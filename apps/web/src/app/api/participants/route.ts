/**
 * POST /api/participants — create an ephemeral participant (P2.3).
 *
 * Body: { sessionId, displayName, color }
 * Response: { participantId }
 *
 * G3: server creates state; G4: no auth required for guests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

interface ParticipantBody {
  sessionId: string;
  displayName: string;
  color: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ParticipantBody;
  try {
    body = (await req.json()) as ParticipantBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, displayName, color } = body;

  if (!sessionId || !displayName || !color) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify session exists and is open
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('session')
    .select('id, status')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.status === 'closed') {
    return NextResponse.json({ error: 'Session is closed' }, { status: 400 });
  }

  const { data: participant, error } = await supabaseAdmin
    .from('participant')
    .insert({
      session_id: sessionId,
      display_name: displayName.trim().slice(0, 64),
      color,
      is_treated: false,
      is_host_proxy: false,
    })
    .select()
    .single();

  if (error || !participant) {
    return NextResponse.json(
      { error: `Failed to create participant: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ participantId: participant.id });
}
