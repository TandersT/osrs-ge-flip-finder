import type {
  DivergenceDeal,
  DivergenceGroup,
  DivergenceGroupMember,
  DivergenceResponse,
  ItemCategory,
  ItemSnapshot,
  PairSignal,
  TimeseriesPoint,
} from '@osrs-flip/shared';
import {
  computeFlip,
  ITEM_CATEGORIES,
  mean,
  median,
  pctChange,
  pearson,
  zScore,
} from '@osrs-flip/shared';
import { config } from './config.js';
import { getItems } from './items.js';
import {
  extractLinkTargets,
  matchMentions,
  parseUpdateTemplate,
  wikiPageUrl,
} from './updateParse.js';
import { getUpdatePages, listUpdatePages, type StoredUpdatePage } from './updates.js';
import { getTimeseries } from './wiki.js';

/**
 * Divergence engine — pairwise correlation-gated spreads inside curated item
 * categories (see docs/superpowers/specs/2026-07-16-category-divergence-design.md).
 * This file follows the longterm.ts pattern: pure computation exported for
 * tests, one lazy build state machine, in-memory state only.
 */

/** Pair must share at least this many overlapping daily points. */
const MIN_OVERLAP_DAYS = 180;
/** …and correlate at least this much on non-overlapping weekly log returns. */
const MIN_WEEKLY_R = 0.4;
/** Both legs must trade at least this many units/day (you must be able to fill). */
const VOLUME_FLOOR = 2_000;
/** |z| at which a spread counts as diverged. */
const ENTRY_Z = 2;
/** |z| at which an episode counts as closed. */
const EXIT_Z = 0.5;
/** Rolling window (days) the spread is z-scored against. */
const SPREAD_WINDOW = 90;
/** An episode "reconverged" when it closes within this many days. */
const EPISODE_CLOSE_DAYS = 30;
/** Days of normalized two-leg series shipped for the overlay chart. */
const SERIES_WINDOW = 90;
/** Game updates this recent can badge a deal. */
const PATCH_WINDOW_DAYS = 21;
const REBUILD_MS = 12 * 60 * 60 * 1000;
const BUILD_CONCURRENCY = 4;
const BUILD_DELAY_MS = 50;

export interface DayPoint {
  t: number;
  mid: number;
}

/** Daily mid prices (avg of both sides, else whichever exists), zeros dropped. */
export function dailyMids(series: TimeseriesPoint[]): DayPoint[] {
  const out: DayPoint[] = [];
  for (const p of series) {
    const mid =
      p.avgHighPrice !== null && p.avgLowPrice !== null
        ? (p.avgHighPrice + p.avgLowPrice) / 2
        : (p.avgHighPrice ?? p.avgLowPrice);
    if (mid !== null && mid > 0) out.push({ t: p.timestamp, mid });
  }
  return out;
}

/** Inner-join two daily series on timestamp, oldest first. */
export function alignPair(a: DayPoint[], b: DayPoint[]): { t: number; a: number; b: number }[] {
  const byT = new Map(a.map((p) => [p.t, p.mid]));
  const out: { t: number; a: number; b: number }[] = [];
  for (const p of b) {
    const av = byT.get(p.t);
    if (av !== undefined) out.push({ t: p.t, a: av, b: p.mid });
  }
  return out;
}

/**
 * Log returns over non-overlapping 7-sample windows, anchored at the newest
 * value (a partial oldest week is dropped). Oldest first.
 */
export function weeklyLogReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let end = values.length - 1; end - 7 >= 0; end -= 7) {
    const now = values[end] as number;
    const then = values[end - 7] as number;
    if (now > 0 && then > 0) out.push(Math.log(now / then));
  }
  return out.reverse();
}

/** Rolling z of the log-price spread ln(a)-ln(b); null until `window` points. */
export function spreadZSeries(
  aligned: { t: number; a: number; b: number }[],
  window: number,
): (number | null)[] {
  const s = aligned.map((p) => Math.log(p.a) - Math.log(p.b));
  return s.map((value, i) => {
    if (i + 1 < window) return null;
    return zScore(value, s.slice(i + 1 - window, i + 1));
  });
}

export interface EpisodeStats {
  count: number;
  closedWithin30d: number;
  medianDays: number | null;
}

