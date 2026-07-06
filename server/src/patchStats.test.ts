import { describe, expect, it } from 'vitest';
import { change7After, computePatch, DAY, type DailyPoint, type PatchItemInput } from './patchStats.js';

/** Daily series: prices[i] at t0 + i days. */
function series(prices: number[], t0 = 1_600_000_000, volume: (i: number) => number | null = () => 1000): DailyPoint[] {
  return prices.map((price, i) => ({ timestamp: t0 + i * DAY, price, volume: volume(i) }));
}

function input(id: number, s: DailyPoint[], mentioned = false): PatchItemInput {
  return { id, name: `Item ${id}`, icon: null, series: s, mentioned };
}

const T0 = 1_600_000_000;
/** Patch lands at day 100 (baseline = day 99's close). */
const PATCH_TS = T0 + 100 * DAY;

/** 200 flat days at 1000 with ±10 alternation (sigma ~1%), jumping to `after` from day 100. */
function jumpSeries(after: number): DailyPoint[] {
  const prices = Array.from({ length: 200 }, (_, i) =>
    i < 100 ? 1000 + (i % 2 === 0 ? 10 : -10) : after,
  );
  return series(prices);
}

describe('computePatch', () => {
  it('measures changes from the patch-eve baseline over 1/7/30 day windows', () => {
    const c = computePatch([input(1, jumpSeries(1100))], PATCH_TS, true);
    const row = c.winners[0]!;
    // baseline = day 99 close = 990 (odd index); +7d price = 1100
    expect(row.change7).toBeCloseTo((1100 - 990) / 990, 5);
    expect(row.change1).toBeCloseTo((1100 - 990) / 990, 5);
    expect(row.change30).toBeCloseTo((1100 - 990) / 990, 5);
    expect(c.windowDays).toBe(7);
  });

  it('ranks winners by z (own-volatility normalised), not raw %', () => {
    // item 1: sleepy (sigma ~2%) +8%; item 2: volatile (sigma ~16%) +12%
    const sleepy = jumpSeries(1070); // ~ +8.1% vs 990 baseline
    const volatilePrices = Array.from({ length: 200 }, (_, i) =>
      i < 100 ? 1000 + (i % 2 === 0 ? 80 : -80) : 1030,
    );
    const volatile = series(volatilePrices); // ~ +12% vs 920 baseline
    const c = computePatch([input(1, sleepy), input(2, volatile)], PATCH_TS, true);
    expect(c.winners[0]!.id).toBe(1);
    expect(Math.abs(c.winners[0]!.zScore!)).toBeGreaterThan(Math.abs(c.winners[1]!.zScore!));
  });

  it('splits winners and losers and computes impact as the unusual share', () => {
    const c = computePatch(
      [input(1, jumpSeries(1500)), input(2, jumpSeries(600)), input(3, jumpSeries(1001))],
      PATCH_TS,
      true,
    );
    expect(c.winners.map((r) => r.id)).toContain(1);
    expect(c.losers.map((r) => r.id)).toContain(2);
    // items 1 and 2 moved ~±50σ-ish, item 3 barely: impact = 2/3
    expect(c.impact).toBeCloseTo(2 / 3, 5);
    expect(c.universeSize).toBe(3);
  });

  it('computes the pre-patch run-up', () => {
    // ramp into the patch: +2/day for the last 10 days before it, flat after
    const prices = Array.from({ length: 200 }, (_, i) => {
      if (i < 90) return 1000;
      if (i < 100) return 1000 + (i - 89) * 2; // day 99 = 1020
      return 1020;
    });
    const c = computePatch([input(1, series(prices))], PATCH_TS, true);
    const row = [...c.winners, ...c.losers][0];
    // runup7: day 93 (1008) -> day 99 (1020)
    expect(row).toBeUndefined(); // no post-patch move -> neither winner nor loser
    const flat = computePatch([input(1, series(prices.map((p, i) => (i >= 100 ? 1100 : p))))], PATCH_TS, true);
    expect(flat.winners[0]!.runup7).toBeCloseTo((1020 - 1008) / 1008, 5);
  });

  it('falls back to the 1d window for a patch younger than a week', () => {
    // series ends 2 days after the patch
    const prices = Array.from({ length: 103 }, (_, i) => (i < 100 ? 1000 : 1200));
    const c = computePatch([input(1, series(prices))], PATCH_TS, true);
    expect(c.windowDays).toBe(1);
    expect(c.winners[0]!.change1).toBeCloseTo(0.2, 5);
    expect(c.winners[0]!.change7).toBeNull();
  });

  it('skips items with no usable baseline and yields null change across data gaps', () => {
    const startsAfter = series(Array.from({ length: 50 }, () => 500), PATCH_TS + 10 * DAY);
    const c = computePatch([input(1, startsAfter)], PATCH_TS, true);
    expect(c.universeSize).toBe(0);
    expect(c.impact).toBeNull();
  });

  it('reports the volume spike where volume data exists', () => {
    const s = series(
      Array.from({ length: 200 }, (_, i) => (i < 100 ? 1000 : 1100)),
      T0,
      (i) => (i < 100 ? 1000 : 3000),
    );
    const c = computePatch([input(1, s)], PATCH_TS, true);
    expect(c.winners[0]!.volumeDelta7).toBeCloseTo(2, 5);
    const noVol = computePatch([input(1, s)], PATCH_TS, false);
    expect(noVol.winners[0]!.volumeDelta7).toBeNull();
  });

  it('marks mentioned items', () => {
    const c = computePatch([input(1, jumpSeries(1100), true)], PATCH_TS, true);
    expect(c.winners[0]!.mentioned).toBe(true);
  });
});

describe('change7After', () => {
  it('returns the 7d fractional change from the patch-eve baseline', () => {
    expect(change7After(jumpSeries(1100), PATCH_TS)).toBeCloseTo((1100 - 990) / 990, 5);
  });

  it('returns null when either side is missing', () => {
    const short = series(Array.from({ length: 101 }, () => 1000));
    expect(change7After(short, PATCH_TS)).toBeNull();
    expect(change7After(short, T0 - 30 * DAY)).toBeNull();
  });
});
