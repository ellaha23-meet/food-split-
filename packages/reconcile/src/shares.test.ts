import { describe, it, expect } from 'vitest';
import { computeShares, type LineItem, type Claim } from './shares.js';
import { asCents, floorToCents } from './money.js';

function makeItem(id: string, cents: number): LineItem {
  return { id, totalPriceCents: asCents(cents) };
}

describe('computeShares', () => {
  it('solo claim — 100% to one participant', () => {
    const items = [makeItem('i1', 500)];
    const claims: Claim[] = [{ lineItemId: 'i1', participantId: 'p1', weight: 1 }];

    const result = computeShares(items, claims);

    expect(result.perParticipant).toHaveLength(1);
    const p1 = result.perParticipant.find((p) => p.participantId === 'p1');
    expect(p1).toBeDefined();
    // Exact share = 500/1 = 500
    expect(floorToCents(p1!.claimedSubtotalRational)).toBe(500);
    expect(result.unclaimedCents).toBe(0);
    expect(result.totalClaimedCents).toBe(500);
  });

  it('equal split — 3 participants on one item (the worked example)', () => {
    // Three friends share $10.00 fries equally (weights 1/1/1).
    // Raw share = 1000/3 = 333.333... each — not rounded here (rounding is P1.4).
    const items = [makeItem('fries', 1000)];
    const claims: Claim[] = [
      { lineItemId: 'fries', participantId: 'p1', weight: 1 },
      { lineItemId: 'fries', participantId: 'p2', weight: 1 },
      { lineItemId: 'fries', participantId: 'p3', weight: 1 },
    ];

    const result = computeShares(items, claims);

    expect(result.perParticipant).toHaveLength(3);
    for (const p of result.perParticipant) {
      // Each rational is exactly 1000/3
      expect(p.claimedSubtotalRational.num).toBe(1000n);
      expect(p.claimedSubtotalRational.den).toBe(3n);
    }
    expect(result.unclaimedCents).toBe(0);
    expect(result.totalClaimedCents).toBe(1000);
  });

  it('weighted split — 2:1 ratio', () => {
    const items = [makeItem('wine', 900)];
    const claims: Claim[] = [
      { lineItemId: 'wine', participantId: 'p1', weight: 2 },
      { lineItemId: 'wine', participantId: 'p2', weight: 1 },
    ];

    const result = computeShares(items, claims);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    // p1 share = 900 * 2/3 = 600
    expect(floorToCents(p1.claimedSubtotalRational)).toBe(600);
    // p2 share = 900 * 1/3 = 300
    expect(floorToCents(p2.claimedSubtotalRational)).toBe(300);
  });

  it('unclaimed item — full price goes to unclaimedCents', () => {
    const items = [makeItem('i1', 500), makeItem('i2', 300)];
    const claims: Claim[] = [{ lineItemId: 'i1', participantId: 'p1', weight: 1 }];

    const result = computeShares(items, claims);

    expect(result.unclaimedCents).toBe(300);
    expect(result.totalClaimedCents).toBe(500);
  });

  it('fully unclaimed — all items orphaned', () => {
    const items = [makeItem('i1', 500), makeItem('i2', 300)];
    const claims: Claim[] = [];

    const result = computeShares(items, claims);

    expect(result.perParticipant).toHaveLength(0);
    expect(result.unclaimedCents).toBe(800);
    expect(result.totalClaimedCents).toBe(0);
  });

  it('multiple items, multiple participants', () => {
    // p1 claims item A, p1+p2 split item B equally
    const items = [makeItem('a', 400), makeItem('b', 600)];
    const claims: Claim[] = [
      { lineItemId: 'a', participantId: 'p1', weight: 1 },
      { lineItemId: 'b', participantId: 'p1', weight: 1 },
      { lineItemId: 'b', participantId: 'p2', weight: 1 },
    ];

    const result = computeShares(items, claims);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    // p1: 400 + 300 (half of 600) = 700
    expect(floorToCents(p1.claimedSubtotalRational)).toBe(700);
    // p2: 300 (half of 600)
    expect(floorToCents(p2.claimedSubtotalRational)).toBe(300);
    expect(result.unclaimedCents).toBe(0);
    expect(result.totalClaimedCents).toBe(1000);
  });
});
