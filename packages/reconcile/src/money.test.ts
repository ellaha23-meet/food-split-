import { describe, it, expect } from 'vitest';
import {
  asCents,
  addCents,
  subCents,
  negateCents,
  centsEq,
  centsLt,
  centsGte,
  ZERO,
  rational,
  fromCents,
  addRational,
  subRational,
  mulRational,
  scaleByCents,
  rationalLt,
  rationalNonNeg,
  floorToCents,
  fractionalPart,
  formatCents,
  formatCentsPlain,
  ZERO_RATIONAL,
} from './money.js';

describe('Cents type', () => {
  it('asCents rejects non-integers', () => {
    expect(() => asCents(1.5)).toThrow();
    expect(() => asCents(NaN)).toThrow();
  });

  it('asCents accepts integers', () => {
    expect(asCents(0)).toBe(0);
    expect(asCents(100)).toBe(100);
    expect(asCents(-50)).toBe(-50);
  });

  it('addCents', () => {
    expect(addCents(asCents(100), asCents(200))).toBe(300);
  });

  it('subCents', () => {
    expect(subCents(asCents(300), asCents(100))).toBe(200);
  });

  it('negateCents', () => {
    expect(negateCents(asCents(100))).toBe(-100);
    expect(negateCents(ZERO)).toBe(-0);
  });

  it('comparisons', () => {
    expect(centsEq(asCents(100), asCents(100))).toBe(true);
    expect(centsEq(asCents(100), asCents(200))).toBe(false);
    expect(centsLt(asCents(100), asCents(200))).toBe(true);
    expect(centsLt(asCents(200), asCents(100))).toBe(false);
    expect(centsGte(asCents(200), asCents(100))).toBe(true);
    expect(centsGte(asCents(100), asCents(100))).toBe(true);
  });
});

describe('Rational arithmetic', () => {
  it('rational reduces fractions', () => {
    const r = rational(4n, 6n);
    expect(r.num).toBe(2n);
    expect(r.den).toBe(3n);
  });

  it('rational normalizes negative denominator', () => {
    const r = rational(1n, -3n);
    expect(r.num).toBe(-1n);
    expect(r.den).toBe(3n);
  });

  it('rational throws on zero denominator', () => {
    expect(() => rational(1n, 0n)).toThrow();
  });

  it('ZERO_RATIONAL is 0/1', () => {
    expect(ZERO_RATIONAL.num).toBe(0n);
    expect(ZERO_RATIONAL.den).toBe(1n);
  });

  it('fromCents', () => {
    const r = fromCents(asCents(333));
    expect(r.num).toBe(333n);
    expect(r.den).toBe(1n);
  });

  it('addRational', () => {
    const a = rational(1n, 3n);
    const b = rational(1n, 6n);
    const sum = addRational(a, b);
    expect(sum.num).toBe(1n);
    expect(sum.den).toBe(2n); // 1/3 + 1/6 = 1/2
  });

  it('subRational', () => {
    const a = rational(1n, 2n);
    const b = rational(1n, 3n);
    const diff = subRational(a, b);
    expect(diff.num).toBe(1n);
    expect(diff.den).toBe(6n); // 1/2 - 1/3 = 1/6
  });

  it('mulRational', () => {
    const a = rational(2n, 3n);
    const b = rational(3n, 4n);
    const prod = mulRational(a, b);
    expect(prod.num).toBe(1n);
    expect(prod.den).toBe(2n); // 2/3 * 3/4 = 1/2
  });

  it('scaleByCents', () => {
    const r = rational(1n, 3n);
    const scaled = scaleByCents(r, asCents(1000));
    expect(scaled.num).toBe(1000n);
    expect(scaled.den).toBe(3n);
  });

  it('rationalLt', () => {
    expect(rationalLt(rational(1n, 3n), rational(1n, 2n))).toBe(true);
    expect(rationalLt(rational(1n, 2n), rational(1n, 3n))).toBe(false);
  });

  it('rationalNonNeg', () => {
    expect(rationalNonNeg(rational(0n, 1n))).toBe(true);
    expect(rationalNonNeg(rational(1n, 3n))).toBe(true);
    expect(rationalNonNeg(rational(-1n, 3n))).toBe(false);
  });
});

describe('Rounding', () => {
  it('floorToCents — exact integer', () => {
    expect(floorToCents(rational(333n, 1n))).toBe(333);
  });

  it('floorToCents — floors down', () => {
    // 1000/3 = 333.333... → 333
    expect(floorToCents(rational(1000n, 3n))).toBe(333);
  });

  it('floorToCents — negative', () => {
    // -1000/3 = -333.333... → -334 (floor)
    expect(floorToCents(rational(-1000n, 3n))).toBe(-334);
  });

  it('fractionalPart is in [0, 1)', () => {
    const r = rational(1000n, 3n); // 333.333...
    const frac = fractionalPart(r);
    expect(rationalNonNeg(frac)).toBe(true);
    expect(rationalLt(frac, rational(1n, 1n))).toBe(true);
    // frac should be 1/3
    expect(frac.num).toBe(1n);
    expect(frac.den).toBe(3n);
  });

  it('fractionalPart of whole number is 0', () => {
    const r = rational(900n, 3n); // exactly 300
    const frac = fractionalPart(r);
    expect(frac.num).toBe(0n);
  });
});

describe('Display formatting', () => {
  it('formatCents', () => {
    expect(formatCents(asCents(0))).toBe('$0.00');
    expect(formatCents(asCents(100))).toBe('$1.00');
    expect(formatCents(asCents(1050))).toBe('$10.50');
    expect(formatCents(asCents(1234))).toBe('$12.34');
    expect(formatCents(asCents(-500))).toBe('-$5.00');
    expect(formatCents(asCents(5))).toBe('$0.05');
  });

  it('formatCentsPlain', () => {
    expect(formatCentsPlain(asCents(1050))).toBe('10.50');
    expect(formatCentsPlain(asCents(0))).toBe('0.00');
    expect(formatCentsPlain(asCents(-500))).toBe('-5.00');
  });
});
