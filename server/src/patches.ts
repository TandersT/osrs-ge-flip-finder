import type {
  ItemSnapshot,
  PatchDetail,
  PatchesResponse,
  PatchItemRow,
  PatchSummary,
  UpcomingFeature,
  UpcomingResponse,
} from '@osrs-flip/shared';
import { config } from './config.js';
import { PATCH_OVERRIDES, type PatchOverrides } from './data/patchOverrides.js';
import { getFullHistory } from './gloop.js';
import { getItems } from './items.js';
import { change7After, computePatch, type DailyPoint, type PatchItemInput } from './patchStats.js';
import { aggregateEvidence, extractTags, pickAnalogues } from './patchTags.js';
import {
  extractLinkTargets,
  matchMentions,
  parseUpdateTemplate,
  splitUpcomingSections,
} from './updateParse.js';
import { getUpcomingWikitext, getUpdatePages, listUpdatePages } from './updates.js';

/**
 * Patch Impact build orchestrator — the longterm.ts state machine applied to
 * a bigger pipeline: update pages + multi-year price archive in, event-study
 * winners/losers + upcoming evidence out. First build backfills the disk
 * cache (~30 MediaWiki calls + ~400 weirdgloop calls, a few minutes);
 * subsequent builds are mostly disk reads.
 */
const REBUILD_MS = 12 * 60 * 60 * 1000;
const BUILD_CONCURRENCY = 4;
const BUILD_DELAY_MS = 50;
/** Weirdgloop coverage starts late March 2015 — earlier patches have no baseline. */
const MIN_PATCH_DATE = '2015-04-01';
/** The archive carries volumes from this date. */
const VOLUME_DATA_START = '2018-09-25';
/** Drop patches where fewer items than this had usable price data. */
const MIN_UNIVERSE = 50;
/** Same-item mention history shown per upcoming item. */
const MAX_MENTION_HISTORY = 6;

interface ParsedPatch {
  pageid: number;
  /** Full wiki title incl. the "Update:" prefix. */
  rawTitle: string;
  /** Display title, prefix stripped. */
  title: string;
  date: string;
  /** Unix seconds, midnight UTC of the publish date. */
  ts: number;
  mentions: Set<number>;
  tags: string[];
}

interface BuildState {
  builtAt: number;
  summaries: PatchSummary[];
  details: Map<number, PatchDetail>;
  upcoming: UpcomingFeature[];
  warnings: string[];
}

let state: BuildState | null = null;
let building: { done: number; total: number } | null = null;
let buildPromise: Promise<void> | null = null;

