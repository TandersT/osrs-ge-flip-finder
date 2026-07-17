# Divergence (category-mismatch deals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A premium `/divergence` page that finds items trading cheap relative to category peers they historically co-move with — pairwise z-scored spreads inside curated groups, with reconvergence evidence and a game-update badge.

**Architecture:** A curated `categories.ts` data file (shared) names ~16 groups of GE items by exact name. A server module `divergence.ts` mirrors the `longterm.ts` build state machine: every 12h it fetches 365-day daily series for all members, computes per-pair weekly-return correlation (eligibility gate), z-scores each eligible pair's log-price spread, scans a year of rolling z for past divergence episodes, aggregates flagged pairs into per-laggard-item deals, and tags deals mentioned in recent game updates (reusing the Patch Impact update-page store). `/api/divergence` serves the state; a React page renders deal cards with an overlay chart and a group-cohesion panel, gated to premium exactly like Patch Impact.

**Tech Stack:** TypeScript npm workspaces (`shared` / `server` / `client`), Fastify, React 18 + TanStack Query, Recharts, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-16-category-divergence-design.md` (approved). The spec is the authority on behaviour; this plan is the authority on code layout.

## Global Constraints

- **Naming everywhere:** page **Divergence**, route `/divergence`, endpoint `GET /api/divergence`, module `server/src/divergence.ts`. Never "pairs page" or "categories page" in user-facing copy.
- **Detection constants** (named `const`s at the top of `server/src/divergence.ts`, values verbatim): `MIN_OVERLAP_DAYS = 180`, `MIN_WEEKLY_R = 0.4`, `VOLUME_FLOOR = 2_000`, `ENTRY_Z = 2`, `EXIT_Z = 0.5`, `SPREAD_WINDOW = 90`, `EPISODE_CLOSE_DAYS = 30`, `SERIES_WINDOW = 90`, `PATCH_WINDOW_DAYS = 21`, `REBUILD_MS = 12 * 60 * 60 * 1000`, `BUILD_CONCURRENCY = 4`, `BUILD_DELAY_MS = 50`.
- **Build politeness:** timeseries fetches only through the existing `getTimeseries` (TTL-cached), through a worker pool of `BUILD_CONCURRENCY` with `BUILD_DELAY_MS` pauses — copy the `longterm.ts` idiom exactly.
- **No new npm dependencies.** No URL-state params on the new page. Premium enforcement is client-side only (matches Patch Impact; payments don't exist yet).
- **Honest copy:** the page must state that a spread can close from either side, and deals are evidence, not advice.
- **Repo conventions:** tests colocated (`foo.test.ts` next to `foo.ts`); imports inside `shared/` use `./x.js` suffixes; server/client import shared as `@osrs-flip/shared`; Tailwind dark-theme tokens (`bg-panel`, `border-panel-border`, `text-gold`, `text-parchment`, `text-osrs-green`, `text-osrs-red`, `bg-panel-light`, `text-ink`); conventional commit messages (`feat(server): …`).
- **Verification commands:** `npm test -w shared`, `npm test -w server`, `npm test -w client`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run e2e` — all from the repo root.

## Before You Start (execution setup)

