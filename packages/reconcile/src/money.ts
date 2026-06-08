/**
 * Money primitives (P1.1)
 *
 * Rules enforced here:
 * - G1: Money is integer cents. No floating-point arithmetic on money values.
 * - G2: This module is pure — zero I/O, zero clock, zero randomness.
 *
 * CentAmount is an opaque branded integer representing a number of cents.
 * Rational is an exact fraction (bigint numerator / bigint denominator) used
 * for intermediate calculations before the single final rounding step (P1.4).
 */

// ─── Branded integer cent type ───────────────────────────────────────────────

declare const __cent_brand: unique symbol;
/** An exact integer number of cents. Never a float. */
export type Cents = number & { readonly [__cent_brand]: true };

/** Unsafely cast a number to Cents — only call this at system boundaries
 *  (DB reads, user input after parseInt). Internal code uses cent() below. */
export function asCents(n: number): Cents {
  if (!Number.isInteger(n)) {
    throw new Error(`asCents: expected integer, got ${n}`);
  }
  return n as Cents;
}

export const ZERO: Cents = 0 as Cents;

export function addCents(a: Cents, b: Cents): Cents {
  return (a + b) as Cents;
}

export function subCents(a: Cents, b: Cents): Cents {
  return (a - b) as Cents;
}

export function negateCents(a: Cents): Cents {
  return (-a) as Cents;
}

export function centsLt(a: Cents, b: Cents): boolean {
  return a < b;
}

export function centsGte(a: Cents, b: Cents): boolean {
  return a >= b;
}

export function centsEq(a: Cents, b: Cents): boolean {
  return a === b;
}

// ─── Rational arithmetic (bigint numerator / denominator) ────────────────────

export interface Rational {
  readonly num: bigint;
  readonly den: bigint; // always positive
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export function rational(num: bigint, den: bigint): Rational {
  if (den === 0n) throw new Error('rational: denominator cannot be zero');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num < 0n ? -num : num, den);
  return { num: num / g, den: den / g };
}

export const ZERO_RATIONAL: Rational = rational(0n, 1n);

export function fromCents(c: Cents): Rational {
  return rational(BigInt(c), 1n);
}

export function addRational(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function subRational(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mulRational(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

/** Multiply a rational by a Cents value, returning a Rational. */
export function scaleByCents(r: Rational, c: Cents): Rational {
  return rational(r.num * BigInt(c), r.den);
}

/** True if a < b */
export function rationalLt(a: Rational, b: Rational): boolean {
  return a.num * b.den < b.num * a.den;
}

/** True if a >= 0 */
export function rationalNonNeg(a: Rational): boolean {
  return a.num >= 0n;
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

/**
 * Floor a rational down to the nearest integer cent.
 * Result is always <= the true value.
 */
export function floorToCents(r: Rational): Cents {
  if (r.den === 1n) return asCents(Number(r.num));
  const q = r.num / r.den;
  // For negative rationals, bigint division truncates toward zero; we need floor.
  const floored = r.num < 0n && r.num % r.den !== 0n ? q - 1n : q;
  return asCents(Number(floored));
}

/**
 * The fractional remainder after flooring: r - floor(r), always in [0, 1).
 * Expressed as a Rational for comparison purposes.
 */
export function fractionalPart(r: Rational): Rational {
  const floored = floorToCents(r);
  return subRational(r, fromCents(floored));
}

// ─── Display formatting ───────────────────────────────────────────────────────

/**
 * Format cents as a USD display string, e.g. 1050 → "$10.50".
 * This is the ONLY place a cents value becomes a decimal string (G1).
 */
export function formatCents(c: Cents): string {
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = c < 0 ? '-' : '';
  return `${sign}$${dollars}.${String(cents).padStart(2, '0')}`;
}

/**
 * Format cents as a plain decimal number string without currency symbol,
 * e.g. 1050 → "10.50". Used for payment deep-link amount parameters.
 */
export function formatCentsPlain(c: Cents): string {
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = c < 0 ? '-' : '';
  return `${sign}${dollars}.${String(cents).padStart(2, '0')}`;
}
