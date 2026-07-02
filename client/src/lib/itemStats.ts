import type { ItemSnapshot, TimeseriesPoint } from '@osrs-flip/shared';
import { mean, pctChange, volatility } from '@osrs-flip/shared';

/** Midpoint of a timeseries bucket, using whichever sides exist. */
export function midPrice(p: TimeseriesPoint): number | null {
  if (p.avgHighPrice !== null && p.avgLowPrice !== null) {
    return (p.avgHighPrice + p.avgLowPrice) / 2;
  }
  return p.avgHighPrice ?? p.avgLowPrice;
}

/** Current midpoint from the live snapshot. */
export function currentMid(item: ItemSnapshot): number | null {
  if (item.high !== null && item.low !== null) return (item.high + item.low) / 2;
  return item.high ?? item.low;
}

export interface ItemStats {
  todayMove: number | null;
  change7d: number | null;
  change30d: number | null;
  change90d: number | null;
  /** Coefficient of variation of the last 30 daily midpoints. */
  volatility30d: number | null;
  avgDailyVolume30d: number | null;
}

/** Fractional change from the bucket closest to `days` ago to the current price. */
function changeOverDays(
  series: TimeseriesPoint[],
  now: number | null,
  lastTs: number,
  days: number,
): number | null {
  if (now === null) return null;
  const target = lastTs - days * 86_400;
  const point = series.find((p) => p.timestamp >= target && midPrice(p) !== null);
  const from = point ? midPrice(point) : null;
  if (from === null) return null;
  return pctChange(from, now);
}

/** Long-horizon stats from the 24h timeseries (~365 daily buckets). */
export function computeItemStats(series: TimeseriesPoint[], item: ItemSnapshot): ItemStats {
  const empty: ItemStats = {
    todayMove: null,
    change7d: null,
    change30d: null,
    change90d: null,
    volatility30d: null,
    avgDailyVolume30d: null,
  };
  if (series.length === 0) return empty;

  const now = currentMid(item);
  const lastTs = series[series.length - 1]!.timestamp;
  const last30 = series.slice(-30);
  const mids30 = last30.map(midPrice).filter((v): v is number => v !== null);
  const volumes30 = last30.map((p) => p.highPriceVolume + p.lowPriceVolume);

  return {
    todayMove: changeOverDays(series, now, lastTs, 1),
    change7d: changeOverDays(series, now, lastTs, 7),
    change30d: changeOverDays(series, now, lastTs, 30),
    change90d: changeOverDays(series, now, lastTs, 90),
    volatility30d: volatility(mids30),
    avgDailyVolume30d: mean(volumes30),
  };
}
