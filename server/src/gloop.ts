import path from 'node:path';
import { config, repoRoot } from './config.js';
import { readJsonFile, writeJsonFile } from './diskCache.js';
import type { DailyPoint } from './patchStats.js';

/**
 * Weirdgloop exchange archive: full multi-year daily price history, one item
 * per request (verified: the /all route rejects multiple ids). Disk-cached —
 * history is immutable, so a restart must never re-hammer the API.
 */
const CACHE_DIR = path.join(repoRoot, 'server', 'data', 'patch-cache', 'prices');
/** One point moves per day; a refetch replaces the whole file with one cheap call. */
const FRESH_MS = 24 * 60 * 60 * 1000;

interface GloopPoint {
  id: string;
  price: number;
  volume: number | null;
  /** Unix MILLISECONDS in the upstream payload. */
  timestamp: number;
}

interface StoredHistory {
  fetchedAt: number;
  points: DailyPoint[];
}

export async function getFullHistory(id: number): Promise<DailyPoint[]> {
  const file = path.join(CACHE_DIR, `${id}.json`);
  const cached = await readJsonFile<StoredHistory>(file);
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return cached.points;
  try {
    const res = await fetch(`${config.gloopApiBase}/all?id=${id}`, {
      headers: { 'User-Agent': config.userAgent },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`weirdgloop ${id} responded ${res.status}`);
    const body = (await res.json()) as Record<string, GloopPoint[]>;
    const points: DailyPoint[] = (body[String(id)] ?? []).map((p) => ({
      timestamp: Math.floor(p.timestamp / 1000),
      price: p.price,
      volume: p.volume,
    }));
    await writeJsonFile(file, { fetchedAt: Date.now(), points } satisfies StoredHistory);
    return points;
  } catch (err) {
    if (cached) return cached.points; // stale archive beats no archive
    throw err;
  }
}
