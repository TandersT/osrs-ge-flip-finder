import { describe, expect, it } from 'vitest';
import type { FlipRow } from './rows';
import { allocateBank } from './allocate';

function row(id: number, buyAt: number, margin: number, feasible: number, over: Partial<FlipRow> = {}): FlipRow {
  return {
    id,
    name: `Item ${id}`,
    volume1h: 1_000,
    isStale: false,
    isThin: false,
    isUnstable: false,
    flip: {
      buyAt,
      sellAt: buyAt + margin,
      tax: 0,
      marginPerItem: margin,
      roi: margin / buyAt,
      feasibleQtyPer4h: feasible,
      profitPer4h: margin * feasible,
      gpPerHour: null,
    },
    ...over,
  } as FlipRow;
}

describe('allocateBank', () => {
  it('spends the budget across the best earners and respects caps', () => {
    const rows = [
      row(1, 100, 10, 50), // 500 profit potential, costs 5k full
      row(2, 1_000, 200, 20), // 4k potential, costs 20k full
      row(3, 10, 1, 100), // 100 potential
    ];
    const p = allocateBank(rows, 10_000, { maxItems: 2 });
    // best first: item 2 (4k) sized to budget: qty 10, cost 10k -> budget exhausted
    expect(p.allocations[0]!.row.id).toBe(2);
    expect(p.allocations[0]!.qty).toBe(10);
    expect(p.totalCost).toBeLessThanOrEqual(10_000);
    expect(p.leftover).toBe(10_000 - p.totalCost);
    expect(p.allocations.length).toBeLessThanOrEqual(2);
  });

  it('diversifies when the top item cannot absorb the budget', () => {
    const rows = [row(1, 100, 10, 5), row(2, 100, 8, 5), row(3, 100, 6, 5)];
    const p = allocateBank(rows, 10_000);
    expect(p.allocations.map((a) => a.row.id)).toEqual([1, 2, 3]);
    expect(p.allocations.every((a) => a.qty === 5)).toBe(true);
    expect(p.totalProfit).toBe(5 * (10 + 8 + 6));
  });

  it('excludes risky, illiquid and unaffordable candidates', () => {
    const rows = [
      row(1, 100, 10, 50, { isThin: true }),
      row(2, 100, 10, 50, { isStale: true }),
      row(3, 100, 10, 50, { volume1h: 5 }),
      row(4, 1_000_000, 10, 50), // unaffordable at 10k
      row(5, 100, -5, 50), // negative margin
    ];
    expect(allocateBank(rows, 10_000).allocations).toHaveLength(0);
  });
});
