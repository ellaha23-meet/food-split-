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

  if (error && !state) return <p style={{ color: 'crimson' }}>Error: {error}</p>;
  if (!state) return <p>Loading session…</p>;

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
                background: '#FBF1DC',
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
        <strong>Items — tap what you had</strong>
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
            const mineItem = viewerClaims(item.id);
            const unclaimed = claimers.length === 0 && !mineItem;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void toggleClaim(item.id)}
                disabled={!participantId || locked}
                style={{
                  fontFamily: 'var(--font-body)',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: 'var(--crav-ink)',
                  textAlign: 'left',
                  padding: 12,
                  borderRadius: 10,
                  boxShadow: '3px 3px 0 var(--crav-ink)',
                  cursor: participantId && !locked ? 'pointer' : 'default',
                  border: mineItem ? '2px solid var(--crav-red)' : '2px solid var(--crav-ink)',
                  background: unclaimed ? '#FEE2E2' : mineItem ? '#FFF3E2' : '#fff',
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
                    <span style={{ fontSize: 11, color: 'var(--crav-red)' }}>split ×{claimers.length}</span>
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
    <section
      style={{
        marginTop: 16,
        padding: 16,
        background: '#FBF1DC',
        border: '1px solid var(--crav-yellow)',
        borderRadius: 12,
      }}
    >
      <strong>Your tip</strong>
      <p style={{ margin: '4px 0 10px', fontSize: 13, color: '#475569' }}>
        Tip on your {fmt(subtotalCents)} of items — your call.
      </p>

      {!locked && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {TIP_PERCENTS.map((pct) => {
            const active = pct === activePct;
            return (
              <button
                key={pct}
                type="button"
                disabled={saving}
                onClick={() => void setTip(Math.round((subtotalCents * pct) / 100))}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: active ? '2px solid var(--crav-red)' : '1px solid var(--crav-cream-line)',
                  background: active ? 'var(--crav-red)' : '#fff',
                  color: active ? '#fff' : '#0F172A',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {pct === 0 ? 'No tip' : `${pct}%`}
              </button>
            );
          })}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => {
                if (custom !== '') void setTip(Math.round(parseFloat(custom || '0') * 100));
              }}
              style={{ width: 80, padding: 6 }}
            />
            <span style={{ fontSize: 13, color: '#475569' }}>₪</span>
          </span>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 15 }}>
        Items {fmt(subtotalCents)} · Tax {fmt(taxCents)} · Tip <strong>{fmt(tipCents)}</strong>
        {' · '}You owe <strong style={{ fontSize: 17 }}>{fmt(totalCents)}</strong>
      </p>

      {alreadyPaid ? (
        <p style={{ marginTop: 8, color: '#047857', fontWeight: 700 }}>
          ✓ Paid {fmt(totalCents)} to {hostName} with Bit
        </p>
      ) : (
        <button
          type="button"
          disabled={totalCents <= 0}
          onClick={() => setShowBit(true)}
          style={{
            marginTop: 8,
            padding: '12px 22px',
            fontWeight: 800,
            fontSize: 16,
            color: '#062E2E',
            background: totalCents > 0 ? '#00C2C7' : 'var(--crav-cream-line)',
            border: 'none',
            borderRadius: 12,
            cursor: totalCents > 0 ? 'pointer' : 'not-allowed',
          }}
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

/**
 * Simulated Bit payment sheet. Bit (ביט) never actually moves money here — this
 * is a faithful-looking confirmation that resolves the diner's share locally.
 */
function BitModal({
  amountCents,
  payeeName,
  onClose,
  onConfirm,
}: {
  amountCents: number;
  payeeName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<'confirm' | 'processing' | 'done'>('confirm');

  async function pay() {
    setPhase('processing');
    await new Promise((r) => setTimeout(r, 1300));
    await onConfirm();
    setPhase('done');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
      onClick={phase === 'processing' ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340,
          maxWidth: '100%',
          borderRadius: 20,
          overflow: 'hidden',
          background: '#fff',
          fontFamily: 'system-ui',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Bit header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #00C2C7, #00A0B4)',
            color: '#062E2E',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1 }}>bit</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>תשלום מהיר</span>
        </div>

        <div style={{ padding: 22, textAlign: 'center' }}>
          {phase === 'done' ? (
            <>
              <div style={{ fontSize: 52 }}>✅</div>
              <p style={{ fontWeight: 800, fontSize: 18, margin: '8px 0 2px' }}>Payment sent</p>
              <p style={{ color: '#475569', margin: 0 }}>
                {fmt(amountCents)} to {payeeName}
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{
                  marginTop: 18,
                  padding: '10px 22px',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: 10,
                  background: '#0F172A',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <p style={{ color: '#475569', margin: '0 0 4px' }}>Paying</p>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#0F172A' }}>
                {fmt(amountCents)}
              </div>
              <p style={{ color: '#475569', margin: '6px 0 0' }}>
                to <strong>{payeeName}</strong>
              </p>
              <div
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  background: '#FBF1DC',
                  borderRadius: 10,
                  fontSize: 13,
                  color: '#64748B',
                }}
              >
                Linked: Visa •••• 4821
              </div>

              <button
                type="button"
                disabled={phase === 'processing'}
                onClick={() => void pay()}
                style={{
                  marginTop: 18,
                  width: '100%',
                  padding: '14px',
                  fontWeight: 800,
                  fontSize: 16,
                  color: '#062E2E',
                  background: '#00C2C7',
                  border: 'none',
                  borderRadius: 12,
                  cursor: phase === 'processing' ? 'default' : 'pointer',
                }}
              >
                {phase === 'processing' ? 'Sending…' : 'Confirm payment'}
              </button>
              {phase !== 'processing' && (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    marginTop: 10,
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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
    <section style={{ marginTop: 20 }}>
      <strong>Settlement — everyone pays {hostName} with Bit</strong>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {settlements.map((s) => {
          const isMine = s.participant_id === viewerParticipantId;
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
                {s.status === 'paid'
                  ? s.payment_method === 'bit'
                    ? 'paid · Bit'
                    : 'paid'
                  : 'pending'}
              </span>
              {isHost && (
                <button
                  type="button"
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
