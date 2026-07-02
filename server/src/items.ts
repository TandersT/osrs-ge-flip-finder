import type {
  ItemMapping,
  ItemSnapshot,
  ItemsResponse,
  LatestPrice,
  WindowPrice,
} from '@osrs-flip/shared';
import { isTaxExempt } from '@osrs-flip/shared';
import { getLatest, getMapping, getOneHour, getVolumes } from './wiki.js';

/** Pure merge of the four wiki payloads into per-item snapshots. */
export function mergeItems(
  mapping: ItemMapping[],
  latest: Record<string, LatestPrice>,
  oneHour: Record<string, WindowPrice>,
  volumes: Record<string, number>,
): ItemSnapshot[] {
  return mapping.map((item) => {
    const price = latest[String(item.id)];
    const hour = oneHour[String(item.id)];
    return {
      id: item.id,
      name: item.name,
      icon: item.icon ?? null,
      members: item.members,
      limit: item.limit ?? null,
      value: item.value ?? null,
      highalch: item.highalch ?? null,
      high: price?.high ?? null,
      highTime: price?.highTime ?? null,
      low: price?.low ?? null,
      lowTime: price?.lowTime ?? null,
      avgHighPrice1h: hour?.avgHighPrice ?? null,
      avgLowPrice1h: hour?.avgLowPrice ?? null,
      volume1h: (hour?.highPriceVolume ?? 0) + (hour?.lowPriceVolume ?? 0),
      dailyVolume: volumes[String(item.id)] ?? null,
      taxExempt: isTaxExempt(item.id),
    };
  });
}

/**
 * Merged snapshot of all tradeable items. Underlying endpoints are cached with
 * their own TTLs; failures fall back to the last good payload (flagged stale).
 */
export async function getItems(): Promise<ItemsResponse> {
  const [mapping, latest, oneHour, volumes] = await Promise.all([
    getMapping(),
    getLatest(),
    getOneHour(),
    getVolumes(),
  ]);
  return {
    items: mergeItems(mapping.value, latest.value, oneHour.value, volumes.value),
    fetchedAt: Math.floor(latest.fetchedAt / 1000),
    upstreamStale: mapping.stale || latest.stale || oneHour.stale || volumes.stale,
  };
}
