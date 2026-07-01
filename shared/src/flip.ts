import type { FlipConfig, FlipResult } from './types.js';
import { geTax } from './tax.js';

export const DEFAULT_FLIP_CONFIG: FlipConfig = {
  captureRate: 0.1,
  offerOffset: 1,
};

export interface FlipInputs {
  /** Latest insta-sell price — what a competitive buy offer starts from. */
  low: number | null;
  /** Latest insta-buy price — what a competitive sell offer starts from. */
  high: number | null;
  isExempt: boolean;
  /** GE buy limit per 4h; null when the wiki doesn't know it. */
  buyLimit: number | null;
  /** Units traded per 4h window; null when unknown. */
  volumePer4h: number | null;
}

/**
 * Post-tax flip economics for one item, or null when there is no usable
 * price pair. Prices are clamped to >= 1 gp (you cannot offer 0).
 */
export function computeFlip(
  inputs: FlipInputs,
  cfg: FlipConfig = DEFAULT_FLIP_CONFIG,
): FlipResult | null {
  const { low, high, isExempt, buyLimit, volumePer4h } = inputs;
  if (low === null || high === null || low <= 0 || high <= 0) return null;

  const buyAt = Math.max(1, low + cfg.offerOffset);
  const sellAt = Math.max(1, high - cfg.offerOffset);
  const tax = geTax(isExempt, sellAt);
  const marginPerItem = sellAt - buyAt - tax;
  const roi = marginPerItem / buyAt;

  const volumeCap =
    volumePer4h === null ? null : Math.floor(Math.max(0, volumePer4h) * cfg.captureRate);
  let feasibleQtyPer4h: number | null;
  if (volumeCap === null && buyLimit === null) feasibleQtyPer4h = null;
  else if (volumeCap === null) feasibleQtyPer4h = buyLimit;
  else if (buyLimit === null) feasibleQtyPer4h = volumeCap;
  else feasibleQtyPer4h = Math.min(buyLimit, volumeCap);

  const profitPer4h = feasibleQtyPer4h === null ? null : marginPerItem * feasibleQtyPer4h;
  const gpPerHour = profitPer4h === null ? null : profitPer4h / 4;

  return { buyAt, sellAt, tax, marginPerItem, roi, feasibleQtyPer4h, profitPer4h, gpPerHour };
}
