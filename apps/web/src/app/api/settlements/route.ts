/**
 * PATCH /api/settlements — mark a participant's debt paid/pending (P6.2).
 *
 * G3: settlement status is server state, broadcast to all clients via Realtime
 * (clients subscribe to the `settlement` table). Either the host marks paid or
 * a guest taps "I paid" — both hit this same server-owned transition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recomputeSession } from '@/lib/session/recompute';
import { applyParticipantTips } from '@/lib/session/applyTips';

interface PatchBody {
  settlementId: string;
  status: 'pending' | 'paid';
  paymentMethod?: string;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { settlementId, status, paymentMethod } = body;
  if (!settlementId || (status !== 'pending' && status !== 'paid')) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  };
  if (paymentMethod) update['payment_method'] = paymentMethod;

  const { data, error } = await supabaseAdmin
    .from('settlement')
    .update(update)
    .eq('id', settlementId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 500 });
  }

  return NextResponse.json({ settlement: data });
}

/**
 * POST /api/settlements — a diner settles their own share via Bit, on demand
 * (before the host formally closes the session).
 *
 * Body: { sessionId, participantId }
 * The amount is recomputed server-side from current state (G3: never trust a
 * client-sent amount) and the diner's settlement row is upserted as paid.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { sessionId?: string; participantId?: string };
  try {
    body = (await req.json()) as { sessionId?: string; participantId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, participantId } = body;
  if (!sessionId || !participantId) {
    return NextResponse.json({ error: 'Missing sessionId or participantId' }, { status: 400 });
  }

  const engineTotals = await recomputeSession(sessionId);
  const { data: participants } = await supabaseAdmin
    .from('participant')
    .select('id, tip_cents')
    .eq('session_id', sessionId);
  const totals = applyParticipantTips(engineTotals, participants ?? []);

  const mine = totals.perParticipant.find((p) => p.participantId === participantId);
  if (!mine) {
    return NextResponse.json({ error: 'Participant not in session' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('settlement')
    .upsert(
      {
        session_id: sessionId,
        participant_id: participantId,
        amount_owed_cents: mine.totalCents,
        status: 'paid',
        payment_method: 'bit',
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,participant_id' },
    )
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to settle' }, { status: 500 });
  }

  return NextResponse.json({ settlement: data });
}
