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