1. Work in a **fresh worktree/branch off `main`** (the user creates worktrees via their manager — ask if one isn't provided). The spec + this plan were committed on `sta/flags-all-lists-margin`; **cherry-pick those docs commits** onto your branch (or copy the two files in as a first `docs:` commit) so the spec travels with the work.
2. `npm install`, then `npm run build -w shared` once so server/client resolve `@osrs-flip/shared`.
3. After any `shared/src` change in a later task, re-run `npm run build -w shared` before running server/client checks.

---

### Task 1: `pearson` + `median` stats helpers (shared)

**Files:**
- Modify: `shared/src/stats.ts`
- Test: `shared/src/stats.test.ts`

**Interfaces:**
- Consumes: existing `mean`, `stdDev` in `shared/src/stats.ts`.
- Produces: `pearson(xs: number[], ys: number[]): number | null` and `median(values: number[]): number | null`, exported from `@osrs-flip/shared` (index already re-exports `./stats.js`). Tasks 3–4 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('stats helpers', …)` block in `shared/src/stats.test.ts` (extend the existing import line with `median, pearson`):

```ts
  it('pearson finds perfect, inverse, and partial correlation', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
    // hand-computed: num=10, dx=10, dy=14.8 → 10/√148
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 6])).toBeCloseTo(0.822, 3);
  });

  it('pearson guards short and flat input', () => {
    expect(pearson([1, 2], [1, 2])).toBeNull(); // under 3 pairs
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull(); // zero variance
    expect(pearson([7, 7, 7], [1, 2, 3])).toBeNull();
  });

  it('median takes the middle (or average of the two middles)', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w shared`
Expected: FAIL — `pearson is not defined` (and `median`).

- [ ] **Step 3: Implement**

Append to `shared/src/stats.ts`:

```ts
/**
 * Pearson correlation of paired samples (extra tail of the longer array is
 * ignored). Null under 3 pairs or when either side has zero variance.
 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n))!;
  const my = mean(ys.slice(0, n))!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = (xs[i] as number) - mx;
    const b = (ys[i] as number) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Middle value (average of the two middles for even length); null on empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w shared`
Expected: PASS (all stats tests green).

- [ ] **Step 5: Commit**

```bash
git add shared/src/stats.ts shared/src/stats.test.ts
git commit -m "feat(shared): pearson + median stats helpers"
```

---

### Task 2: Divergence types + curated categories (shared)

**Files:**
- Create: `shared/src/divergenceTypes.ts`
- Create: `shared/src/categories.ts`
- Create: `shared/src/categories.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 4–9 and e2e): `ItemCategory { id: string; label: string; members: string[] }`, `ITEM_CATEGORIES: ItemCategory[]`, and the API types `PairSignal`, `DivergenceDeal`, `DivergenceGroupMember`, `DivergenceGroup`, `DivergenceResponse` exactly as written below.

- [ ] **Step 1: Write the failing test**

Create `shared/src/categories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ITEM_CATEGORIES } from './categories.js';

describe('curated item categories', () => {
  it('group ids are unique', () => {
    const ids = ITEM_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every group has at least 2 members (a pair needs two legs)', () => {
    for (const c of ITEM_CATEGORIES) {
      expect(c.members.length, c.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('no item appears twice (within or across groups)', () => {
    const all = ITEM_CATEGORIES.flatMap((c) => c.members.map((m) => m.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL — cannot resolve `./categories.js`.

- [ ] **Step 3: Create the data + types**

Create `shared/src/categories.ts`:

```ts
/**
 * Curated item categories for the Divergence screener. Members are EXACT GE
 * item names (the methods.ts convention), resolved against the live mapping
 * at build time — an unresolved name shows up as `missing` in the groups
 * panel, never silently. Semantic grouping is only a candidate prior: pairs
 * must additionally prove historical co-movement before they may signal.
 * Data only — tune groups freely without touching code.
 */
export interface ItemCategory {
  id: string;
  label: string;
  members: string[];
}

export const ITEM_CATEGORIES: ItemCategory[] = [
  {
    id: 'food-high-heal',
    label: 'High-heal food',
    members: ['Shark', 'Sea turtle', 'Manta ray', 'Anglerfish', 'Dark crab', 'Monkfish', 'Cooked karambwan'],
  },
  {
    id: 'raw-fish',
    label: 'Raw fish',
    members: ['Raw shark', 'Raw sea turtle', 'Raw manta ray', 'Raw anglerfish', 'Raw dark crab', 'Raw monkfish', 'Raw karambwan'],
  },
  {
    id: 'logs',
    label: 'Logs',
    members: ['Oak logs', 'Willow logs', 'Maple logs', 'Yew logs', 'Magic logs', 'Redwood logs'],
  },
  {
    id: 'planks',
    label: 'Planks',
    members: ['Plank', 'Oak plank', 'Teak plank', 'Mahogany plank'],
  },
  {
    id: 'ores',
    label: 'Ores',
    members: ['Iron ore', 'Coal', 'Mithril ore', 'Adamantite ore', 'Runite ore'],
  },
  {
    id: 'bars',
    label: 'Metal bars',
    members: ['Iron bar', 'Steel bar', 'Mithril bar', 'Adamantite bar', 'Runite bar'],
  },
  {
    id: 'runes-elemental',
    label: 'Elemental runes',
    members: ['Air rune', 'Water rune', 'Earth rune', 'Fire rune'],
  },
  {
    id: 'runes-catalytic',
    label: 'Catalytic runes',
    members: ['Nature rune', 'Law rune', 'Death rune', 'Blood rune', 'Chaos rune', 'Cosmic rune', 'Astral rune', 'Wrath rune'],
  },
  {
    id: 'herbs-clean',
    label: 'Clean herbs',
    members: ['Ranarr weed', 'Toadflax', 'Irit leaf', 'Avantoe', 'Kwuarm', 'Snapdragon', 'Cadantine', 'Lantadyme', 'Dwarf weed', 'Torstol'],
  },
  {
    id: 'potions-restore',
    label: 'Restore potions',
    members: ['Prayer potion(4)', 'Super restore(4)', 'Saradomin brew(4)'],
  },
  {
    id: 'dragonhide',
    label: 'Dragonhide',
    members: ['Green dragonhide', 'Blue dragonhide', 'Red dragonhide', 'Black dragonhide'],
  },
  {
    id: 'bones-high',
    label: 'High-tier bones',
    members: ['Dragon bones', 'Superior dragon bones', 'Wyvern bones', 'Lava dragon bones'],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    members: ['Adamant arrow', 'Rune arrow', 'Amethyst arrow', 'Dragon arrow'],
  },
  {
    id: 'chinchompas',
    label: 'Chinchompas',
    members: ['Chinchompa', 'Red chinchompa', 'Black chinchompa'],
  },
  {
    id: 'gems-uncut',
    label: 'Uncut gems',
    members: ['Uncut sapphire', 'Uncut emerald', 'Uncut ruby', 'Uncut diamond', 'Uncut dragonstone'],
  },
];
```

Create `shared/src/divergenceTypes.ts`:

```ts
/** Payload types for /api/divergence — see the Divergence design spec. */

export interface PairSignal {
  peerId: number;
  peerName: string;
  /** Current spread z-score from the laggard's perspective (always negative). */
  z: number;
  /** Weekly log-return Pearson r that qualified the pair. */
  weeklyR: number;
  /**
   * Past divergence episodes of this pair (|z| >= 2 entered, |z| <= 0.5 closed)
   * over the trailing year; the currently-open episode is excluded.
   */
  episodes: { count: number; closedWithin30d: number; medianDays: number | null };
  /** Present only on the deal's worst pair; both legs normalized to window start. */
  series90?: { t: number; item: number; peer: number }[];
}

export interface DivergenceDeal {
  itemId: number;
  name: string;
  icon: string | null;
  groupId: string;
  groupLabel: string;
  /** Eligible pairs where this item is currently the flagged laggard. */
  laggingPairs: number;
  /** All eligible pairs this item participates in. */
  eligiblePairs: number;
  /** 30-day fractional change: this item vs the median of its eligible peers. */
  headline: { item30d: number | null; peersMedian30d: number | null };
  /** Flagged pairs where this item is the laggard, worst (most negative z) first. */
  pairs: PairSignal[];
  /** Competitive offer prices + post-tax margin from the live snapshot. */
  buy: number | null;
  sell: number | null;
  margin: number | null;
  /** Recent game update linking this item or a flagged peer — may not reconverge. */
  patch?: { title: string; url: string; date: string };
}

export interface DivergenceGroupMember {
  itemId: number | null;
  name: string;
  icon: string | null;
  /** Participates in at least one eligible pair. */
  eligible: boolean;
  /** Mean weekly-return correlation across this member's computed pairs. */
  avgR: number | null;
  /** Name didn't resolve in the mapping, or its timeseries fetch failed. */
  missing: boolean;
}

export interface DivergenceGroup {
  id: string;
  label: string;
  eligiblePairs: number;
  members: DivergenceGroupMember[];
}

export interface DivergenceResponse {
  /** Unix seconds of the last completed build; null while the first build runs. */
  builtAt: number | null;
  building?: { total: number; done: number };
  deals: DivergenceDeal[];
  groups: DivergenceGroup[];
  coverage: { itemsRequested: number; itemsWithSeries: number };
}
```

Add to `shared/src/index.ts` (after the `./patchTypes.js` line):

```ts
export * from './categories.js';
export * from './divergenceTypes.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w shared`
Expected: PASS.

- [ ] **Step 5: Rebuild shared, typecheck**

Run: `npm run build -w shared` then `npm run typecheck`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add shared/src/divergenceTypes.ts shared/src/categories.ts shared/src/categories.test.ts shared/src/index.ts
git commit -m "feat(shared): divergence API types + curated item categories"
```

---

### Task 3: Series helpers — mids, weekly returns, spread z, episodes (server)

**Files:**
- Create: `server/src/divergence.ts`
- Create: `server/src/divergence.test.ts`

**Interfaces:**
- Consumes: `TimeseriesPoint`, `mean`, `median`, `pearson`, `zScore` from `@osrs-flip/shared`.
- Produces (used by Task 4 in the same file):
  - `DayPoint { t: number; mid: number }`
  - `dailyMids(series: TimeseriesPoint[]): DayPoint[]`
  - `alignPair(a: DayPoint[], b: DayPoint[]): { t: number; a: number; b: number }[]`
  - `weeklyLogReturns(values: number[]): number[]`
  - `spreadZSeries(aligned: { t: number; a: number; b: number }[], window: number): (number | null)[]`
  - `EpisodeStats { count: number; closedWithin30d: number; medianDays: number | null }`
  - `scanEpisodes(z: (number | null)[], entryZ: number, exitZ: number, closeDays: number): EpisodeStats`

- [ ] **Step 1: Write the failing tests**

Create `server/src/divergence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TimeseriesPoint } from '@osrs-flip/shared';
import { alignPair, dailyMids, scanEpisodes, spreadZSeries, weeklyLogReturns } from './divergence.js';

const DAY = 86_400;
const T0 = 1_700_000_000;

/** Synthetic daily series: price(i) drives both sides of the day's mid. */
export function mkSeries(days: number, price: (i: number) => number): TimeseriesPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    timestamp: T0 + i * DAY,
    avgHighPrice: Math.round(price(i) * 101) / 100,
    avgLowPrice: Math.round(price(i) * 99) / 100,
    highPriceVolume: 500,
    lowPriceVolume: 500,
  }));
}

describe('dailyMids', () => {
  it('averages high/low, falls back to the present side, drops empty days', () => {
    const pts: TimeseriesPoint[] = [
      { timestamp: 1, avgHighPrice: 110, avgLowPrice: 90, highPriceVolume: 1, lowPriceVolume: 1 },
      { timestamp: 2, avgHighPrice: null, avgLowPrice: 80, highPriceVolume: 0, lowPriceVolume: 1 },
      { timestamp: 3, avgHighPrice: null, avgLowPrice: null, highPriceVolume: 0, lowPriceVolume: 0 },
    ];
    expect(dailyMids(pts)).toEqual([
      { t: 1, mid: 100 },
      { t: 2, mid: 80 },
    ]);
  });
});

describe('alignPair', () => {
  it('joins on timestamp and skips days either side is missing', () => {
    const a = [
      { t: 1, mid: 10 },
      { t: 2, mid: 11 },
      { t: 4, mid: 12 },
    ];
    const b = [
      { t: 2, mid: 20 },
      { t: 3, mid: 21 },
      { t: 4, mid: 22 },
    ];
    expect(alignPair(a, b)).toEqual([
      { t: 2, a: 11, b: 20 },
      { t: 4, a: 12, b: 22 },
    ]);
  });
});

describe('weeklyLogReturns', () => {
  it('takes non-overlapping 7-step log returns, newest-aligned', () => {
    // 15 values 100..114: two full windows fit, anchored at the newest value
    const values = Array.from({ length: 15 }, (_, i) => 100 + i);
    const rs = weeklyLogReturns(values);
    expect(rs).toHaveLength(2);
    expect(rs[1]).toBeCloseTo(Math.log(114 / 107), 9);
    expect(rs[0]).toBeCloseTo(Math.log(107 / 100), 9);
  });

  it('returns empty when under 8 values', () => {
    expect(weeklyLogReturns([1, 2, 3, 4, 5, 6, 7])).toEqual([]);
  });
});

