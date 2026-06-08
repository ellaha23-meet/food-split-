/**
 * POST /api/sessions/[id]/close — move the session to settling, generating
 * settlement rows from the engine's per-participant totals (P5.3 → P6).
 *
 * Hard guards (cannot be bypassed by the client):
 *   - I4 grand-total guard: subtotal+tax+service+tip−discount must equal
 *     printed_total. If they disagree, close is rejected with a fix prompt.
 *   - P5.3 unclaimed block: close is blocked while unclaimedCents > 0.
 *
 * No silent dropping of orphan amounts (would break I1).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recomputeSession } from '@/lib/session/recompute';

export async function POST(
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

  // I4 grand-total guard — recompute the printed total from its components.
  const reconstructed =
    session.subtotal_cents +
    session.tax_cents +
    session.service_charge_cents +
    session.tip_cents -
    session.discount_cents;
  if (reconstructed !== session.printed_total_cents) {
    return NextResponse.json(
      {
        error: 'GRAND_TOTAL_MISMATCH',
        message: `Totals don't reconcile: components sum to ${reconstructed}¢ but the receipt total is ${session.printed_total_cents}¢. Fix the tax/tip/total before closing.`,
        reconstructed,
        printedTotalCents: session.printed_total_cents,
      },
      { status: 409 },
    );
  }

  const totals = await recomputeSession(sessionId);

  // P5.3 unclaimed block — no orphaned amounts may remain at close.
  if (totals.unclaimedCents > 0) {
    return NextResponse.json(
      {
        error: 'UNRESOLVED_ITEMS',
        message: `${totals.unclaimedCents}¢ of items are still unclaimed. Resolve every item before closing.`,
        unclaimedCents: totals.unclaimedCents,
      },
      { status: 409 },
    );
  }

  // Generate settlement rows from per-participant totals (everyone owes the host).
  const rows = totals.perParticipant
    .filter((p) => p.totalCents > 0)
    .map((p) => ({
      session_id: sessionId,
      participant_id: p.participantId,
      amount_owed_cents: p.totalCents,
      status: 'pending' as const,
    }));

  // Replace any prior settlement rows for idempotency.
  await supabaseAdmin.from('settlement').delete().eq('session_id', sessionId);
  if (rows.length > 0) {
    const { error: insErr } = await supabaseAdmin.from('settlement').insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from('session')
    .update({ status: 'settling' })
    .eq('id', sessionId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, totals });
}
