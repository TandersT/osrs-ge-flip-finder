import { describe, expect, it } from 'vitest';
import type { ItemSnapshot, TimeseriesPoint } from '@osrs-flip/shared';
import { computeLongtermRow } from './longterm.js';

function snapshot(overrides: Partial<ItemSnapshot>): ItemSnapshot {
  return {
    id: 1,
    name: 'Test item',
    icon: null,
    members: false,
    limit: 100,
    value: null,
    highalch: null,
    high: 100,
    highTime: 0,
    low: 100,
    lowTime: 0,
    avgHighPrice1h: null,
    avgLowPrice1h: null,
    volume1h: 0,
    dailyVolume: 50_000,
    taxExempt: false,
    ...overrides,
  };
}

function series(prices: number[], volume = 10_000): TimeseriesPoint[] {
  return prices.map((p, i) => ({
    timestamp: 1_700_000_000 + i * 86_400,
    avgHighPrice: p,
    avgLowPrice: p,
    highPriceVolume: volume / 2,
    lowPriceVolume: volume / 2,
  }));
}

describe('computeLongtermRow', () => {
  it('flags a liquid item trading >=1 std dev below its 90-day mean as a dip', () => {
    // 90 flat days at 1000 with mild noise, current price well below
    const prices = Array.from({ length: 90 }, (_, i) => 1000 + (i % 2 === 0 ? 10 : -10));
    const row = computeLongtermRow(snapshot({ high: 900, low: 900 }), series(prices));
    expect(row.zScore90).not.toBeNull();
    expect(row.zScore90!).toBeLessThan(-1);
    expect(row.isDip).toBe(true);
  });

  it('does not flag an item trading at its mean', () => {
    const prices = Array.from({ length: 90 }, (_, i) => 1000 + (i % 2 === 0 ? 10 : -10));
    const row = computeLongtermRow(snapshot({ high: 1000, low: 1000 }), series(prices));
    expect(row.isDip).toBe(false);
  });

  it('flags sustained uptrend with rising volume as momentum', () => {
    // +1%/day for two weeks, volume ramping up
    const prices = Array.from({ length: 90 }, (_, i) => (i < 76 ? 1000 : 1000 * 1.01 ** (i - 75)));
    const points = series(prices).map((p, i) => ({
      ...p,
      highPriceVolume: 5_000 + i * 100,
      lowPriceVolume: 5_000 + i * 100,
    }));
    const row = computeLongtermRow(snapshot({ high: 1160, low: 1160 }), points);
    expect(row.isMomentum).toBe(true);
  });

  it('computes 7/30/90-day change against the current price', () => {
    // Steady climb from 1000 to ~1445 over 90 days
    const prices = Array.from({ length: 91 }, (_, i) => Math.round(1000 * 1.0041 ** i));
    const row = computeLongtermRow(snapshot({ high: 1445, low: 1445 }), series(prices));
    expect(row.change90d).not.toBeNull();
    expect(row.change90d!).toBeGreaterThan(0.3);
    expect(row.change7d!).toBeLessThan(row.change30d!);
  });

  it('handles a null-price snapshot by falling back to the last bucket mid', () => {
    const prices = Array.from({ length: 90 }, () => 500);
    const row = computeLongtermRow(snapshot({ high: null, low: null }), series(prices));
    expect(row.price).toBe(500);
  });

  it('leaves stats null for a short history', () => {
    const row = computeLongtermRow(snapshot({}), series([100, 101]));
    expect(row.zScore90).toBeNull();
    expect(row.change90d).not.toBeNull(); // falls back to earliest available bucket
    expect(row.isDip).toBe(false);
  });
});
