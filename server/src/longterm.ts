import type { ItemSnapshot, LongtermResponse, LongtermRow, TimeseriesPoint } from '@osrs-flip/shared';
import { normalisedSlope, pctChange, volatility, zScore } from '@osrs-flip/shared';
import { config } from './config.js';
import { getItems } from './items.js';
import { getTimeseries } from './wiki.js';

/** Rebuild the screen at most this often (timeseries move one bucket per day). */
const REBUILD_MS = 12 * 60 * 60 * 1000;
/** Parallel timeseries fetches against the wiki during a build. */
const BUILD_CONCURRENCY = 4;
/** Pause per worker between fetches — keeps the build polite (~250 items in <1min). */
const BUILD_DELAY_MS = 50;
/** Dip: trading at/below this many std devs under the 90-day mean. */
const DIP_Z_THRESHOLD = -1;
/** Momentum: 14-day price slope above this fraction/day (0.003 ~ +4.3%/14d)… */
const MOMENTUM_SLOPE = 0.003;
/** …with the 30-day volume slope positive. */
const MOMENTUM_VOLUME_SLOPE = 0;

interface BuildState {
  builtAt: number;
  rows: LongtermRow[];
}

let state: BuildState | null = null;
let building: { total: number; done: number } | null = null;

function mid(p: TimeseriesPoint): number | null {
  if (p.avgHighPrice !== null && p.avgLowPrice !== null) return (p.avgHighPrice + p.avgLowPrice) / 2;
  return p.avgHighPrice ?? p.avgLowPrice;
}

function changeOverDays(series: TimeseriesPoint[], current: number, days: number): number | null {
  const lastTs = series[series.length - 1]?.timestamp;
  if (lastTs === undefined) return null;
  const target = lastTs - days * 86_400;
  const point = series.find((p) => p.timestamp >= target && mid(p) !== null);
  const from = point ? mid(point) : null;
  return from === null ? null : pctChange(from, current);
}

export function computeLongtermRow(item: ItemSnapshot, series: TimeseriesPoint[]): LongtermRow {
  const mids = series.map(mid).filter((v): v is number => v !== null);
  const mids90 = mids.slice(-90);
  const mids30 = mids.slice(-30);
  const mids14 = mids.slice(-14);
  const volumes30 = series.slice(-30).map((p) => p.highPriceVolume + p.lowPriceVolume);

  const price =
    item.high !== null && item.low !== null
      ? (item.high + item.low) / 2
      : (item.high ?? item.low ?? mids[mids.length - 1] ?? null);

  const z = price === null || mids90.length < 30 ? null : zScore(price, mids90);
  const priceSlope14 = normalisedSlope(mids14);
  const volumeTrend30 = normalisedSlope(volumes30);
  const change7d = price === null ? null : changeOverDays(series, price, 7);

  return {
    id: item.id,
    name: item.name,
    icon: item.icon,
    members: item.members,
    limit: item.limit,
    dailyVolume: item.dailyVolume,
    price,
    change7d,
    change30d: price === null ? null : changeOverDays(series, price, 30),
    change90d: price === null ? null : changeOverDays(series, price, 90),
    zScore90: z,
    volatility30: volatility(mids30),
    volumeTrend30,
    isDip: z !== null && z <= DIP_Z_THRESHOLD,
    // "sustained uptrend": 14d slope up AND still up over the last week, with rising volume
    isMomentum:
      priceSlope14 !== null &&
      volumeTrend30 !== null &&
      priceSlope14 > MOMENTUM_SLOPE &&
      volumeTrend30 > MOMENTUM_VOLUME_SLOPE &&
      (change7d ?? 0) > 0,
  };
}

async function build(): Promise<void> {
  const { items } = await getItems();
  const candidates = items
    .filter((i) => (i.dailyVolume ?? 0) >= config.longtermMinDailyVolume)
    .sort((a, b) => (b.dailyVolume ?? 0) - (a.dailyVolume ?? 0))
    .slice(0, config.longtermMaxItems);

  building = { total: candidates.length, done: 0 };
  const rows: LongtermRow[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    while (next < candidates.length) {
      const item = candidates[next++]!;
      try {
        const series = await getTimeseries(item.id, '24h');
        rows.push(computeLongtermRow(item, series.value));
      } catch {
        // wiki hiccup on one item: skip it, keep the screen building
      }
      building!.done++;
      await new Promise((r) => setTimeout(r, BUILD_DELAY_MS));
    }
  }

  await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, worker));
  rows.sort((a, b) => (b.dailyVolume ?? 0) - (a.dailyVolume ?? 0));
  state = { builtAt: Date.now(), rows };
  building = null;
}

let buildPromise: Promise<void> | null = null;

/** Lazily (re)build in the background; serve whatever exists right now. */
export function getLongterm(): LongtermResponse {
  const isFresh = state !== null && Date.now() - state.builtAt < REBUILD_MS;
  if (!isFresh && buildPromise === null) {
    buildPromise = build()
      .catch(() => {
        // total failure (e.g. wiki down with cold cache): try again on a later request
      })
      .finally(() => {
        buildPromise = null;
      });
  }

  if (building !== null) {
    return {
      status: 'building',
      progress: building.total === 0 ? 0 : building.done / building.total,
      builtAt: state === null ? null : Math.floor(state.builtAt / 1000),
      rows: state?.rows ?? [],
    };
  }
  return {
    status: state === null ? 'building' : 'ready',
    progress: state === null ? 0 : 1,
    builtAt: state === null ? null : Math.floor(state.builtAt / 1000),
    rows: state?.rows ?? [],
  };
}
