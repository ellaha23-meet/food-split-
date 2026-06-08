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

import { useRef, useState } from 'react';
import { fmt } from '@/lib/format';
import { computeSplit, itemTotal, type PItem } from '@/lib/prototype/split';

type Phase = 'capture' | 'scanning' | 'review' | 'split';

interface Diner {
  id: string;
  name: string;
  color: string;
  tipCents: number;
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

  const fileInput = useRef<HTMLInputElement>(null);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
    setPhase('scanning');
    setTimeout(() => {
      setItems(DEMO_SCAN.items.map((it) => ({ ...it })));
      setTaxCents(DEMO_SCAN.taxCents);
      setPhase('review');
    }, 1700);
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

  // ── diner + claim actions ────────────────────────────────────────────
  function addDiner(name: string) {
    const id = newId();
    const color = COLORS[diners.length % COLORS.length] ?? '#3B82F6';
    setDiners((d) => [...d, { id, name, color, tipCents: 0, paid: false }]);
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
            border: '2px dashed #CBD5E1',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
            background: '#F8FAFC',
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
            <p style={{ marginTop: 16, fontWeight: 600, color: '#2563EB' }}>Reading your receipt…</p>
          ) : (
            <>
              <p style={{ marginTop: 12, color: INK }}>
                Take a photo of your receipt and we&apos;ll turn it into a tappable bill.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhoto}
                style={{ display: 'none' }}
              />
              <button type="button" onClick={() => fileInput.current?.click()} style={primaryBtn}>
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
        <p style={{ color: INK, marginTop: -8 }}>
          {photoUrl ? 'Scanned from your photo — tap any field to fix it.' : 'Enter each item below.'}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: INK, fontSize: 13 }}>
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
        <p style={{ marginTop: -6, fontSize: 13, color: INK }}>
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
  // Split
  // ════════════════════════════════════════════════════════════════════
  return (
    <Shell>
      <h2 style={{ marginBottom: 4 }}>Who had what?</h2>
      <p style={{ color: INK, marginTop: 0 }}>
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
        <p style={{ fontSize: 14, color: INK }}>
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
                fontFamily: 'system-ui',
                color: INK,
                textAlign: 'left',
                padding: 14,
                borderRadius: 12,
                cursor: activeId ? 'pointer' : 'default',
                border: mine ? '2px solid #2563EB' : '1px solid #E2E8F0',
                background: mine ? '#EFF6FF' : '#fff',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                transition: 'border-color 120ms, background 120ms',
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
                <span style={{ fontWeight: 600 }}>{it.name || 'Item'}</span>
                <span style={{ fontWeight: 600 }}>{fmt(itemTotal(it))}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 18 }}>
                {claimers.map((id) => (
                  <span
                    key={id}
                    title={nameOf(id)}
                    style={{ width: 14, height: 14, borderRadius: 999, background: colorOf(id) }}
                  />
                ))}
                {claimers.length > 1 && (
                  <span style={pillTag('#EFF6FF', '#2563EB')}>split ×{claimers.length}</span>
                )}
                {unclaimed && <span style={pillTag('#F1F5F9', INK)}>Unclaimed</span>}
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

      {/* Active diner: tip + pay */}
      {activeDiner && (
        <DinerPanel
          diner={activeDiner}
          total={totalFor(activeDiner.id)}
          isPayer={activeDiner.id === payerId}
          payerName={payerName}
          onTip={(cents) => patchDiner(activeDiner.id, { tipCents: cents })}
          onPay={() => setPayFor(activeDiner)}
        />
      )}

      {/* Totals */}
      <section style={{ marginTop: 16 }}>
        <strong>Live totals</strong>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: INK }}>
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
            border: d.id === activeId ? '2px solid #0F172A' : '1px solid #CBD5E1',
            background: d.id === activeId ? '#0F172A' : '#fff',
            color: d.id === activeId ? '#fff' : '#0F172A',
            fontWeight: 600,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 999, background: d.color }} />
          {d.name}
          {d.id === payerId && ' 💳'}
          {d.paid && ' ✓'}
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
  payerName,
  onTip,
  onPay,
}: {
  diner: Diner;
  total: { itemsCents: number; taxCents: number; tipCents: number; totalCents: number } | undefined;
  isPayer: boolean;
  payerName: string;
  onTip: (cents: number) => void;
  onPay: () => void;
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
        background: '#F0F9FF',
        border: '1px solid #BAE6FD',
        borderRadius: 12,
      }}
    >
      <strong>{diner.name}&apos;s tip</strong>
      <p style={{ margin: '4px 0 10px', fontSize: 13, color: INK }}>
        Tip on {fmt(items)} of items — their call.
      </p>

      {diner.paid ? (
        <p style={{ color: '#047857', fontWeight: 700 }}>
          ✓ Paid {fmt(grand)} with Bit
        </p>
      ) : (
        <>
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
                    border: active ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: active ? '#2563EB' : '#fff',
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
              <span style={{ fontSize: 13, color: INK }}>₪</span>
            </span>
          </div>

          <p style={{ marginTop: 12, fontSize: 15 }}>
            Items {fmt(items)} · Tax {fmt(tax)} · Tip <strong>{fmt(tip)}</strong> ·{' '}
            {isPayer ? 'Their share ' : 'Owes '}
            <strong style={{ fontSize: 17 }}>{fmt(grand)}</strong>
          </p>

          {isPayer ? (
            <p style={{ fontSize: 14, color: INK, marginTop: 4 }}>
              💳 {diner.name} covered the bill — everyone else Bit-pays them back.
            </p>
          ) : (
            <button
              type="button"
              disabled={grand <= 0}
              onClick={onPay}
              style={{
                marginTop: 4,
                padding: '12px 22px',
                fontWeight: 800,
                fontSize: 16,
                color: '#062E2E',
                background: grand > 0 ? '#00C2C7' : '#CBD5E1',
                border: 'none',
                borderRadius: 12,
                cursor: grand > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Pay {fmt(grand)} to {payerName} with Bit
            </button>
          )}
        </>
      )}
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
              <div style={{ fontSize: 40, fontWeight: 900, color: '#0F172A' }}>{fmt(amountCents)}</div>
              <p style={{ color: '#475569', margin: '6px 0 0' }}>
                to <strong>{payeeName}</strong>
              </p>
              <div
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  background: '#F1F5F9',
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

// ── shared layout + style helpers ──────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ fontFamily: 'system-ui', color: INK, padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 0 }}>Splity</h1>
      <p style={{ color: INK, marginTop: 6 }}>
        Snap the receipt, tap what you had, add your tip, and pay with Bit.
      </p>
      {children}
    </main>
  );
}

// Shared ink color — one consistent text color across the app (no grey text).
const INK = '#0F172A';

// Small rounded tag used on the item cards, matching the app's pill aesthetic.
const pillTag = (background: string, color: string): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  background,
  color,
});

const primaryBtn: React.CSSProperties = {
  marginTop: 12,
  padding: '12px 24px',
  fontWeight: 700,
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
};
