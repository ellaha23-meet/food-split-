'use client';

/**
 * Live session state hook (P3.3 / P3.4 / P5.2).
 *
 * Single source of truth = the server. This hook fetches the full computed
 * state from /api/sessions/[id]/state, then re-fetches whenever a relevant
 * row changes (Supabase Realtime postgres_changes), with a polling safety net.
 *
 * G3: the client never computes authoritative money — it renders engine output.
 * P3.4: on (re)mount we rehydrate entirely from the server; no client-persisted
 * authoritative state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Session, LineItem, Participant, Claim, Settlement } from '@/types/database';

export interface ParticipantTotalView {
  participantId: string;
  claimedSubtotalCents: number;
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number;
}

export interface SessionState {
  session: Session;
  /** Display name of the host — the person everyone pays back. */
  hostName: string;
  lineItems: LineItem[];
  participants: Participant[];
  claims: Claim[];
  settlements: Settlement[];
  totals: {
    perParticipant: ParticipantTotalView[];
    unclaimedCents: number;
    grandTotalCents: number;
  };
}

export function useSessionState(sessionId: string) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/state`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`State fetch failed (${res.status})`);
      setState((await res.json()) as SessionState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      inFlight.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    void refetch();

    // Realtime: any change to this session's rows triggers a full rehydrate.
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claim' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participant', filter: `session_id=eq.${sessionId}` }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session', filter: `id=eq.${sessionId}` }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlement', filter: `session_id=eq.${sessionId}` }, () => void refetch())
      .subscribe();

    // Polling safety net (covers environments where Realtime isn't wired up).
    const poll = setInterval(() => void refetch(), 4000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [sessionId, refetch]);

  return { state, error, refetch };
}
