import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal JSON-file persistence for immutable/slow-moving upstream data
 * (multi-year price history, update-post wikitext). NOT a TTL cache —
 * callers decide freshness; this only reads and writes.
 */
export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null; // missing or corrupt -> caller refetches
  }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file); // rename is atomic on one filesystem: no torn reads
}
