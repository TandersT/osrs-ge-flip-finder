import { describe, expect, it } from 'vitest';
import type { TimeseriesPoint } from '@osrs-flip/shared';
import { alignPair, dailyMids, scanEpisodes, spreadZSeries, weeklyLogReturns } from './divergence.js';

const DAY = 86_400;
const T0 = 1_700_000_000;

/** Synthetic daily series: price(i) drives both sides of the day's mid. */
export function mkSeries(days: number, price: (i: number) => number): TimeseriesPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    timestamp: T0 + i * DAY,
    avgHighPrice: Math.round(price(i) * 101) / 100,
    avgLowPrice: Math.round(price(i) * 99) / 100,
    highPriceVolume: 500,
    lowPriceVolume: 500,
  }));
}

describe('dailyMids', () => {
  it('averages high/low, falls back to the present side, drops empty days', () => {
    const pts: TimeseriesPoint[] = [
      { timestamp: 1, avgHighPrice: 110, avgLowPrice: 90, highPriceVolume: 1, lowPriceVolume: 1 },
      { timestamp: 2, avgHighPrice: null, avgLowPrice: 80, highPriceVolume: 0, lowPriceVolume: 1 },
      { timestamp: 3, avgHighPrice: null, avgLowPrice: null, highPriceVolume: 0, lowPriceVolume: 0 },
    ];
    expect(dailyMids(pts)).toEqual([
      { t: 1, mid: 100 },
      { t: 2, mid: 80 },
    ]);
  });
});

describe('alignPair', () => {
  it('joins on timestamp and skips days either side is missing', () => {
    const a = [
      { t: 1, mid: 10 },
      { t: 2, mid: 11 },
      { t: 4, mid: 12 },
    ];
    const b = [
      { t: 2, mid: 20 },
      { t: 3, mid: 21 },
      { t: 4, mid: 22 },
    ];
    expect(alignPair(a, b)).toEqual([
      { t: 2, a: 11, b: 20 },
      { t: 4, a: 12, b: 22 },
    ]);
  });
});

describe('weeklyLogReturns', () => {
  it('takes non-overlapping 7-step log returns, newest-aligned', () => {
    // 15 values 100..114: two full windows fit, anchored at the newest value
    const values = Array.from({ length: 15 }, (_, i) => 100 + i);
    const rs = weeklyLogReturns(values);
    expect(rs).toHaveLength(2);
    expect(rs[1]).toBeCloseTo(Math.log(114 / 107), 9);
    expect(rs[0]).toBeCloseTo(Math.log(107 / 100), 9);
  });

  it('returns empty when under 8 values', () => {
    expect(weeklyLogReturns([1, 2, 3, 4, 5, 6, 7])).toEqual([]);
  });
});

describe('spreadZSeries', () => {
  it('is null until the window fills, then z-scores the log spread', () => {
    // flat ratio for 10 days, then a jump: z must spike positive at the end
    const aligned = Array.from({ length: 11 }, (_, i) => ({
      t: i,
      a: i === 10 ? 150 : 100 + (i % 2), // tiny wobble so variance is nonzero
      b: 100,
    }));
    const z = spreadZSeries(aligned, 10);
    expect(z.slice(0, 9).every((v) => v === null)).toBe(true);
    expect(z[9]).not.toBeNull();
    expect(z[10]!).toBeGreaterThan(2);
  });
});

describe('scanEpisodes', () => {
  it('counts entry->close cycles and their durations', () => {
    const z = [0, 0.3, 2.4, 2.1, 1.4, 0.4, 0.1, -2.2, -1.0, -0.3, 0];
    // episode 1: idx2 -> closes idx5 (3 days); episode 2: idx7 -> closes idx9 (2 days)
    const stats = scanEpisodes(z, 2, 0.5, 30);
    expect(stats).toEqual({ count: 2, closedWithin30d: 2, medianDays: 2.5 });
  });

  it('drops the live episode still open at the end, keeps slow closers in count only', () => {
    const slow = Array.from({ length: 40 }, (_, i) => (i === 0 ? 2.5 : 1.5));
    slow.push(0.4); // closes after 40 days: counted, but not within 30
    const live = [...slow, 0, 2.6, 2.4]; // reopens at the end: live, dropped
    const stats = scanEpisodes(live, 2, 0.5, 30);
    expect(stats.count).toBe(1);
    expect(stats.closedWithin30d).toBe(0);
    expect(stats.medianDays).toBe(40);
  });

  it('skips null gaps without breaking state', () => {
    const z = [null, null, 2.5, null, 2.2, 0.2];
    expect(scanEpisodes(z, 2, 0.5, 30).count).toBe(1);
  });
});
