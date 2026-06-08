/**
 * Per-diner tip overlay (G3-safe).
 *
 * The reconciliation engine (P1) is intentionally tip-agnostic now that tip is
 * a per-diner choice rather than a single session-level amount: sessions are
 * created with tip_cents = 0, so the engine allocates only items + tax. This
 * helper layers each participant's chosen tip back on top of the engine's
 * authoritative items+tax totals, server-side, so totals and settlement amounts
 * stay consistent everywhere they're read.
 *
 * Tips are additive and never feed back into the engine, so the engine's money
 * invariants (I1–I5 over items+tax) are untouched.
 */

import type { ComputeResult } from '@tally/reconcile';

export interface ParticipantTipRow {
  id: string;
  tip_cents: number;
}

export interface ParticipantTotalView {
  participantId: string;
  claimedSubtotalCents: number;
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number;
}

export interface AugmentedTotals {
  perParticipant: ParticipantTotalView[];
  unclaimedCents: number;
  grandTotalCents: number;
}

export function applyParticipantTips(
  totals: ComputeResult,
  participants: ParticipantTipRow[],
): AugmentedTotals {
  const tipById = new Map(participants.map((p) => [p.id, p.tip_cents || 0]));

  let tipSum = 0;
  const perParticipant = totals.perParticipant.map((p) => {
    const tip = tipById.get(p.participantId) ?? 0;
    tipSum += tip;
    return {
      participantId: p.participantId,
      claimedSubtotalCents: p.claimedSubtotalCents as number,
      taxCents: p.taxCents as number,
      tipCents: tip,
      serviceChargeCents: p.serviceChargeCents as number,
      discountCents: p.discountCents as number,
      totalCents: (p.totalCents as number) + tip,
    };
  });

  return {
    perParticipant,
    unclaimedCents: totals.unclaimedCents as number,
    grandTotalCents: (totals.grandTotalCents as number) + tipSum,
  };
}
