import type { AppConfig } from './types.js';
import type { FlipResult } from './types.js';
import type { ItemSnapshot } from './types.js';
import { computeFlip } from './flip.js';

export interface FlipRow extends ItemSnapshot {
  flip: FlipResult | null;
  /** 1h traded units extrapolated to the 4h buy-limit window. */
  volumePer4h: number | null;
  /** Age in seconds of the OLDER of the two price sides (worst case). */
  ageSeconds: number | null;
  isStale: boolean;
  /** Juicy margin on tiny volume — likely manipulation or an unfillable offer. */
  isThin: boolean;
  /** Latest prices disagree sharply with the 1h average. */
  isUnstable: boolean;
  /** Direction the buy side (insta-sell) moved since the previous refresh. */
  buyMove: -1 | 0 | 1;
  /** Direction the sell side (insta-buy) moved since the previous refresh. */
  sellMove: -1 | 0 | 1;
}

export type PrevPrices = Map<number, { low: number | null; high: number | null }>;

function move(current: number | null, previous: number | null | undefined): -1 | 0 | 1 {
  if (current === null || previous === null || previous === undefined) return 0;
  return Math.sign(current - previous) as -1 | 0 | 1;
}

/** "Thin" = ROI at least this… */
const THIN_MIN_ROI = 0.04;
/** …on fewer than this many units traded per hour. */
const THIN_MAX_VOLUME_1H = 30;
/** "Unstable" = either latest side deviating more than this from its 1h average. */
const UNSTABLE_DEVIATION = 0.1;

function deviates(latest: number | null, hourAvg: number | null): boolean {
  if (latest === null || hourAvg === null || hourAvg === 0) return false;
  return Math.abs(latest - hourAvg) / hourAvg > UNSTABLE_DEVIATION;
}

/**
 * Compute flip economics for every item snapshot. `nowSec` fixes "age" per
 * refresh; `prev` (prices from the previous refresh) enables change flashes.
 */
export function buildRows(
  items: ItemSnapshot[],
  cfg: AppConfig,
  nowSec: number,
  prev?: PrevPrices,
): FlipRow[] {
  return items.map((item) => {
    const prevPrices = prev?.get(item.id);
    // 0 recent volume is a real zero, not "unknown": fall back to the daily
    // average, else feasible quantity legitimately becomes 0 (dead item).
    const volumePer4h =
      item.volume1h > 0
        ? item.volume1h * 4
        : item.dailyVolume !== null
          ? item.dailyVolume / 6
          : null;
    const flip = computeFlip(
      {
        low: item.low,
        high: item.high,
        isExempt: item.taxExempt,
        buyLimit: item.limit,
        volumePer4h,
      },
      { captureRate: cfg.captureRate, offerOffset: cfg.offerOffset },
    );
    const oldestTime =
      item.highTime === null || item.lowTime === null
        ? (item.highTime ?? item.lowTime)
        : Math.min(item.highTime, item.lowTime);
    const ageSeconds = oldestTime === null ? null : Math.max(0, nowSec - oldestTime);
    return {
      ...item,
      flip,
      volumePer4h,
      ageSeconds,
      isStale: ageSeconds === null || ageSeconds > cfg.staleAfterSeconds,
      isThin:
        flip !== null &&
        flip.marginPerItem > 0 &&
        flip.roi >= THIN_MIN_ROI &&
        item.volume1h < THIN_MAX_VOLUME_1H,
      isUnstable:
        deviates(item.high, item.avgHighPrice1h) || deviates(item.low, item.avgLowPrice1h),
      buyMove: move(item.low, prevPrices?.low),
      sellMove: move(item.high, prevPrices?.high),
    };
  });
}

