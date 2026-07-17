import type { TimeseriesPoint } from '@osrs-flip/shared';
import { median, zScore } from '@osrs-flip/shared';

/**
 * Divergence engine — pairwise correlation-gated spreads inside curated item
 * categories (see docs/superpowers/specs/2026-07-16-category-divergence-design.md).
 * This file follows the longterm.ts pattern: pure computation exported for
 * tests, one lazy build state machine, in-memory state only.
 */

/** Pair must share at least this many overlapping daily points. */
const MIN_OVERLAP_DAYS = 180;
/** …and correlate at least this much on non-overlapping weekly log returns. */
const MIN_WEEKLY_R = 0.4;
/** Both legs must trade at least this many units/day (you must be able to fill). */
const VOLUME_FLOOR = 2_000;
/** |z| at which a spread counts as diverged. */
const ENTRY_Z = 2;
/** |z| at which an episode counts as closed. */
const EXIT_Z = 0.5;
/** Rolling window (days) the spread is z-scored against. */
const SPREAD_WINDOW = 90;
/** An episode "reconverged" when it closes within this many days. */
const EPISODE_CLOSE_DAYS = 30;
/** Days of normalized two-leg series shipped for the overlay chart. */
const SERIES_WINDOW = 90;
/** Game updates this recent can badge a deal. */
const PATCH_WINDOW_DAYS = 21;
const REBUILD_MS = 12 * 60 * 60 * 1000;
const BUILD_CONCURRENCY = 4;
const BUILD_DELAY_MS = 50;

export interface DayPoint {
  t: number;
  mid: number;
}

/** Daily mid prices (avg of both sides, else whichever exists), zeros dropped. */
export function dailyMids(series: TimeseriesPoint[]): DayPoint[] {
  const out: DayPoint[] = [];
  for (const p of series) {
    const mid =
      p.avgHighPrice !== null && p.avgLowPrice !== null
        ? (p.avgHighPrice + p.avgLowPrice) / 2
        : (p.avgHighPrice ?? p.avgLowPrice);
    if (mid !== null && mid > 0) out.push({ t: p.timestamp, mid });
  }
  return out;
}

/** Inner-join two daily series on timestamp, oldest first. */
export function alignPair(a: DayPoint[], b: DayPoint[]): { t: number; a: number; b: number }[] {
  const byT = new Map(a.map((p) => [p.t, p.mid]));
  const out: { t: number; a: number; b: number }[] = [];
  for (const p of b) {
    const av = byT.get(p.t);
    if (av !== undefined) out.push({ t: p.t, a: av, b: p.mid });
  }
  return out;
}

/**
 * Log returns over non-overlapping 7-sample windows, anchored at the newest
 * value (a partial oldest week is dropped). Oldest first.
 */
export function weeklyLogReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let end = values.length - 1; end - 7 >= 0; end -= 7) {
    const now = values[end] as number;
    const then = values[end - 7] as number;
    if (now > 0 && then > 0) out.push(Math.log(now / then));
  }
  return out.reverse();
}

/** Rolling z of the log-price spread ln(a)-ln(b); null until `window` points. */
export function spreadZSeries(
  aligned: { t: number; a: number; b: number }[],
  window: number,
): (number | null)[] {
  const s = aligned.map((p) => Math.log(p.a) - Math.log(p.b));
  return s.map((value, i) => {
    if (i + 1 < window) return null;
    return zScore(value, s.slice(i + 1 - window, i + 1));
  });
}

export interface EpisodeStats {
  count: number;
  closedWithin30d: number;
  medianDays: number | null;
}

/**
 * Past divergence episodes in a rolling-z series: enter at |z| >= entryZ,
 * close at |z| <= exitZ. One aligned step ≈ one day (24h buckets; data gaps
 * make durations approximate). An episode still open at the last index is the
 * LIVE signal, not history — dropped entirely. Episodes that close later than
 * `closeDays` count toward `count` but not `closedWithin30d`.
 */
export function scanEpisodes(
  z: (number | null)[],
  entryZ: number,
  exitZ: number,
  closeDays: number,
): EpisodeStats {
  let openAt: number | null = null;
  const durations: number[] = [];
  for (let i = 0; i < z.length; i++) {
    const v = z[i];
    if (v === null || v === undefined) continue;
    if (openAt === null) {
      if (Math.abs(v) >= entryZ) openAt = i;
    } else if (Math.abs(v) <= exitZ) {
      durations.push(i - openAt);
      openAt = null;
    }
  }
  return {
    count: durations.length,
    closedWithin30d: durations.filter((d) => d <= closeDays).length,
    medianDays: median(durations),
  };
}
