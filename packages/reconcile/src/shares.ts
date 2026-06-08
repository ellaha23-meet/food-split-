/**
 * P1.2: Per-item shares and claimed subtotal.
 *
 * Given a set of line items + weighted claims, compute each participant's
 * claimed subtotal as an exact Rational (unrounded).
 *
 * G2: pure — zero I/O, zero clock, zero randomness.
 * G1: all money stays in Cents / Rational, never float.
 * Output is exact rationals only — no rounding happens here (rounding is P1.4).
 */

import {
  type Cents,
  type Rational,
  ZERO_RATIONAL,
  rational,
  addRational,
  scaleByCents,
  addCents,
  ZERO,
} from './money.js';

// ─── Input types ─────────────────────────────────────────────────────────────

export interface LineItem {
  readonly id: string;
  readonly totalPriceCents: Cents;
}

export interface Claim {
  readonly lineItemId: string;
  readonly participantId: string;
  readonly weight: number; // positive integer (G8: validated at boundary)
}

// ─── Output types ────────────────────────────────────────────────────────────

export interface ParticipantSubtotal {
  readonly participantId: string;
  /** Exact rational share of each item summed up. Unrounded. */
  readonly claimedSubtotalRational: Rational;
}

export interface ShareResult {
  readonly perParticipant: ReadonlyArray<ParticipantSubtotal>;
  /** Items with zero claims. */
  readonly unclaimedCents: Cents;
  /** Sum of all claimed items' prices. */
  readonly totalClaimedCents: Cents;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Compute per-participant claimed subtotals as exact rationals.
 *
 * Algorithm:
 *  For each line_item, find all claims. Sum their weights. Each claimer's
 *  share = item.totalPriceCents * weight / sumWeights (rational, unrounded).
 *  Unclaimed item = item with 0 claims; its full price contributes to unclaimedCents.
 */
export function computeShares(
  lineItems: ReadonlyArray<LineItem>,
  claims: ReadonlyArray<Claim>,
): ShareResult {
  // Group claims by line item
  const claimsByItem = new Map<string, Claim[]>();
  for (const claim of claims) {
    const existing = claimsByItem.get(claim.lineItemId);
    if (existing !== undefined) {
      existing.push(claim);
    } else {
      claimsByItem.set(claim.lineItemId, [claim]);
    }
  }

  // Accumulate per-participant rational subtotals
  const subtotals = new Map<string, Rational>();
  let unclaimedCents: Cents = ZERO;
  let totalClaimedCents: Cents = ZERO;

  for (const item of lineItems) {
    const itemClaims = claimsByItem.get(item.id) ?? [];

    if (itemClaims.length === 0) {
      // Unclaimed — surfaces to the session for resolution
      unclaimedCents = addCents(unclaimedCents, item.totalPriceCents);
      continue;
    }

    totalClaimedCents = addCents(totalClaimedCents, item.totalPriceCents);

    const sumWeights = itemClaims.reduce((acc, c) => acc + c.weight, 0);
    const sumWeightsBig = BigInt(sumWeights);

    for (const claim of itemClaims) {
      // share = totalPriceCents * weight / sumWeights (exact rational)
      const share = scaleByCents(rational(BigInt(claim.weight), sumWeightsBig), item.totalPriceCents);
      const existing = subtotals.get(claim.participantId) ?? ZERO_RATIONAL;
      subtotals.set(claim.participantId, addRational(existing, share));
    }
  }

  const perParticipant: ParticipantSubtotal[] = Array.from(subtotals.entries()).map(
    ([participantId, claimedSubtotalRational]) => ({
      participantId,
      claimedSubtotalRational,
    }),
  );

  return { perParticipant, unclaimedCents, totalClaimedCents };
}
