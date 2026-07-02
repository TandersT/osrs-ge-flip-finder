import type { FlipRow, Membership } from './rows';

export interface StarterFlip {
  row: FlipRow;
  /** How many you can actually flip: limited by budget, buy limit and volume. */
  affordableQty: number;
  /** gp tied up while the flip runs. */
  capitalUsed: number;
  /** Post-tax profit if all offers fill: affordableQty * margin. */
  expectedProfit: number;
  /** expectedProfit / capitalUsed. */
  returnOnCapital: number;
}

export interface StarterOptions {
  budget: number;
  membership: Membership;
  /** Items below this hourly volume are excluded — small offers must fill fast. */
  minVolume1h?: number;
  maxResults?: number;
}

/**
 * Rank flips for a small bank: only liquid, currently-safe items you can
 * afford, sized by what the budget actually buys. Sorted by expected profit.
 */
export function computeStarterFlips(rows: FlipRow[], opts: StarterOptions): StarterFlip[] {
  const { budget, membership, minVolume1h = 100, maxResults = 50 } = opts;
  const picks: StarterFlip[] = [];

  for (const row of rows) {
    if (row.flip === null || row.flip.marginPerItem <= 0) continue;
    if (row.isStale || row.isThin || row.isUnstable) continue;
    if (row.volume1h < minVolume1h) continue;
    if (membership === 'f2p' && row.members) continue;
    if (membership === 'members' && !row.members) continue;

    const { buyAt, marginPerItem, feasibleQtyPer4h } = row.flip;
    if (buyAt > budget) continue;

    const budgetQty = Math.floor(budget / buyAt);
    const affordableQty = Math.min(budgetQty, feasibleQtyPer4h ?? budgetQty);
    if (affordableQty <= 0) continue;

    const capitalUsed = affordableQty * buyAt;
    const expectedProfit = affordableQty * marginPerItem;
    picks.push({
      row,
      affordableQty,
      capitalUsed,
      expectedProfit,
      returnOnCapital: expectedProfit / capitalUsed,
    });
  }

  picks.sort((a, b) => b.expectedProfit - a.expectedProfit);
  return picks.slice(0, maxResults);
}

export const BUDGET_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 25_000, label: '25k' },
  { value: 100_000, label: '100k' },
  { value: 500_000, label: '500k' },
  { value: 2_000_000, label: '2m' },
  { value: 10_000_000, label: '10m' },
];
export const DEFAULT_BUDGET = 100_000;
