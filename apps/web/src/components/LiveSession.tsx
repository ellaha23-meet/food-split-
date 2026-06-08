'use client';

/**
 * LiveSession — the live table view shared by guests and the host.
 *
 * Composes the core experience:
 *   P3.1 tappable grid + optimistic claim/un-claim (rollback on server reject)
 *   P3.2 emergent sharing (co-tapped item → equal weights → equal split)
 *   P3.3 presence board + unclaimed highlight (the honesty surface)
 *   P5.2 live per-participant breakdown (items + tax + tip), cent-exact
 *   P5.1 host tip controls + grand-total guard messaging
 *   P6   settlement board: deep links + mark-paid
 *
 * G3: every total shown is engine output over server state. Optimistic claim
 * toggles are cosmetic only and reconcile/rollback against the server.
 */

import { useMemo, useState } from 'react';
import { useSessionState } from '@/lib/useSessionState';
import { fmt } from '@/lib/format';
import { buildPaymentLinks } from '@/lib/settlement/links';

interface LiveSessionProps {
  sessionId: string;
  /** The viewer's participant id, or null for a pure host/observer view. */
  participantId: string | null;
  /** Show host-only controls (tip, close, mark-paid). */
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

  if (error && !state) return <p style={{ color: 'crimson' }}>Error: {error}</p>;
  if (!state) return <p>Loading session…</p>;

  const { session, lineItems, participants, totals, settlements } = state;
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
      // Clear overlay once server truth has caught up.
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

  const myTotal = participantId
    ? totals.perParticipant.find((p) => p.participantId === participantId)?.totalCents ?? 0
    : 0;

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 760 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>Session {session.join_code}</h2>
        <span style={{ fontSize: 13, color: '#666' }}>status: {session.status}</span>
      </header>

      {notice && (
        <p style={{ background: '#FEF3C7', padding: '8px 12px', borderRadius: 6 }}>{notice}</p>
      )}

      {/* Presence board (P3.3) */}
      <section style={{ margin: '12px 0' }}>
        <strong>At the table</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {participants.length === 0 && <em style={{ color: '#888' }}>No one yet</em>}
          {participants.map((p) => (
            <span
              key={p.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: '#F3F4F6',
                fontWeight: p.id === participantId ? 700 : 400,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: p.color }} />
              {p.display_name}
              {p.id === participantId && ' (you)'}
            </span>
          ))}
        </div>
      </section>

      {/* Tappable grid (P3.1/3.2) */}
      <section>
        <strong>Items — tap to claim</strong>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            marginTop: 8,
          }}
        >
          {lineItems.map((item) => {
            const claimers = claimsByItem.get(item.id) ?? [];
            const mine = viewerClaims(item.id);
            const unclaimed = claimers.length === 0 && !mine;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void toggleClaim(item.id)}
                disabled={!participantId || locked}
                style={{
                  textAlign: 'left',
                  padding: 12,
                  borderRadius: 10,
                  cursor: participantId && !locked ? 'pointer' : 'default',
                  border: mine ? '2px solid #2563EB' : '1px solid #E5E7EB',
                  // Unclaimed items are unmistakable — the load-bearing honesty cue.
                  background: unclaimed ? '#FEE2E2' : mine ? '#EFF6FF' : '#fff',
                  outline: unclaimed ? '2px dashed #DC2626' : 'none',
                }}
              >
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ color: '#374151' }}>{fmt(item.total_price_cents)}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 14 }}>
                  {claimers.map((pid) => (
                    <span
                      key={pid}
                      title={nameOf(pid)}
                      style={{ width: 14, height: 14, borderRadius: 999, background: colorOf(pid) }}
                    />
                  ))}
                  {claimers.length > 1 && (
                    <span style={{ fontSize: 11, color: '#2563EB' }}>
                      split ×{claimers.length}
                    </span>
                  )}
                  {unclaimed && <span style={{ fontSize: 11, color: '#DC2626' }}>UNCLAIMED</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {totals.unclaimedCents > 0 && (
        <p style={{ color: '#DC2626', fontWeight: 600, marginTop: 10 }}>
          {fmt(totals.unclaimedCents)} still unclaimed — must be resolved before settling.
        </p>
      )}

      {/* Host tip controls (P5.1) */}
      {isHost && <TipControls sessionId={sessionId} current={session.tip_cents} mode={session.tip_mode} onChange={refetch} />}

      {/* Live totals (P5.2) */}
      <section style={{ marginTop: 16 }}>
        <strong>Live totals</strong>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: '#666' }}>
              <th style={{ textAlign: 'left' }}>Diner</th>
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
                style={{
                  textAlign: 'right',
                  fontWeight: p.participantId === participantId ? 700 : 400,
                }}
              >
                <td style={{ textAlign: 'left' }}>{nameOf(p.participantId)}</td>
                <td>{fmt(p.claimedSubtotalCents)}</td>
                <td>{fmt(p.taxCents)}</td>
                <td>{fmt(p.tipCents + p.serviceChargeCents)}</td>
                <td>{fmt(p.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ textAlign: 'right', borderTop: '2px solid #111', fontWeight: 700 }}>
              <td style={{ textAlign: 'left' }}>Grand total</td>
              <td colSpan={3} />
              <td>{fmt(totals.grandTotalCents)}</td>
            </tr>
          </tfoot>
        </table>
        {participantId && (
          <p style={{ marginTop: 8 }}>
            Your total: <strong>{fmt(myTotal)}</strong>
          </p>
        )}
      </section>

      {/* Close / settle (host, P5.3 → P6) */}
      {isHost && session.status === 'open' && (
        <CloseButton sessionId={sessionId} onDone={refetch} />
      )}

      {/* Settlement board (P6) */}
      {settlements.length > 0 && (
        <SettlementBoard
          sessionId={sessionId}
          settlements={settlements}
          nameOf={nameOf}
          hostName="the host"
          isHost={isHost}
          viewerParticipantId={participantId}
          onChange={refetch}
        />
      )}
    </div>
  );
}

