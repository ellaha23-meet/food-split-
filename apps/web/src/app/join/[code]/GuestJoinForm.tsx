'use client';

/**
 * P2.3: Guest join form — name + color picker → ephemeral participant.
 * Client component; calls the /api/participants route to create the row.
 * G4: No install, no account, no camera required.
 */

import { useState } from 'react';
import { LiveSession } from '@/components/LiveSession';

const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

interface GuestJoinFormProps {
  sessionId: string;
}

export function GuestJoinForm({ sessionId }: GuestJoinFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0] ?? '#EF4444');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, displayName: name.trim(), color }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to join');
      }

      const data = (await res.json()) as { participantId: string };
      setParticipantId(data.participantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  if (participantId) {
    return <LiveSession sessionId={sessionId} participantId={participantId} />;
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="card" style={{ maxWidth: 420 }}>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="name" className="label" style={{ display: 'block', marginBottom: '0.4rem' }}>
          Your name
        </label>
        <input
          id="name"
          className="field"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          placeholder="e.g. Alice"
          required
        />
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <p className="label" style={{ marginBottom: '0.4rem' }}>Pick a color</p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); }}
              style={{
                width: '2.25rem',
                height: '2.25rem',
                borderRadius: '50%',
                background: c,
                border: color === c ? '4px solid var(--ink)' : '2px solid rgba(0,0,0,0.12)',
                cursor: 'pointer',
                transform: color === c ? 'scale(1.1)' : 'none',
                transition: 'transform 0.1s ease',
              }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="btn btn--primary btn--lg btn--block"
      >
        {submitting ? 'Joining…' : 'Join session'}
      </button>
    </form>
  );
}
