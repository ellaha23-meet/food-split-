'use client';

/**
 * Tally — self-contained client-side prototype (no backend).
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
import { Shell, BitModal } from '@/components/ui';

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

  function enterManually() {
    setItems([{ id: newId(), name: '', qty: 1, unitCents: 0 }]);
    setTaxCents(0);
    setPhase('review');
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
      <Shell sticker="Feel it">
        <h2 className="section-title">Scan the receipt</h2>
        <div className="dropzone container--narrow" style={{ marginTop: 8 }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Receipt"
              style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 12, objectFit: 'contain' }}
            />
          ) : (
            <div className="dropzone__icon">📷</div>
          )}

          {phase === 'scanning' ? (
            <p style={{ marginTop: 16, fontWeight: 800, color: 'var(--red)' }}>Reading your receipt…</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 12, fontWeight: 700 }}>
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
              <button type="button" onClick={() => fileInput.current?.click()} className="btn btn--primary btn--lg" style={{ marginTop: 16 }}>
                Take a photo
              </button>
              <div style={{ marginTop: 14 }}>
                <button type="button" onClick={enterManually} className="btn-link">
                  or enter items manually
                </button>
              </div>
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
      <Shell sticker="Pure quality">
        <h2 className="section-title">Review the bill</h2>
        <p className="muted" style={{ marginTop: 0, fontWeight: 700 }}>
          {photoUrl ? 'Scanned from your photo — tap any field to fix it.' : 'Enter each item below.'}
        </p>
        <div className="card card--flat" style={{ marginTop: 12 }}>
          <table className="edit-table">
            <thead>
              <tr>
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
                      className="field"
                      value={it.name}
                      onChange={(e) => upd(it.id, { name: e.target.value })}
                      placeholder="Margherita pizza"
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      value={it.qty}
                      onChange={(e) => upd(it.id, { qty: parseInt(e.target.value || '1', 10) || 1 })}
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      min="0"
                      value={it.unitCents ? (it.unitCents / 100).toString() : ''}
                      onChange={(e) =>
                        upd(it.id, { unitCents: Math.round(parseFloat(e.target.value || '0') * 100) })
                      }
                      placeholder="12.00"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
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
            className="btn btn--sm"
            onClick={() => setItems((arr) => [...arr, { id: newId(), name: '', qty: 1, unitCents: 0 }])}
            style={{ marginTop: 8 }}
          >
            + Add item
          </button>

          <div style={{ marginTop: 16 }}>
            <label className="row" style={{ gap: 8 }}>
              <span className="label">Tax ₪</span>
              <input
                className="field"
                type="number"
                step="0.01"
                min="0"
                value={taxCents ? (taxCents / 100).toString() : ''}
                onChange={(e) => setTaxCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                style={{ width: 110 }}
              />
            </label>
          </div>
        </div>

        <p style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>
          Subtotal {fmt(subtotal)} · Receipt total <strong>{fmt(subtotal + taxCents)}</strong>
        </p>
        <p className="muted" style={{ marginTop: -6, fontSize: 14, fontWeight: 700 }}>
          Each diner adds their own tip when they pick what they had.
        </p>

        <button
          type="button"
          disabled={!valid}
          onClick={() => setPhase('split')}
          className="btn btn--primary btn--lg"
          style={{ marginTop: 8 }}
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
    <Shell sticker="Who's in">
      <h2 className="section-title" style={{ marginBottom: 4 }}>Who had what?</h2>
      <p className="muted" style={{ marginTop: 0, fontWeight: 700 }}>
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
        <p className="error">Add a diner to start tapping items.</p>
      ) : (
        <p style={{ fontSize: 15, fontWeight: 700 }} className="muted">
          Tapping as{' '}
          <strong style={{ color: activeDiner.color }}>{activeDiner.name}</strong>
        </p>
      )}

      {/* Items grid */}
      <div className="item-grid">
        {items.map((it) => {
          const claimers = claims[it.id] ?? [];
          const mine = activeId ? claimers.includes(activeId) : false;
          const unclaimed = claimers.length === 0;
          const cls =
            'item-card' + (mine ? ' item-card--mine' : unclaimed ? ' item-card--unclaimed' : '');
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => toggleClaim(it.id)}
              disabled={!activeId}
              className={cls}
            >
              <div className="item-name">{it.name || 'Item'}</div>
              <div className="item-price">{fmt(itemTotal(it))}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', minHeight: 16 }}>
                {claimers.map((id) => (
                  <span
                    key={id}
                    className="dot"
                    title={nameOf(id)}
                    style={{ background: colorOf(id) }}
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

      {split.unclaimedCents > 0 && (
        <p className="error" style={{ marginTop: 10 }}>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {diners.map((d) => {
                const t = totalFor(d.id);
                return (
                  <tr key={d.id} className={d.id === activeId ? 'is-you' : undefined}>
                    <td>
                      <span className="dot" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle', background: d.color }} />
                      {d.name}
                    </td>
                    <td>{fmt(t?.itemsCents ?? 0)}</td>
                    <td>{fmt(t?.taxCents ?? 0)}</td>
                    <td>{fmt(t?.tipCents ?? 0)}</td>
                    <td>{fmt(t?.totalCents ?? 0)}</td>
                    <td>
                      {d.paid ? (
                        <span className="badge badge--paid">✓ Bit</span>
                      ) : (
                        <span className="badge badge--pending">unpaid</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    <div className="row" style={{ margin: '14px 0' }}>
      {diners.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onSelect(d.id)}
          className={'chip' + (d.id === activeId ? ' chip--active' : '')}
        >
          <span className="dot" style={{ background: d.color }} />
          {d.name}
          {d.id === payerId && ' 💳'}
          {d.paid && ' ✓'}
        </button>
      ))}

      {adding ? (
        <span className="row" style={{ gap: 6 }}>
          <input
            className="field"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Name"
            style={{ width: 130 }}
          />
          <button type="button" className="btn btn--sm btn--dark" onClick={submit}>
            Add
          </button>
        </span>
      ) : (
        <button type="button" className="chip" onClick={() => setAdding(true)}>
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
    <section className="panel">
      <h3 className="section-title">{diner.name}&apos;s tip</h3>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>
        Tip on {fmt(items)} of items — their call.
      </p>

      {diner.paid ? (
        <p style={{ color: 'var(--green)', fontWeight: 800 }}>
          ✓ Paid {fmt(grand)} with Bit
        </p>
      ) : (
        <>
          <div className="row">
            {TIP_PERCENTS.map((pct) => {
              const active = pct === activePct;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => onTip(Math.round((items * pct) / 100))}
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
                onBlur={() => custom !== '' && onTip(Math.round(parseFloat(custom || '0') * 100))}
                style={{ width: 90 }}
              />
              <span className="muted" style={{ fontWeight: 700 }}>₪</span>
            </span>
          </div>

          <p style={{ marginTop: 14, fontSize: 16, fontWeight: 700 }}>
            Items {fmt(items)} · Tax {fmt(tax)} · Tip <strong>{fmt(tip)}</strong> ·{' '}
            {isPayer ? 'Their share ' : 'Owes '}
            <strong className="amount" style={{ fontSize: 22 }}>{fmt(grand)}</strong>
          </p>

          {isPayer ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 4, fontWeight: 700 }}>
              💳 {diner.name} covered the bill — everyone else Bit-pays them back.
            </p>
          ) : (
            <button
              type="button"
              disabled={grand <= 0}
              onClick={onPay}
              className="btn btn--bit btn--lg"
              style={{ marginTop: 6 }}
            >
              Pay {fmt(grand)} to {payerName} with Bit
            </button>
          )}
        </>
      )}
    </section>
  );
}
