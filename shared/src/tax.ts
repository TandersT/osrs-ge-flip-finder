import { GE_TAX_EXEMPT_IDS } from './taxExemptions.js';

/** Tax rate is 2% == 1/50, rounded down per item. */
export const GE_TAX_DIVISOR = 50;
/** Tax is capped at 5m gp per item (reached at a 250m sale price). */
export const GE_TAX_CAP = 5_000_000;

/**
 * Grand Exchange tax for selling ONE item at `sellPrice` (current as of mid-2026).
 * - 2% of sale price, rounded down => any price <= 49 gp is tax-free.
 * - Capped at 5,000,000 gp per item.
 * - Buyers are never taxed; ~45 items are fully exempt.
 */
export function geTax(isExempt: boolean, sellPrice: number): number {
  if (isExempt || sellPrice < GE_TAX_DIVISOR) return 0;
  // 2% rounded down == integer division by 50 (avoids float error)
  return Math.min(Math.floor(sellPrice / GE_TAX_DIVISOR), GE_TAX_CAP);
}

/** Tax is applied per item, not per offer. */
export function geTaxForQuantity(isExempt: boolean, sellPrice: number, quantity: number): number {
  return geTax(isExempt, sellPrice) * quantity;
}

export function isTaxExempt(itemId: number): boolean {
  return GE_TAX_EXEMPT_IDS.has(itemId);
}

/**
 * Smallest sell price that doesn't lose money after tax, given what you paid.
 * Exempt (or sub-50gp) sales have no tax, so break-even == the buy price.
 */
export function breakEvenSell(isExempt: boolean, buyPrice: number): number {
  if (isExempt || buyPrice < GE_TAX_DIVISOR) return buyPrice;
  // Above the cap the tax is a flat 5m.
  if (buyPrice + GE_TAX_CAP >= 250_000_000) return buyPrice + GE_TAX_CAP;
  // Need min S with S - floor(S/50) >= buy; S ≈ 50*buy/49, then fix floor jitter.
  const estimate = Math.floor((GE_TAX_DIVISOR * buyPrice) / (GE_TAX_DIVISOR - 1));
  for (let s = estimate - 2; s <= estimate + 3; s++) {
    if (s - geTax(false, s) >= buyPrice) return s;
  }
  /* c8 ignore next */
  return estimate + 3; // unreachable: the window always contains the fix point
}
