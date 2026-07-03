import { describe, expect, it } from 'vitest';
import {
  buildEntry,
  completeEntry,
  computeStats,
  CSV_HEADER,
  cumulativeProfit,
  fromCsv,
  migrateV1,
  monthlyProfit,
  perItemStats,
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
    expect(lines[0]).toBe(CSV_HEADER);
    expect(csv).toContain('"Bandos ""BCP"" chestplate"');
    expect(lines[1]).toContain('closed');
    expect(lines[2]).toContain(',,,open'.replace(',,,', ',,')); // empty sell/tax/profit
    expect(lines[2]!.endsWith('open')).toBe(true);
  });
});

describe('fromCsv round-trip', () => {
  it('re-imports exported entries including open positions and quotes', () => {
    const closed = buildEntry(flip({ itemName: 'Bandos "BCP" chestplate' }), 'a', 100);
    const open = buildEntry(flip({ sellPrice: null, qty: 3 }), 'b', 200);
    const parsed = fromCsv(toCsv([closed, open]));
    expect(parsed).toHaveLength(2);
    const [c, o] = parsed;
    expect(c!.itemName).toBe('Bandos "BCP" chestplate');
    expect(c!.itemId).toBe(4151);
    expect(c!.profit).toBe(closed.profit);
    expect(c!.loggedAt).toBe(100);
    expect(o!.sellPrice).toBeNull();
    expect(o!.soldAt).toBeNull();
    expect(o!.qty).toBe(3);
  });

  it('rejects junk and skips malformed rows', () => {
    expect(fromCsv('not,a,log\n1,2,3')).toEqual([]);
    const good = toCsv([buildEntry(flip(), 'a', 100)]);
    expect(fromCsv(good + '\n,,,broken,,,,,,,')).toHaveLength(1);
  });
});

describe('log analytics', () => {
  it('aggregates per item over closed flips only', () => {
    const whipWin = buildEntry(flip({ qty: 1, sellPrice: 1_200 }), 'a', 100);
    const whipLoss = buildEntry(flip({ qty: 1, sellPrice: 900 }), 'b', 200);
    const openWhip = buildEntry(flip({ sellPrice: null }), 'c', 300);
    const rune = buildEntry(
      flip({ itemId: 561, itemName: 'Nature rune', sellPrice: 1_050, qty: 2 }),
      'd',
      400,
    );
    const stats = perItemStats([whipWin, whipLoss, openWhip, rune]);
    expect(stats).toHaveLength(2);
    const whip = stats.find((s) => s.itemId === 4151)!;
    expect(whip.flips).toBe(2);
    expect(whip.wins).toBe(1);
    expect(whip.profit).toBe(whipWin.profit! + whipLoss.profit!);
  });

  it('computes average hold only from real durations', () => {
    const twoHours = completeEntry(buildEntry(flip({ sellPrice: null }), 'a', 0), 1_100, 7_200);
    const instant = buildEntry(flip(), 'b', 100);
    const agg = perItemStats([twoHours, instant])[0]!;
    expect(agg.avgHoldHours).toBe(2);
  });

  it('groups realized profit by month chronologically', () => {
    const jan = buildEntry(flip({ qty: 1 }), 'a', Date.UTC(2026, 0, 15) / 1000);
    const mar = buildEntry(flip({ qty: 2 }), 'b', Date.UTC(2026, 2, 10) / 1000);
    const months = monthlyProfit([mar, jan]);
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-03']);
    expect(months[1]!.profit).toBe(mar.profit);
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
