/**
 * P1.4: Largest-remainder rounding + invariant assertions (I1–I5).
 *
 * Rounding happens EXACTLY ONCE, at the end. This is the only place that
 * converts Rationals to Cents in the authoritative computation path.
 *
 * G2: pure — zero I/O, zero clock, zero randomness.
 * I1: Σ participant totals == printedTotalCents (asserted in code).
 * I5: Identical inputs → byte-identical outputs (stable sort by participantId).
 */

import {
  type Cents,
  type Rational,
  asCents,
  addCents,
  subCents,
  centsEq,
  floorToCents,
  fractionalPart,
  rationalLt,
  ZERO,
} from './money.js';

import type { ParticipantAllocation } from './allocate.js';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ParticipantTotal {
  readonly participantId: string;
  readonly claimedSubtotalCents: Cents;
  readonly taxCents: Cents;
  readonly tipCents: Cents;
  readonly serviceChargeCents: Cents;
  readonly discountCents: Cents;
  readonly totalCents: Cents;
}

export interface RoundResult {
  readonly perParticipant: ReadonlyArray<ParticipantTotal>;
  readonly grandTotalCents: Cents;
}

// ─── Largest-remainder rounding ───────────────────────────────────────────────

/**
 * Round a list of (id, rational) pairs so their sum equals targetCents exactly.
 * Algorithm: floor each, then distribute remaining cents to the entries with the
 * largest fractional parts, breaking ties by participantId (stable, I5).
 */
function largestRemainder(
  entries: ReadonlyArray<{ id: string; value: Rational }>,
  targetCents: Cents,
): Map<string, Cents> {
  const floored = entries.map((e) => ({
    id: e.id,
    floored: floorToCents(e.value),
    frac: fractionalPart(e.value),
  }));

  const floorSum: Cents = floored.reduce((acc, e) => addCents(acc, e.floored), ZERO);
  const remainder = subCents(targetCents, floorSum);

  // Sort by fractional part descending, ties broken by id ascending (I5 determinism)
  const sorted = [...floored].sort((a, b) => {
    if (rationalLt(b.frac, a.frac)) return -1;
    if (rationalLt(a.frac, b.frac)) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const result = new Map<string, Cents>();
  for (let i = 0; i < floored.length; i++) {
    const entry = sorted[i]!;
    result.set(entry.id, i < remainder ? addCents(entry.floored, asCents(1)) : entry.floored);
  }

  return result;
}

// ─── Main round function ──────────────────────────────────────────────────────

export interface RoundInput {
  readonly allocations: ReadonlyArray<ParticipantAllocation>;
  /** The printed total from the receipt — I1 asserts Σ totals == this. */
  readonly printedTotalCents: Cents;
}

export function roundAllocations(input: RoundInput): RoundResult {
  const { allocations, printedTotalCents } = input;

  // Apply largest-remainder rounding to the totalRational of each participant.
  // The target is printedTotalCents — this is the I1 guarantee.
  const totalEntries = allocations.map((a) => ({
    id: a.participantId,
    value: a.totalRational,
  }));
  const roundedTotals = largestRemainder(totalEntries, printedTotalCents);

  // Round each component independently (for display breakdowns).
  // We use floor for display components since they don't need to sum to any external total.
  const perParticipant: ParticipantTotal[] = allocations.map((a) => {
    const totalCents = roundedTotals.get(a.participantId) ?? ZERO;
    return {
      participantId: a.participantId,
      claimedSubtotalCents: floorToCents(a.claimedSubtotalRational),
      taxCents: floorToCents(a.taxRational),
      tipCents: floorToCents(a.tipRational),
      serviceChargeCents: floorToCents(a.serviceChargeRational),
      discountCents: floorToCents(a.discountRational),
      totalCents,
    };
  });

  const grandTotalCents: Cents = perParticipant.reduce(
    (acc, p) => addCents(acc, p.totalCents),
    ZERO,
  );

  // ── Invariant assertions ──────────────────────────────────────────────────
  // I1 — Conservation: Σ totals == printedTotalCents
  assertI1(grandTotalCents, printedTotalCents);

  // I3 — Non-negativity: no total < 0
  for (const p of perParticipant) {
    assertI3(p.participantId, p.totalCents);
  }

  return { perParticipant, grandTotalCents };
}

// ─── Invariant assertions (asserted in code, G8) ─────────────────────────────

function assertI1(grandTotal: Cents, printedTotal: Cents): void {
  if (!centsEq(grandTotal, printedTotal)) {
    throw new Error(
      `I1 VIOLATION: Σ participant totals (${grandTotal}¢) ≠ printed total (${printedTotal}¢). ` +
        'This should be impossible — file a bug.',
    );
  }
}

function assertI3(participantId: string, total: Cents): void {
  if (total < 0) {
    throw new Error(
      `I3 VIOLATION: participant "${participantId}" total is negative (${total}¢). ` +
        'This should be impossible — file a bug.',
    );
  }
}
