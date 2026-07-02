import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from './cache.js';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves from cache within the TTL — one upstream call', async () => {
    const cache = new TtlCache();
    const fetcher = vi.fn(async () => 'payload');

    const first = await cache.get('k', 60_000, fetcher);
    const second = await cache.get('k', 60_000, fetcher);

    expect(first.value).toBe('payload');
    expect(second.value).toBe('payload');
    expect(second.stale).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toEqual({ k: 1 });
  });

  it('refetches after the TTL expires', async () => {
    const cache = new TtlCache();
    const fetcher = vi.fn(async () => 'payload');

    await cache.get('k', 60_000, fetcher);
    vi.advanceTimersByTime(61_000);
    await cache.get('k', 60_000, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('single-flight: concurrent misses share one upstream call', async () => {
    const cache = new TtlCache();
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<string>((res) => {
          resolve = res;
        }),
    );

    const a = cache.get('k', 60_000, fetcher);
    const b = cache.get('k', 60_000, fetcher);
    const c = cache.get('k', 60_000, fetcher);
    resolve('shared');

    const results = await Promise.all([a, b, c]);
    expect(results.map((r) => r.value)).toEqual(['shared', 'shared', 'shared']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves the last good value flagged stale when upstream fails', async () => {
    const cache = new TtlCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('good')
      .mockRejectedValueOnce(new Error('wiki down'));

    const first = await cache.get('k', 60_000, fetcher);
    vi.advanceTimersByTime(61_000);
    const second = await cache.get('k', 60_000, fetcher);

    expect(first.stale).toBe(false);
    expect(second.value).toBe('good');
    expect(second.stale).toBe(true);
  });

  it('rethrows when upstream fails with nothing cached', async () => {
    const cache = new TtlCache();
    const fetcher = vi.fn(async () => {
      throw new Error('wiki down');
    });

    await expect(cache.get('k', 60_000, fetcher)).rejects.toThrow('wiki down');
  });

  it('recovers after a stale period once upstream heals', async () => {
    const cache = new TtlCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('v2');

    await cache.get('k', 1_000, fetcher);
    vi.advanceTimersByTime(2_000);
    const staleHit = await cache.get('k', 1_000, fetcher);
    const healed = await cache.get('k', 1_000, fetcher);

    expect(staleHit.stale).toBe(true);
    expect(healed.value).toBe('v2');
    expect(healed.stale).toBe(false);
  });
});
