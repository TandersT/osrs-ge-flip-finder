import type {
  ItemMapping,
  LatestPrice,
  TimeseriesPoint,
  Timestep,
  WindowPrice,
} from '@osrs-flip/shared';
import { config } from './config.js';
import { TtlCache, type CacheHit } from './cache.js';

const TTL = {
  mapping: 24 * 60 * 60 * 1000,
  latest: 60 * 1000,
  fiveMin: 5 * 60 * 1000,
  oneHour: 60 * 60 * 1000,
  timeseries: 5 * 60 * 1000,
  volumes: 60 * 60 * 1000,
} as const;

export const wikiCache = new TtlCache();

/** Typed fetch against the wiki real-time prices API. Every call sends our User-Agent. */
async function wikiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${config.wikiApiBase}${path}`, {
    headers: { 'User-Agent': config.userAgent },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`wiki API ${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

export function getMapping(): Promise<CacheHit<ItemMapping[]>> {
  return wikiCache.get('mapping', TTL.mapping, () => wikiFetch<ItemMapping[]>('/mapping'));
}

export function getLatest(): Promise<CacheHit<Record<string, LatestPrice>>> {
  return wikiCache.get('latest', TTL.latest, async () => {
    const body = await wikiFetch<{ data: Record<string, LatestPrice> }>('/latest');
    return body.data;
  });
}

export function getOneHour(): Promise<CacheHit<Record<string, WindowPrice>>> {
  return wikiCache.get('1h', TTL.oneHour, async () => {
    const body = await wikiFetch<{ data: Record<string, WindowPrice> }>('/1h');
    return body.data;
  });
}

export function getFiveMin(): Promise<CacheHit<Record<string, WindowPrice>>> {
  return wikiCache.get('5m', TTL.fiveMin, async () => {
    const body = await wikiFetch<{ data: Record<string, WindowPrice> }>('/5m');
    return body.data;
  });
}

export function getVolumes(): Promise<CacheHit<Record<string, number>>> {
  return wikiCache.get('volumes', TTL.volumes, async () => {
    const body = await wikiFetch<{ data: Record<string, number> }>('/volumes');
    return body.data;
  });
}

export function getTimeseries(id: number, timestep: Timestep): Promise<CacheHit<TimeseriesPoint[]>> {
  return wikiCache.get(`timeseries:${timestep}:${id}`, TTL.timeseries, async () => {
    const body = await wikiFetch<{ data: TimeseriesPoint[] }>(
      `/timeseries?timestep=${timestep}&id=${id}`,
    );
    return body.data;
  });
}
