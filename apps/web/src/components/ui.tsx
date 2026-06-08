'use client';

/**
 * Shared presentational building blocks for Tally's brand UI.
 * Purely visual — no business logic lives here.
 */

import { useState } from 'react';
import { fmt } from '@/lib/format';

/** A chunky, hand-drawn wave divider in brand red. */
export function Wave({ color = 'var(--red)' }: { color?: string }) {
  return (
    <div className="wave" style={{ color }} aria-hidden="true">
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none">
        <path
          d="M0 20 C 150 38, 300 2, 450 20 S 750 38, 900 20 S 1200 2, 1200 20 V40 H0 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

/**
 * Page shell — the CRAV-style header (bubble wordmark + sticker + tagline),
 * a wave divider, then the page content in a centered container.
 */
export function Shell({
  children,
  sticker,
  subtitle = 'host',
  showSubtitle = false,
}: {
  children: React.ReactNode;
  sticker?: string;
  subtitle?: string;
  showSubtitle?: boolean;
}) {
  return (
    <main className="page">
      <div className="container">
        <header style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            {sticker && <span className="sticker" style={{ marginBottom: 10, display: 'inline-block' }}>{sticker}</span>}
            <h1 className="brand brand--xl" style={{ marginTop: sticker ? 6 : 0 }}>
              Tally{showSubtitle ? <span className="brand--sm" style={{ display: 'block', color: 'var(--ink)', WebkitTextStroke: 0 }}>{subtitle}</span> : null}
            </h1>
            <p className="tagline">
              Snap the receipt, tap what you had, add your tip, and pay with Bit.
            </p>
          </div>
        </header>
        <Wave />
        {children}
      </div>
    </main>
  );
}

/**
 * Simulated Bit payment sheet. Bit (ביט) never actually moves money here — this
 * is a faithful-looking confirmation that resolves a diner's share locally.
 */
export function BitModal({
  amountCents,
  payeeName,
  onClose,
  onConfirm,
}: {
  amountCents: number;
  payeeName: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
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
      className="modal-overlay"
      onClick={phase === 'processing' ? undefined : onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1 }}>bit</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>תשלום מהיר</span>
        </div>

        <div className="modal__body">
          {phase === 'done' ? (
            <>
              <div style={{ fontSize: 52 }}>✅</div>
              <p style={{ fontWeight: 900, fontSize: 18, margin: '8px 0 2px' }}>Payment sent</p>
              <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
                {fmt(amountCents)} to {payeeName}
              </p>
              <button type="button" onClick={onClose} className="btn btn--dark" style={{ marginTop: 18 }}>
                Done
              </button>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 4px', fontWeight: 700 }}>Paying</p>
              <div className="amount" style={{ fontSize: 44, color: 'var(--ink)' }}>{fmt(amountCents)}</div>
              <p className="muted" style={{ margin: '6px 0 0', fontWeight: 700 }}>
                to <strong>{payeeName}</strong>
              </p>
              <div
                className="muted"
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  background: '#f4efe3',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Linked: Visa •••• 4821
              </div>
              <button
                type="button"
                disabled={phase === 'processing'}
                onClick={() => void pay()}
                className="btn btn--bit btn--block"
                style={{ marginTop: 18 }}
              >
                {phase === 'processing' ? 'Sending…' : 'Confirm payment'}
              </button>
              {phase !== 'processing' && (
                <button type="button" onClick={onClose} className="btn-link" style={{ marginTop: 10, color: 'var(--ink-soft)' }}>
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
