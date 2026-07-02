import { useCallback, useSyncExternalStore } from 'react';

export interface WatchEntry {
  id: number;
  /** Unix seconds when starred. */
  addedAt: number;
  /** Mid price at the moment of starring (for "since added"). */
  priceAtAdd: number | null;
}

const KEY = 'geff:watchlist:v1';
const listeners = new Set<() => void>();

function load(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is WatchEntry => typeof e === 'object' && e !== null && typeof (e as WatchEntry).id === 'number',
    );
  } catch {
    return [];
  }
}

let entries: WatchEntry[] = load();

function persist(next: WatchEntry[]): void {
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

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, () => entries);
  const isWatched = useCallback((id: number) => list.some((e) => e.id === id), [list]);
  const toggle = useCallback(
    (id: number, currentPrice: number | null) => {
      if (entries.some((e) => e.id === id)) {
        persist(entries.filter((e) => e.id !== id));
      } else {
        persist([
          ...entries,
          { id, addedAt: Math.floor(Date.now() / 1000), priceAtAdd: currentPrice },
        ]);
      }
    },
    [],
  );
  return { entries: list, isWatched, toggle };
}
