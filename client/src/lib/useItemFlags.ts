import { useMemo } from 'react';
import { useAppConfig, useItems } from './api';
import { buildRows, type FlipRow } from './rows';

/**
 * Live item flags keyed by item id, built from the same snapshot the Flip
 * Finder uses. Lets the other tabs (deals/long-term/tools) show and filter the
 * market flags for whatever item a row maps to, without each re-deriving them.
 * Backed by the shared, cached `useItems` query, so it costs no extra request.
 */
export function useFlipRowsById(): Map<number, FlipRow> {
  const config = useAppConfig();
  const { data } = useItems(config.clientRefreshSeconds);
  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), [data]);
  return useMemo(() => {
    const map = new Map<number, FlipRow>();
    if (data) for (const r of buildRows(data.items, config, nowSec)) map.set(r.id, r);
    return map;
  }, [data, config, nowSec]);
}
