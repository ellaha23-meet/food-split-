'use client';

/**
 * Splity — self-contained client-side prototype (no backend).
 *
 * A single-device walkthrough of the whole idea:
 *   1. capture  — snap/upload a photo of the receipt
 *   2. review   — the digitized receipt, editable
 *   3. split    — add diners; each taps what they had, picks their own tip,
 *                 and pays the table back with Bit (simulated)
 *
 * Everything lives in React state — nothing is persisted or sent anywhere.
 */

import { useState } from 'react';
import { fmt } from '@/lib/format';
import { computeSplit, evenSplit, itemTotal, type PItem } from '@/lib/prototype/split';

type Phase = 'capture' | 'scanning' | 'review' | 'split' | 'dashboard';

interface Diner {
  id: string;
  name: string;
  color: string;
  tipCents: number;
  // The friend has confirmed they're done picking their meals + tip.
  done: boolean;
  paid: boolean;
}

const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

// Stand-in for receipt OCR — a snapshot "digitizes" into this editable draft.
const DEMO_SCAN: { items: PItem[]; taxCents: number } = {
  items: [
    { id: 'i1', name: 'Shakshuka', qty: 1, unitCents: 5200 },
    { id: 'i2', name: 'Hummus plate', qty: 1, unitCents: 3800 },
    { id: 'i3', name: 'Grilled sea bass', qty: 1, unitCents: 9400 },
    { id: 'i4', name: 'Greek salad', qty: 1, unitCents: 4400 },
    { id: 'i5', name: 'Lemonade', qty: 2, unitCents: 1600 },
    { id: 'i6', name: 'Espresso', qty: 2, unitCents: 1200 },
  ],
  taxCents: 0,
};

// A receipt-looking placeholder shown while the demo "scan" runs, so the
// prototype feels real without requiring an actual camera or photo file.
const DEMO_RECEIPT_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="320" viewBox="0 0 260 320">
      <rect width="260" height="320" rx="10" fill="#ffffff" stroke="#E2E8F0"/>
      <text x="130" y="40" text-anchor="middle" font-family="monospace" font-size="18" font-weight="bold" fill="#0F172A">SEASIDE GRILL</text>
      <text x="130" y="60" text-anchor="middle" font-family="monospace" font-size="11" fill="#64748B">Tel Aviv · Table 7</text>
      <line x1="24" y1="78" x2="236" y2="78" stroke="#CBD5E1" stroke-dasharray="4 4"/>
      <g font-family="monospace" font-size="12" fill="#334155">
        <text x="24" y="104">Shakshuka</text><text x="236" y="104" text-anchor="end">52.00</text>
        <text x="24" y="128">Hummus plate</text><text x="236" y="128" text-anchor="end">38.00</text>
        <text x="24" y="152">Grilled sea bass</text><text x="236" y="152" text-anchor="end">94.00</text>
        <text x="24" y="176">Greek salad</text><text x="236" y="176" text-anchor="end">44.00</text>
        <text x="24" y="200">Lemonade  x2</text><text x="236" y="200" text-anchor="end">32.00</text>
        <text x="24" y="224">Espresso  x2</text><text x="236" y="224" text-anchor="end">24.00</text>
      </g>
      <line x1="24" y1="242" x2="236" y2="242" stroke="#CBD5E1" stroke-dasharray="4 4"/>
      <g font-family="monospace" font-size="13" font-weight="bold" fill="#0F172A">
        <text x="24" y="268">TOTAL</text><text x="236" y="268" text-anchor="end">284.00</text>
      </g>
      <text x="130" y="298" text-anchor="middle" font-family="monospace" font-size="11" fill="#94A3B8">Thank you! · Toda</text>
    </svg>`,
  );

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random()}`;

