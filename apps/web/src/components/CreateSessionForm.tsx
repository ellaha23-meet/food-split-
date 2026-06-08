'use client';

/**
 * Host receipt-entry form (prototype stand-in for receipt digitization, P4).
 * Builds the line items + tax + tip, then creates a session and routes the
 * host to the live view where the shareable link lives.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmt } from '@/lib/format';

interface ItemDraft {
  name: string;
  qty: string;
  price: string; // dollars
}

const BLANK: ItemDraft = { name: '', qty: '1', price: '' };

export function CreateSessionForm() {
  const router = useRouter();
  const [items, setItems] = useState<ItemDraft[]>([{ ...BLANK }]);
  const [tax, setTax] = useState('');
  const [tip, setTip] = useState('');
  const [tipMode, setTipMode] = useState<'proportional' | 'even'>('proportional');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const grandTotal = subtotalCents + dollarsToCents(tax) + dollarsToCents(tip);

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
          tipCents: dollarsToCents(tip),
          tipMode,
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

  return (
    <section style={{ marginTop: 24 }}>
      <h2>New receipt</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#666', fontSize: 13 }}>
            <th>Item</th>
            <th style={{ width: 60 }}>Qty</th>
            <th style={{ width: 110 }}>Unit $</th>
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
          Tax $
          <input
            type="number"
            step="0.01"
            min="0"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            style={{ width: 90, padding: 6, marginLeft: 6 }}
          />
        </label>
        <label>
          Tip $
          <input
            type="number"
            step="0.01"
            min="0"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            style={{ width: 90, padding: 6, marginLeft: 6 }}
          />
        </label>
        <label>
          Tip mode
          <select
            value={tipMode}
            onChange={(e) => setTipMode(e.target.value as 'proportional' | 'even')}
            style={{ marginLeft: 6 }}
          >
            <option value="proportional">proportional</option>
            <option value="even">even per head</option>
          </select>
        </label>
      </div>

      <p style={{ marginTop: 12, fontSize: 15 }}>
        Subtotal {fmt(subtotalCents)} · Grand total <strong>{fmt(grandTotal)}</strong>
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
