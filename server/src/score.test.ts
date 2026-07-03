import { describe, expect, it } from 'vitest';
import type { FlipRow, MethodRow } from '@osrs-flip/shared';
import { flipConsistency, logRamp, rankDeals, scoreFlip, scoreMethod } from './score.js';

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
      requirements: [{ skill: 'Herblore', level: 30 }],
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
  it('produces a 1-100 score and NEVER leaks the factor breakdown', () => {
    const deal = scoreFlip(flipRow())!;
    expect(deal.score).toBeGreaterThanOrEqual(1);
    expect(deal.score).toBeLessThanOrEqual(100);
    expect(deal.kind).toBe('flip');
    expect(deal.capital).toBeCloseTo((1_001 * 800) / 4);
    // trade secret: the payload must not contain factors or multipliers
    expect(Object.keys(deal)).not.toContain('breakdown');
    expect(JSON.stringify(deal)).not.toMatch(/consistency|effort|liquidity/);
  });

  it('rewards liquidity and punishes flags', () => {
    const liquid = scoreFlip(flipRow({ volume1h: 5_000 }))!;
    const thin = scoreFlip(flipRow({ volume1h: 30 }))!;
    expect(liquid.score).toBeGreaterThan(thin.score);

    const clean = scoreFlip(flipRow())!;
    const flagged = scoreFlip(flipRow({ isUnstable: true }))!;
    expect(flagged.score).toBeLessThan(clean.score);
    expect(flagged.hints).toContain('risk flags');
  });

  it('discounts very expensive positions and hints at it', () => {
    const cheap = scoreFlip(flipRow())!;
    const expensive = scoreFlip(
      flipRow({ avgHighPrice1h: 210_000_000, avgLowPrice1h: 199_000_000 }, {
        buyAt: 200_000_000,
        sellAt: 209_000_000,
        marginPerItem: 4_000_000,
        feasibleQtyPer4h: 4,
        gpPerHour: 400_000,
      }),
    )!;
    expect(expensive.score).toBeLessThan(cheap.score);
    expect(expensive.hints).toContain('big capital at risk');
  });

  it('excludes losers and unfillable flips', () => {
    expect(scoreFlip(flipRow({}, { gpPerHour: -5 }))).toBeNull();
    expect(scoreFlip(flipRow({}, { feasibleQtyPer4h: 0 }))).toBeNull();
    expect(scoreFlip(flipRow({ flip: null } as Partial<FlipRow>))).toBeNull();
  });

  it('consistency drops when the current spread is a blip', () => {
    const stable = flipConsistency(flipRow());
    const blip = flipConsistency(
      flipRow({ avgHighPrice1h: 1_020, avgLowPrice1h: 1_000 }, { marginPerItem: 500 }),
    );
    expect(stable).toBeGreaterThan(0.9);
    expect(blip).toBeLessThan(0.6);
    const blipDeal = scoreFlip(
      flipRow({ avgHighPrice1h: 1_020, avgLowPrice1h: 1_000 }, { marginPerItem: 500 }),
    )!;
    expect(blipDeal.hints).toContain('spread may be a blip');
  });
});

describe('scoreMethod', () => {
  it('penalises active time by intensity and carries requirements for the client', () => {
    const afk = scoreMethod(methodRow())!;
    const clicky = scoreMethod(methodRow({ def: { ...methodRow().def, intensity: 'high' } }))!;
    expect(afk.score).toBeGreaterThan(clicky.score);
    expect(clicky.hints).toContain('costs your attention');
    expect(afk.requirements).toEqual([{ skill: 'Herblore', level: 30 }]);
    expect(afk.atGE).toBe(true);
  });

  it('a passive flip beats an AFK method at identical numbers', () => {
    const flip = scoreFlip(flipRow())!;
    const method = scoreMethod(methodRow())!;
    expect(flip.score).toBeGreaterThan(method.score);
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
