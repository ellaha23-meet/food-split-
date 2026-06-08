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
            <p style={{ marginTop: 16, fontWeight: 600, color: '#2563EB' }}>
              Reading your receipt…
            </p>
          ) : (
            <>
              <p style={{ marginTop: 12, color: '#475569' }}>
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
                style={{
                  marginTop: 8,
                  padding: '12px 24px',
                  fontWeight: 700,
                  background: '#2563EB',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Take a photo
              </button>
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={enterManually}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
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
      <h2>Review the bill</h2>
      <p style={{ color: '#64748B', marginTop: -8 }}>
        {photoUrl ? 'Scanned from your photo — tap any field to fix it.' : 'Enter each item below.'}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
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
                  value={it.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Margherita pizza"
                  style={{ width: '100%', padding: 6, boxSizing: 'border-box' }}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  value={it.qty}
                  onChange={(e) => update(i, { qty: e.target.value })}
                  style={{ width: '100%', padding: 6, boxSizing: 'border-box' }}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                  placeholder="12.00"
                  style={{ width: '100%', padding: 6, boxSizing: 'border-box' }}
                />
              </td>
              <td>
                <button type="button" onClick={() => removeRow(i)} aria-label="Remove">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow} style={{ marginTop: 8 }}>
        + Add item
      </button>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <label>
          Tax ₪
          <input
            type="number"
            step="0.01"
            min="0"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            style={{ width: 90, padding: 6, marginLeft: 6 }}
          />
        </label>
      </div>

      <p style={{ marginTop: 12, fontSize: 15 }}>
        Subtotal {fmt(subtotalCents)} · Receipt total <strong>{fmt(grandTotal)}</strong>
      </p>
      <p style={{ marginTop: -6, fontSize: 13, color: '#64748B' }}>
        Each diner adds their own tip when they pick what they had.
      </p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        style={{ padding: '10px 20px', fontWeight: 600, background: '#2563EB', color: '#fff', borderRadius: 8 }}
      >
        {submitting ? 'Creating…' : 'Create session'}
      </button>
    </section>
  );
}