/**
 * Past divergence episodes in a rolling-z series: enter at |z| >= entryZ,
 * close at |z| <= exitZ. One aligned step ≈ one day (24h buckets; data gaps
 * make durations approximate). An episode still open at the last index is the
 * LIVE signal, not history — dropped entirely. Episodes that close later than
 * `closeDays` count toward `count` but not `closedWithin30d`.
 */
export function scanEpisodes(
  z: (number | null)[],
  entryZ: number,
  exitZ: number,
  closeDays: number,
): EpisodeStats {
  let openAt: number | null = null;
  const durations: number[] = [];
  for (let i = 0; i < z.length; i++) {
    const v = z[i];
    if (v === null || v === undefined) continue;
    if (openAt === null) {
      if (Math.abs(v) >= entryZ) openAt = i;
    } else if (Math.abs(v) <= exitZ) {
      durations.push(i - openAt);
      openAt = null;
    }
  }
  return {
    count: durations.length,
    closedWithin30d: durations.filter((d) => d <= closeDays).length,
    medianDays: median(durations),
  };
}

export interface PairComputation {
  weeklyR: number | null;
  eligible: boolean;
  /** Current z of the spread ln(a) - ln(b); null when ineligible. */
  z: number | null;
  episodes: EpisodeStats;
  aligned: { t: number; a: number; b: number }[];
}

const NO_EPISODES: EpisodeStats = { count: 0, closedWithin30d: 0, medianDays: null };

/** Full pair pipeline: align → correlation gate → rolling spread z → episodes. */
export function computePair(a: DayPoint[], b: DayPoint[]): PairComputation {
  const aligned = alignPair(a, b);
  if (aligned.length < MIN_OVERLAP_DAYS) {
    return { weeklyR: null, eligible: false, z: null, episodes: NO_EPISODES, aligned };
  }
  const recent = aligned.slice(-MIN_OVERLAP_DAYS);
  const weeklyR = pearson(
    weeklyLogReturns(recent.map((p) => p.a)),
    weeklyLogReturns(recent.map((p) => p.b)),
  );
  if (weeklyR === null || weeklyR < MIN_WEEKLY_R) {
    return { weeklyR, eligible: false, z: null, episodes: NO_EPISODES, aligned };
  }
  const zs = spreadZSeries(aligned, SPREAD_WINDOW);
  return {
    weeklyR,
    eligible: true,
    z: zs[zs.length - 1] ?? null,
    episodes: scanEpisodes(zs, ENTRY_Z, EXIT_Z, EPISODE_CLOSE_DAYS),
    aligned,
  };
}

/** Fractional change over the last 30 daily points of a member's own series. */
function change30(mids: DayPoint[]): number | null {
  if (mids.length < 31) return null;
  const from = mids[mids.length - 31]!.mid;
  return pctChange(from, mids[mids.length - 1]!.mid);
}

interface MemberCtx {
  name: string;
  item: ItemSnapshot | null;
  mids: DayPoint[] | null;
}

/**
 * Pure heart of the build: categories + live snapshot + fetched series in,
 * ranked laggard deals + groups panel out.
 */
