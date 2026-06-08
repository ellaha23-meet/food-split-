/**
 * P2.2: Join code resolution + capability token minting (G9).
 *
 * A join code grants read on the session + write on the holder's own
 * participant + claims. Token scope is the narrowest possible (G9).
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { Session } from '@/types/database';

export interface ResolveJoinCodeResult {
  session: Session;
}

export async function resolveJoinCode(joinCode: string): Promise<ResolveJoinCodeResult> {
  const { data: session, error } = await supabaseAdmin
    .from('session')
    .select('*')
    .eq('join_code', joinCode.toUpperCase())
    .single();

  if (error || !session) {
    throw new Error(`Invalid or expired join code: ${joinCode}`);
  }

  return { session };
}

export interface MintGuestTokenInput {
  sessionId: string;
  participantId: string;
}

export interface MintGuestTokenResult {
  token: string;
}

/**
 * Mint a capability token for a guest participant.
 * The token carries: role=guest, session_id, participant_id.
 * Supabase RLS uses these claims to scope access (G9).
 */
export async function mintGuestToken(
  input: MintGuestTokenInput,
): Promise<MintGuestTokenResult> {
  const { sessionId, participantId } = input;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: `guest+${participantId}@tally.internal`,
    options: {
      data: {
        role: 'guest',
        session_id: sessionId,
        participant_id: participantId,
      },
    },
  });

  if (error || !data.properties) {
    throw new Error(`Failed to mint guest token: ${error?.message ?? 'unknown error'}`);
  }

  // The Supabase admin link response contains the token in hashed_token
  const token = data.properties.hashed_token ?? '';
  return { token };
}

/**
 * Build the shareable join URL for a session.
 */
export function buildJoinUrl(joinCode: string, baseUrl?: string): string {
  const base = baseUrl ?? process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';
  return `${base}/join/${joinCode}`;
}

/**
 * Build a QR code data URL for the join link.
 * Returns the join URL directly (QR rendering delegated to the UI layer, P3).
 */
export function buildQrDataUrl(joinCode: string, baseUrl?: string): string {
  return buildJoinUrl(joinCode, baseUrl);
}
