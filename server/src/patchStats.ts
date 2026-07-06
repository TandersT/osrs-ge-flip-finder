import type { PatchItemRow } from '@osrs-flip/shared';

/**
 * Event-study math for Patch Impact: how did each item move around an update
 * date, normalised by that item's own volatility so a sleepy item moving 12%
 * outranks a jittery one moving 15%. Pure functions over daily price series.
 */

/** One daily price point from the exchange archive (weirdgloop). */
export interface DailyPoint {
  /** Unix seconds, ascending. */
  timestamp: number;
  price: number;
  /** Null before Sept 2018 (archive has no volumes there). */
  volume: number | null;
}

export interface PatchItemInput {
  id: number;
  name: string;
  icon: string | null;
  series: DailyPoint[];
  mentioned: boolean;
}

export interface PatchComputation {
  /** 7 normally; 1 when the patch is too recent for any 7d reading. */
  windowDays: 1 | 7;
  /** Items with a usable patch-eve baseline. */
  universeSize: number;
  winners: PatchItemRow[];
  losers: PatchItemRow[];
  /** Share of scored items with |z| >= UNUSUAL_Z; null when nothing scored. */
  impact: number | null;
}

export const DAY = 86_400;
export const UNUSUAL_Z = 2;
/** A window price counts only if a point lands within this many days of the target. */
const TOLERANCE_DAYS = 2;
/** Pre-patch daily-return volatility lookback. */
const SIGMA_DAYS = 90;
/** Fewer pre-patch returns than this -> use the universe median sigma instead. */
const SIGMA_MIN_POINTS = 30;
/** Last-resort sigma when a whole patch lacks history (earliest 2015 patches): ~3%/day. */
const DEFAULT_DAILY_SIGMA = 0.03;
const TOP_N = 20;

/** Index of the last point at/before ts, or -1 (series ascending). */
function lastIndexAtOrBefore(series: DailyPoint[], ts: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.timestamp <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Price nearest ts within TOLERANCE_DAYS, else null. */
export function priceAt(series: DailyPoint[], ts: number): number | null {
  const i = lastIndexAtOrBefore(series, ts);
  const before = i >= 0 ? series[i]! : null;
  const after = i + 1 < series.length ? series[i + 1]! : null;
  const dBefore = before ? ts - before.timestamp : Infinity;
  const dAfter = after ? after.timestamp - ts : Infinity;
  const best = dBefore <= dAfter ? before : after;
  return best !== null && Math.min(dBefore, dAfter) <= TOLERANCE_DAYS * DAY ? best.price : null;
}

/** Patch-eve baseline: last price strictly before the patch, within tolerance. */
export function baselineAt(series: DailyPoint[], patchTs: number): number | null {
  const i = lastIndexAtOrBefore(series, patchTs - 1);
  if (i < 0) return null;
  const p = series[i]!;
  return patchTs - p.timestamp <= TOLERANCE_DAYS * DAY ? p.price : null;
}

/** Std dev of daily returns over SIGMA_DAYS pre-patch; null when history is thin. */
export function preDailySigma(series: DailyPoint[], patchTs: number): number | null {
  const end = lastIndexAtOrBefore(series, patchTs - 1);
  if (end < 0) return null;
  const start = Math.max(0, end - SIGMA_DAYS + 1);
  const returns: number[] = [];
  for (let i = start + 1; i <= end; i++) {
    const prev = series[i - 1]!.price;
    if (prev > 0) returns.push((series[i]!.price - prev) / prev);
  }
  if (returns.length < SIGMA_MIN_POINTS) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

/** 7d fractional change from the patch-eve baseline; null when either side is missing. */
export function change7After(series: DailyPoint[], patchTs: number): number | null {
  const base = baselineAt(series, patchTs);
  const after = priceAt(series, patchTs + 7 * DAY);
  return base !== null && base > 0 && after !== null ? (after - base) / base : null;
}

/** Mean volume over (from, to], needing >= 3 volume-bearing points. */
function avgVolume(series: DailyPoint[], from: number, to: number): number | null {
  const start = Math.max(0, lastIndexAtOrBefore(series, from) + 1);
  const end = lastIndexAtOrBefore(series, to);
  const vols: number[] = [];
  for (let i = start; i <= end; i++) {
    const v = series[i]!.volume;
    if (v !== null) vols.push(v);
  }
  if (vols.length < 3) return null;
  return vols.reduce((s, v) => s + v, 0) / vols.length;
}

export function computePatch(
  items: PatchItemInput[],
  patchTs: number,
  hasVolume: boolean,
): PatchComputation {
  interface Working {
    row: PatchItemRow;
    sigma: number | null;
  }
  const working: Working[] = [];
  for (const item of items) {
    const base = baselineAt(item.series, patchTs);
    if (base === null || base <= 0) continue;
    const rel = (p: number | null): number | null => (p === null ? null : (p - base) / base);
    const before7 = priceAt(item.series, patchTs - 7 * DAY);
    let volumeDelta7: number | null = null;
    if (hasVolume) {
      const before = avgVolume(item.series, patchTs - 28 * DAY, patchTs - 1);
      const after = avgVolume(item.series, patchTs - 1, patchTs + 7 * DAY);
      volumeDelta7 = before !== null && before > 0 && after !== null ? after / before - 1 : null;
    }
    working.push({
      sigma: preDailySigma(item.series, patchTs),
      row: {
        id: item.id,
        name: item.name,
        icon: item.icon,
        change1: rel(priceAt(item.series, patchTs + 1 * DAY)),
        change7: rel(priceAt(item.series, patchTs + 7 * DAY)),
        change30: rel(priceAt(item.series, patchTs + 30 * DAY)),
        runup7: before7 !== null && before7 > 0 ? (base - before7) / before7 : null,
        zScore: null,
        volumeDelta7,
        mentioned: item.mentioned,
      },
    });
  }

  const windowDays: 1 | 7 = working.some((w) => w.row.change7 !== null) ? 7 : 1;
  const chg = (r: PatchItemRow): number | null => (windowDays === 7 ? r.change7 : r.change1);

  // Sigma fallback chain: own history -> universe median -> a sane default.
  // A zero sigma (perfectly flat pre-patch series) is unusable, same as null.
  const sigmas = working
    .map((w) => w.sigma)
    .filter((s): s is number => s !== null && s > 0)
    .sort((a, b) => a - b);
  const medianSigma = sigmas.length > 0 ? sigmas[Math.floor(sigmas.length / 2)]! : null;
  for (const w of working) {
    const change = chg(w.row);
    const own = w.sigma !== null && w.sigma > 0 ? w.sigma : null;
    const sigma = own ?? medianSigma ?? DEFAULT_DAILY_SIGMA;
    w.row.zScore = change === null ? null : change / (sigma * Math.sqrt(windowDays));
  }

  const rows = working.map((w) => w.row);
  const scored = rows.filter((r) => r.zScore !== null);
  const winners = scored
    .filter((r) => (chg(r) ?? 0) > 0)
    .sort((a, b) => b.zScore! - a.zScore! || (chg(b) ?? 0) - (chg(a) ?? 0))
    .slice(0, TOP_N);
  const losers = scored
    .filter((r) => (chg(r) ?? 0) < 0)
    .sort((a, b) => a.zScore! - b.zScore! || (chg(a) ?? 0) - (chg(b) ?? 0))
    .slice(0, TOP_N);

  return {
    windowDays,
    universeSize: rows.length,
    winners,
    losers,
    impact:
      scored.length === 0
        ? null
        : scored.filter((r) => Math.abs(r.zScore!) >= UNUSUAL_Z).length / scored.length,
  };
}
