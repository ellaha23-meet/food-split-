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
      style={{
        background: '#FBF1DC',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        gap: 20,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: '#666' }}>Join code</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>{joinCode}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            readOnly
            value={url}
            style={{ width: 280, padding: 6, fontSize: 13 }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" onClick={() => void copy()}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qrSrc && <img src={qrSrc} alt={`QR code for ${joinCode}`} width={180} height={180} />}
    </section>
  );
}
