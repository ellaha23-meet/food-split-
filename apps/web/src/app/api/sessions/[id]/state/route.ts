/**
 * GET /api/sessions/[id]/state — full live session state + computed totals.
 *
 * G3: totals are engine output over server state. Clients render this; they
 * never compute authoritative money themselves. Per-diner tips are layered on
 * top of the engine's items+tax totals server-side (see applyTips).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recomputeSession } from '@/lib/session/recompute';
import { applyParticipantTips } from '@/lib/session/applyTips';

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

  const [{ data: lineItems }, { data: participants }, { data: settlements }, { data: host }] =
    await Promise.all([
      supabaseAdmin.from('line_item').select('*').eq('session_id', sessionId).order('sort_order'),
      supabaseAdmin.from('participant').select('*').eq('session_id', sessionId).order('joined_at'),
      supabaseAdmin.from('settlement').select('*').eq('session_id', sessionId),
      supabaseAdmin.from('host_account').select('display_name').eq('id', session.host_account_id).maybeSingle(),
    ]);

  const itemIds = (lineItems ?? []).map((i) => i.id);
  const { data: claims } = itemIds.length
    ? await supabaseAdmin.from('claim').select('*').in('line_item_id', itemIds)
    : { data: [] as unknown[] };

  const engineTotals = await recomputeSession(sessionId);
  const totals = applyParticipantTips(engineTotals, participants ?? []);

  return NextResponse.json({
    session,
    hostName: host?.display_name ?? 'the host',
    lineItems: lineItems ?? [],
    participants: participants ?? [],
    claims: claims ?? [],
    settlements: settlements ?? [],
    totals,
  });
}