export function Prototype() {
  const [phase, setPhase] = useState<Phase>('capture');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [items, setItems] = useState<PItem[]>([]);
  const [taxCents, setTaxCents] = useState(0);

  const [diners, setDiners] = useState<Diner[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // itemId -> dinerIds who claimed it
  const [claims, setClaims] = useState<Record<string, string[]>>({});
  const [payFor, setPayFor] = useState<Diner | null>(null);

  // Turn a captured (or simulated) snapshot into the editable digital receipt.
  function digitize(previewUrl: string | null) {
    setPhotoUrl(previewUrl);
    setPhase('scanning');
    setTimeout(() => {
      setItems(DEMO_SCAN.items.map((it) => ({ ...it })));
      setTaxCents(DEMO_SCAN.taxCents);
      setPhase('review');
    }, 1700);
  }

  // Prototype shortcut: tapping "Take a photo" jumps straight to a digital
  // receipt without needing a real camera/file, so the demo always works.
  function simulateCapture() {
    digitize(DEMO_RECEIPT_SVG);
  }

  // ── compute ───────────────────────────────────────────────────────────
  const dinerIds = diners.map((d) => d.id);
  const tipsByDiner = Object.fromEntries(
    diners.map((d) => [d.id, d.tipCents] as [string, number]),
  );
  const split = computeSplit(items, claims, tipsByDiner, dinerIds, taxCents);
  const totalFor = (id: string) => split.perDiner.find((p) => p.dinerId === id);
  const activeDiner = diners.find((d) => d.id === activeId) ?? null;
  // The first diner added is the one who paid the restaurant; everyone else
  // Bit-pays them back.
  const payerId = diners[0]?.id ?? null;
  const payerName = diners[0]?.name ?? 'the table';
  // Completion gate: every friend must confirm their picks before we settle.
  const doneCount = diners.filter((d) => d.done).length;
  const allDone = diners.length > 0 && doneCount === diners.length;

  // ── diner + claim actions ────────────────────────────────────────────
  function addDiner(name: string) {
    const id = newId();
    const color = COLORS[diners.length % COLORS.length] ?? '#3B82F6';
    setDiners((d) => [...d, { id, name, color, tipCents: 0, done: false, paid: false }]);
    setActiveId(id);
  }
  function patchDiner(id: string, patch: Partial<Diner>) {
    setDiners((arr) => arr.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function toggleClaim(itemId: string) {
    if (!activeId) return;
    setClaims((c) => {
      const cur = c[itemId] ?? [];
      const next = cur.includes(activeId)
        ? cur.filter((x) => x !== activeId)
        : [...cur, activeId];
      return { ...c, [itemId]: next };
    });
    // Changing a selection re-opens this friend's confirmation.
    patchDiner(activeId, { done: false });
  }

  const colorOf = (id: string) => diners.find((d) => d.id === id)?.color ?? '#999';
  const nameOf = (id: string) => diners.find((d) => d.id === id)?.name ?? 'Someone';

  // ════════════════════════════════════════════════════════════════════
  // Capture / scanning
  // ════════════════════════════════════════════════════════════════════
  if (phase === 'capture' || phase === 'scanning') {
    return (
      <Shell>
        <h2>Scan the receipt</h2>
        <div
          style={{
            border: '2px dashed var(--crav-cream-line)',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
            background: '#FBF1DC',
            maxWidth: 460,
          }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Receipt"
              style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, objectFit: 'contain' }}
            />
          ) : (
            <div style={{ fontSize: 56, lineHeight: 1 }}>📷</div>
          )}

          {phase === 'scanning' ? (
            <p style={{ marginTop: 16, fontWeight: 600, color: 'var(--crav-red)' }}>Reading your receipt…</p>
          ) : (
            <>
              <p style={{ marginTop: 12, color: 'var(--crav-ink)' }}>
                Take a photo of your receipt and we&apos;ll turn it into a tappable bill.
              </p>
              <button type="button" onClick={simulateCapture} style={primaryBtn}>
                Take a photo
              </button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // Review receipt
  // ════════════════════════════════════════════════════════════════════
  if (phase === 'review') {
    const subtotal = items.reduce((a, it) => a + itemTotal(it), 0);
    const upd = (id: string, patch: Partial<PItem>) =>
      setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const valid = items.some((it) => it.name.trim() && it.unitCents > 0);

    return (
      <Shell>
        <h2>Review the bill</h2>
        <p style={{ color: 'var(--crav-ink)', marginTop: -8 }}>
          {photoUrl ? 'Scanned from your photo — tap any field to fix it.' : 'Enter each item below.'}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--crav-ink)', fontSize: 13 }}>
              <th>Item</th>
              <th style={{ width: 60 }}>Qty</th>
              <th style={{ width: 110 }}>Unit ₪</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <input
                    value={it.name}
                    onChange={(e) => upd(it.id, { name: e.target.value })}
                    placeholder="Margherita pizza"
                    style={{ width: '100%', padding: 6, boxSizing: 'border-box' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => upd(it.id, { qty: parseInt(e.target.value || '1', 10) || 1 })}
                    style={{ width: '100%', padding: 6, boxSizing: 'border-box' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.unitCents ? (it.unitCents / 100).toString() : ''}
                    onChange={(e) =>
                      upd(it.id, { unitCents: Math.round(parseFloat(e.target.value || '0') * 100) })
                    }
                    placeholder="12.00"
                    style={{ width: '100%', padding: 6, boxSizing: 'border-box' }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => setItems((arr) => arr.filter((x) => x.id !== it.id))}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() => setItems((arr) => [...arr, { id: newId(), name: '', qty: 1, unitCents: 0 }])}
          style={{ marginTop: 8 }}
        >
          + Add item
        </button>

        <div style={{ marginTop: 16 }}>
          <label>
            Tax ₪
            <input
              type="number"
              step="0.01"
              min="0"
              value={taxCents ? (taxCents / 100).toString() : ''}
              onChange={(e) => setTaxCents(Math.round(parseFloat(e.target.value || '0') * 100))}
              style={{ width: 90, padding: 6, marginLeft: 6 }}
            />
          </label>
        </div>

        <p style={{ marginTop: 12, fontSize: 15 }}>
          Subtotal {fmt(subtotal)} · Receipt total <strong>{fmt(subtotal + taxCents)}</strong>
        </p>
        <p style={{ marginTop: -6, fontSize: 13, color: 'var(--crav-ink)' }}>
          Each diner adds their own tip when they pick what they had.
        </p>

        <button
          type="button"
          disabled={!valid}
          onClick={() => setPhase('split')}
          style={{ ...primaryBtn, opacity: valid ? 1 : 0.5 }}
        >
          Start splitting
        </button>
      </Shell>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // Review dashboard — shown before settling; gates the Bit payment
  // ════════════════════════════════════════════════════════════════════
  if (phase === 'dashboard') {
    const claimersOf = (it: PItem) => claims[it.id] ?? [];
    const sharedItems = items.filter((it) => claimersOf(it).length >= 2);
    const personalItems = items.filter((it) => claimersOf(it).length === 1);
    const unclaimedItems = items.filter((it) => claimersOf(it).length === 0);
    const waitingOn = diners.filter((d) => !d.done).map((d) => d.name);

    // Each friend's meals with their cents-exact share (matches computeSplit).
    const mealsFor = (dinerId: string) => {
      const rows: { item: PItem; shareCents: number; shared: boolean }[] = [];
      for (const it of items) {
        const cs = claimersOf(it);
        const idx = cs.indexOf(dinerId);
        if (idx === -1) continue;
        const shares = evenSplit(itemTotal(it), cs.length);
        rows.push({ item: it, shareCents: shares[idx] ?? 0, shared: cs.length > 1 });
      }
      return rows;
    };

    return (
      <Shell>
        <button type="button" onClick={() => setPhase('split')} style={linkBtn}>
          ← Back to choosing
        </button>
        <h2 style={{ marginBottom: 4 }}>Review before paying</h2>
        <p style={{ color: 'var(--crav-ink)', marginTop: 0 }}>
          Check who had what, then settle up with Bit.
        </p>

        {/* Completion status indicator */}
        {allDone ? (
          <div style={{ ...banner, background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46' }}>
            ✓ All {diners.length} {diners.length === 1 ? 'friend has' : 'friends have'} finished
            choosing — you&apos;re ready to settle up.
          </div>
        ) : (
          <div style={{ ...banner, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
            <strong>⚠ Not everyone is done choosing.</strong>{' '}
            {doneCount} of {diners.length} friends have confirmed. Payment is locked until everyone
            finishes{waitingOn.length ? ` — still waiting on ${waitingOn.join(', ')}.` : '.'}
          </div>
        )}

        {unclaimedItems.length > 0 && (
          <div style={{ ...banner, background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E' }}>
            {unclaimedItems.length} item{unclaimedItems.length === 1 ? '' : 's'} still unclaimed
            ({fmt(split.unclaimedCents)}). Go back and assign {unclaimedItems.length === 1 ? 'it' : 'them'}.
          </div>
        )}

        {/* Shared meals */}
        <section style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>🍽️ Shared meals</h3>
          {sharedItems.length === 0 ? (
            <p style={{ color: 'var(--crav-ink)', margin: 0 }}>No shared meals.</p>
          ) : (
            <ul style={mealList}>
              {sharedItems.map((it) => {
                const cs = claimersOf(it);
                return (
                  <li key={it.id} style={mealRow}>
                    <div>
                      <strong>{it.name || 'Item'}</strong>{' '}
                      <span style={{ color: 'var(--crav-ink)' }}>{fmt(itemTotal(it))}</span>
                      <span style={{ fontSize: 12, color: 'var(--crav-red)', marginLeft: 6 }}>
                        split ×{cs.length} = {fmt(Math.round(itemTotal(it) / cs.length))} each
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {cs.map((id) => (
                        <span key={id} style={chip(colorOf(id))}>
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Personal meals */}
        <section style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>👤 Personal meals</h3>
          {personalItems.length === 0 ? (
            <p style={{ color: 'var(--crav-ink)', margin: 0 }}>No personal meals.</p>
          ) : (
            <ul style={mealList}>
              {personalItems.map((it) => {
                const owner = claimersOf(it)[0] ?? '';
                return (
                  <li key={it.id} style={mealRow}>
                    <div>
                      <strong>{it.name || 'Item'}</strong>{' '}
                      <span style={{ color: 'var(--crav-ink)' }}>{fmt(itemTotal(it))}</span>
                    </div>
                    <span style={chip(colorOf(owner))}>{nameOf(owner)} only</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Per-friend summary + payment */}
        <section style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Each friend pays</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {diners.map((d) => {
              const t = totalFor(d.id);
              const rows = mealsFor(d.id);
              const isPayer = d.id === payerId;
              const owe = t?.totalCents ?? 0;
              const canPay = allDone && owe > 0;
              return (
                <div
                  key={d.id}
                  style={{ border: `1px solid ${d.color}55`, borderRadius: 12, padding: 14, background: '#fff' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: d.color }} />
                      {d.name}
                      {isPayer && ' 💳'}
                    </strong>
                    <span style={{ fontSize: 12, fontWeight: 700, color: d.done ? '#047857' : '#B45309' }}>
                      {d.done ? '✓ confirmed' : 'still choosing'}
                    </span>
                  </div>

                  {rows.length === 0 ? (
                    <p style={{ color: 'var(--crav-ink)', margin: '8px 0' }}>No meals selected.</p>
                  ) : (
                    <ul style={{ ...mealList, marginTop: 8 }}>
                      {rows.map(({ item, shareCents, shared }) => (
                        <li
                          key={item.id}
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}
                        >
                          <span>
                            {item.name || 'Item'}{' '}
                            {shared && <span style={{ fontSize: 11, color: 'var(--crav-red)' }}>(shared)</span>}
                          </span>
                          <span>{fmt(shareCents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p style={{ margin: '8px 0 10px', fontSize: 14, color: 'var(--crav-ink)' }}>
                    Items {fmt(t?.itemsCents ?? 0)} · Tax {fmt(t?.taxCents ?? 0)} · Tip {fmt(t?.tipCents ?? 0)} ·{' '}
                    <strong style={{ fontSize: 16, color: '#0F172A' }}>{fmt(owe)}</strong>
                  </p>

                  {isPayer ? (
                    <p style={{ fontSize: 13, color: 'var(--crav-ink)', margin: 0 }}>
                      💳 {d.name} covered the bill — collects from everyone else.
                    </p>
                  ) : d.paid ? (
                    <p style={{ color: '#047857', fontWeight: 700, margin: 0 }}>✓ Paid {fmt(owe)} with Bit</p>
                  ) : (
                    <button
                      type="button"
                      disabled={!canPay}
                      onClick={() => setPayFor(d)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontWeight: 800,
                        fontSize: 15,
                        color: canPay ? '#062E2E' : 'var(--crav-ink)',
                        background: canPay ? '#00C2C7' : 'var(--crav-cream-line)',
                        border: 'none',
                        borderRadius: 12,
                        cursor: canPay ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {allDone ? `Pay ${fmt(owe)} to ${payerName} with Bit` : 'Not ready yet'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {payFor && (
          <BitModal
            amountCents={totalFor(payFor.id)?.totalCents ?? 0}
            payeeName={payFor.id === payerId ? 'the restaurant' : payerName}
            onClose={() => setPayFor(null)}
            onConfirm={() => patchDiner(payFor.id, { paid: true })}
          />
        )}
      </Shell>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // Split
  // ════════════════════════════════════════════════════════════════════
  return (
    <Shell>
      <h2 style={{ marginBottom: 4 }}>Who had what?</h2>
      <p style={{ color: 'var(--crav-ink)', marginTop: 0 }}>
        Pick a diner, then tap the items they had. Shared items split automatically.
      </p>

      <DinerBar
        diners={diners}
        activeId={activeId}
        payerId={payerId}
        onSelect={setActiveId}
        onAdd={addDiner}
      />

      {!activeDiner ? (
        <p style={{ color: '#DC2626', fontWeight: 600 }}>Add a diner to start tapping items.</p>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--crav-ink)' }}>
          Tapping as{' '}
          <strong style={{ color: activeDiner.color }}>{activeDiner.name}</strong>
        </p>
      )}

      {/* Items grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
          marginTop: 8,
        }}
      >
        {items.map((it) => {
          const claimers = claims[it.id] ?? [];
          const mine = activeId ? claimers.includes(activeId) : false;
          const unclaimed = claimers.length === 0;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => toggleClaim(it.id)}
              disabled={!activeId}
              style={{
                fontFamily: 'var(--font-body)',
                textTransform: 'none',
                letterSpacing: 'normal',
                color: 'var(--crav-ink)',
                textAlign: 'left',
                padding: 14,
                borderRadius: 'var(--radius-card)',
                boxShadow: 'var(--shadow-hard)',
                cursor: activeId ? 'pointer' : 'default',
                border: mine ? '2px solid var(--crav-red)' : '2px solid var(--crav-ink)',
                background: mine ? 'var(--crav-yellow-soft)' : 'var(--crav-white)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 800 }}>{it.name || 'Item'}</span>
                <span style={{ fontWeight: 800 }}>{fmt(itemTotal(it))}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 24 }}>
                {claimers.map((id) => (
                  <span key={id} style={chip(colorOf(id))}>
                    {nameOf(id)}
                  </span>
                ))}
                {claimers.length > 1 && <span style={tag}>split ×{claimers.length}</span>}
                {unclaimed && <span style={tag}>Unclaimed</span>}
              </div>
            </button>
          );
        })}
      </div>

      {split.unclaimedCents > 0 && (
        <p style={{ color: '#DC2626', fontWeight: 600, marginTop: 10 }}>
          {fmt(split.unclaimedCents)} still unclaimed.
        </p>
      )}

      {/* Active diner: tip + confirm they're done choosing */}
      {activeDiner && (
        <DinerPanel
          diner={activeDiner}
          total={totalFor(activeDiner.id)}
          isPayer={activeDiner.id === payerId}
          onTip={(cents) => patchDiner(activeDiner.id, { tipCents: cents, done: false })}
          onToggleDone={() => patchDiner(activeDiner.id, { done: !activeDiner.done })}
        />
      )}

      {/* Totals */}
      <section style={{ marginTop: 16 }}>
        <strong>Live totals</strong>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: 'var(--crav-ink)' }}>
              <th style={{ textAlign: 'left' }}>Diner</th>
              <th>Items</th>
              <th>Tax</th>
              <th>Tip</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {diners.map((d) => {
              const t = totalFor(d.id);
              return (
                <tr
                  key={d.id}
                  style={{ textAlign: 'right', fontWeight: d.id === activeId ? 700 : 400 }}
                >
                  <td style={{ textAlign: 'left' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: d.color,
                        marginRight: 6,
                      }}
                    />
                    {d.name}
                  </td>
                  <td>{fmt(t?.itemsCents ?? 0)}</td>
                  <td>{fmt(t?.taxCents ?? 0)}</td>
                  <td>{fmt(t?.tipCents ?? 0)}</td>
                  <td>{fmt(t?.totalCents ?? 0)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {d.paid ? (
                      <span style={{ color: '#047857', fontWeight: 700, fontSize: 12 }}>✓ Bit</span>
                    ) : (
                      <span style={{ color: '#B45309', fontSize: 12 }}>unpaid</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p style={{ marginTop: 14, fontSize: 14, color: allDone ? '#047857' : '#B45309' }}>
        {allDone
          ? `✓ All ${diners.length} ${diners.length === 1 ? 'friend has' : 'friends have'} confirmed their picks.`
          : `${doneCount} of ${diners.length || 0} friends have confirmed — tap a friend, then “I'm done choosing”.`}
      </p>
      <button
        type="button"
        disabled={diners.length === 0}
        onClick={() => setPhase('dashboard')}
        style={{ ...primaryBtn, opacity: diners.length === 0 ? 0.5 : 1 }}
      >
        Review &amp; settle up →
      </button>
    </Shell>
  );
}

function DinerBar({
  diners,
  activeId,
  payerId,
  onSelect,
  onAdd,
}: {
  diners: Diner[];
  activeId: string | null;
  payerId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  function submit() {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    setName('');
    setAdding(false);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
      {diners.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onSelect(d.id)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            cursor: 'pointer',
            border: d.id === activeId ? '2px solid #0F172A' : '1px solid var(--crav-cream-line)',
            background: d.id === activeId ? '#0F172A' : '#fff',
            color: d.id === activeId ? '#fff' : '#0F172A',
            fontWeight: 600,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 999, background: d.color }} />
          {d.name}
          {d.id === payerId && ' 💳'}
          {d.done && ' ✓'}
        </button>
      ))}

      {adding ? (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Name"
            style={{ padding: 6, width: 110 }}
          />
          <button type="button" onClick={submit}>
            Add
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ padding: '6px 12px' }}>
          + Add diner
        </button>
      )}
    </div>
  );
}

const TIP_PERCENTS = [0, 10, 12, 15, 18];

function DinerPanel({
  diner,
  total,
  isPayer,
  onTip,
  onToggleDone,
}: {
  diner: Diner;
  total: { itemsCents: number; taxCents: number; tipCents: number; totalCents: number } | undefined;
  isPayer: boolean;
  onTip: (cents: number) => void;
  onToggleDone: () => void;
}) {
  const [custom, setCustom] = useState('');
  const items = total?.itemsCents ?? 0;
  const tax = total?.taxCents ?? 0;
  const tip = total?.tipCents ?? 0;
  const grand = total?.totalCents ?? 0;
  const activePct = TIP_PERCENTS.find((pct) => Math.round((items * pct) / 100) === tip);

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
      <strong>{diner.name}&apos;s tip</strong>
      <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--crav-ink)' }}>
        Tip on {fmt(items)} of items — their call.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {TIP_PERCENTS.map((pct) => {
          const active = pct === activePct;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => onTip(Math.round((items * pct) / 100))}
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
            onBlur={() => custom !== '' && onTip(Math.round(parseFloat(custom || '0') * 100))}
            style={{ width: 80, padding: 6 }}
          />
          <span style={{ fontSize: 13, color: 'var(--crav-ink)' }}>₪</span>
        </span>
      </div>

      <p style={{ marginTop: 12, fontSize: 15 }}>
        Items {fmt(items)} · Tax {fmt(tax)} · Tip <strong>{fmt(tip)}</strong> ·{' '}
        {isPayer ? 'Their share ' : 'Owes '}
        <strong style={{ fontSize: 17 }}>{fmt(grand)}</strong>
      </p>

      {isPayer && (
        <p style={{ fontSize: 14, color: 'var(--crav-ink)', marginTop: 4 }}>
          💳 {diner.name} covered the bill — everyone else Bit-pays them back.
        </p>
      )}

      <button
        type="button"
        onClick={onToggleDone}
        style={{
          marginTop: 10,
          padding: '12px 22px',
          fontWeight: 800,
          fontSize: 15,
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
          color: diner.done ? '#065F46' : '#fff',
          background: diner.done ? '#D1FAE5' : '#0F172A',
        }}
      >
        {diner.done ? `✓ ${diner.name} is done — tap to change` : "I'm done choosing"}
      </button>
    </section>
  );
}

/**
 * Simulated Bit payment sheet. Bit (ביט) never actually moves money here — this
 * is a faithful-looking confirmation that resolves a diner's share locally.
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
  onConfirm: () => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'processing' | 'done'>('confirm');

  async function pay() {
    setPhase('processing');
    await new Promise((r) => setTimeout(r, 1300));
    onConfirm();
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
              <p style={{ color: 'var(--crav-ink)', margin: 0 }}>
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
              <p style={{ color: 'var(--crav-ink)', margin: '0 0 4px' }}>Paying</p>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#0F172A' }}>{fmt(amountCents)}</div>
              <p style={{ color: 'var(--crav-ink)', margin: '6px 0 0' }}>
                to <strong>{payeeName}</strong>
              </p>
              <div
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  background: '#FBF1DC',
                  borderRadius: 10,
                  fontSize: 13,
                  color: 'var(--crav-ink)',
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
                    color: 'var(--crav-ink)',
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

// ── shared layout + style helpers ──────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        fontFamily: 'var(--font-body)',
        padding: 'clamp(1.25rem, 4vw, 2.5rem)',
        maxWidth: 820,
        margin: '0 auto',
      }}
    >
      <span className="crav-tagline">Feel the change</span>
      <h1 style={{ marginTop: 12, marginBottom: 0, fontSize: 'clamp(3rem, 8vw, 5rem)' }}>
        Split it.
      </h1>
      <p style={{ color: 'var(--crav-ink-soft)', marginTop: 6, fontWeight: 700, fontSize: 17 }}>
        Snap the receipt, tap what you had, add your tip, and pay with Bit.
      </p>
      {children}
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  marginTop: 16,
  padding: '14px 30px',
  fontSize: '1.05rem',
  background: 'var(--crav-red)',
  color: '#fff',
  cursor: 'pointer',
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--crav-red)',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 14,
};

// ── dashboard style helpers ─────────────────────────────────────────────
const banner: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  fontSize: 14,
  lineHeight: 1.4,
};

const mealList: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const mealRow: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--crav-cream-line)',
  borderRadius: 10,
  background: '#fff',
};

const chip = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  background: color,
});

// Small cream "sticker" pill used for status labels on the item cards,
// matching the warm sticker look of the rest of the UI.
const tag: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1.5px solid var(--crav-ink)',
  background: 'var(--crav-cream-soft)',
  color: 'var(--crav-ink)',
};
