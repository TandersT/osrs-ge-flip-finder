import type { FlipRow } from './rows';

export interface Allocation {
  row: FlipRow;
  qty: number;
  cost: number;
  expectedProfit: number;
}

export interface Portfolio {
  allocations: Allocation[];
  totalCost: number;
  totalProfit: number;
  leftover: number;
}

export interface AllocateOptions {
  /** Diversification cap — one stuck offer shouldn't freeze the bank. */
  maxItems?: number;
  /** Liquidity floor so the portfolio actually fills. */
  minVolume1h?: number;
}

/**
 * Greedy portfolio for a budget: walk candidates by achievable 4h profit,
 * size each position by budget / buy limit / volume, diversify across up to
 * `maxItems`. Greedy isn't optimal knapsack, but with 4h re-buys and moving
 * prices, robustness beats optimality.
 */
export function allocateBank(
  rows: FlipRow[],
  budget: number,
  { maxItems = 5, minVolume1h = 100 }: AllocateOptions = {},
): Portfolio {
  const candidates = rows
    .filter(
      (r) =>
        r.flip !== null &&
        r.flip.marginPerItem > 0 &&
        !r.isStale &&
        !r.isThin &&
        !r.isUnstable &&
        r.volume1h >= minVolume1h &&
        r.flip.feasibleQtyPer4h !== null &&
        r.flip.feasibleQtyPer4h > 0,
    )
    .sort(
      (a, b) =>
        b.flip!.marginPerItem * b.flip!.feasibleQtyPer4h! -
        a.flip!.marginPerItem * a.flip!.feasibleQtyPer4h!,
    );

  const allocations: Allocation[] = [];
  let remaining = budget;
  for (const row of candidates) {
    if (allocations.length >= maxItems || remaining <= 0) break;
    const { buyAt, marginPerItem, feasibleQtyPer4h } = row.flip!;
    const qty = Math.min(feasibleQtyPer4h!, Math.floor(remaining / buyAt));
    if (qty < 1) continue;
    const cost = qty * buyAt;
    allocations.push({ row, qty, cost, expectedProfit: qty * marginPerItem });
    remaining -= cost;
  }

  return {
    allocations,
    totalCost: budget - remaining,
    totalProfit: allocations.reduce((s, a) => s + a.expectedProfit, 0),
    leftover: remaining,
  };
}
