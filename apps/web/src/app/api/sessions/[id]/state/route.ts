/**
 * GET /api/sessions/[id]/state — full live session state + computed totals.
 *
 * G3: totals are engine output over server state. Clients render this; they
 * never compute authoritative money themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recomputeSession } from '@/lib/session/recompute';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: sessionId } = await ctx.params;

  const { data: session, error: sErr } = await supabaseAdmin
    .from('session')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const [{ data: lineItems }, { data: participants }, { data: settlements }] = await Promise.all([
    supabaseAdmin.from('line_item').select('*').eq('session_id', sessionId).order('sort_order'),
    supabaseAdmin.from('participant').select('*').eq('session_id', sessionId).order('joined_at'),
    supabaseAdmin.from('settlement').select('*').eq('session_id', sessionId),
  ]);

  const itemIds = (lineItems ?? []).map((i) => i.id);
  const { data: claims } = itemIds.length
    ? await supabaseAdmin.from('claim').select('*').in('line_item_id', itemIds)
    : { data: [] as unknown[] };

  const totals = await recomputeSession(sessionId);

  return NextResponse.json({
    session,
    lineItems: lineItems ?? [],
    participants: participants ?? [],
    claims: claims ?? [],
    settlements: settlements ?? [],
    totals,
  });
}
