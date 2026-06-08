import { describe, it, expect } from 'vitest';
import { allocate, type AllocationInput } from './allocate.js';
import { asCents, addRational, ZERO_RATIONAL, floorToCents } from './money.js';
import type { ParticipantSubtotal } from './shares.js';
import { rational } from './money.js';

function subtotal(id: string, cents: number): ParticipantSubtotal {
  return {
    participantId: id,
    claimedSubtotalRational: rational(BigInt(cents), 1n),
  };
}

const noTreated = new Set<string>();

function baseInput(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    perParticipant: [],
    treatedParticipantIds: noTreated,
    taxCents: asCents(0),
    tipCents: asCents(0),
    tipMode: 'proportional',
    serviceChargeCents: asCents(0),
    serviceChargeMode: 'proportional',
    discountCents: asCents(0),
    discountMode: 'proportional',
    ...overrides,
  };
}


describe('allocate — proportional tax', () => {
  it('two participants split tax proportionally to subtotals', () => {
    // p1 spent 600, p2 spent 400, tax = 90
    // p1 tax = 90 * 600/1000 = 54
    // p2 tax = 90 * 400/1000 = 36
    const input = baseInput({
      perParticipant: [subtotal('p1', 600), subtotal('p2', 400)],
      taxCents: asCents(90),
    });
    const result = allocate(input);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    expect(floorToCents(p1.taxRational)).toBe(54);
    expect(floorToCents(p2.taxRational)).toBe(36);

    // I2: component conservation — sum of tax shares == taxCents (in rationals before rounding)
    const taxSum = addRational(p1.taxRational, p2.taxRational);
    expect(floorToCents(taxSum)).toBe(90);
  });
});

describe('allocate — proportional tip', () => {
  it('proportional tip follows subtotal ratio', () => {
    const input = baseInput({
      perParticipant: [subtotal('p1', 750), subtotal('p2', 250)],
      tipCents: asCents(200),
      tipMode: 'proportional',
    });
    const result = allocate(input);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    // p1 tip = 200 * 750/1000 = 150; p2 tip = 200 * 250/1000 = 50
    expect(floorToCents(p1.tipRational)).toBe(150);
    expect(floorToCents(p2.tipRational)).toBe(50);

    // I2
    const tipSum = addRational(p1.tipRational, p2.tipRational);
    expect(floorToCents(tipSum)).toBe(200);
  });
});

describe('allocate — even tip', () => {
  it('even tip splits equally per head', () => {
    const input = baseInput({
      perParticipant: [subtotal('p1', 900), subtotal('p2', 100)],
      tipCents: asCents(200),
      tipMode: 'even',
    });
    const result = allocate(input);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    // Each gets 100 exactly (200/2)
    expect(floorToCents(p1.tipRational)).toBe(100);
    expect(floorToCents(p2.tipRational)).toBe(100);
  });
});

describe('allocate — proportional discount', () => {
  it('proportional discount reduces proportionally', () => {
    const input = baseInput({
      perParticipant: [subtotal('p1', 600), subtotal('p2', 400)],
      discountCents: asCents(100),
      discountMode: 'proportional',
    });
    const result = allocate(input);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    // p1 discount = 100 * 600/1000 = 60; p2 = 40
    expect(floorToCents(p1.discountRational)).toBe(60);
    expect(floorToCents(p2.discountRational)).toBe(40);
  });
});

describe('allocate — assigned discount', () => {
  it('assigned discount goes to assignee only', () => {
    const input = baseInput({
      perParticipant: [subtotal('p1', 600), subtotal('p2', 400)],
      discountCents: asCents(50),
      discountMode: 'assigned',
      discountAssigneeId: 'p2',
    });
    const result = allocate(input);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    expect(floorToCents(p1.discountRational)).toBe(0);
    expect(floorToCents(p2.discountRational)).toBe(50);
  });
});

describe('allocate — treated diner', () => {
  it('treated diner total is zero; payers cover tax/tip from their own subtotals', () => {
    // p1 (treated) claimed $5, p2 (payer) claimed $10.
    // Tax = $1.50, tip = $2 (proportional)
    // p1 is treated → everything zeroed.
    // p2 covers: subtotal=1000, tax=150, tip=200 → total=1350
    const input = baseInput({
      perParticipant: [subtotal('p1', 500), subtotal('p2', 1000)],
      treatedParticipantIds: new Set(['p1']),
      taxCents: asCents(150),
      tipCents: asCents(200),
      tipMode: 'proportional',
    });
    const result = allocate(input);

    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    const p2 = result.perParticipant.find((p) => p.participantId === 'p2')!;

    expect(floorToCents(p1.totalRational)).toBe(0);
    expect(p1.claimedSubtotalRational).toEqual(ZERO_RATIONAL);

    // p2 gets all tax + tip since p1 is excluded from payer set
    expect(floorToCents(p2.taxRational)).toBe(150);
    expect(floorToCents(p2.tipRational)).toBe(200);
    expect(floorToCents(p2.totalRational)).toBe(1350);
  });
});

describe('allocate — I3 non-negativity', () => {
  it('large assigned discount does not make total negative', () => {
    // p1 subtotal = 100, assigned discount = 200 (overshoot)
    const input = baseInput({
      perParticipant: [subtotal('p1', 100)],
      discountCents: asCents(200),
      discountMode: 'assigned',
      discountAssigneeId: 'p1',
    });
    const result = allocate(input);
    const p1 = result.perParticipant.find((p) => p.participantId === 'p1')!;
    expect(floorToCents(p1.totalRational)).toBe(0);
  });
});
