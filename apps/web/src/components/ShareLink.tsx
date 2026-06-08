'use client';

/**
 * Share panel — the join code + a copyable deep link + a QR image.
 * G4: guests need nothing but this link — no install, account, or app.
 */

import { useEffect, useState } from 'react';

export function ShareLink({ joinCode }: { joinCode: string }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/join/${joinCode}`);
  }, [joinCode]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the link is still visible to copy manually */
    }
  }

  // Best-effort QR via a public renderer; degrades gracefully if blocked.
  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`
    : '';

  return (
    <section
      className="card"
      style={{
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div className="label">Join code</div>
        <div className="brand brand--lg" style={{ letterSpacing: 4 }}>{joinCode}</div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <input
            className="field"
            readOnly
            value={url}
            style={{ flex: 1, minWidth: 200 }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="btn btn--sm btn--dark" onClick={() => void copy()}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qrSrc && (
        <img
          src={qrSrc}
          alt={`QR code for ${joinCode}`}
          width={180}
          height={180}
          style={{ borderRadius: 16, border: '3px solid var(--ink)', background: '#fff' }}
        />
      )}
    </section>
  );
}