describe('spreadZSeries', () => {
  it('is null until the window fills, then z-scores the log spread', () => {
    // flat ratio for 10 days, then a jump: z must spike positive at the end
    const aligned = Array.from({ length: 11 }, (_, i) => ({
      t: i,
      a: i === 10 ? 150 : 100 + (i % 2), // tiny wobble so variance is nonzero
      b: 100,
    }));
    const z = spreadZSeries(aligned, 10);
    expect(z.slice(0, 9).every((v) => v === null)).toBe(true);
    expect(z[9]).not.toBeNull();
    expect(z[10]!).toBeGreaterThan(2);
  });
});

describe('scanEpisodes', () => {
  it('counts entry->close cycles and their durations', () => {
    const z = [0, 0.3, 2.4, 2.1, 1.4, 0.4, 0.1, -2.2, -1.0, -0.3, 0];
    // episode 1: idx2 -> closes idx5 (3 days); episode 2: idx7 -> closes idx9 (2 days)
    const stats = scanEpisodes(z, 2, 0.5, 30);
    expect(stats).toEqual({ count: 2, closedWithin30d: 2, medianDays: 2.5 });
  });

  it('drops the live episode still open at the end, keeps slow closers in count only', () => {
    const slow = Array.from({ length: 40 }, (_, i) => (i === 0 ? 2.5 : 1.5));
    slow.push(0.4); // closes after 40 days: counted, but not within 30
    const live = [...slow, 0, 2.6, 2.4]; // reopens at the end: live, dropped
    const stats = scanEpisodes(live, 2, 0.5, 30);
    expect(stats.count).toBe(1);
    expect(stats.closedWithin30d).toBe(0);
    expect(stats.medianDays).toBe(40);
  });

  it('skips null gaps without breaking state', () => {
    const z = [null, null, 2.5, null, 2.2, 0.2];
    expect(scanEpisodes(z, 2, 0.5, 30).count).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w server`
Expected: FAIL — cannot resolve `./divergence.js`.

- [ ] **Step 3: Implement the helpers**

Create `server/src/divergence.ts`:

```ts
import type { TimeseriesPoint } from '@osrs-flip/shared';
import { median, zScore } from '@osrs-flip/shared';

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
```

(The constants beyond `SPREAD_WINDOW` are unused until Tasks 4–6 — that's fine; `noUnusedLocals` applies to locals, not module consts. If the server tsconfig complains anyway, add the remaining constants in the task that uses them instead.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/divergence.ts server/src/divergence.test.ts
git commit -m "feat(server): divergence series helpers (mids, weekly returns, spread z, episodes)"
```

---

### Task 4: `computePair` + `computeDivergence` — pairs, deals, groups panel (server)

**Files:**
- Modify: `server/src/divergence.ts`
- Test: `server/src/divergence.test.ts`

**Interfaces:**
- Consumes: Task 3 helpers; `ItemCategory`, `ItemSnapshot`, `TimeseriesPoint`, `DivergenceDeal`, `DivergenceGroup`, `PairSignal`, `computeFlip`, `mean`, `median`, `pctChange`, `pearson` from `@osrs-flip/shared`.
- Produces (used by Task 6's build and Task 5's badges):
  - `PairComputation { weeklyR: number | null; eligible: boolean; z: number | null; episodes: EpisodeStats; aligned: { t: number; a: number; b: number }[] }`
  - `computePair(a: DayPoint[], b: DayPoint[]): PairComputation`
  - `computeDivergence(categories: ItemCategory[], items: ItemSnapshot[], seriesById: Map<number, TimeseriesPoint[]>, flipCfg: { captureRate: number; offerOffset: number }): { deals: DivergenceDeal[]; groups: DivergenceGroup[] }`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/divergence.test.ts` (extend the import line with `computeDivergence, computePair`; add shared imports):

```ts
import type { ItemCategory, ItemSnapshot } from '@osrs-flip/shared';

/** Minimal live snapshot for tests; override what a case cares about. */
function mkItem(id: number, name: string, over: Partial<ItemSnapshot> = {}): ItemSnapshot {
  return {
    id,
    name,
    icon: `${name}.png`,
    members: true,
    limit: 10_000,
    value: null,
    highalch: null,
    high: 1_050,
    highTime: T0,
    low: 1_000,
    lowTime: T0,
    avgHighPrice1h: null,
    avgLowPrice1h: null,
    volume1h: 0,
    dailyVolume: 50_000,
    taxExempt: false,
    ...over,
  };
}

/** Shared market wave both legs of a healthy pair follow. */
const wave = (i: number) => 1_000 + 150 * Math.sin(i / 9);
/** Small independent wobble so pair spreads have nonzero variance. */
const wobble = (i: number) => 1 + 0.01 * Math.sin(i / 5);

describe('computePair', () => {
  it('qualifies co-moving pairs and reports no signal when the spread is normal', () => {
    const a = dailyMids(mkSeries(365, wave));
    const b = dailyMids(mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i)));
    const pair = computePair(a, b);
    expect(pair.eligible).toBe(true);
    expect(pair.weeklyR!).toBeGreaterThan(0.4);
    expect(Math.abs(pair.z!)).toBeLessThan(2);
  });

  it('rejects pairs with insufficient overlap or low correlation', () => {
    const short = dailyMids(mkSeries(100, wave));
    expect(computePair(short, short).eligible).toBe(false);
    const a = dailyMids(mkSeries(365, wave));
    const noise = dailyMids(mkSeries(365, (i) => 1_000 + 300 * Math.sin(i / 2.3 + 1)));
    const pair = computePair(a, noise);
    expect(pair.eligible).toBe(false);
    expect(pair.z).toBeNull();
  });

  it('flags a leg that breaks away downward', () => {
    const a = dailyMids(mkSeries(365, wave));
    const drop = (i: number) =>
      wave(i) * wobble(i) * (i >= 350 ? 1 - 0.015 * (i - 350) : 1);
    const pair = computePair(dailyMids(mkSeries(365, drop)), a);
    expect(pair.eligible).toBe(true);
    expect(pair.z!).toBeLessThanOrEqual(-2); // a-leg (the dropper) is cheap
  });
});

describe('computeDivergence', () => {
  const CATS: ItemCategory[] = [
    { id: 'test-fish', label: 'Test fish', members: ['Alpha fish', 'Beta fish', 'Gamma fish'] },
  ];
  const alpha = mkItem(1, 'Alpha fish');
  const beta = mkItem(2, 'Beta fish');
  const gamma = mkItem(3, 'Gamma fish');
  const flipCfg = { captureRate: 0.1, offerOffset: 1 };

  function series(drop: boolean) {
    const gammaPrice = (i: number) =>
      (wave(i) * 0.8 + 200) * wobble(i) * (drop && i >= 350 ? 1 - 0.015 * (i - 350) : 1);
    return new Map([
      [1, mkSeries(365, wave)],
      [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
      [3, mkSeries(365, gammaPrice)],
    ]);
  }

  it('aggregates flagged pairs into a laggard deal with evidence', () => {
    const { deals, groups } = computeDivergence(CATS, [alpha, beta, gamma], series(true), flipCfg);
    expect(deals).toHaveLength(1);
    const deal = deals[0]!;
    expect(deal.itemId).toBe(3);
    expect(deal.groupId).toBe('test-fish');
    expect(deal.laggingPairs).toBeGreaterThanOrEqual(1);
    expect(deal.eligiblePairs).toBe(2);
    expect(deal.pairs[0]!.z).toBeLessThanOrEqual(-2);
    expect(deal.pairs[0]!.series90).toHaveLength(90);
    expect(deal.pairs[0]!.series90![0]!.item).toBeCloseTo(1, 6); // normalized to window start
    expect(deal.headline.item30d!).toBeLessThan(deal.headline.peersMedian30d!);
    expect(deal.buy).toBe(1_001); // low + offerOffset
    expect(deal.sell).toBe(1_049); // high - offerOffset
    expect(deal.margin).not.toBeNull();
    // groups panel reflects the same build
    expect(groups).toHaveLength(1);
    expect(groups[0]!.eligiblePairs).toBeGreaterThanOrEqual(2);
    expect(groups[0]!.members.every((m) => !m.missing)).toBe(true);
  });

  it('returns no deals when everything tracks', () => {
    const { deals } = computeDivergence(CATS, [alpha, beta, gamma], series(false), flipCfg);
    expect(deals).toHaveLength(0);
  });

  it('enforces the volume floor', () => {
    const thinGamma = mkItem(3, 'Gamma fish', { dailyVolume: 500 });
    const { deals, groups } = computeDivergence(CATS, [alpha, beta, thinGamma], series(true), flipCfg);
    expect(deals).toHaveLength(0);
    const member = groups[0]!.members.find((m) => m.name === 'Gamma fish')!;
    expect(member.eligible).toBe(false);
    expect(member.missing).toBe(false);
  });

  it('marks unresolved names and missing series as missing', () => {
    const { deals, groups } = computeDivergence(
      CATS,
      [alpha, beta], // gamma not in the mapping at all
      new Map([
        [1, mkSeries(365, wave)],
        [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
      ]),
      flipCfg,
    );
    expect(deals).toHaveLength(0); // remaining pair tracks fine
    const member = groups[0]!.members.find((m) => m.name === 'Gamma fish')!;
    expect(member.missing).toBe(true);
    expect(member.itemId).toBeNull();
  });

  it('flags the quiet item when a peer soars (the shark-vs-turtle case)', () => {
    const soar = new Map([
      [1, mkSeries(365, (i) => wave(i) * wobble(i))],
      [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
      [3, mkSeries(365, (i) => (wave(i) * 0.8 + 200) * wobble(i / 3 + 1) * (i >= 350 ? 1 + 0.015 * (i - 350) : 1))],
    ]);
    const { deals } = computeDivergence(CATS, [alpha, beta, gamma], soar, flipCfg);
    // gamma soared: the deal (if the gate passes) must be a QUIET item, never gamma
    for (const d of deals) expect(d.itemId).not.toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w server`
Expected: FAIL — `computePair is not exported` (Task 3 tests still pass).

- [ ] **Step 3: Implement**

Append to `server/src/divergence.ts` (extend the shared import line to `import { computeFlip, mean, median, pctChange, pearson, zScore } from '@osrs-flip/shared';` and add the type imports `ItemCategory, ItemSnapshot, DivergenceDeal, DivergenceGroup, DivergenceGroupMember, PairSignal`):

```ts
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

    const pairs: { a: (typeof usable)[number]; b: (typeof usable)[number]; comp: PairComputation }[] = [];
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        pairs.push({ a: usable[i]!, b: usable[j]!, comp: computePair(usable[i]!.mids, usable[j]!.mids) });
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
    const flaggedBy = new Map<string, { peer: (typeof usable)[number]; comp: PairComputation; laggardIsA: boolean }[]>();
    for (const p of pairs) {
      if (!p.comp.eligible || p.comp.z === null || Math.abs(p.comp.z) < ENTRY_Z) continue;
      const laggardIsA = p.comp.z < 0; // spread ln(a)-ln(b) low ⇒ a is the cheap leg
      const laggard = laggardIsA ? p.a : p.b;
      const peer = laggardIsA ? p.b : p.a;
      flaggedBy.set(laggard.name, [...(flaggedBy.get(laggard.name) ?? []), { peer, comp: p.comp, laggardIsA }]);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w server`
Expected: PASS. If the soar-case or drop-case fixture doesn't cross the z threshold, tune the fixture (drop rate `0.015`/day for 15 days ≈ −22%), not the engine constants.

- [ ] **Step 5: Commit**

```bash
git add server/src/divergence.ts server/src/divergence.test.ts
git commit -m "feat(server): pairwise divergence computation + laggard deal aggregation"
```

---

### Task 5: Patch badges — linked-item mentions in recent game updates (server)

**Files:**
- Modify: `server/src/updateParse.ts` (add `wikiPageUrl`)
- Modify: `server/src/updateParse.test.ts`
- Modify: `server/src/patches.ts` (import `wikiPageUrl` instead of its local copy)
- Modify: `server/src/divergence.ts`
- Test: `server/src/divergence.test.ts`

**Interfaces:**
- Consumes: `listUpdatePages`, `getUpdatePages`, `StoredUpdatePage` from `./updates.js`; `extractLinkTargets`, `matchMentions`, `parseUpdateTemplate` from `./updateParse.js`.
- Produces (used by Task 6):
  - `wikiPageUrl(rawTitle: string): string` (moves to `updateParse.ts`)
  - `RecentUpdate { title: string; date: string; url: string; mentions: Set<number> }`
  - `parseRecentUpdates(pages: StoredUpdatePage[], nameToId: Map<string, number>, sinceIso: string): RecentUpdate[]` (pure)
  - `attachPatchBadges(deals: DivergenceDeal[], updates: RecentUpdate[]): DivergenceDeal[]` (pure)
  - `fetchRecentUpdates(nameToId: Map<string, number>): Promise<RecentUpdate[]>` (IO wrapper)

- [ ] **Step 1: Write the failing tests**

Append to `server/src/updateParse.test.ts` (in its existing top-level `describe`, matching its import style):

```ts
  it('wikiPageUrl underscores and escapes the raw title', () => {
    expect(wikiPageUrl('Update:The Blood Moon Rises')).toBe(
      'https://oldschool.runescape.wiki/w/Update%3AThe_Blood_Moon_Rises',
    );
  });
```

Append to `server/src/divergence.test.ts` (extend imports with `attachPatchBadges, parseRecentUpdates`; import type `DivergenceDeal` from `@osrs-flip/shared`):

```ts
describe('patch badges', () => {
  const nameToId = new Map([
    ['shark', 385],
    ['sea turtle', 397],
  ]);
  const page = (pageid: number, title: string, date: string, body: string) => ({
    pageid,
    title,
    wikitext: `{{Update|date=${date}|type=game}}\n${body}`,
    // parseUpdateTemplate reads date via parseWikiDate("12 July 2026") — use that format
  });

  it('keeps only recent game updates and resolves linked items', () => {
    const updates = parseRecentUpdates(
      [
        page(1, 'Update:Fishing Rework', '12 July 2026', 'The [[Shark]] spawn rate changed.'),
        page(2, 'Update:Ancient News', '1 January 2020', '[[Shark]] nerf of old.'),
        page(3, 'Update:No Items Here', '13 July 2026', 'Only [[Sailing]] things.'),
      ],
      nameToId,
      '2026-07-01',
    );
    expect(updates).toHaveLength(2);
    const fishing = updates.find((u) => u.title === 'Fishing Rework')!;
    expect(fishing.date).toBe('2026-07-12');
    expect(fishing.url).toContain('Fishing_Rework');
    expect([...fishing.mentions]).toEqual([385]);
  });

  it('badges deals whose laggard or flagged peer is mentioned, newest update first', () => {
    const deal = (itemId: number, peerId: number): DivergenceDeal => ({
      itemId,
      name: `item-${itemId}`,
      icon: null,
      groupId: 'g',
      groupLabel: 'G',
      laggingPairs: 1,
      eligiblePairs: 1,
      headline: { item30d: -0.1, peersMedian30d: 0.05 },
      pairs: [
        {
          peerId,
          peerName: `item-${peerId}`,
          z: -2.5,
          weeklyR: 0.8,
          episodes: { count: 0, closedWithin30d: 0, medianDays: null },
        },
      ],
      buy: null,
      sell: null,
      margin: null,
    });
    const updates = [
      { title: 'Old', date: '2026-07-02', url: 'u1', mentions: new Set([397]) },
      { title: 'New', date: '2026-07-12', url: 'u2', mentions: new Set([397]) },
    ];
    const [laggardHit, peerHit, noHit] = attachPatchBadges(
      [deal(397, 385), deal(1, 397), deal(1, 2)],
      updates,
    );
    expect(laggardHit!.patch?.title).toBe('New'); // newest wins
    expect(peerHit!.patch?.title).toBe('New'); // peer mention badges too
    expect(noHit!.patch).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w server`
Expected: FAIL — `wikiPageUrl` / `parseRecentUpdates` / `attachPatchBadges` not exported.

- [ ] **Step 3: Implement**

In `server/src/updateParse.ts`, add (it's the pure-parsing home; no IO):

```ts
/** Public wiki URL for a raw page title (spaces become underscores). */
export function wikiPageUrl(rawTitle: string): string {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(rawTitle.replace(/ /g, '_'))}`;
}
```

In `server/src/patches.ts`: delete its local `wikiPageUrl` function and add `wikiPageUrl` to the existing `./updateParse.js` import list. No behaviour change.

In `server/src/divergence.ts`, add imports `import { extractLinkTargets, matchMentions, parseUpdateTemplate, wikiPageUrl } from './updateParse.js';` and `import { getUpdatePages, listUpdatePages, type StoredUpdatePage } from './updates.js';`, then append:

```ts
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
export function attachPatchBadges(deals: DivergenceDeal[], updates: RecentUpdate[]): DivergenceDeal[] {
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
```

Check the exact `{{Update|...}}` category key against `parseUpdateTemplate` in `server/src/updateParse.ts` while implementing — the test fixture above assumes `type=game` parses to `category === 'game'`; mirror whatever `patches.ts` filters on (`head.category !== 'game'`) and whatever fixture format `updateParse.test.ts` already uses. Adjust the fixture's template line to match the real parser, not the other way round.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w server`
Expected: PASS, including all pre-existing `updateParse` and `patches` tests (the `wikiPageUrl` move must not change any URL in `patches.test.ts` fixtures).

- [ ] **Step 5: Commit**

```bash
git add server/src/updateParse.ts server/src/updateParse.test.ts server/src/patches.ts server/src/divergence.ts server/src/divergence.test.ts
git commit -m "feat(server): patch badges for divergence deals (linked-item mentions)"
```

---

### Task 6: Build state machine + `GET /api/divergence`

**Files:**
- Modify: `server/src/divergence.ts`
- Modify: `server/src/routes.ts`

**Interfaces:**
- Consumes: `getItems` from `./items.js`, `getTimeseries` from `./wiki.js`, `config` from `./config.js`, `ITEM_CATEGORIES` + `DivergenceResponse` from `@osrs-flip/shared`, and everything from Tasks 4–5.
- Produces: `getDivergence(): DivergenceResponse` and the route `GET /api/divergence`. The client (Task 8) and e2e (Task 11) rely on the exact `DivergenceResponse` shape from Task 2.

- [ ] **Step 1: Implement the build + accessor**

(No unit test for the IO shell — the pure heart is already covered; the live smoke in this task and Task 12 exercises the shell. This matches `longterm.ts`, which has tests for `computeLongtermRow` only.)

Add imports to `server/src/divergence.ts`: `import { ITEM_CATEGORIES } from '@osrs-flip/shared';` (merge into the existing shared import), `import type { DivergenceDeal, DivergenceGroup, DivergenceResponse, ...existing } from '@osrs-flip/shared';`, `import { config } from './config.js';`, `import { getItems } from './items.js';`, `import { getTimeseries } from './wiki.js';`. Append:

```ts
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

  let { deals, groups } = computeDivergence(ITEM_CATEGORIES, items, seriesById, {
    captureRate: config.captureRate,
    offerOffset: config.offerOffset,
  });
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
```

(`TimeseriesPoint` must be in the type-import list from `@osrs-flip/shared` — Task 3 already imports it.)

- [ ] **Step 2: Register the route**

In `server/src/routes.ts`, add `import { getDivergence } from './divergence.js';` and, directly under the `/api/longterm` route:

```ts
  app.get('/api/divergence', async () => getDivergence());
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `npm run typecheck` then `npm test -w server`
Expected: both clean.

- [ ] **Step 4: Live smoke against the real wiki**

```bash
npm run build
PORT=3400 node server/dist/index.js &
sleep 2
curl -s localhost:3400/api/divergence | head -c 400
```

Expected: JSON with `"builtAt":null` and a `building` progress object. Poll until built (~60–90s of ~80 series fetches; the first ever run also backfills the update-page disk cache, which can add a couple of minutes):

```bash
sleep 90
curl -s localhost:3400/api/divergence | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log({builtAt:r.builtAt,deals:r.deals.length,groups:r.groups.length,coverage:r.coverage,eligibleTotal:r.groups.reduce((a,g)=>a+g.eligiblePairs,0)})})"
kill %1
```

Expected: `builtAt` set, `groups: 15`, `coverage.itemsWithSeries` equal (or near) `itemsRequested`, `eligibleTotal > 0`. `deals` may legitimately be 0 — most days everything tracks. Paste the actual output into the task summary. If `eligibleTotal` is 0 across ALL groups, the gate is mistuned or a helper is broken — investigate before proceeding (check a few `avgR` values in the payload; herbs/logs/runes normally co-move).

- [ ] **Step 5: Commit**

```bash
git add server/src/divergence.ts server/src/routes.ts
git commit -m "feat(server): divergence build state machine + /api/divergence"
```

---

### Task 7: `divergence` entitlement + premium page row

**Files:**
- Modify: `shared/src/tiers.ts`
- Modify: `shared/src/tiers.test.ts`
- Modify: `client/src/pages/PremiumPage.tsx`

**Interfaces:**
- Consumes: existing `Entitlements` / `ENTITLEMENTS`.
- Produces: `Entitlements.divergence: boolean` (free `false`, premium `true`). Task 8's gate reads `entitlements.divergence`.

- [ ] **Step 1: Write the failing test**

Append to `shared/src/tiers.test.ts` inside the `describe`:

```ts
  it('gates the divergence screener to premium only', () => {
    expect(getEntitlements('free').divergence).toBe(false);
    expect(getEntitlements('premium').divergence).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL — `divergence` undefined (the superset test also fails the moment the key exists on only one tier, which guards typos).

- [ ] **Step 3: Implement**

In `shared/src/tiers.ts`: add to the `Entitlements` interface (after `patchAnalysis`):

```ts
  /** Divergence: category-mismatch laggard deals (/divergence). */
  divergence: boolean;
```

Add `divergence: false,` to `ENTITLEMENTS.free` and `divergence: true,` to `ENTITLEMENTS.premium`.

In `client/src/pages/PremiumPage.tsx`, append to the `FEATURES` array:

```ts
  { label: 'Divergence screener (category-mismatch deals)', free: '—', premium: '✓' },
```

- [ ] **Step 4: Run tests, rebuild shared, typecheck**

Run: `npm test -w shared` then `npm run build -w shared` then `npm run typecheck`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add shared/src/tiers.ts shared/src/tiers.test.ts client/src/pages/PremiumPage.tsx
git commit -m "feat(shared): divergence entitlement (premium) + premium page row"
```

---

### Task 8: Divergence page — locked state, deal cards, route, nav (client)

**Files:**
- Create: `client/src/pages/DivergencePage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `DivergenceResponse`, `DivergenceDeal` from `@osrs-flip/shared`; `useTier`, `Pct` (exported by `PatchesPage.tsx`), `CopyValue`, `GpText`, `Icon`, `ItemIcon`, `TableSkeleton`, `UnlockStrip`.
- Produces: default export `DivergencePage`; route `/divergence`; nav tab "Divergence". Task 9 fills the `DealDetail` placeholder and `GroupsPanel`; Task 11 asserts this page's copy, so keep the quoted strings verbatim.

(Pages in this repo have no unit tests — they're covered by e2e in Task 11. Verification here is typecheck + lint + a manual dev-server look.)

- [ ] **Step 1: Create the page**

Create `client/src/pages/DivergencePage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DivergenceDeal, DivergenceResponse } from '@osrs-flip/shared';
import { CopyValue } from '../components/CopyValue';
import { GpText } from '../components/GpText';
import { Icon } from '../components/Icon';
import { ItemIcon } from '../components/ItemIcon';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';
import { useTier } from '../lib/tier';
import { Pct } from './PatchesPage';

function LockedDivergence() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="rounded border border-panel-border bg-panel p-6 text-center">
        <Icon name="lock" size={28} className="text-gold" />
        <h1 className="mt-2 text-xl font-bold text-gold">Divergence is a Premium feature</h1>
        <p className="mt-2 text-sm opacity-80">
          Items of the same kind — sharks and sea turtles, logs, runes, hides — usually move
          together. When one breaks away from peers it historically tracks, that mismatch is a
          deal: buy the laggard, wait for the spread to close. Every signal ships with the
          evidence — peer moves, past reconvergence record, and a warning when a game update is
          the likely cause.
        </p>
      </div>
      <UnlockStrip>Category-mismatch deals with reconvergence history and update warnings.</UnlockStrip>
    </div>
  );
}

async function fetchDivergence(): Promise<DivergenceResponse> {
  const res = await fetch('/api/divergence');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<DivergenceResponse>;
}

function PatchBadge({ patch }: { patch: NonNullable<DivergenceDeal['patch']> }) {
  return (
    <a
      href={patch.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`A recent game update mentions this item or its peer — this divergence may be justified and never close. ${patch.title} (${patch.date})`}
      className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-1.5 py-0.5 text-xs text-amber-300 hover:underline"
    >
      <Icon name="warning" size={11} /> patched
    </a>
  );
}

function DealCard({ deal }: { deal: DivergenceDeal }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-panel-border bg-panel">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
      >
        <ItemIcon icon={deal.icon} name={deal.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium text-parchment">
            <Link
              to={`/item/${deal.itemId}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-gold hover:underline"
            >
              {deal.name}
            </Link>
            <span className="text-xs font-normal opacity-60">{deal.groupLabel}</span>
            {deal.patch && <PatchBadge patch={deal.patch} />}
          </div>
          <div className="text-xs opacity-70">
            peers <Pct value={deal.headline.peersMedian30d} /> · this{' '}
            <Pct value={deal.headline.item30d} /> over 30d · lags {deal.laggingPairs} of{' '}
            {deal.eligiblePairs} co-moving peers
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span>
            buy{' '}
            <CopyValue value={deal.buy}>
              <GpText amount={deal.buy} />
            </CopyValue>
          </span>
          <Icon name="arrow-right" size={11} className="opacity-40" />
          <span>
            sell{' '}
            <CopyValue value={deal.sell}>
              <GpText amount={deal.sell} />
            </CopyValue>
          </span>
          <span className="opacity-70">
            margin <GpText amount={deal.margin} signed />
          </span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} className="opacity-50" />
        </div>
      </div>
      {open && <DealDetail deal={deal} />}
    </div>
  );
}

/** Expanded evidence: overlay chart + all flagged pairs. Filled in by Task 9. */
function DealDetail({ deal }: { deal: DivergenceDeal }) {
  void deal;
  return null;
}

function DivergenceContent() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['divergence'],
    queryFn: fetchDivergence,
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.building || d.builtAt === null) ? 2_000 : 15 * 60_000;
    },
  });

  if (isPending) return <TableSkeleton rows={8} />;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gold">Divergence</h1>
        <p className="mt-1 max-w-3xl text-sm opacity-70">
          Same-category items that historically move together, screened daily for one breaking
          away. Only pairs that prove co-movement (weekly-return correlation over 6 months) can
          signal; each deal shows how often that pair snapped back before. A spread can close
          from either side — the laggard rising <em>or</em> the leader falling back — so treat
          these as evidence, not advice. See the <Link to="/faq" className="text-gold underline">FAQ</Link>.
        </p>
      </header>

      {(data.building || data.builtAt === null) && (
        <div className="rounded border border-panel-border bg-panel px-3 py-2 text-sm opacity-70">
          Screening categories — {data.building?.done ?? 0}/{data.building?.total ?? '…'} price
          histories fetched…
        </div>
      )}

      {data.deals.length > 0 && (
        <section className="flex flex-col gap-2">
          {data.deals.map((deal) => (
            <DealCard key={`${deal.groupId}-${deal.itemId}`} deal={deal} />
          ))}
        </section>
      )}
      {data.deals.length === 0 && data.builtAt !== null && (
        <div className="rounded border border-panel-border bg-panel p-8 text-center text-sm opacity-60">
          No mismatches right now — most days everything tracks. Check back after the next
          screen (rebuilds twice a day).
        </div>
      )}

      <GroupsPanel groups={data.groups} />
    </div>
  );
}

/** Cohesion overview: why quiet groups are quiet. Filled in by Task 9. */
function GroupsPanel({ groups }: { groups: DivergenceResponse['groups'] }) {
  void groups;
  return null;
}

export default function DivergencePage() {
  const { entitlements } = useTier();
  if (!entitlements.divergence) return <LockedDivergence />;
  return <DivergenceContent />;
}
```

- [ ] **Step 2: Wire route + nav**

In `client/src/App.tsx`:
- Import: `import DivergencePage from './pages/DivergencePage';` (with the other page imports).
- Nav, directly after the Patches tab: `<Tab to="/divergence" label="Divergence" />`
- Routes, directly after the patches route: `<Route path="/divergence" element={<DivergencePage />} />`

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: clean. (If lint flags the `void deal;` placeholders, replace the body with `return null;` and an `// Task 9` comment — but `void` is the idiomatic unused-param escape here.)

- [ ] **Step 4: Manual look**

Run: `npm run dev`, open `http://localhost:5173/divergence`.
Expected: locked pitch when free; after redeeming `GEFF-DEV-2026` on `/premium`, the header, building strip (first run) and then deal cards / empty state render. Cards expand to nothing yet (Task 9). Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/DivergencePage.tsx client/src/App.tsx
git commit -m "feat(client): Divergence page — locked state, deal cards, nav"
```

---

### Task 9: Overlay chart, pair detail, groups panel (client)

**Files:**
- Create: `client/src/components/DivergenceOverlayChart.tsx`
- Modify: `client/src/pages/DivergencePage.tsx` (replace the two placeholders)

**Interfaces:**
- Consumes: `CHART` from `../lib/chartTheme` (keys `line`, `lineAlt`, `grid`, `axisText` — same as `PriceVolumeChart`); `PairSignal`, `DivergenceGroup` types.
- Produces: `DivergenceOverlayChart({ series, itemName, peerName })` and working `DealDetail` / `GroupsPanel`. Task 11 asserts `.recharts-wrapper` renders and groups-panel text.

- [ ] **Step 1: Create the chart component**

Create `client/src/components/DivergenceOverlayChart.tsx`:

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART } from '../lib/chartTheme';

const ITEM_COLOR = CHART.line;
const PEER_COLOR = CHART.lineAlt;

/** Both legs of a diverged pair, normalized to the window start (1 = start price). */
export function DivergenceOverlayChart({
  series,
  itemName,
  peerName,
}: {
  series: { t: number; item: number; peer: number }[];
  itemName: string;
  peerName: string;
}) {
  const dayFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
  const pct = (v: number) => `${v >= 1 ? '+' : ''}${((v - 1) * 100).toFixed(0)}%`;
  return (
    <div>
      <div className="mb-1 flex gap-4 text-xs opacity-80">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ITEM_COLOR }} />
          {itemName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PEER_COLOR }} />
          {peerName}
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t: number) => dayFmt.format(new Date(t * 1000))}
              stroke={CHART.axisText}
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={pct}
              stroke={CHART.axisText}
              fontSize={11}
              width={48}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value: number, name: string) => [pct(value), name]}
              labelFormatter={(t: number) => dayFmt.format(new Date(t * 1000))}
              contentStyle={{
                background: 'rgba(20, 18, 14, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                fontSize: 12,
              }}
            />
            <Line dataKey="item" name={itemName} stroke={ITEM_COLOR} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line dataKey="peer" name={peerName} stroke={PEER_COLOR} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

(Match the `Tooltip` styling approach used in this repo if `PriceVolumeChart`'s custom `content` component is preferred over `contentStyle` — check it while implementing and mirror; the inline style above is acceptable if no shared tooltip exists.)

- [ ] **Step 2: Fill in `DealDetail` and `GroupsPanel`**

In `client/src/pages/DivergencePage.tsx`, add the import `import { DivergenceOverlayChart } from '../components/DivergenceOverlayChart';` and replace the `DealDetail` placeholder:

```tsx
/** Expanded evidence: overlay chart of the worst pair + all flagged pairs. */
function DealDetail({ deal }: { deal: DivergenceDeal }) {
  const worst = deal.pairs[0];
  return (
    <div className="flex flex-col gap-3 border-t border-panel-border/60 px-4 py-3">
      {worst?.series90 && (
        <DivergenceOverlayChart series={worst.series90} itemName={deal.name} peerName={worst.peerName} />
      )}
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            <th className="py-1 pr-4 font-medium">Lags behind</th>
            <th className="py-1 pr-4 font-medium">Spread z</th>
            <th className="py-1 pr-4 font-medium">Correlation</th>
            <th className="py-1 font-medium">Past episodes</th>
          </tr>
        </thead>
        <tbody>
          {deal.pairs.map((p) => (
            <tr key={p.peerId} className="border-t border-panel-border/40">
              <td className="py-1.5 pr-4">vs {p.peerName}</td>
              <td className="py-1.5 pr-4 tabular-nums text-osrs-red">{p.z.toFixed(1)}</td>
              <td className="py-1.5 pr-4 tabular-nums">{p.weeklyR.toFixed(2)}</td>
              <td className="py-1.5">
                {p.episodes.count === 0
                  ? 'first divergence this year'
                  : `closed ${p.episodes.closedWithin30d} of ${p.episodes.count} within 30d` +
                    (p.episodes.medianDays !== null ? ` · median ${Math.round(p.episodes.medianDays)}d` : '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs opacity-50">
        Spreads close from either side — history shows how often this pair snapped back, not
        which leg moved.
      </p>
    </div>
  );
}
```

Replace the `GroupsPanel` placeholder:

```tsx
/** Cohesion overview: why quiet groups are quiet. */
function GroupsPanel({ groups }: { groups: DivergenceResponse['groups'] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gold">
        Watched categories
      </h2>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded border border-panel-border bg-panel px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-parchment">{g.label}</span>
              <span className="text-xs opacity-50">
                {g.eligiblePairs} co-moving pair{g.eligiblePairs === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {g.members.map((m) => (
                <span
                  key={m.name}
                  className="flex items-center gap-1 text-xs opacity-80"
                  title={
                    m.missing
                      ? 'No data — name not in the mapping or its price history failed'
                      : m.eligible
                        ? `Co-moves with the group (avg weekly-return r ${m.avgR?.toFixed(2) ?? '—'})`
                        : `Not correlated enough to signal (avg r ${m.avgR?.toFixed(2) ?? '—'}) or too thinly traded`
                  }
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      m.missing ? 'bg-osrs-red' : m.eligible ? 'bg-osrs-green' : 'bg-parchment/30'
                    }`}
                  />
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: clean.

- [ ] **Step 4: Manual look**

Run: `npm run dev`, unlock premium, open `/divergence`: expand a deal (if any) — chart + pair table render; groups panel shows all 15 categories with dots. If no live deals exist, temporarily assert the layout by checking the groups panel and empty state only — the e2e task covers deals with fixtures. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DivergenceOverlayChart.tsx client/src/pages/DivergencePage.tsx
git commit -m "feat(client): divergence overlay chart, pair detail, groups panel"
```

---

### Task 10: FAQ entries + README + DECISIONS

**Files:**
- Modify: `client/src/pages/FaqPage.tsx`
- Modify: `README.md`
- Modify: `DECISIONS.md`

**Interfaces:** none produced; Task 11's e2e does not assert FAQ content (keep it that way).

- [ ] **Step 1: FAQ section**

In `client/src/pages/FaqPage.tsx`, add a new `<Section>` as the LAST section inside the page's outer `div` (after the final existing `</Section>`), using the existing `Section`/`Q` components:

```tsx
      <Section title="Divergence">
        <Q id="divergence" q="What is the Divergence page?">
          <p>
            Items of the same kind (high-heal food, logs, runes, hides…) usually move together in
            price. Divergence screens curated categories daily and flags an item trading unusually
            cheap against peers it <em>historically tracks</em> — the deal is buying the laggard
            and waiting for the gap to close. Premium feature; rebuilds twice a day from daily
            price history.
          </p>
        </Q>
        <Q q="How do I read a divergence deal?">
          <p>
            The headline compares 30-day moves: “peers +12% · this −3%”. “Lags 3 of 4 co-moving
            peers” means 3 of the 4 pairs that historically track this item are stretched beyond
            2 standard deviations. “Closed 4 of 5 within 30d” is that pair's actual reconvergence
            record over the past year — evidence, not a promise. A <em>patched</em> badge means a
            recent game update mentions the item or its peer: those divergences are often
            justified and may never close.
          </p>
          <p>
            One honest caveat: a spread can close from either side — the laggard rising <em>or</em>
            the leader falling back. An item lagging several peers at once is the stronger signal.
          </p>
        </Q>
        <Q q="Why is an item or category missing from Divergence?">
          <p>
            Pairs must prove co-movement before they may signal: at least 6 months of overlapping
            history and a weekly-return correlation of 0.4+, with both items trading 2,000+ units a
            day. Members failing those gates show a grey dot in the “Watched categories” panel — a
            red dot means we couldn't get its price data at all. Categories are a curated list, so
            some items simply aren't watched yet.
          </p>
        </Q>
      </Section>
```

- [ ] **Step 2: README + DECISIONS**

`README.md` — in the **Tiers** paragraph, extend the premium sentence: `…full-year history and the Patch Impact page` → `…full-year history, the Patch Impact page and the Divergence screener`. In **Architecture notes**, add a bullet after the long-term screener bullet:

```markdown
- **Divergence (`/divergence`, premium)** screens ~15 curated item categories (shared data,
  `shared/src/categories.ts`) for pairwise mismatches: pairs must prove co-movement (weekly
  log-return correlation ≥ 0.4 over 180 overlapping days, both legs ≥ 2k daily volume) before
  a z-scored log-price spread (|z| ≥ 2 vs its trailing 90d) may flag the cheap leg as a
  laggard deal. Deals carry the pair's past reconvergence record and a ⚠ badge when a recent
  game update links either leg (reusing the Patch Impact update store). Same 12h lazy build
  pattern as the long-term screener (`server/src/divergence.ts`).
```

`DECISIONS.md` — append at the end:

```markdown
## Divergence — category-mismatch laggard deals (2026-07-17)

- Spec: `docs/superpowers/specs/2026-07-16-category-divergence-design.md` (brainstormed
  choices: days-to-weeks horizon, buy-the-laggard only, curated categories, pairwise engine,
  patch badge in v1, fully premium, named "Divergence").
- Categories are curated DATA (`shared/src/categories.ts`, exact GE names like methods.ts) —
  semantic grouping is only a candidate prior; every pair must additionally pass the
  correlation gate before it may signal. Unresolved names surface as red dots in the groups
  panel, never silently.
- Engine thresholds (all named consts in `server/src/divergence.ts`): 180d overlap,
  weekly-log-return Pearson r ≥ 0.4, 2k/day volume floor both legs, entry |z| ≥ 2 vs
  trailing 90d, episode close |z| ≤ 0.5, reconvergence horizon 30d. Weekly (not daily)
  returns for the gate: smooths bucket noise without rewarding shared long drift.
- The currently-open episode is excluded from a pair's reconvergence record — it IS the
  signal being sold, counting it would inflate the history.
- Deals aggregate by laggard item (lagging several peers ≫ one stray pair) and are listed
  only when the item's 30d change trails its peers' median (direction sanity check).
- Patch badge reuses the Patch Impact machinery (`listUpdatePages`/`getUpdatePages` disk
  cache + `extractLinkTargets`/`matchMentions`) rather than fresh name-regex matching;
  `wikiPageUrl` moved to `updateParse.ts` for reuse. Badge failures never kill a build.
- e2e mocks `/api/divergence` (live build takes ~1–2 min cold); the live pipeline is
  verified by hand in the plan's task 6/12 smoke steps.
```

- [ ] **Step 3: Typecheck + lint + eyeball**

Run: `npm run typecheck` then `npm run lint`
Expected: clean. Open `/faq` in the dev server briefly — the new section renders and `/faq#divergence` deep-links.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/FaqPage.tsx README.md DECISIONS.md
git commit -m "docs: Divergence FAQ entries + README + DECISIONS notes"
```

---

### Task 11: e2e — mocked Divergence coverage

**Files:**
- Create: `e2e/divergence.spec.ts`

**Interfaces:**
- Consumes: `DivergenceResponse` type; the page copy from Tasks 8–9 (assertions quote it verbatim); the `unlockPremium` idiom from `e2e/patches.spec.ts` (each spec file defines its own copy).

- [ ] **Step 1: Write the spec**

Create `e2e/divergence.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import type { DivergenceResponse } from '@osrs-flip/shared';

async function unlockPremium(page: Page) {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText('Premium is active on this browser')).toBeVisible();
}

const T0 = 1_780_000_000;
const SERIES = Array.from({ length: 90 }, (_, i) => ({
  t: T0 - (90 - i) * 86_400,
  item: 1 - (i / 90) * 0.15,
  peer: 1 + (i / 90) * 0.08,
}));

const READY: DivergenceResponse = {
  builtAt: T0,
  deals: [
    {
      itemId: 397,
      name: 'Sea turtle',
      icon: 'Sea turtle.png',
      groupId: 'food-high-heal',
      groupLabel: 'High-heal food',
      laggingPairs: 2,
      eligiblePairs: 3,
      headline: { item30d: -0.12, peersMedian30d: 0.06 },
      pairs: [
        {
          peerId: 385,
          peerName: 'Shark',
          z: -2.7,
          weeklyR: 0.71,
          episodes: { count: 5, closedWithin30d: 4, medianDays: 9 },
          series90: SERIES,
        },
        {
          peerId: 391,
          peerName: 'Manta ray',
          z: -2.1,
          weeklyR: 0.64,
          episodes: { count: 2, closedWithin30d: 2, medianDays: 12 },
        },
      ],
      buy: 720,
      sell: 799,
      margin: 64,
      patch: {
        title: 'Fishing Rework',
        url: 'https://oldschool.runescape.wiki/w/Update:Fishing_Rework',
        date: '2026-07-10',
      },
    },
  ],
  groups: [
    {
      id: 'food-high-heal',
      label: 'High-heal food',
      eligiblePairs: 3,
      members: [
        { itemId: 385, name: 'Shark', icon: 'Shark.png', eligible: true, avgR: 0.7, missing: false },
        { itemId: 397, name: 'Sea turtle', icon: 'Sea turtle.png', eligible: true, avgR: 0.68, missing: false },
        { itemId: 3144, name: 'Cooked karambwan', icon: null, eligible: false, avgR: 0.2, missing: false },
        { itemId: null, name: 'Mystery meat', icon: null, eligible: false, avgR: null, missing: true },
      ],
    },
  ],
  coverage: { itemsRequested: 4, itemsWithSeries: 3 },
};

const EMPTY: DivergenceResponse = { builtAt: T0, deals: [], groups: READY.groups, coverage: READY.coverage };

test('free: divergence page is fully locked and fetches no data', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/divergence')) calls.push(r.url());
  });
  await page.goto('/divergence');
  await expect(page.getByText('Divergence is a Premium feature')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unlock with Premium' })).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('premium: deal card renders evidence and expands to chart + pair table', async ({ page }) => {
  await page.route('**/api/divergence', (route) => route.fulfill({ json: READY }));
  await unlockPremium(page);
  await page.goto('/divergence');

  await expect(page.getByRole('link', { name: 'Sea turtle' })).toBeVisible();
  await expect(page.getByText('lags 2 of 3 co-moving peers')).toBeVisible();
  await expect(page.getByRole('link', { name: /patched/ })).toBeVisible();

  await page.getByText('lags 2 of 3 co-moving peers').click();
  await expect(page.locator('.recharts-wrapper')).toBeVisible();
  await expect(page.getByText('vs Shark')).toBeVisible();
  await expect(page.getByText('closed 4 of 5 within 30d · median 9d')).toBeVisible();
  await expect(page.getByText('Spreads close from either side', { exact: false })).toBeVisible();
});

test('premium: groups panel explains member eligibility', async ({ page }) => {
  await page.route('**/api/divergence', (route) => route.fulfill({ json: READY }));
  await unlockPremium(page);
  await page.goto('/divergence');

  await expect(page.getByRole('heading', { name: 'Watched categories' })).toBeVisible();
  await expect(page.getByText('High-heal food')).toBeVisible();
  await expect(page.getByText('3 co-moving pairs')).toBeVisible();
  await expect(page.getByText('Mystery meat')).toBeVisible();
});

test('premium: empty state when everything tracks', async ({ page }) => {
  await page.route('**/api/divergence', (route) => route.fulfill({ json: EMPTY }));
  await unlockPremium(page);
  await page.goto('/divergence');
  await expect(page.getByText('No mismatches right now', { exact: false })).toBeVisible();
});
```

- [ ] **Step 2: Build + run the new spec**

Run: `npm run build` then `npx playwright test divergence.spec.ts`
Expected: all 4 tests pass on the desktop project (and the mobile project if the config runs every spec there — fix responsive breakage if the card wraps unusably; the flex-wrap classes should handle it). If a text assertion fails, fix the ASSERTION to match the page (or the page copy where it drifted from Tasks 8–9), never loosen to regex-anything.

Note: `getByText('High-heal food')` may resolve to both the deal card's group label and the panel — if Playwright complains about strict mode, scope it: `page.locator('section').filter({ hasText: 'Watched categories' }).getByText('High-heal food')`.

- [ ] **Step 3: Run the full e2e suite**

Run: `npm run e2e`
Expected: everything green, including all pre-existing specs (the App.tsx nav change must not break finder/mobile specs).

- [ ] **Step 4: Commit**

```bash
git add e2e/divergence.spec.ts
git commit -m "test(e2e): mocked Divergence page coverage"
```

---

### Task 12: Full verification + live smoke

**Files:** none (fixes only, if something fails).

- [ ] **Step 1: The full battery**

Run each from the repo root, in order:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run e2e
```

Expected: all green. Fix anything that isn't, commit fixes with sensible messages.

- [ ] **Step 2: Live smoke (real wiki data, production build)**

```bash
PORT=3400 node server/dist/index.js &
sleep 3
curl -s localhost:3400/api/divergence > /dev/null   # trigger the build
sleep 120
curl -s localhost:3400/api/divergence | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log(JSON.stringify({builtAt:r.builtAt,deals:r.deals.map(d=>({name:d.name,group:d.groupLabel,lags:\`\${d.laggingPairs}/\${d.eligiblePairs}\`,z:d.pairs[0].z.toFixed(2),patch:d.patch?.title??null})),groupCohesion:r.groups.map(g=>({g:g.label,pairs:g.eligiblePairs,missing:g.members.filter(m=>m.missing).map(m=>m.name)})),coverage:r.coverage},null,2))})"
kill %1
```

Expected and reported in your summary:
- `builtAt` set; `coverage.itemsWithSeries === coverage.itemsRequested` (or missing members explained);
- most groups show `eligiblePairs > 0` (elemental runes, logs, herbs are the canaries — if ALL are 0, the gate is mistuned: dump a few pairs' `avgR` and investigate before shipping);
- any `missing` names are typos to fix in `shared/src/categories.ts` (fix + commit);
- deals list may be empty — fine and normal.

- [ ] **Step 3: Update the categories file for any missing names found, re-verify, commit**

```bash
git add shared/src/categories.ts
git commit -m "fix(shared): correct curated category item names against the live mapping"
```

(Skip if nothing was missing.)

---

## Plan Self-Review (done at writing time)

- **Spec coverage:** curated data ✓ (T2), eligibility gate ✓ (T4), spread z + laggard ✓ (T3/T4), reconvergence evidence ✓ (T3/T4), patch badge v1 ✓ (T5), aggregation + ranking + direction sanity ✓ (T4), API shape ✓ (T2/T6), 12h lazy build + politeness ✓ (T6), premium gate ✓ (T7/T8), page UI: blurb/cards/expand/groups/empty ✓ (T8/T9), resilience (skip failed series, badge additive, last-good state) ✓ (T5/T6), FAQ/README/DECISIONS ✓ (T10), unit + e2e tests ✓ (throughout, T11), live verification ✓ (T6/T12).
- **Type consistency:** `DivergenceResponse.builtAt` is `number | null` (spec amended); `PairSignal.series90` optional, worst-pair only; group member `itemId: number | null`. Names checked against Tasks 2/4/5/6/8/9 usages.
- **Known judgment calls:** the `{{Update|...}}` fixture format in T5 must be verified against the real `parseUpdateTemplate` while implementing (explicitly flagged in the task); Recharts tooltip styling may be swapped for the repo's custom tooltip idiom (flagged in T9).
