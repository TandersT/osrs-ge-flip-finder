import { useCallback, useSyncExternalStore } from 'react';

export interface SavedFilter {
  id: string;
  name: string;
  /** The finder's URL search string, e.g. "?mv=1000&mm=100". */
  search: string;
}

const KEY = 'geff:saved-filters:v1';
const listeners = new Set<() => void>();

function load(): SavedFilter[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (f): f is SavedFilter =>
            typeof f === 'object' && f !== null && typeof (f as SavedFilter).search === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

let saved: SavedFilter[] = load();

function persist(next: SavedFilter[]): void {
  saved = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // storage blocked: keep the in-memory list working
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSavedFilters() {
  const list = useSyncExternalStore(subscribe, () => saved);
  const save = useCallback((name: string, search: string) => {
    persist([...saved, { id: crypto.randomUUID(), name: name.trim(), search }]);
  }, []);
  const remove = useCallback((id: string) => {
    persist(saved.filter((f) => f.id !== id));
  }, []);
  return { saved: list, save, remove };
}
