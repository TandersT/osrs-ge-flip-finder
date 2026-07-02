import { describe, expect, it } from 'vitest';
import type { FlipRow } from './rows';
import { computeStarterFlips } from './starter';

function row(
  overrides: Omit<Partial<FlipRow>, 'flip'> & {
    flip?: Partial<NonNullable<FlipRow['flip']>> | null;
  },
): FlipRow {
  const flip =
    overrides.flip === null
      ? null
      : {
          buyAt: 100,
          sellAt: 120,
          tax: 2,
          marginPerItem: 18,
          roi: 0.18,
          feasibleQtyPer4h: 500,
          profitPer4h: 9000,
          gpPerHour: 2250,
          ...overrides.flip,
        };
  return {
    id: 1,
    name: 'Test item',
    icon: null,
    members: false,
    limit: 1000,
    value: null,
    highalch: null,
    high: 120,
    highTime: 0,
    low: 100,
    lowTime: 0,
    avgHighPrice1h: 120,
    avgLowPrice1h: 100,
    volume1h: 5000,
    dailyVolume: 100_000,
    taxExempt: false,
    volumePer4h: 20_000,
    ageSeconds: 60,
    isStale: false,
    isThin: false,
    isUnstable: false,
    ...overrides,
    flip,
  } as FlipRow;
}

describe('computeStarterFlips', () => {
  it('sizes the position by budget, buy limit and volume', () => {
    // 10k budget at 100gp -> 100 affordable, but feasible caps at 80
    const picks = computeStarterFlips([row({ flip: { feasibleQtyPer4h: 80 } })], {
      budget: 10_000,
      membership: 'all',
    });
    expect(picks).toHaveLength(1);
    expect(picks[0]!.affordableQty).toBe(80);
    expect(picks[0]!.capitalUsed).toBe(8_000);
    expect(picks[0]!.expectedProfit).toBe(80 * 18);
  });

  it('caps by budget when the market could absorb more', () => {
    const picks = computeStarterFlips([row({ flip: { feasibleQtyPer4h: 5_000 } })], {
      budget: 2_500,
      membership: 'all',
    });
    expect(picks[0]!.affordableQty).toBe(25);
    expect(picks[0]!.capitalUsed).toBeLessThanOrEqual(2_500);
  });

  it('excludes items you cannot afford even once', () => {
    const picks = computeStarterFlips([row({ flip: { buyAt: 50_000 } })], {
      budget: 10_000,
      membership: 'all',
    });
    expect(picks).toHaveLength(0);
  });

  it('excludes risky, stale, illiquid, negative-margin and members-only (on F2P) items', () => {
    const base = { budget: 100_000, membership: 'f2p' as const };
    expect(computeStarterFlips([row({ isThin: true })], base)).toHaveLength(0);
    expect(computeStarterFlips([row({ isStale: true })], base)).toHaveLength(0);
    expect(computeStarterFlips([row({ isUnstable: true })], base)).toHaveLength(0);
    expect(computeStarterFlips([row({ volume1h: 5 })], base)).toHaveLength(0);
    expect(computeStarterFlips([row({ members: true })], base)).toHaveLength(0);
    expect(computeStarterFlips([row({ flip: { marginPerItem: -2 } })], base)).toHaveLength(0);
    expect(computeStarterFlips([row({})], base)).toHaveLength(1);
  });

  it('sorts by expected profit and truncates to maxResults', () => {
    const rows = [
      row({ id: 1, name: 'small', flip: { marginPerItem: 1 } }),
      row({ id: 2, name: 'big', flip: { marginPerItem: 50 } }),
      row({ id: 3, name: 'mid', flip: { marginPerItem: 10 } }),
    ];
    const picks = computeStarterFlips(rows, { budget: 100_000, membership: 'all', maxResults: 2 });
    expect(picks.map((p) => p.row.name)).toEqual(['big', 'mid']);
  });
});
