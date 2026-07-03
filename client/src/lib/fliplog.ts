import { useCallback, useSyncExternalStore } from 'react';
import { geTax } from '@osrs-flip/shared';

export interface FlipLogEntry {
  id: string;
  itemId: number;
  /** Denormalised so the log stays readable if the item list changes. */
  itemName: string;
  icon: string | null;
  /** Needed to compute tax when an open position completes later. */
  taxExempt: boolean;
  qty: number;
  /** Per item. */
  buyPrice: number;
  /** Per item; null while the position is still open (bought, not yet sold). */
  sellPrice: number | null;
  /** Per item, at sellPrice; null while open. */
  taxPerItem: number | null;
  /** (sell - buy - tax) * qty; null while open. */
  profit: number | null;
  /** Unix seconds when the buy was logged. */
  loggedAt: number;
  /** Unix seconds when the sell completed; null while open. */
  soldAt: number | null;
}

export interface NewFlip {
  itemId: number;
  itemName: string;
  icon: string | null;
  taxExempt: boolean;
  qty: number;
  buyPrice: number;
  /** null logs an open position to complete later. */
  sellPrice: number | null;
}

export function isOpen(e: FlipLogEntry): boolean {
  return e.sellPrice === null;
}

export function buildEntry(flip: NewFlip, id: string, nowSec: number): FlipLogEntry {
  const taxPerItem = flip.sellPrice === null ? null : geTax(flip.taxExempt, flip.sellPrice);
  return {
    id,
    itemId: flip.itemId,
    itemName: flip.itemName,
    icon: flip.icon,
    taxExempt: flip.taxExempt,
    qty: flip.qty,
    buyPrice: flip.buyPrice,
    sellPrice: flip.sellPrice,
    taxPerItem,
    profit:
      flip.sellPrice === null ? null : (flip.sellPrice - flip.buyPrice - taxPerItem!) * flip.qty,
    loggedAt: nowSec,
    soldAt: flip.sellPrice === null ? null : nowSec,
  };
}

/** Close an open position at `sellPrice`; no-op for already-closed entries. */
export function completeEntry(e: FlipLogEntry, sellPrice: number, nowSec: number): FlipLogEntry {
  if (!isOpen(e)) return e;
  const taxPerItem = geTax(e.taxExempt, sellPrice);
  return {
    ...e,
    sellPrice,
    taxPerItem,
    profit: (sellPrice - e.buyPrice - taxPerItem) * e.qty,
    soldAt: nowSec,
  };
}

export interface FlipLogStats {
  realizedProfit: number;
  closedCount: number;
  openCount: number;
  /** gp tied up in open positions. */
  openCapital: number;
  /** Fraction of closed flips with positive profit; null with no closed flips. */
  winRate: number | null;
  best: FlipLogEntry | null;
  /** Realized profit / real flip duration; null until closed flips have durations. */
  gpPerHour: number | null;
}

export function computeStats(entries: FlipLogEntry[]): FlipLogStats {
  let realizedProfit = 0;
  let closedCount = 0;
  let openCount = 0;
  let openCapital = 0;
  let wins = 0;
  let best: FlipLogEntry | null = null;
  let timedProfit = 0;
  let timedHours = 0;

  for (const e of entries) {
    if (isOpen(e)) {
      openCount++;
      openCapital += e.qty * e.buyPrice;
      continue;
    }
    closedCount++;
    realizedProfit += e.profit!;
    if (e.profit! > 0) wins++;
    if (best === null || e.profit! > best.profit!) best = e;
    if (e.soldAt !== null && e.soldAt > e.loggedAt) {
      timedProfit += e.profit!;
      timedHours += (e.soldAt - e.loggedAt) / 3600;
    }
  }

  return {
    realizedProfit,
    closedCount,
    openCount,
    openCapital,
    winRate: closedCount === 0 ? null : wins / closedCount,
    best,
    gpPerHour: timedHours > 0 ? timedProfit / timedHours : null,
  };
}

/** Chronological running total of REALIZED profit for the chart. */
export function cumulativeProfit(
  entries: FlipLogEntry[],
): { n: number; total: number; entry: FlipLogEntry }[] {
  const closed = entries.filter((e) => !isOpen(e)).sort((a, b) => a.soldAt! - b.soldAt!);
  let total = 0;
  return closed.map((entry, i) => {
    total += entry.profit!;
    return { n: i + 1, total, entry };
  });
}

export function toCsv(entries: FlipLogEntry[]): string {
  const header = 'bought_at,sold_at,item,qty,buy_price,sell_price,tax_per_item,profit,status';
  const rows = [...entries]
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((e) =>
      [
        new Date(e.loggedAt * 1000).toISOString(),
        e.soldAt === null ? '' : new Date(e.soldAt * 1000).toISOString(),
        // quote + escape the only free-text field
        `"${e.itemName.replaceAll('"', '""')}"`,
        e.qty,
        e.buyPrice,
        e.sellPrice ?? '',
        e.taxPerItem ?? '',
        e.profit ?? '',
        isOpen(e) ? 'open' : 'closed',
      ].join(','),
    );
  return [header, ...rows].join('\n');
}

/** v1 entries were always closed and lacked taxExempt/soldAt. */
export function migrateV1(raw: unknown): FlipLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is Record<string, unknown> =>
        typeof e === 'object' && e !== null && typeof (e as { profit?: unknown }).profit === 'number',
    )
    .map((e) => ({
      id: String(e.id),
      itemId: Number(e.itemId),
      itemName: String(e.itemName),
      icon: (e.icon as string | null) ?? null,
      taxExempt: e.taxPerItem === 0,
      qty: Number(e.qty),
      buyPrice: Number(e.buyPrice),
      sellPrice: Number(e.sellPrice),
      taxPerItem: Number(e.taxPerItem),
      profit: Number(e.profit),
      loggedAt: Number(e.loggedAt),
      soldAt: Number(e.loggedAt),
    }));
}

const KEY_V1 = 'geff:fliplog:v1';
const KEY = 'geff:fliplog:v2';
const listeners = new Set<() => void>();

function load(): FlipLogEntry[] {
  try {
    const v2 = localStorage.getItem(KEY);
    if (v2 !== null) {
      const parsed = JSON.parse(v2) as unknown;
      return Array.isArray(parsed) ? (parsed as FlipLogEntry[]) : [];
    }
    const migrated = migrateV1(JSON.parse(localStorage.getItem(KEY_V1) ?? '[]'));
    if (migrated.length > 0) localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
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
  const complete = useCallback((id: string, sellPrice: number) => {
    const nowSec = Math.floor(Date.now() / 1000);
    persist(entries.map((e) => (e.id === id ? completeEntry(e, sellPrice, nowSec) : e)));
  }, []);
  const remove = useCallback((id: string) => {
    persist(entries.filter((e) => e.id !== id));
  }, []);
  return { entries: list, add, complete, remove };
}