function wikiPageUrl(rawTitle: string): string {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(rawTitle.replace(/ /g, '_'))}`;
}

/** Pure and exported for tests: hide first, then pins float up in pin order. */
export function applyOverrides(
  summaries: PatchSummary[],
  overrides: PatchOverrides,
): PatchSummary[] {
  const hidden = new Set(overrides.hidePatches);
  const kept = summaries.filter((s) => !hidden.has(s.pageid));
  if (overrides.pinPatches.length === 0) return kept;
  const pinRank = new Map(overrides.pinPatches.map((id, i) => [id, i]));
  // Array.prototype.sort is stable: non-pinned entries keep their date order.
  return [...kept].sort(
    (a, b) => (pinRank.get(a.pageid) ?? Infinity) - (pinRank.get(b.pageid) ?? Infinity),
  );
}

async function build(): Promise<void> {
  const warnings: string[] = [];
  building = { done: 0, total: 100 };
  const setProgress = (frac: number): void => {
    building = { done: Math.round(Math.min(1, frac) * 100), total: 100 };
  };

  // Phase 1 — universe + name index from the live snapshot
  const { items } = await getItems();
  const universe = [...items]
    .sort((a, b) => (b.dailyVolume ?? 0) - (a.dailyVolume ?? 0))
    .slice(0, config.patchesMaxItems);
  const nameToId = new Map(items.map((i) => [i.name.toLowerCase(), i.id]));
  const byId = new Map(items.map((i) => [i.id, i]));

  // Phase 2 — update pages (0 -> 0.35): disk-cached after the first run
  const refs = await listUpdatePages();
  const pages = await getUpdatePages(refs, (done, total) =>
    setProgress(0.35 * (done / Math.max(1, total))),
  );
  if (pages.length < refs.length) {
    warnings.push(
      `${refs.length - pages.length} of ${refs.length} update pages unavailable — will retry next rebuild`,
    );
  }
  const parsed: ParsedPatch[] = [];
  for (const page of pages) {
    const head = parseUpdateTemplate(page.wikitext);
    if (head.category !== 'game' || head.date === null || head.date < MIN_PATCH_DATE) continue;
    parsed.push({
      pageid: page.pageid,
      rawTitle: page.title,
      title: page.title.replace(/^Update:/, ''),
      date: head.date,
      ts: Math.floor(Date.parse(`${head.date}T00:00:00Z`) / 1000),
      mentions: new Set(matchMentions(extractLinkTargets(page.wikitext), nameToId)),
      tags: extractTags(page.title, page.wikitext),
    });
  }

  // Phase 3 — price histories (0.35 -> 0.9): disk-cached, refreshed daily
  const histories = new Map<number, DailyPoint[]>();
  let next = 0;
  let failed = 0;
  async function worker(): Promise<void> {
    while (next < universe.length) {
      const item = universe[next++]!;
      try {
        histories.set(item.id, await getFullHistory(item.id));
      } catch {
        failed++; // one bad item must not kill the build
      }
      setProgress(0.35 + 0.55 * ((histories.size + failed) / Math.max(1, universe.length)));
      await new Promise((r) => setTimeout(r, BUILD_DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, worker));
  if (failed > 0) {
    warnings.push(`${failed} of ${universe.length} items unavailable from the price archive`);
  }

  // Phase 4 — event study per patch (0.9 -> 0.95)
  const details = new Map<number, PatchDetail>();
  const summaries: PatchSummary[] = [];
  const screened = universe.filter((i) => histories.has(i.id));
  for (const patch of parsed) {
    const inputs: PatchItemInput[] = screened.map((i) => ({
      id: i.id,
      name: i.name,
      icon: i.icon,
      series: histories.get(i.id)!,
      mentioned: patch.mentions.has(i.id),
    }));
    const hasVolume = patch.date >= VOLUME_DATA_START;
    const c = computePatch(inputs, patch.ts, hasVolume);
    if (c.universeSize < MIN_UNIVERSE) continue;
    const rankChange = (r: PatchItemRow): number =>
      (c.windowDays === 7 ? r.change7 : r.change1) ?? 0;
    const summary: PatchSummary = {
      pageid: patch.pageid,
      title: patch.title,
      date: patch.date,
      wikiUrl: wikiPageUrl(patch.rawTitle),
      impact: c.impact,
      topWinner: c.winners[0]
        ? { id: c.winners[0].id, name: c.winners[0].name, change: rankChange(c.winners[0]) }
        : null,
      topLoser: c.losers[0]
        ? { id: c.losers[0].id, name: c.losers[0].name, change: rankChange(c.losers[0]) }
        : null,
    };
    summaries.push(summary);
    details.set(patch.pageid, {
      ...summary,
      dataQuality: hasVolume ? 'full' : 'priceOnly',
      tags: patch.tags,
      universeSize: c.universeSize,
      windowDays: c.windowDays,
      winners: c.winners,
      losers: c.losers,
    });
  }
  setProgress(0.95);

  // Phase 5 — upcoming watchlist (0.95 -> 1)
  const keptPatches = parsed.filter((p) => details.has(p.pageid));
  const upcoming = await buildUpcoming(keptPatches, histories, byId, nameToId);

  summaries.sort((a, b) => b.date.localeCompare(a.date));
  state = {
    builtAt: Date.now(),
    summaries: applyOverrides(summaries, PATCH_OVERRIDES),
    details,
    upcoming,
    warnings,
  };
}

async function buildUpcoming(
  patches: ParsedPatch[],
  histories: Map<number, DailyPoint[]>,
  byId: Map<number, ItemSnapshot>,
  nameToId: Map<string, number>,
): Promise<UpcomingFeature[]> {
  const { wikitext } = await getUpcomingWikitext();
  const features: UpcomingFeature[] = [];
  for (const section of splitUpcomingSections(wikitext)) {
    const tags = extractTags(section.title, section.wikitext);
    const items = matchMentions(extractLinkTargets(section.wikitext), nameToId)
      .filter((id) => histories.has(id))
      .map((id) => {
        const snap = byId.get(id)!;
        const price =
          snap.high !== null && snap.low !== null
            ? (snap.high + snap.low) / 2
            : (snap.high ?? snap.low);
        const history = patches
          .filter((p) => p.mentions.has(id))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, MAX_MENTION_HISTORY)
          .map((p) => ({
            pageid: p.pageid,
            title: p.title,
            date: p.date,
            change7: change7After(histories.get(id)!, p.ts),
          }));
        return { id, name: snap.name, icon: snap.icon, price, history };
      });
    if (items.length === 0) continue; // spec: no priced mentions -> omit the feature

    const analogues = pickAnalogues(
      tags,
      patches.map((p) => ({ pageid: p.pageid, title: p.title, date: p.date, tags: p.tags })),
    );
    const pool: number[] = [];
    for (const a of analogues) {
      const patch = patches.find((p) => p.pageid === a.pageid)!;
      for (const id of patch.mentions) {
        const series = histories.get(id);
        if (series === undefined) continue;
        const change = change7After(series, patch.ts);
        if (change !== null) pool.push(change);
      }
    }
    features.push({
      anchor: section.anchor,
      title: section.title,
      tags,
      items,
      analogues,
      evidence: aggregateEvidence(pool),
      note: PATCH_OVERRIDES.upcomingNotes[section.anchor] ?? null,
    });
  }
  return features;
}

function ensureBuild(): void {
  const fresh = state !== null && Date.now() - state.builtAt < REBUILD_MS;
  if (!fresh && buildPromise === null) {
    buildPromise = build()
      .catch(() => {
        // total failure (e.g. upstreams down with a cold disk): retry on a later request
      })
      .finally(() => {
        buildPromise = null;
        building = null;
      });
  }
}

export function getPatches(): PatchesResponse {
  ensureBuild();
  if (building !== null) {
    return {
      status: 'building',
      progress: building.done / building.total,
      builtAt: state === null ? null : Math.floor(state.builtAt / 1000),
      warnings: state?.warnings ?? [],
      patches: state?.summaries ?? [],
    };
  }
  return {
    status: state === null ? 'building' : 'ready',
    progress: state === null ? 0 : 1,
    builtAt: state === null ? null : Math.floor(state.builtAt / 1000),
    warnings: state?.warnings ?? [],
    patches: state?.summaries ?? [],
  };
}

export function getPatchDetail(pageid: number): PatchDetail | null {
  ensureBuild();
  return state?.details.get(pageid) ?? null;
}

export function getUpcoming(): UpcomingResponse {
  ensureBuild();
  return {
    status: state === null ? 'building' : 'ready',
    builtAt: state === null ? null : Math.floor(state.builtAt / 1000),
    features: state?.upcoming ?? [],
  };
}
