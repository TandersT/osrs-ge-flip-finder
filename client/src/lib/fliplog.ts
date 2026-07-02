import { useCallback, useSyncExternalStore } from 'react';
import { geTax } from '@osrs-flip/shared';

export interface FlipLogEntry {
  id: string;
  itemId: number;
  /** Denormalised so the log stays readable if the item list changes. */
  itemName: string;
  icon: string | null;
  qty: number;
  /** Per item. */
  buyPrice: number;
  /** Per item. */
  sellPrice: number;
  /** Per item, at sellPrice, respecting exemption at log time. */
  taxPerItem: number;
  /** (sell - buy - tax) * qty. */
  profit: number;
  /** Unix seconds. */
  loggedAt: number;
}

export interface NewFlip {
  itemId: number;
  itemName: string;
  icon: string | null;
  taxExempt: boolean;
  qty: number;
  buyPrice: number;
  sellPrice: number;
}

export function buildEntry(flip: NewFlip, id: string, nowSec: number): FlipLogEntry {
  const taxPerItem = geTax(flip.taxExempt, flip.sellPrice);
  return {
    id,
    itemId: flip.itemId,
    itemName: flip.itemName,
    icon: flip.icon,
    qty: flip.qty,
    buyPrice: flip.buyPrice,
    sellPrice: flip.sellPrice,
    taxPerItem,
    profit: (flip.sellPrice - flip.buyPrice - taxPerItem) * flip.qty,
    loggedAt: nowSec,
  };
}

export interface FlipLogStats {
  totalProfit: number;
  flips: number;
  /** Fraction of flips with positive profit; null with an empty log. */
  winRate: number | null;
  best: FlipLogEntry | null;
}

export function computeStats(entries: FlipLogEntry[]): FlipLogStats {
  if (entries.length === 0) return { totalProfit: 0, flips: 0, winRate: null, best: null };
  let totalProfit = 0;
  let wins = 0;
  let best: FlipLogEntry = entries[0]!;
  for (const e of entries) {
    totalProfit += e.profit;
    if (e.profit > 0) wins++;
    if (e.profit > best.profit) best = e;
  }
  return { totalProfit, flips: entries.length, winRate: wins / entries.length, best };
}

/** Chronological running total for the chart: [{ n, profit, entry }]. */
export function cumulativeProfit(
  entries: FlipLogEntry[],
): { n: number; total: number; entry: FlipLogEntry }[] {
  const chronological = [...entries].sort((a, b) => a.loggedAt - b.loggedAt);
  let total = 0;
  return chronological.map((entry, i) => {
    total += entry.profit;
    return { n: i + 1, total, entry };
  });
}

export function toCsv(entries: FlipLogEntry[]): string {
  const header = 'date,item,qty,buy_price,sell_price,tax_per_item,profit';
  const rows = [...entries]
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((e) =>
      [
        new Date(e.loggedAt * 1000).toISOString(),
        // quote + escape the only free-text field
        `"${e.itemName.replaceAll('"', '""')}"`,
        e.qty,
        e.buyPrice,
        e.sellPrice,
        e.taxPerItem,
        e.profit,
      ].join(','),
    );
  return [header, ...rows].join('\n');
}

const KEY = 'geff:fliplog:v1';
const listeners = new Set<() => void>();

function load(): FlipLogEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FlipLogEntry =>
        typeof e === 'object' && e !== null && typeof (e as FlipLogEntry).profit === 'number',
    );
  } catch {
    return [];
  }
}

let entries: FlipLogEntry[] = load();

function persist(next: FlipLogEntry[]): void {
  entries = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage full/blocked: keep the in-memory list working
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFlipLog() {
  const list = useSyncExternalStore(subscribe, () => entries);
  const add = useCallback((flip: NewFlip) => {
    const entry = buildEntry(flip, crypto.randomUUID(), Math.floor(Date.now() / 1000));
    persist([entry, ...entries]);
  }, []);
  const remove = useCallback((id: string) => {
    persist(entries.filter((e) => e.id !== id));
  }, []);
  return { entries: list, add, remove };
}
