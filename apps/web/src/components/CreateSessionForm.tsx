'use client';

/**
 * Host entry — snap the receipt, review the digitized items, open the table.
 *
 * Flow:
 *   capture  → take/upload a photo of the receipt
 *   scanning → simulated receipt digitization (real OCR is P4 + Anthropic key)
 *   review   → edit the scanned items + tax, then create the session
 *
 * The receipt now captures items + tax only — tip is a per-diner choice made
 * later in the live view — so the session is created with tip_cents = 0.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmt } from '@/lib/format';

interface ItemDraft {
  name: string;
  qty: string;
  price: string; // shekels
}

const BLANK: ItemDraft = { name: '', qty: '1', price: '' };

// Stand-in for receipt OCR (P4). Until the vision model is wired up, a snapshot
// "digitizes" into this editable draft so the host can correct and continue.
const DEMO_SCAN: { items: ItemDraft[]; tax: string } = {
  items: [
    { name: 'Shakshuka', qty: '1', price: '52.00' },
    { name: 'Hummus plate', qty: '1', price: '38.00' },
    { name: 'Grilled sea bass', qty: '1', price: '94.00' },
    { name: 'Greek salad', qty: '1', price: '44.00' },
    { name: 'Lemonade', qty: '2', price: '16.00' },
    { name: 'Espresso', qty: '2', price: '12.00' },
  ],
  tax: '0.00',
};

type Phase = 'capture' | 'scanning' | 'review';

export function CreateSessionForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('capture');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([{ ...BLANK }]);
  const [tax, setTax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
    setPhase('scanning');
    // Simulated digitization pass.
    setTimeout(() => {
      setItems(DEMO_SCAN.items.map((it) => ({ ...it })));
      setTax(DEMO_SCAN.tax);
      setPhase('review');
    }, 1700);
  }

  function enterManually() {
    setItems([{ ...BLANK }]);
    setTax('');
    setPhase('review');
  }

  function update(i: number, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addRow() {
    setItems((arr) => [...arr, { ...BLANK }]);
  }
  function removeRow(i: number) {
    setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  const dollarsToCents = (s: string) => Math.round(parseFloat(s || '0') * 100);
  const subtotalCents = items.reduce(
    (a, it) => a + (parseInt(it.qty || '0', 10) || 0) * dollarsToCents(it.price),
    0,
  );
  const grandTotal = subtotalCents + dollarsToCents(tax);

  async function submit() {
    const parsed = items
      .filter((it) => it.name.trim() && it.price)
      .map((it) => ({
        name: it.name.trim(),
        qty: parseInt(it.qty || '1', 10) || 1,
        unitPriceCents: dollarsToCents(it.price),
      }));
    if (parsed.length === 0) {
      setError('Add at least one item with a name and price.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/host-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: parsed,
          taxCents: dollarsToCents(tax),
          tipCents: 0, // per-diner tip is chosen later, in the live view
          tipMode: 'proportional',
        }),
      });
      const body = (await res.json()) as { sessionId?: string; error?: string };
      if (!res.ok || !body.sessionId) throw new Error(body.error ?? 'Failed to create session');
      router.push(`/host/${body.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  // ── Capture / scanning ──────────────────────────────────────────────────
  if (phase !== 'review') {
    return (
      <section style={{ marginTop: 24 }}>
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
            <p style={{ marginTop: 16, fontWeight: 800, color: 'var(--red)' }}>
              Reading your receipt…
            </p>
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
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="btn btn--primary btn--lg"
                style={{ marginTop: 16 }}
              >
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
      </section>
    );
  }

  // ── Review ──────────────────────────────────────────────────────────────
  return (
    <section style={{ marginTop: 24 }}>
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
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="field"
                    value={it.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Margherita pizza"
                  />
                </td>
                <td>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => update(i, { qty: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                    placeholder="12.00"
                  />
                </td>
                <td>
                  <button type="button" className="icon-btn" onClick={() => removeRow(i)} aria-label="Remove">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn--sm" onClick={addRow} style={{ marginTop: 8 }}>
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
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              style={{ width: 110 }}
            />
          </label>
        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>
        Subtotal {fmt(subtotalCents)} · Receipt total <strong>{fmt(grandTotal)}</strong>
      </p>
      <p className="muted" style={{ marginTop: -6, fontSize: 14, fontWeight: 700 }}>
        Each diner adds their own tip when they pick what they had.
      </p>

      {error && <p className="error">{error}</p>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        className="btn btn--primary btn--lg"
        style={{ marginTop: 8 }}
      >
        {submitting ? 'Creating…' : 'Create session'}
      </button>
    </section>
  );
}
