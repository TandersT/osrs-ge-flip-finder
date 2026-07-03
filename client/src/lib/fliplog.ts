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

export const CSV_HEADER =
  'bought_at,sold_at,item,item_id,tax_exempt,qty,buy_price,sell_price,tax_per_item,profit,status';

export function toCsv(entries: FlipLogEntry[]): string {
  const rows = [...entries]
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((e) =>
      [
        new Date(e.loggedAt * 1000).toISOString(),
        e.soldAt === null ? '' : new Date(e.soldAt * 1000).toISOString(),
        // quote + escape the only free-text field
        `"${e.itemName.replaceAll('"', '""')}"`,
        e.itemId,
        e.taxExempt ? 1 : 0,
        e.qty,
        e.buyPrice,
        e.sellPrice ?? '',
        e.taxPerItem ?? '',
        e.profit ?? '',
        isOpen(e) ? 'open' : 'closed',
      ].join(','),
    );
  return [CSV_HEADER, ...rows].join('\n');
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse a previously exported CSV back into entries (ids are re-assigned on
 * import). Tolerates the pre-item_id export format. Malformed rows are skipped.
 */
export function fromCsv(text: string): Omit<FlipLogEntry, 'id'>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const cols = splitCsvLine(lines[0]!).map((c) => c.trim());
  const idx = (name: string) => cols.indexOf(name);
  if (idx('bought_at') === -1 || idx('item') === -1 || idx('buy_price') === -1) return [];

  const out: Omit<FlipLogEntry, 'id'>[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const get = (name: string) => (idx(name) === -1 ? '' : (f[idx(name)] ?? ''));
    const loggedAt = Math.floor(Date.parse(get('bought_at')) / 1000);
    const qty = Number(get('qty'));
    const buyPrice = Number(get('buy_price'));
    if (!Number.isFinite(loggedAt) || !(qty > 0) || !Number.isFinite(buyPrice)) continue;
    const soldRaw = get('sold_at');
    const sellRaw = get('sell_price');
    const open = get('status') === 'open' || sellRaw === '';
    out.push({
      itemId: Number(get('item_id')) || 0,
      itemName: get('item') || 'Unknown item',
      icon: null,
      taxExempt: get('tax_exempt') === '1',
      qty,
      buyPrice,
      sellPrice: open ? null : Number(sellRaw),
      taxPerItem: open ? null : Number(get('tax_per_item')) || 0,
      profit: open ? null : Number(get('profit')) || 0,
      loggedAt,
      soldAt: open || soldRaw === '' ? (open ? null : loggedAt) : Math.floor(Date.parse(soldRaw) / 1000),
    });
  }
  return out;
}

export interface ItemAgg {
  itemId: number;
  itemName: string;
  icon: string | null;
  flips: number;
  wins: number;
  profit: number;
  /** Mean hold time in hours over flips with real durations; null if none. */
  avgHoldHours: number | null;
}

/** Per-item aggregates over CLOSED flips, sorted by total profit. */
export function perItemStats(entries: FlipLogEntry[]): ItemAgg[] {
  const byItem = new Map<string, ItemAgg & { holdSum: number; holdN: number }>();
  for (const e of entries) {
    if (isOpen(e)) continue;
    const key = `${e.itemId}:${e.itemName}`;
    let agg = byItem.get(key);
    if (!agg) {
      agg = {
        itemId: e.itemId,
        itemName: e.itemName,
        icon: e.icon,
        flips: 0,
        wins: 0,
        profit: 0,
        avgHoldHours: null,
        holdSum: 0,
        holdN: 0,
      };
      byItem.set(key, agg);
    }
    agg.flips++;
    agg.profit += e.profit!;
    if (e.profit! > 0) agg.wins++;
    if (e.soldAt !== null && e.soldAt > e.loggedAt) {
      agg.holdSum += (e.soldAt - e.loggedAt) / 3600;
      agg.holdN++;
    }
  }
  return [...byItem.values()]
    .map(({ holdSum, holdN, ...agg }) => ({
      ...agg,
      avgHoldHours: holdN > 0 ? holdSum / holdN : null,
    }))
    .sort((a, b) => b.profit - a.profit);
}

/** Realized profit per calendar month (chronological). */
export function monthlyProfit(entries: FlipLogEntry[]): { month: string; profit: number }[] {
  const byMonth = new Map<string, number>();
  for (const e of entries) {
    if (isOpen(e)) continue;
    const d = new Date(e.soldAt! * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + e.profit!);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, profit]) => ({ month, profit }));
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
  const importMany = useCallback((parsed: Omit<FlipLogEntry, 'id'>[]) => {
    const withIds = parsed.map((e) => ({ ...e, id: crypto.randomUUID() }));
    persist([...withIds, ...entries]);
  }, []);
  return { entries: list, add, complete, remove, importMany };
}
