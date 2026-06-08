'use client';

/**
 * LiveSession — the live table view shared by guests and the host.
 *
 * Composes the core experience:
 *   P3.1 tappable grid + optimistic claim/un-claim (rollback on server reject)
 *   P3.2 emergent sharing (co-tapped item → equal weights → equal split)
 *   P3.3 presence board + unclaimed highlight (the honesty surface)
 *   P5.2 live per-participant breakdown (items + tax + own tip), cent-exact
 *   per-diner tip: each guest picks their own tip on their share
 *   Bit settlement: each guest pays the table payer back with Bit (simulated)
 *
 * G3: every total shown is engine output (items+tax) plus the diner's own tip,
 * layered server-side. Optimistic claim toggles are cosmetic and reconcile.
 */

import { useMemo, useState } from 'react';
import { useSessionState } from '@/lib/useSessionState';
import { fmt } from '@/lib/format';
import { BitModal } from '@/components/ui';

interface LiveSessionProps {
  sessionId: string;
  /** The viewer's participant id, or null for a pure host/observer view. */
  participantId: string | null;
  /** Show host-only controls (close, mark-paid). */
  isHost?: boolean;
}

export function LiveSession({ sessionId, participantId, isHost = false }: LiveSessionProps) {
  const { state, error, refetch } = useSessionState(sessionId);
  // Optimistic overlay: lineItemId -> desired claimed boolean for the viewer.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const claimsByItem = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of state?.claims ?? []) {
      const arr = map.get(c.line_item_id) ?? [];
      arr.push(c.participant_id);
      map.set(c.line_item_id, arr);
    }
    return map;
  }, [state?.claims]);

  if (error && !state) return <p className="error">Error: {error}</p>;
  if (!state) return <p style={{ fontWeight: 700 }}>Loading session…</p>;

  const { session, hostName, lineItems, participants, totals, settlements } = state;
  const locked = session.status !== 'open';
  const colorOf = (pid: string) => participants.find((p) => p.id === pid)?.color ?? '#999';
  const nameOf = (pid: string) =>
    participants.find((p) => p.id === pid)?.display_name ?? 'Someone';

  function viewerClaims(itemId: string): boolean {
    if (itemId in optimistic) return optimistic[itemId]!;
    if (!participantId) return false;
    return (claimsByItem.get(itemId) ?? []).includes(participantId);
  }

  async function toggleClaim(itemId: string) {
    if (!participantId || locked || busy[itemId]) return;
    const desired = !viewerClaims(itemId);
    setOptimistic((o) => ({ ...o, [itemId]: desired }));
    setBusy((b) => ({ ...b, [itemId]: true }));
    setNotice(null);
    try {
      const res = await fetch('/api/claims', {
        method: desired ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId: itemId, participantId, sessionId }),
      });
      if (!res.ok) throw new Error(`Server rejected (${res.status})`);
      await refetch();
      setOptimistic((o) => {
        const next = { ...o };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      // G3: roll the UI back to server truth on conflict.
      setOptimistic((o) => {
        const next = { ...o };
        delete next[itemId];
        return next;
      });
      setNotice(err instanceof Error ? err.message : 'Claim failed — rolled back');
      await refetch();
    } finally {
      setBusy((b) => ({ ...b, [itemId]: false }));
    }
  }

  const mine = participantId
    ? totals.perParticipant.find((p) => p.participantId === participantId)
    : undefined;
  const mySettlement = participantId
    ? settlements.find((s) => s.participant_id === participantId)
    : undefined;

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Session {session.join_code}</h2>
        <span className={'badge ' + (locked ? 'badge--paid' : 'badge--pending')}>status: {session.status}</span>
      </header>

      {notice && <p className="notice" style={{ marginTop: 12 }}>{notice}</p>}

      {/* Presence board (P3.3) */}
      <section style={{ margin: '16px 0' }}>
        <h3 className="section-title">At the table</h3>
        <div className="row" style={{ marginTop: 6 }}>
          {participants.length === 0 && <em className="muted">No one yet</em>}
          {participants.map((p) => (
            <span
              key={p.id}
              className={'chip chip--static' + (p.id === participantId ? ' is-you' : '')}
              style={{ cursor: 'default', fontWeight: p.id === participantId ? 900 : 800 }}
            >
              <span className="dot" style={{ background: p.color }} />
              {p.display_name}
              {p.id === participantId && ' (you)'}
            </span>
          ))}
        </div>
      </section>

      {/* Tappable grid (P3.1/3.2) */}
      <section>
        <h3 className="section-title">Items — tap what you had</h3>
        <div className="item-grid">
          {lineItems.map((item) => {
            const claimers = claimsByItem.get(item.id) ?? [];
            const mineItem = viewerClaims(item.id);
            const unclaimed = claimers.length === 0 && !mineItem;
            const cls =
              'item-card' + (mineItem ? ' item-card--mine' : unclaimed ? ' item-card--unclaimed' : '');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void toggleClaim(item.id)}
                disabled={!participantId || locked}
                className={cls}
              >
                <div className="item-name">{item.name}</div>
                <div className="item-price">{fmt(item.total_price_cents)}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', minHeight: 16 }}>
                  {claimers.map((pid) => (
                    <span
                      key={pid}
                      className="dot"
                      title={nameOf(pid)}
                      style={{ background: colorOf(pid) }}
                    />
                  ))}
                  {claimers.length > 1 && (
                    <span className="tag tag--split">split ×{claimers.length}</span>
                  )}
                  {unclaimed && <span className="tag tag--unclaimed">UNCLAIMED</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {totals.unclaimedCents > 0 && (
        <p className="error" style={{ marginTop: 12 }}>
          {fmt(totals.unclaimedCents)} still unclaimed — must be resolved before settling.
        </p>
      )}

      {/* Per-diner tip + pay (the viewer's own panel) */}
      {participantId && mine && (
        <DinerPanel
          sessionId={sessionId}
          participantId={participantId}
          subtotalCents={mine.claimedSubtotalCents}
          taxCents={mine.taxCents}
          tipCents={mine.tipCents}
          totalCents={mine.totalCents}
          hostName={hostName}
          locked={locked}
          alreadyPaid={mySettlement?.status === 'paid'}
          onChange={refetch}
        />
      )}

      {/* Live totals (P5.2) */}
      <section style={{ marginTop: 20 }}>
        <h3 className="section-title">Live totals</h3>
        <div className="card card--flat" style={{ padding: 16 }}>
          <table className="totals">
            <thead>
              <tr>
                <th>Diner</th>
                <th>Items</th>
                <th>Tax</th>
                <th>Tip</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {totals.perParticipant.map((p) => (
                <tr
                  key={p.participantId}
                  className={p.participantId === participantId ? 'is-you' : undefined}
                >
                  <td>{nameOf(p.participantId)}</td>
                  <td>{fmt(p.claimedSubtotalCents)}</td>
                  <td>{fmt(p.taxCents)}</td>
                  <td>{fmt(p.tipCents + p.serviceChargeCents)}</td>
                  <td>{fmt(p.totalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand total</td>
                <td colSpan={3} />
                <td>{fmt(totals.grandTotalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Close / settle (host) */}
      {isHost && session.status === 'open' && (
        <CloseButton sessionId={sessionId} onDone={refetch} />
      )}

      {/* Settlement board */}
      {settlements.length > 0 && (
        <SettlementBoard
          settlements={settlements}
          nameOf={nameOf}
          hostName={hostName}
          isHost={isHost}
          viewerParticipantId={participantId}
          onChange={refetch}
        />
      )}
    </div>
  );
}

const TIP_PERCENTS = [0, 10, 12, 15, 18];

function DinerPanel({
  sessionId,
  participantId,
  subtotalCents,
  taxCents,
  tipCents,
  totalCents,
  hostName,
  locked,
  alreadyPaid,
  onChange,
}: {
  sessionId: string;
  participantId: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  hostName: string;
  locked: boolean;
  alreadyPaid: boolean;
  onChange: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState('');
  const [showBit, setShowBit] = useState(false);

  // The percentage that produced the current tip (for highlighting), if any.
  const activePct = TIP_PERCENTS.find(
    (pct) => Math.round((subtotalCents * pct) / 100) === tipCents,
  );

  async function setTip(cents: number) {
    if (locked) return;
    setSaving(true);
    try {
      await fetch('/api/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, tipCents: Math.max(0, cents) }),
      });
      await onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <h3 className="section-title">Your tip</h3>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>
        Tip on your {fmt(subtotalCents)} of items — your call.
      </p>

      {!locked && (
        <div className="row">
          {TIP_PERCENTS.map((pct) => {
            const active = pct === activePct;
            return (
              <button
                key={pct}
                type="button"
                disabled={saving}
                onClick={() => void setTip(Math.round((subtotalCents * pct) / 100))}
                className={'chip' + (active ? ' chip--active' : '')}
              >
                {pct === 0 ? 'No tip' : `${pct}%`}
              </button>
            );
          })}
          <span className="row" style={{ gap: 4 }}>
            <input
              className="field"
              type="number"
              step="0.01"
              min="0"
              placeholder="custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => {
                if (custom !== '') void setTip(Math.round(parseFloat(custom || '0') * 100));
              }}
              style={{ width: 90 }}
            />
            <span className="muted" style={{ fontWeight: 700 }}>₪</span>
          </span>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 16, fontWeight: 700 }}>
        Items {fmt(subtotalCents)} · Tax {fmt(taxCents)} · Tip <strong>{fmt(tipCents)}</strong>
        {' · '}You owe <strong className="amount" style={{ fontSize: 22 }}>{fmt(totalCents)}</strong>
      </p>

      {alreadyPaid ? (
        <p style={{ marginTop: 8, color: 'var(--green)', fontWeight: 800 }}>
          ✓ Paid {fmt(totalCents)} to {hostName} with Bit
        </p>
      ) : (
        <button
          type="button"
          disabled={totalCents <= 0}
          onClick={() => setShowBit(true)}
          className="btn btn--bit btn--lg"
          style={{ marginTop: 8 }}
        >
          Pay {fmt(totalCents)} with Bit
        </button>
      )}

      {showBit && (
        <BitModal
          amountCents={totalCents}
          payeeName={hostName}
          onClose={() => setShowBit(false)}
          onConfirm={async () => {
            await fetch('/api/settlements', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, participantId }),
            });
            await onChange();
          }}
        />
      )}
    </section>
  );
}

function CloseButton({ sessionId, onDone }: { sessionId: string; onDone: () => Promise<void> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function close() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/close`, { method: 'POST' });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setMsg(body.message ?? 'Cannot close yet.');
      } else {
        await onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <button
        type="button"
        onClick={() => void close()}
        disabled={busy}
        className="btn btn--dark"
      >
        {busy ? 'Closing…' : 'Close & settle'}
      </button>
      {msg && <p className="error" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

interface SettlementRow {
  id: string;
  participant_id: string;
  amount_owed_cents: number;
  status: string;
  payment_method?: string | null;
}

function SettlementBoard({
  settlements,
  nameOf,
  hostName,
  isHost,
  viewerParticipantId,
  onChange,
}: {
  settlements: SettlementRow[];
  nameOf: (pid: string) => string;
  hostName: string;
  isHost: boolean;
  viewerParticipantId: string | null;
  onChange: () => Promise<void>;
}) {
  async function setStatus(id: string, status: 'pending' | 'paid') {
    await fetch('/api/settlements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlementId: id, status }),
    });
    await onChange();
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h3 className="section-title">Settlement — everyone pays {hostName} with Bit</h3>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {settlements.map((s) => {
          const isMine = s.participant_id === viewerParticipantId;
          return (
            <li
              key={s.id}
              className="row"
              style={{
                gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span style={{ minWidth: 120, fontWeight: isMine ? 900 : 700 }}>
                {nameOf(s.participant_id)}
                {isMine && ' (you)'}
              </span>
              <span style={{ minWidth: 80, fontWeight: 700 }}>{fmt(s.amount_owed_cents)}</span>
              <span className={'badge ' + (s.status === 'paid' ? 'badge--paid' : 'badge--pending')}>
                {s.status === 'paid'
                  ? s.payment_method === 'bit'
                    ? 'paid · Bit'
                    : 'paid'
                  : 'pending'}
              </span>
              {isHost && (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void setStatus(s.id, s.status === 'paid' ? 'pending' : 'paid')}
                  style={{ marginLeft: 'auto' }}
                >
                  {s.status === 'paid' ? 'Undo' : 'Mark paid'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
