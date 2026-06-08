/**
 * Self-contained split math for the client-side prototype (no backend, no DB).
 *
 * All money is integer cents (G1). Shared items split equally among claimers;
 * tax is allocated proportionally to each diner's claimed items; tip is each
 * diner's own choice, added on top. Remainders are distributed deterministically
 * so the parts always sum back to the whole — good enough for a demo, and honest.
 */

export interface PItem {
  id: string;
  name: string;
  qty: number;
  unitCents: number;
}

export const itemTotal = (it: PItem): number => it.qty * it.unitCents;

export interface DinerTotal {
  dinerId: string;
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export interface SplitResult {
  perDiner: DinerTotal[];
  subtotalCents: number;
  unclaimedCents: number;
}

/** Spread `total` across `n` recipients as evenly as possible (cents-exact). */
export function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export function computeSplit(
  items: PItem[],
  claimsByItem: Record<string, string[]>,
  tipsByDiner: Record<string, number>,
  dinerIds: string[],
  taxCents: number,
): SplitResult {
  const itemsCents: Record<string, number> = {};
  for (const id of dinerIds) itemsCents[id] = 0;

  let unclaimedCents = 0;
  let subtotalCents = 0;

  for (const it of items) {
    const total = itemTotal(it);
    subtotalCents += total;
    const claimers = claimsByItem[it.id] ?? [];
    if (claimers.length === 0) {
      unclaimedCents += total;
      continue;
    }
    const shares = evenSplit(total, claimers.length);
    claimers.forEach((d, i) => {
      itemsCents[d] = (itemsCents[d] ?? 0) + (shares[i] ?? 0);
    });
  }

  // Tax allocated proportionally to each diner's claimed items (cents-exact).
  const claimedSubtotal = dinerIds.reduce((a, d) => a + (itemsCents[d] ?? 0), 0);
  const taxByDiner: Record<string, number> = {};
  for (const id of dinerIds) taxByDiner[id] = 0;
  if (taxCents > 0 && claimedSubtotal > 0) {
    // Largest-remainder allocation keyed on each diner's items weight.
    const floored = dinerIds.map((d) => {
      const exact = (taxCents * (itemsCents[d] ?? 0)) / claimedSubtotal;
      const f = Math.floor(exact);
      return { d, f, frac: exact - f };
    });
    let assigned = floored.reduce((a, e) => a + e.f, 0);
    let leftover = taxCents - assigned;
    floored.sort((a, b) => b.frac - a.frac);
    for (const e of floored) {
      taxByDiner[e.d] = e.f + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
    }
  }

  const perDiner: DinerTotal[] = dinerIds.map((d) => {
    const itemsC = itemsCents[d] ?? 0;
    const taxC = taxByDiner[d] ?? 0;
    const tipC = Math.max(0, Math.round(tipsByDiner[d] ?? 0));
    return {
      dinerId: d,
      itemsCents: itemsC,
      taxCents: taxC,
      tipCents: tipC,
      totalCents: itemsC + taxC + tipC,
    };
  });

  return { perDiner, subtotalCents, unclaimedCents };
}
