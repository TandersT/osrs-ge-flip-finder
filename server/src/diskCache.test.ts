import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './diskCache.js';

describe('diskCache', () => {
  it('round-trips a value, creating parent directories', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geff-'));
    const file = path.join(dir, 'nested', 'deep', 'x.json');
    await writeJsonFile(file, { a: 1, b: [null, 'two'] });
    expect(await readJsonFile(file)).toEqual({ a: 1, b: [null, 'two'] });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns null for a missing file', async () => {
    expect(await readJsonFile(path.join(os.tmpdir(), 'geff-definitely-missing.json'))).toBeNull();
  });

  it('returns null for a corrupt file so the caller refetches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geff-'));
    const file = path.join(dir, 'bad.json');
    await fs.writeFile(file, '{not json');
    expect(await readJsonFile(file)).toBeNull();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
