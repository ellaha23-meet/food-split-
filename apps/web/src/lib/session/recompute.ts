/**
 * Server-side engine recompute (P2.4).
 *
 * Fetches session state from DB, calls compute(), and returns results.
 * G3: always recomputes from persisted state, never from client deltas.
 * G8: no TODOs; this is a money path.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { compute, asCents, type ComputeInput } from '@tally/reconcile';
import type { ComputeResult } from '@tally/reconcile';

export async function recomputeSession(sessionId: string): Promise<ComputeResult> {
  // Fetch session
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('session')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionErr || !session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Fetch line items
  const { data: lineItems, error: itemsErr } = await supabaseAdmin
    .from('line_item')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order');

  if (itemsErr || !lineItems) {
    throw new Error(`Failed to fetch line items: ${itemsErr?.message}`);
  }

  // Fetch participants
  const { data: participants, error: participantsErr } = await supabaseAdmin
    .from('participant')
    .select('*')
    .eq('session_id', sessionId);

  if (participantsErr || !participants) {
    throw new Error(`Failed to fetch participants: ${participantsErr?.message}`);
  }

  // Fetch claims
  const { data: claims, error: claimsErr } = await supabaseAdmin
    .from('claim')
    .select('*')
    .in(
      'line_item_id',
      lineItems.map((i) => i.id),
    );

  if (claimsErr) {
    throw new Error(`Failed to fetch claims: ${claimsErr?.message}`);
  }

  // Build compute input — all money values converted to Cents (G1)
  const computeInput: ComputeInput = {
    lineItems: lineItems.map((item) => ({
      id: item.id,
      totalPriceCents: asCents(item.total_price_cents),
    })),
    claims: (claims ?? []).map((c) => ({
      lineItemId: c.line_item_id,
      participantId: c.participant_id,
      weight: c.weight,
    })),
    participantIds: participants.map((p) => p.id),
    treatedParticipantIds: new Set(
      participants.filter((p) => p.is_treated).map((p) => p.id),
    ),
    taxCents: asCents(session.tax_cents),
    tipCents: asCents(session.tip_cents),
    tipMode: session.tip_mode,
    serviceChargeCents: asCents(session.service_charge_cents),
    serviceChargeMode: 'proportional',
    discountCents: asCents(session.discount_cents),
    discountMode: session.discount_mode,
    printedTotalCents: asCents(session.printed_total_cents),
  };

  return compute(computeInput);
}
