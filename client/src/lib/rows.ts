import type { AppConfig, FlipResult, ItemSnapshot } from '@osrs-flip/shared';
import { computeFlip } from '@osrs-flip/shared';

export interface FlipRow extends ItemSnapshot {
  flip: FlipResult | null;
  /** 1h traded units extrapolated to the 4h buy-limit window. */
  volumePer4h: number | null;
  /** Age in seconds of the OLDER of the two price sides (worst case). */
  ageSeconds: number | null;
  isStale: boolean;
}

/** Compute flip economics for every item snapshot. `nowSec` fixes "age" per refresh. */
export function buildRows(items: ItemSnapshot[], cfg: AppConfig, nowSec: number): FlipRow[] {
  return items.map((item) => {
    const volumePer4h = item.volume1h > 0 ? item.volume1h * 4 : null;
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
    };
  });
}

export type Membership = 'all' | 'members' | 'f2p';

export interface Filters {
  search: string;
  minMargin: number | null;
  /** Percent, e.g. 2 == 2%. */
  minRoi: number | null;
  minVolume1h: number | null;
  minBuyPrice: number | null;
  maxBuyPrice: number | null;
  membership: Membership;
  taxExemptOnly: boolean;
  hideStale: boolean;
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  minMargin: null,
  minRoi: null,
  minVolume1h: null,
  minBuyPrice: null,
  maxBuyPrice: null,
  membership: 'all',
  taxExemptOnly: false,
  hideStale: false,
};

/** Case-insensitive substring, falling back to in-order subsequence ("fuzzy"). */
export function nameMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const n = name.toLowerCase();
  if (n.includes(q)) return true;
  let i = 0;
  for (const ch of n) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export function applyFilters(rows: FlipRow[], f: Filters): FlipRow[] {
  return rows.filter((row) => {
    if (!nameMatches(row.name, f.search)) return false;
    if (f.membership === 'members' && !row.members) return false;
    if (f.membership === 'f2p' && row.members) return false;
    if (f.taxExemptOnly && !row.taxExempt) return false;
    if (f.hideStale && row.isStale) return false;
    if (f.minVolume1h !== null && row.volume1h < f.minVolume1h) return false;
    if (f.minMargin !== null || f.minRoi !== null || f.minBuyPrice !== null || f.maxBuyPrice !== null) {
      if (row.flip === null) return false;
      if (f.minMargin !== null && row.flip.marginPerItem < f.minMargin) return false;
      if (f.minRoi !== null && row.flip.roi * 100 < f.minRoi) return false;
      if (f.minBuyPrice !== null && row.flip.buyAt < f.minBuyPrice) return false;
      if (f.maxBuyPrice !== null && row.flip.buyAt > f.maxBuyPrice) return false;
    }
    return true;
  });
}
