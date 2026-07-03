import { describe, expect, it } from 'vitest';
import {
  buildEntry,
  completeEntry,
  computeStats,
  cumulativeProfit,
  migrateV1,
  toCsv,
  type NewFlip,
} from './fliplog';

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
  it('computes tax and profit for a closed flip', () => {
    const e = buildEntry(flip(), 'id1', 100);
    expect(e.taxPerItem).toBe(22); // floor(1100/50)
    expect(e.profit).toBe((1_100 - 1_000 - 22) * 10);
    expect(e.soldAt).toBe(100);
  });

  it('logs an open position when sellPrice is null', () => {
    const e = buildEntry(flip({ sellPrice: null }), 'id1', 100);
    expect(e.sellPrice).toBeNull();
    expect(e.taxPerItem).toBeNull();
    expect(e.profit).toBeNull();
    expect(e.soldAt).toBeNull();
  });

  it('respects tax exemption', () => {
    const e = buildEntry(flip({ taxExempt: true }), 'id1', 100);
    expect(e.taxPerItem).toBe(0);
    expect(e.profit).toBe(1_000);
  });
});

describe('completeEntry', () => {
  it('closes an open position with tax computed at the completion price', () => {
    const open = buildEntry(flip({ sellPrice: null }), 'id1', 100);
    const closed = completeEntry(open, 1_200, 7_300); // 2h later
    expect(closed.sellPrice).toBe(1_200);
    expect(closed.taxPerItem).toBe(24);
    expect(closed.profit).toBe((1_200 - 1_000 - 24) * 10);
    expect(closed.soldAt).toBe(7_300);
  });

  it('does not touch already-closed entries', () => {
    const done = buildEntry(flip(), 'id1', 100);
    expect(completeEntry(done, 9_999, 200)).toBe(done);
  });
});

describe('computeStats', () => {
  it('separates realized results from open capital', () => {
    const entries = [
      buildEntry(flip({ sellPrice: 1_100 }), 'a', 1), // closed, +780
      buildEntry(flip({ sellPrice: null, qty: 5 }), 'b', 2), // open, 5k tied up
      buildEntry(flip({ sellPrice: 900 }), 'c', 3), // closed loss
    ];
    const stats = computeStats(entries);
    expect(stats.closedCount).toBe(2);
    expect(stats.openCount).toBe(1);
    expect(stats.openCapital).toBe(5_000);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.best!.id).toBe('a');
  });

  it('computes gp/hour only from flips with real durations', () => {
    const instant = buildEntry(flip(), 'a', 100); // soldAt == loggedAt, excluded
    const twoHours = completeEntry(buildEntry(flip({ sellPrice: null }), 'b', 0), 1_100, 7_200);
    const stats = computeStats([instant, twoHours]);
    expect(stats.gpPerHour).toBeCloseTo(twoHours.profit! / 2);
    expect(computeStats([instant]).gpPerHour).toBeNull();
  });
});

describe('cumulativeProfit', () => {
  it('charts only closed flips, ordered by completion time', () => {
    const open = buildEntry(flip({ sellPrice: null }), 'open', 1);
    const late = completeEntry(buildEntry(flip({ sellPrice: null }), 'late', 2), 1_100, 900);
    const early = buildEntry(flip(), 'early', 500);
    const points = cumulativeProfit([open, late, early]);
    expect(points.map((p) => p.entry.id)).toEqual(['early', 'late']);
    expect(points[1]!.total).toBe(early.profit! + late.profit!);
  });
});

describe('toCsv', () => {
  it('marks open/closed, escapes quotes, includes both timestamps', () => {
    const closed = buildEntry(flip({ itemName: 'Bandos "BCP" chestplate' }), 'a', 100);
    const open = buildEntry(flip({ sellPrice: null }), 'b', 200);
    const csv = toCsv([closed, open]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('bought_at,sold_at,item,qty,buy_price,sell_price,tax_per_item,profit,status');
    expect(csv).toContain('"Bandos ""BCP"" chestplate"');
    expect(lines[1]).toContain('closed');
    expect(lines[2]).toContain(',,,open'.replace(',,,', ',,')); // empty sell/tax/profit
    expect(lines[2]!.endsWith('open')).toBe(true);
  });
});

describe('migrateV1', () => {
  it('upgrades v1 entries to closed v2 entries', () => {
    const v1 = [
      {
        id: 'x',
        itemId: 561,
        itemName: 'Nature rune',
        icon: null,
        qty: 100,
        buyPrice: 129,
        sellPrice: 127,
        taxPerItem: 2,
        profit: -400,
        loggedAt: 1_000,
      },
    ];
    const [e] = migrateV1(v1);
    expect(e!.soldAt).toBe(1_000);
    expect(e!.taxExempt).toBe(false);
    expect(e!.profit).toBe(-400);
  });

  it('rejects malformed payloads', () => {
    expect(migrateV1('junk')).toEqual([]);
    expect(migrateV1([{ nope: 1 }])).toEqual([]);
  });
});
