/**
 * Top-level compute() function — the public API of the reconciliation engine.
 * Wires together shares (P1.2) + allocate (P1.3) + round (P1.4).
 *
 * G2: pure — delegates to pure sub-functions; zero I/O anywhere in this path.
 */

import { type Cents, floorToCents, addRational, ZERO_RATIONAL } from './money.js';
import { computeShares, type LineItem, type Claim } from './shares.js';
import { allocate, type AllocationInput } from './allocate.js';
import { roundAllocations, type ParticipantTotal } from './round.js';

export interface ComputeInput {
  readonly lineItems: ReadonlyArray<LineItem>;
  readonly claims: ReadonlyArray<Claim>;
  /** Participant IDs that are payers (non-empty; order doesn't matter — I5). */
  readonly participantIds: ReadonlyArray<string>;
  readonly treatedParticipantIds: ReadonlySet<string>;
  readonly taxCents: Cents;
  readonly tipCents: Cents;
  readonly tipMode: 'proportional' | 'even';
  readonly serviceChargeCents: Cents;
  readonly serviceChargeMode: 'proportional' | 'even';
  readonly discountCents: Cents;
  readonly discountMode: 'proportional' | 'assigned';
  readonly discountAssigneeId?: string;
  /**
   * The amount charged to the card. Equals:
   *   subtotal + tax + service + tip − discount
   * I4: must match before the session opens.
   */
  readonly printedTotalCents: Cents;
}

export interface ComputeResult {
  readonly perParticipant: ReadonlyArray<ParticipantTotal>;
  readonly unclaimedCents: Cents;
  readonly grandTotalCents: Cents;
}

export function compute(input: ComputeInput): ComputeResult {
  const {
    lineItems,
    claims,
    participantIds,
    treatedParticipantIds,
    taxCents,
    tipCents,
    tipMode,
    serviceChargeCents,
    serviceChargeMode,
    discountCents,
    discountMode,
    discountAssigneeId,
  } = input;

  // Step 1: Per-item shares
  const shareResult = computeShares(lineItems, claims);

  // Build the full perParticipant list including participants with no claims
  // (they will have zero subtotals but still appear in the output)
  const knownIds = new Set(shareResult.perParticipant.map((p) => p.participantId));
  const allParticipants = [
    ...shareResult.perParticipant,
    ...participantIds
      .filter((id) => !knownIds.has(id))
      .map((id) => ({
        participantId: id,
        claimedSubtotalRational: { num: 0n, den: 1n } as const,
      })),
  ];

  // Step 2: Tax/tip/discount allocation
  const allocInput: AllocationInput = {
    perParticipant: allParticipants,
    treatedParticipantIds,
    taxCents,
    tipCents,
    tipMode,
    serviceChargeCents,
    serviceChargeMode,
    discountCents,
    discountMode,
    ...(discountAssigneeId !== undefined ? { discountAssigneeId } : {}),
  };
  const allocResult = allocate(allocInput);

  // Step 3: Largest-remainder rounding (round once, at the end — G2/I5)
  // Compute allocationTarget = floor(Σ totalRational).
  //
  // For fully-claimed sessions (unclaimedCents == 0) and I4 satisfied, the
  // rational sum equals printedTotalCents exactly, so allocationTarget ==
  // printedTotalCents and I1 holds after rounding.
  //
  // For partially-claimed sessions (live updates), allocationTarget is the
  // floor of what's actually allocated. The caller observes grandTotalCents <
  // printedTotalCents to determine the unresolved gap.
  //
  // We use floor(Σ) as the target so that largestRemainder's invariant
  // (Σ floor(entry_i) ≤ target) always holds, guaranteeing I1.
  const actualSumRational = allocResult.perParticipant.reduce(
    (acc, a) => addRational(acc, a.totalRational),
    ZERO_RATIONAL,
  );
  const allocationTarget = floorToCents(actualSumRational);

  const roundResult = roundAllocations({
    allocations: allocResult.perParticipant,
    printedTotalCents: allocationTarget,
  });

  return {
    perParticipant: roundResult.perParticipant,
    unclaimedCents: shareResult.unclaimedCents,
    grandTotalCents: roundResult.grandTotalCents,
  };
}
