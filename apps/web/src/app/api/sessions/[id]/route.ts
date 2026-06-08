/**
 * PATCH /api/sessions/[id] — update tip / tip mode (P5.1).
 * POST  /api/sessions/[id]/close is handled separately.
 *
 * G3: server owns the totals. The grand-total guard (I4) and the unclaimed
 * block (P5.3) are enforced server-side at close time, never on the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recomputeSession } from '@/lib/session/recompute';

interface PatchBody {
  tipCents?: number;
  tipMode?: 'proportional' | 'even';
  printedTotalCents?: number;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: sessionId } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.tipCents != null) {
    if (!Number.isInteger(body.tipCents) || body.tipCents < 0) {
      return NextResponse.json({ error: 'tipCents must be a non-negative integer' }, { status: 400 });
    }
    update['tip_cents'] = body.tipCents;
  }
  if (body.tipMode) update['tip_mode'] = body.tipMode;
  if (body.printedTotalCents != null) {
    if (!Number.isInteger(body.printedTotalCents) || body.printedTotalCents < 0) {
      return NextResponse.json({ error: 'printedTotalCents must be a non-negative integer' }, { status: 400 });
    }
    update['printed_total_cents'] = body.printedTotalCents;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('session').update(update).eq('id', sessionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totals = await recomputeSession(sessionId);
  return NextResponse.json({ totals });
}