export function computeDivergence(
  categories: ItemCategory[],
  items: ItemSnapshot[],
  seriesById: Map<number, TimeseriesPoint[]>,
  flipCfg: { captureRate: number; offerOffset: number },
): { deals: DivergenceDeal[]; groups: DivergenceGroup[] } {
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const deals: DivergenceDeal[] = [];
  const groups: DivergenceGroup[] = [];

  for (const cat of categories) {
    const members: MemberCtx[] = cat.members.map((name) => {
      const item = byName.get(name.toLowerCase()) ?? null;
      const raw = item ? seriesById.get(item.id) : undefined;
      const mids = raw ? dailyMids(raw) : null;
      return { name, item, mids: mids && mids.length > 0 ? mids : null };
    });

    const usable = members.filter(
      (m): m is MemberCtx & { item: ItemSnapshot; mids: DayPoint[] } =>
        m.item !== null && m.mids !== null && (m.item.dailyVolume ?? 0) >= VOLUME_FLOOR,
    );

    const pairs: {
      a: (typeof usable)[number];
      b: (typeof usable)[number];
      comp: PairComputation;
    }[] = [];
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        pairs.push({
          a: usable[i]!,
          b: usable[j]!,
          comp: computePair(usable[i]!.mids, usable[j]!.mids),
        });
      }
    }

    // groups panel: eligibility + average measured correlation per member
    const rByMember = new Map<string, number[]>();
    for (const p of pairs) {
      if (p.comp.weeklyR === null) continue;
      for (const m of [p.a, p.b]) {
        rByMember.set(m.name, [...(rByMember.get(m.name) ?? []), p.comp.weeklyR]);
      }
    }
    const panelMembers: DivergenceGroupMember[] = members.map((m) => ({
      itemId: m.item?.id ?? null,
      name: m.name,
      icon: m.item?.icon ?? null,
      eligible: pairs.some((p) => (p.a.name === m.name || p.b.name === m.name) && p.comp.eligible),
      avgR: mean(rByMember.get(m.name) ?? []),
      missing: m.item === null || m.mids === null,
    }));
    groups.push({
      id: cat.id,
      label: cat.label,
      eligiblePairs: pairs.filter((p) => p.comp.eligible).length,
      members: panelMembers,
    });

    // deals: flagged pairs grouped by laggard member
    const flaggedBy = new Map<
      string,
      { peer: (typeof usable)[number]; comp: PairComputation; laggardIsA: boolean }[]
    >();
    for (const p of pairs) {
      if (!p.comp.eligible || p.comp.z === null || Math.abs(p.comp.z) < ENTRY_Z) continue;
      const laggardIsA = p.comp.z < 0; // spread ln(a)-ln(b) low ⇒ a is the cheap leg
      const laggard = laggardIsA ? p.a : p.b;
      const peer = laggardIsA ? p.b : p.a;
      flaggedBy.set(laggard.name, [
        ...(flaggedBy.get(laggard.name) ?? []),
        { peer, comp: p.comp, laggardIsA },
      ]);
    }

    for (const [laggardName, flagged] of flaggedBy) {
      const laggard = usable.find((m) => m.name === laggardName)!;
      const partners = pairs.filter(
        (p) => p.comp.eligible && (p.a.name === laggardName || p.b.name === laggardName),
      );
      const item30d = change30(laggard.mids);
      const peersMedian30d = median(
        partners
          .map((p) => change30((p.a.name === laggardName ? p.b : p.a).mids))
          .filter((v): v is number => v !== null),
      );
      // direction sanity: only list items actually trailing their peers
      if (item30d === null || peersMedian30d === null || item30d >= peersMedian30d) continue;

      const signals: PairSignal[] = flagged
        .map(({ peer, comp }) => ({
          peerId: peer.item.id,
          peerName: peer.item.name,
          z: -Math.abs(comp.z!), // laggard's perspective: always negative
          weeklyR: comp.weeklyR!,
          episodes: comp.episodes,
        }))
        .sort((x, y) => x.z - y.z);

      // overlay series for the worst pair only, normalized to the window start
      const worst = flagged.find((f) => -Math.abs(f.comp.z!) === signals[0]!.z)!;
      const windowed = worst.comp.aligned.slice(-SERIES_WINDOW);
      const first = windowed[0];
      if (first !== undefined) {
        signals[0] = {
          ...signals[0]!,
          series90: windowed.map((p) => ({
            t: p.t,
            item: (worst.laggardIsA ? p.a : p.b) / (worst.laggardIsA ? first.a : first.b),
            peer: (worst.laggardIsA ? p.b : p.a) / (worst.laggardIsA ? first.b : first.a),
          })),
        };
      }

      const flip = computeFlip(
        {
          low: laggard.item.low,
          high: laggard.item.high,
          isExempt: laggard.item.taxExempt,
          buyLimit: laggard.item.limit,
          volumePer4h: null,
        },
        { captureRate: flipCfg.captureRate, offerOffset: flipCfg.offerOffset },
      );

      deals.push({
        itemId: laggard.item.id,
        name: laggard.item.name,
        icon: laggard.item.icon,
        groupId: cat.id,
        groupLabel: cat.label,
        laggingPairs: signals.length,
        eligiblePairs: partners.length,
        headline: { item30d, peersMedian30d },
        pairs: signals,
        buy: flip?.buyAt ?? null,
        sell: flip?.sellAt ?? null,
        margin: flip?.marginPerItem ?? null,
      });
    }
  }

  deals.sort((x, y) => y.laggingPairs - x.laggingPairs || x.pairs[0]!.z - y.pairs[0]!.z);
  return { deals, groups };
}

export interface RecentUpdate {
  title: string;
  date: string;
  url: string;
  mentions: Set<number>;
}

