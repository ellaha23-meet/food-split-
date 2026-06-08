'use client';

/**
 * P2.3: Guest join form — name + color picker → ephemeral participant.
 * Client component; calls the /api/participants route to create the row.
 * G4: No install, no account, no camera required.
 */

import { useState } from 'react';

const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

interface GuestJoinFormProps {
  sessionId: string;
  joinCode: string;
}

export function GuestJoinForm({ sessionId, joinCode }: GuestJoinFormProps) {
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
    return (
      <div>
        <p>
          You joined as <strong>{name}</strong>!
        </p>
        <p>
          Session: <code>{joinCode}</code> — Participant ID: <code>{participantId}</code>
        </p>
        <p><em>(Claiming UI comes in P3.)</em></p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} style={{ maxWidth: '320px' }}>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Your name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          placeholder="e.g. Alice"
          required
          style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <p style={{ marginBottom: '0.25rem' }}>Pick a color</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); }}
              style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                background: c,
                border: color === c ? '3px solid #000' : '2px solid transparent',
                cursor: 'pointer',
              }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        style={{ padding: '0.5rem 1.5rem' }}
      >
        {submitting ? 'Joining…' : 'Join session'}
      </button>
    </form>
  );
}
