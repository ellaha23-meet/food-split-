/**
 * POST /api/claims — write a claim and broadcast recomputed totals (P2.4).
 * DELETE /api/claims — remove a claim (un-claim).
 *
 * G3: server computes totals from DB state, not from client delta.
 * G8: no TODOs in this money path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recomputeSession } from '@/lib/session/recompute';

interface ClaimBody {
  lineItemId: string;
  participantId: string;
  sessionId: string;
  weight?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lineItemId, participantId, sessionId, weight = 1 } = body;

  if (!lineItemId || !participantId || !sessionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!Number.isInteger(weight) || weight <= 0) {
    return NextResponse.json({ error: 'weight must be a positive integer' }, { status: 400 });
  }

  // Upsert claim (idempotent — same participant can't claim twice with different weights)
  const { data: claim, error } = await supabaseAdmin
    .from('claim')
    .upsert({ line_item_id: lineItemId, participant_id: participantId, weight })
    .select()
    .single();

  if (error || !claim) {
    return NextResponse.json(
      { error: `Failed to create claim: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // Recompute totals from server state and broadcast (G3)
  const totals = await recomputeSession(sessionId);

  return NextResponse.json({ claim, totals });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let body: { lineItemId: string; participantId: string; sessionId: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lineItemId, participantId, sessionId } = body;

  const { error } = await supabaseAdmin
    .from('claim')
    .delete()
    .eq('line_item_id', lineItemId)
    .eq('participant_id', participantId);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete claim: ${error.message}` },
      { status: 500 },
    );
  }

  // Recompute and broadcast (G3)
  const totals = await recomputeSession(sessionId);

  return NextResponse.json({ totals });
}
