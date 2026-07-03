import { describe, expect, it } from 'vitest';
import type { FlipRow } from './rows';
import type { MethodRow } from './tools';
import { flipConsistency, logRamp, rankDeals, scoreFlip, scoreMethod } from './score';

function flipRow(over: Partial<FlipRow> = {}, flipOver: Partial<NonNullable<FlipRow['flip']>> = {}): FlipRow {
  return {
    id: 1,
    name: 'Test item',
    icon: null,
    taxExempt: false,
    volume1h: 2_000,
    avgHighPrice1h: 1_100,
    avgLowPrice1h: 1_000,
    isStale: false,
    isThin: false,
    isUnstable: false,
    flip: {
      buyAt: 1_001,
      sellAt: 1_099,
      tax: 21,
      marginPerItem: 77,
      roi: 0.077,
      feasibleQtyPer4h: 800,
      profitPer4h: 61_600,
      gpPerHour: 400_000,
      ...flipOver,
    },
    ...over,
  } as FlipRow;
}

function methodRow(over: Partial<MethodRow> = {}): MethodRow {
  return {
    def: {
      id: 'm1',
      name: 'Test method',
      category: 'Herblore',
      members: true,
      intensity: 'low',
      atGE: true,
      requirements: [],
      inputs: [],
      outputs: [],
      actionsPerHour: 2_000,
    },
    costPerAction: 100,
    revenuePerAction: 300,
    profitPerAction: 200,
    gpPerHour: 400_000,
    volume1h: 2_000,
    meetsReqs: null,
    ...over,
  } as MethodRow;
}

describe('logRamp', () => {
  it('is 0 below lo, 1 above hi, monotone between', () => {
    expect(logRamp(10, 50, 5_000)).toBe(0);
    expect(logRamp(5_000, 50, 5_000)).toBe(1);
    const mid = logRamp(500, 50, 5_000);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
});

describe('scoreFlip', () => {
  it('produces a 1-100 score with a full breakdown', () => {
    const deal = scoreFlip(flipRow())!;
    expect(deal.score).toBeGreaterThanOrEqual(1);
    expect(deal.score).toBeLessThanOrEqual(100);
    expect(deal.kind).toBe('flip');
    expect(deal.capital).toBeCloseTo((1_001 * 800) / 4);
  });

  it('rewards liquidity and punishes flags', () => {
    const liquid = scoreFlip(flipRow({ volume1h: 5_000 }))!;
    const thin = scoreFlip(flipRow({ volume1h: 30 }))!;
    expect(liquid.score).toBeGreaterThan(thin.score);

    const clean = scoreFlip(flipRow())!;
    const flagged = scoreFlip(flipRow({ isUnstable: true }))!;
    const stale = scoreFlip(flipRow({ isStale: true }))!;
    expect(flagged.score).toBeLessThan(clean.score);
    expect(stale.score).toBeLessThan(clean.score);
  });

  it('discounts very expensive positions', () => {
    const cheap = scoreFlip(flipRow())!;
    // same gp/hour but 200m in motion
    const expensive = scoreFlip(
      flipRow({ avgHighPrice1h: 210_000_000, avgLowPrice1h: 199_000_000 }, {
        buyAt: 200_000_000,
        sellAt: 209_000_000,
        marginPerItem: 4_000_000,
        feasibleQtyPer4h: 4,
        gpPerHour: 400_000,
      }),
    )!;
    expect(expensive.breakdown.capital).toBeLessThan(cheap.breakdown.capital);
    expect(expensive.score).toBeLessThan(cheap.score);
  });

  it('excludes losers and unfillable flips', () => {
    expect(scoreFlip(flipRow({}, { gpPerHour: -5 }))).toBeNull();
    expect(scoreFlip(flipRow({}, { feasibleQtyPer4h: 0 }))).toBeNull();
    expect(scoreFlip(flipRow({ flip: null } as Partial<FlipRow>))).toBeNull();
  });

  it('consistency drops when the current spread is a blip', () => {
    const stable = flipConsistency(flipRow()); // avg margin ≈ current margin
    const blip = flipConsistency(
      flipRow({ avgHighPrice1h: 1_020, avgLowPrice1h: 1_000 }, { marginPerItem: 500 }),
    );
    expect(stable).toBeGreaterThan(0.9);
    expect(blip).toBeLessThan(0.6);
  });
});

describe('scoreMethod', () => {
  it('penalises active time by intensity', () => {
    const afk = scoreMethod(methodRow())!;
    const clicky = scoreMethod(
      methodRow({ def: { ...methodRow().def, intensity: 'high' } }),
    )!;
    expect(afk.score).toBeGreaterThan(clicky.score);
  });

  it('a passive flip beats an AFK method at identical numbers', () => {
    const flip = scoreFlip(flipRow())!;
    const method = scoreMethod(methodRow())!;
    expect(flip.score).toBeGreaterThan(method.score);
  });

  it('excludes methods the imported character cannot do', () => {
    expect(scoreMethod(methodRow({ meetsReqs: false }))).toBeNull();
    expect(scoreMethod(methodRow({ meetsReqs: true }))).not.toBeNull();
  });
});

describe('rankDeals', () => {
  it('interleaves both kinds sorted by score', () => {
    const deals = rankDeals(
      [flipRow(), flipRow({ id: 2, name: 'Weak flip', volume1h: 15 })],
      [methodRow()],
    );
    expect(deals.length).toBe(3);
    expect(deals.map((d) => d.score)).toEqual([...deals.map((d) => d.score)].sort((a, b) => b - a));
    expect(new Set(deals.map((d) => d.kind))).toEqual(new Set(['flip', 'method']));
  });
});
