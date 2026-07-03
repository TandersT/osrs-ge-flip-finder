import { useCallback, useSyncExternalStore } from 'react';

export interface Character {
  name: string;
  /** Hiscores skill name -> level, e.g. { Herblore: 74 }. */
  levels: Record<string, number>;
  /** Unix seconds when imported. */
  fetchedAt: number;
}

const KEY = 'geff:character:v1';
const listeners = new Set<() => void>();

function load(): Character | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const c = parsed as Character;
    return typeof c.name === 'string' && typeof c.levels === 'object' ? c : null;
  } catch {
    return null;
  }
}

let character: Character | null = load();

function persist(next: Character | null): void {
  character = next;
  try {
    if (next === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: in-memory character still works this session
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Imported OSRS character (official hiscores, via our server proxy). */
export function useCharacter() {
  const current = useSyncExternalStore(subscribe, () => character);
  const importCharacter = useCallback(async (name: string): Promise<string | null> => {
    const res = await fetch(`/api/hiscores?player=${encodeURIComponent(name.trim())}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return body.error ?? `Import failed (${res.status})`;
    }
    const body = (await res.json()) as { name: string; levels: Record<string, number> };
    persist({ name: body.name, levels: body.levels, fetchedAt: Math.floor(Date.now() / 1000) });
    return null;
  }, []);
  const clear = useCallback(() => persist(null), []);
  return { character: current, importCharacter, clear };
}
