import { describe, expect, it } from 'vitest';
import { buildEntry, computeStats, cumulativeProfit, toCsv, type NewFlip } from './fliplog';

const flip = (overrides: Partial<NewFlip> = {}): NewFlip => ({
  itemId: 4151,
  itemName: 'Abyssal whip',
  icon: null,
  taxExempt: false,
  qty: 10,
  buyPrice: 1_000,
  sellPrice: 1_100,
  ...overrides,
});

describe('buildEntry', () => {
  it('computes tax and profit per the GE rules', () => {
    const e = buildEntry(flip(), 'id1', 100);
    expect(e.taxPerItem).toBe(22); // floor(1100/50)
    expect(e.profit).toBe((1_100 - 1_000 - 22) * 10);
  });

  it('respects tax exemption', () => {
    const e = buildEntry(flip({ taxExempt: true }), 'id1', 100);
    expect(e.taxPerItem).toBe(0);
    expect(e.profit).toBe(1_000);
  });
});

describe('computeStats', () => {
  it('handles the empty log', () => {
    expect(computeStats([])).toEqual({ totalProfit: 0, flips: 0, winRate: null, best: null });
  });

  it('totals, win rate and best flip', () => {
    const entries = [
      buildEntry(flip({ sellPrice: 1_100 }), 'a', 1), // +780
      buildEntry(flip({ sellPrice: 900 }), 'b', 2), // loss
      buildEntry(flip({ sellPrice: 2_000, qty: 1 }), 'c', 3), // +960
    ];
    const stats = computeStats(entries);
    expect(stats.flips).toBe(3);
    expect(stats.winRate).toBeCloseTo(2 / 3);
    expect(stats.best!.id).toBe('c');
    expect(stats.totalProfit).toBe(entries.reduce((s, e) => s + e.profit, 0));
  });
});

describe('cumulativeProfit', () => {
  it('runs chronologically regardless of insert order', () => {
    const newest = buildEntry(flip({ qty: 1, sellPrice: 1_100 }), 'new', 200);
    const oldest = buildEntry(flip({ qty: 1, sellPrice: 1_200 }), 'old', 100);
    const points = cumulativeProfit([newest, oldest]); // store keeps newest first
    expect(points.map((p) => p.entry.id)).toEqual(['old', 'new']);
    expect(points[1]!.total).toBe(oldest.profit + newest.profit);
    expect(points.map((p) => p.n)).toEqual([1, 2]);
  });
});

describe('toCsv', () => {
  it('escapes quotes and orders chronologically', () => {
    const e = buildEntry(flip({ itemName: 'Bandos "BCP" chestplate' }), 'a', 100);
    const csv = toCsv([e]);
    expect(csv.split('\n')[0]).toBe('date,item,qty,buy_price,sell_price,tax_per_item,profit');
    expect(csv).toContain('"Bandos ""BCP"" chestplate"');
    expect(csv).toContain('1970-01-01T00:01:40.000Z');
  });
});
