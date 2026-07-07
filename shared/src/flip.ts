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
 * Units you can realistically move in a 4h window: the buy limit and the
 * capture-rate share of traded volume, whichever binds. Null only when both
 * inputs are unknown.
 */
export function feasibleQtyPer4h(
  buyLimit: number | null,
  volumePer4h: number | null,
  captureRate: number,
): number | null {
  const volumeCap =
    volumePer4h === null ? null : Math.floor(Math.max(0, volumePer4h) * captureRate);
  if (volumeCap === null && buyLimit === null) return null;
  if (volumeCap === null) return buyLimit;
  if (buyLimit === null) return volumeCap;
  return Math.min(buyLimit, volumeCap);
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

  const qty = feasibleQtyPer4h(buyLimit, volumePer4h, cfg.captureRate);
  const profitPer4h = qty === null ? null : marginPerItem * qty;
  const gpPerHour = profitPer4h === null ? null : profitPer4h / 4;

  return { buyAt, sellAt, tax, marginPerItem, roi, feasibleQtyPer4h: qty, profitPer4h, gpPerHour };
}

export interface PricedFlipInputs {
  /** Exact buy price the player intends to pay. */
  buy: number;
  /** Exact sell price the player intends to list at. */
  sell: number;
  isExempt: boolean;
  buyLimit: number | null;
  volumePer4h: number | null;
}

/**
 * Post-tax flip economics from EXPLICIT buy/sell prices — a "what-if", rather
 * than prices derived from the live spread. Prices are floored to whole gp and
 * must be >= 1 (you cannot offer 0), else null. Same throughput and tax rules
 * as {@link computeFlip}, so the two agree when fed matching prices.
 */
export function computeFlipFromPrices(
  inputs: PricedFlipInputs,
  captureRate: number = DEFAULT_FLIP_CONFIG.captureRate,
): FlipResult | null {
  const buyAt = Math.floor(inputs.buy);
  const sellAt = Math.floor(inputs.sell);
  if (buyAt < 1 || sellAt < 1) return null;

  const tax = geTax(inputs.isExempt, sellAt);
  const marginPerItem = sellAt - buyAt - tax;
  const roi = marginPerItem / buyAt;

  const qty = feasibleQtyPer4h(inputs.buyLimit, inputs.volumePer4h, captureRate);
  const profitPer4h = qty === null ? null : marginPerItem * qty;
  const gpPerHour = profitPer4h === null ? null : profitPer4h / 4;

  return { buyAt, sellAt, tax, marginPerItem, roi, feasibleQtyPer4h: qty, profitPer4h, gpPerHour };
}