/** Pure: recent `game` update pages with their linked-item mentions resolved. */
export function parseRecentUpdates(
  pages: StoredUpdatePage[],
  nameToId: Map<string, number>,
  sinceIso: string,
): RecentUpdate[] {
  const out: RecentUpdate[] = [];
  for (const page of pages) {
    const head = parseUpdateTemplate(page.wikitext);
    if (head.category !== 'game' || head.date === null || head.date < sinceIso) continue;
    out.push({
      title: page.title.replace(/^Update:/, ''),
      date: head.date,
      url: wikiPageUrl(page.title),
      mentions: new Set(matchMentions(extractLinkTargets(page.wikitext), nameToId)),
    });
  }
  return out;
}

/**
 * Pure: newest recent update that links a deal's laggard or a flagged peer.
 * Divergences coinciding with a game change often DON'T reconverge — the
 * badge is a caution, not a bonus.
 */
export function attachPatchBadges(
  deals: DivergenceDeal[],
  updates: RecentUpdate[],
): DivergenceDeal[] {
  const newestFirst = [...updates].sort((a, b) => b.date.localeCompare(a.date));
  return deals.map((deal) => {
    const ids = [deal.itemId, ...deal.pairs.map((p) => p.peerId)];
    const hit = newestFirst.find((u) => ids.some((id) => u.mentions.has(id)));
    return hit ? { ...deal, patch: { title: hit.title, url: hit.url, date: hit.date } } : deal;
  });
}

/** IO wrapper: update pages come from the shared Patch Impact disk cache. */
export async function fetchRecentUpdates(nameToId: Map<string, number>): Promise<RecentUpdate[]> {
  const sinceIso = new Date(Date.now() - PATCH_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const refs = await listUpdatePages();
  const pages = await getUpdatePages(refs);
  return parseRecentUpdates(pages, nameToId, sinceIso);
}

interface BuildState {
  builtAt: number;
  deals: DivergenceDeal[];
  groups: DivergenceGroup[];
  coverage: { itemsRequested: number; itemsWithSeries: number };
}

let state: BuildState | null = null;
let building: { total: number; done: number } | null = null;
let buildPromise: Promise<void> | null = null;

async function build(): Promise<void> {
  const { items } = await getItems();
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const wanted = [
    ...new Map(
      ITEM_CATEGORIES.flatMap((c) => c.members)
        .map((name) => byName.get(name.toLowerCase()))
        .filter((i): i is NonNullable<typeof i> => i !== undefined)
        .map((i) => [i.id, i] as const),
    ).values(),
  ];

  building = { total: wanted.length, done: 0 };
  const seriesById = new Map<number, TimeseriesPoint[]>();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < wanted.length) {
      const item = wanted[next++]!;
      try {
        const series = await getTimeseries(item.id, '24h');
        seriesById.set(item.id, series.value);
      } catch {
        // wiki hiccup on one item: its group members show as missing this build
      }
      building!.done++;
      await new Promise((r) => setTimeout(r, BUILD_DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, worker));

  const computed = computeDivergence(ITEM_CATEGORIES, items, seriesById, {
    captureRate: config.captureRate,
    offerOffset: config.offerOffset,
  });
  const { groups } = computed;
  let deals = computed.deals;
  try {
    const nameToId = new Map(items.map((i) => [i.name.toLowerCase(), i.id]));
    deals = attachPatchBadges(deals, await fetchRecentUpdates(nameToId));
  } catch {
    // badges are additive — a MediaWiki hiccup must not kill the build
  }

  state = {
    builtAt: Date.now(),
    deals,
    groups,
    coverage: { itemsRequested: wanted.length, itemsWithSeries: seriesById.size },
  };
  building = null;
}

/** Lazily (re)build in the background; serve whatever exists right now. */
export function getDivergence(): DivergenceResponse {
  const isFresh = state !== null && Date.now() - state.builtAt < REBUILD_MS;
  if (!isFresh && buildPromise === null) {
    buildPromise = build()
      .catch(() => {
        // total failure (e.g. wiki down with cold cache): retry on a later request
      })
      .finally(() => {
        buildPromise = null;
      });
  }
  return {
    builtAt: state === null ? null : Math.floor(state.builtAt / 1000),
    ...(building !== null ? { building } : {}),
    deals: state?.deals ?? [],
    groups: state?.groups ?? [],
    coverage: state?.coverage ?? { itemsRequested: 0, itemsWithSeries: 0 },
  };
}
