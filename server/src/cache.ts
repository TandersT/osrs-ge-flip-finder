export interface CacheHit<T> {
  value: T;
  /** Unix ms when the value was fetched from upstream. */
  fetchedAt: number;
  /** True when upstream failed and this is the last known-good value. */
  stale: boolean;
}

interface Entry {
  value: unknown;
  fetchedAt: number;
}

/**
 * In-memory TTL cache with single-flight and stale-on-error semantics:
 * - within TTL: serve cached value, no upstream call
 * - expired: one upstream call at a time per key (concurrent callers share it)
 * - upstream failure with a previous value: serve it flagged stale
 * - upstream failure with nothing cached: rethrow
 */
export class TtlCache {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<CacheHit<unknown>>>();
  private upstreamCalls = new Map<string, number>();

  async get<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<CacheHit<T>> {
    const entry = this.entries.get(key);
    const now = Date.now();
    if (entry && now - entry.fetchedAt < ttlMs) {
      return { value: entry.value as T, fetchedAt: entry.fetchedAt, stale: false };
    }

    const running = this.inflight.get(key);
    if (running) return running as Promise<CacheHit<T>>;

    const flight: Promise<CacheHit<unknown>> = (async () => {
      this.upstreamCalls.set(key, (this.upstreamCalls.get(key) ?? 0) + 1);
      try {
        const value = await fetcher();
        const fetchedAt = Date.now();
        this.entries.set(key, { value, fetchedAt });
        return { value, fetchedAt, stale: false };
      } catch (err) {
        const previous = this.entries.get(key);
        if (previous) {
          return { value: previous.value, fetchedAt: previous.fetchedAt, stale: true };
        }
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, flight);
    return flight as Promise<CacheHit<T>>;
  }

  /** Upstream call count per key — used by /api/health and tests. */
  stats(): Record<string, number> {
    return Object.fromEntries(this.upstreamCalls);
  }
}
