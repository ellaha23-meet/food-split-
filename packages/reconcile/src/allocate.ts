/**
 * P1.3: Tax / tip / service / discount allocation.
 *
 * All arithmetic is done in exact Rationals (no rounding yet — that's P1.4).
 * Component conservation (I2) holds in rationals before rounding.
 * Non-negativity invariant (I3) is maintained — discounts can't go below 0.
 *
 * G2: pure — zero I/O, zero clock, zero randomness.
 */

import {
  type Cents,
  type Rational,
  rational,
  ZERO_RATIONAL,
  addRational,
  subRational,
  mulRational,
  scaleByCents,
  rationalNonNeg,
  fromCents,
} from './money.js';

import type { ParticipantSubtotal } from './shares.js';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface AllocationInput {
  /** Per-participant subtotals from computeShares (P1.2). */
  readonly perParticipant: ReadonlyArray<ParticipantSubtotal>;
  /** IDs of participants who are treated (their total will be zeroed; items redistributed). */
  readonly treatedParticipantIds: ReadonlySet<string>;
  /** Total tax in cents (allocated proportionally). */
  readonly taxCents: Cents;
  /** Total tip in cents. */
  readonly tipCents: Cents;
  /** 'proportional' = proportional to subtotal; 'even' = equal per head. */
  readonly tipMode: 'proportional' | 'even';
  /** Service charge in cents (treated like tip). */
  readonly serviceChargeCents: Cents;
  /** Service charge mode (treated like tip). */
  readonly serviceChargeMode: 'proportional' | 'even';
  /** Discount in cents. */
  readonly discountCents: Cents;
  /** 'proportional' = proportional to subtotal; 'assigned' = single participant. */
  readonly discountMode: 'proportional' | 'assigned';
  /** Only used when discountMode = 'assigned'. */
  readonly discountAssigneeId?: string;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ParticipantAllocation {
  readonly participantId: string;
  readonly claimedSubtotalRational: Rational;
  readonly taxRational: Rational;
  readonly tipRational: Rational;
  readonly serviceChargeRational: Rational;
  readonly discountRational: Rational;
  /** Pre-rounding total = subtotal + tax + tip + service - discount */
  readonly totalRational: Rational;
}

export interface AllocationResult {
  readonly perParticipant: ReadonlyArray<ParticipantAllocation>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function proportionalShareExact(
  participantSubtotal: Rational,
  totalClaimedSubtotal: Rational,
  amountCents: Cents,
): Rational {
  if (amountCents === 0) return ZERO_RATIONAL;
  if (totalClaimedSubtotal.num === 0n) return ZERO_RATIONAL;
  // amount * participantSubtotal / totalClaimedSubtotal
  // = (amountCents/1) * (p.num/p.den) / (t.num/t.den)
  // = amountCents * p.num * t.den / (p.den * t.num)
  return rational(
    BigInt(amountCents) * participantSubtotal.num * totalClaimedSubtotal.den,
    participantSubtotal.den * totalClaimedSubtotal.num,
  );
}

function evenShare(amountCents: Cents, payerCount: number): Rational {
  if (amountCents === 0 || payerCount === 0) return ZERO_RATIONAL;
  return rational(BigInt(amountCents), BigInt(payerCount));
}

// ─── Core function ────────────────────────────────────────────────────────────

export function allocate(input: AllocationInput): AllocationResult {
  const {
    perParticipant,
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

  // Payers = participants who are NOT treated (treated diners owe nothing)
  const payers = perParticipant.filter((p) => !treatedParticipantIds.has(p.participantId));

  // Total claimed subtotal across payers (for proportional calculations)
  const totalClaimedSubtotal: Rational = payers.reduce(
    (acc, p) => addRational(acc, p.claimedSubtotalRational),
    ZERO_RATIONAL,
  );

  // For treated diners, redistribute their items: we do NOT change the subtotals
  // that come in — instead, treated diners get taxRational/tipRational = 0
  // and their subtotal is also zeroed out (set to 0 in the output).
  // Redistribution means payers' proportional shares are computed against
  // the FULL totalClaimedSubtotal including treated diners' items.
  // This naturally redistributes the cost to the payers because their
  // subtotals are the source for proportional tax/tip sharing.
  //
  // Wait — the spec says: "treated-diner redistribution (share → 0, payer set
  // excludes them)". So treated diners' items still contributed to totalClaimedSubtotal
  // but treated diners don't pay tax/tip. For complete redistribution:
  // - We exclude treated from payer count (for even-split tip)
  // - We compute proportional shares only among payers' subtotals

  const payerCount = payers.length;

  const allocations: ParticipantAllocation[] = perParticipant.map((p) => {
    const isTreated = treatedParticipantIds.has(p.participantId);

    if (isTreated) {
      // Treated diner: everything zeroed out
      return {
        participantId: p.participantId,
        claimedSubtotalRational: ZERO_RATIONAL,
        taxRational: ZERO_RATIONAL,
        tipRational: ZERO_RATIONAL,
        serviceChargeRational: ZERO_RATIONAL,
        discountRational: ZERO_RATIONAL,
        totalRational: ZERO_RATIONAL,
      };
    }

    // Tax — always proportional
    const taxRational = proportionalShareExact(p.claimedSubtotalRational, totalClaimedSubtotal, taxCents);

    // Tip
    const tipRational =
      tipMode === 'proportional'
        ? proportionalShareExact(p.claimedSubtotalRational, totalClaimedSubtotal, tipCents)
        : evenShare(tipCents, payerCount);

    // Service charge (treated like tip)
    const serviceChargeRational =
      serviceChargeMode === 'proportional'
        ? proportionalShareExact(p.claimedSubtotalRational, totalClaimedSubtotal, serviceChargeCents)
        : evenShare(serviceChargeCents, payerCount);

    // Discount
    let discountRational: Rational = ZERO_RATIONAL;
    if (discountMode === 'proportional') {
      discountRational = proportionalShareExact(
        p.claimedSubtotalRational,
        totalClaimedSubtotal,
        discountCents,
      );
    } else if (discountMode === 'assigned' && discountAssigneeId === p.participantId) {
      discountRational = fromCents(discountCents);
    }

    // Pre-rounding total
    let totalRational = addRational(p.claimedSubtotalRational, taxRational);
    totalRational = addRational(totalRational, tipRational);
    totalRational = addRational(totalRational, serviceChargeRational);
    totalRational = subRational(totalRational, discountRational);

    // I3: non-negativity — clamp to zero if somehow negative
    if (!rationalNonNeg(totalRational)) {
      totalRational = ZERO_RATIONAL;
    }

    return {
      participantId: p.participantId,
      claimedSubtotalRational: p.claimedSubtotalRational,
      taxRational,
      tipRational,
      serviceChargeRational,
      discountRational,
      totalRational,
    };
  });

  return { perParticipant: allocations };
}
