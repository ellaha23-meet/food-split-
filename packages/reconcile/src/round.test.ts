import { describe, it, expect } from 'vitest';
import { roundAllocations, type RoundInput } from './round.js';
import { asCents } from './money.js';
import { rational, ZERO_RATIONAL } from './money.js';
import type { ParticipantAllocation } from './allocate.js';

function makeAlloc(id: string, totalNum: bigint, totalDen: bigint): ParticipantAllocation {
  return {
    participantId: id,
    claimedSubtotalRational: rational(totalNum, totalDen),
    taxRational: ZERO_RATIONAL,
    tipRational: ZERO_RATIONAL,
    serviceChargeRational: ZERO_RATIONAL,
    discountRational: ZERO_RATIONAL,
    totalRational: rational(totalNum, totalDen),
  };
}

describe('roundAllocations — P1.4', () => {
  it('exact totals (no rounding needed)', () => {
    // Two participants: 600 and 400, printed total 1000
    const input: RoundInput = {
      allocations: [makeAlloc('p1', 600n, 1n), makeAlloc('p2', 400n, 1n)],
      printedTotalCents: asCents(1000),
    };
    const result = roundAllocations(input);
    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;
    expect(p1.totalCents).toBe(600);
    expect(p2.totalCents).toBe(400);
    expect(result.grandTotalCents).toBe(1000);
  });

  it('worked example: three friends split $10.00 fries equally → 334/333/333', () => {
    // Raw share = 1000/3 each → floor = 333 × 3 = 999 → 1 remainder
    // Stable tie-break by id: 'p1' < 'p2' < 'p3' → p1 gets the extra cent
    const input: RoundInput = {
      allocations: [
        makeAlloc('p1', 1000n, 3n),
        makeAlloc('p2', 1000n, 3n),
        makeAlloc('p3', 1000n, 3n),
      ],
      printedTotalCents: asCents(1000),
    };
    const result = roundAllocations(input);
    const totals = result.perParticipant.map((p) => ({ id: p.participantId, t: p.totalCents }));
    const sum = totals.reduce((acc, p) => acc + p.t, 0);
    expect(sum).toBe(1000); // I1
    // p1 gets extra cent (smallest id)
    expect(totals.find((p) => p.id === 'p1')!.t).toBe(334);
    expect(totals.find((p) => p.id === 'p2')!.t).toBe(333);
    expect(totals.find((p) => p.id === 'p3')!.t).toBe(333);
  });

  it('I1 — Σ totals == printedTotalCents always', () => {
    // Messy fractions: 7 people split $100
    const perPerson = { num: 10000n, den: 7n };
    const allocs = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id) =>
      makeAlloc(id, perPerson.num, perPerson.den),
    );
    const result = roundAllocations({ allocations: allocs, printedTotalCents: asCents(10000) });
    expect(result.grandTotalCents).toBe(10000);
  });

  it('I3 — no total < 0', () => {
    const result = roundAllocations({
      allocations: [makeAlloc('p1', 0n, 1n)],
      printedTotalCents: asCents(0),
    });
    expect(result.perParticipant[0]!.totalCents).toBeGreaterThanOrEqual(0);
  });

  it('I5 — determinism: same inputs produce identical outputs', () => {
    const allocs = ['p3', 'p1', 'p2'].map((id) => makeAlloc(id, 1000n, 3n));
    const r1 = roundAllocations({ allocations: allocs, printedTotalCents: asCents(1000) });
    const r2 = roundAllocations({ allocations: allocs, printedTotalCents: asCents(1000) });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    // The extra cent always goes to the same participant regardless of input order
    const extra = r1.perParticipant.find((p) => p.totalCents === 334);
    expect(extra?.participantId).toBe('p1'); // smallest id
  });

  it('I1 violation throws', () => {
    // Supply a printed total that can't be reached — should throw
    expect(() =>
      roundAllocations({
        allocations: [makeAlloc('p1', 500n, 1n)],
        printedTotalCents: asCents(600), // mismatch
      }),
    ).toThrow(/I1 VIOLATION/);
  });
});