function TipControls({
  sessionId,
  current,
  mode,
  onChange,
}: {
  sessionId: string;
  current: number;
  mode: 'proportional' | 'even';
  onChange: () => Promise<void>;
}) {
  const [dollars, setDollars] = useState((current / 100).toFixed(2));
  const [tipMode, setTipMode] = useState(mode);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const cents = Math.round(parseFloat(dollars || '0') * 100);
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipCents: cents, tipMode }),
      });
      await onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginTop: 16, padding: 12, background: '#F9FAFB', borderRadius: 8 }}>
      <strong>Tip (host)</strong>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <span>$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          style={{ width: 90, padding: 6 }}
        />
        <select value={tipMode} onChange={(e) => setTipMode(e.target.value as 'proportional' | 'even')}>
          <option value="proportional">proportional</option>
          <option value="even">even per head</option>
        </select>
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Update tip'}
        </button>
      </div>
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
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => void close()}
        disabled={busy}
        style={{ padding: '10px 18px', fontWeight: 600, background: '#111', color: '#fff', borderRadius: 8 }}
      >
        {busy ? 'Closing…' : 'Close & settle'}
      </button>
      {msg && <p style={{ color: '#DC2626', marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

interface SettlementRow {
  id: string;
  participant_id: string;
  amount_owed_cents: number;
  status: string;
}

function SettlementBoard({
  settlements,
  nameOf,
  isHost,
  viewerParticipantId,
  onChange,
}: {
  sessionId: string;
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
    <section style={{ marginTop: 20 }}>
      <strong>Settlement — everyone pays the host</strong>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {settlements.map((s) => {
          const isMine = s.participant_id === viewerParticipantId;
          // P6.1 — demo handles so the deep links render; real handles come from
          // saved-diner memory (P9, out of prototype scope).
          const links = buildPaymentLinks({
            amountCents: s.amount_owed_cents,
            memo: `Tally: ${nameOf(s.participant_id)}'s share`,
            handles: { venmo: '@host', cashapp: '$host', paypal: 'host' },
          });
          return (
            <li
              key={s.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eee',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ minWidth: 120, fontWeight: isMine ? 700 : 400 }}>
                {nameOf(s.participant_id)}
                {isMine && ' (you)'}
              </span>
              <span style={{ minWidth: 80 }}>{fmt(s.amount_owed_cents)}</span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  background: s.status === 'paid' ? '#DCFCE7' : '#FEF3C7',
                  fontSize: 12,
                }}
              >
                {s.status}
              </span>
              {(isMine || isHost) &&
                s.status !== 'paid' &&
                links.map((l) =>
                  l.url ? (
                    <a key={l.app} href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      {l.label} {l.amount}
                    </a>
                  ) : (
                    <span key={l.app} style={{ fontSize: 13, color: '#666' }}>
                      {l.label}: {l.handle} ({l.amount})
                    </span>
                  ),
                )}
              {(isMine || isHost) && (
                <button
                  type="button"
                  onClick={() => void setStatus(s.id, s.status === 'paid' ? 'pending' : 'paid')}
                  style={{ marginLeft: 'auto' }}
                >
                  {s.status === 'paid' ? 'Undo' : isHost ? 'Mark paid' : 'I paid'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
