# Patch Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Premium `/patches` page: computed winners/losers for every OSRS game update back to 2015, plus an upcoming-content watchlist backed by measured historical evidence.

**Architecture:** Two new server-side upstream clients (weirdgloop exchange history, OSRS wiki MediaWiki API) feed a lazily-built, disk-persisted analysis (longterm.ts pattern: worker pool, progress, 12h rebuild). Pure analytics modules (event study, lexical tags, analogues) are unit-tested; three `/api/patches*` endpoints serve the client; the page is fully gated behind a new `patchAnalysis` entitlement.

**Tech Stack:** Existing only — Fastify, TanStack Query, React 18, Vitest, Playwright. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-06-patch-impact-design.md` (approved). Read it before starting.

## Global Constraints

- **No new npm dependencies** (native `fetch`, `node:fs/promises` only).
- **The browser never calls an upstream directly** — weirdgloop and the MediaWiki API are reachable only through our server (same constitutional rule as the prices API, README "Architecture notes").
- Server/shared are ESM TypeScript; **intra-workspace imports use the `.js` suffix** (`from './config.js'`).
- **After editing `shared/`, run `npm run build -w shared`** before typechecking/testing server or client (they import the built `dist/`).
- Run shell commands as separate Bash calls, from the repo root (no `&&` chaining).
- UI follows `docs/design.md`: `Icon` component only (no emoji/dingbats), established badge tints, `tabular-nums` right-aligned numerics, `GpText`/`Pct` for values.
- Every commit message ends with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Working tree already contains unrelated uncommitted changes — **stage only the files your task touches, never `git add -A`**.
- Verified upstream facts (2026-07-06): weirdgloop `all` route = **1 id per request**, ~4,050 daily points for whip, volumes from 2018-09-25; MediaWiki `allpages` ns=112 lists ~1,100 update pages at 500/request; bulk `prop=revisions` accepts **50 pageids/request**; every update page starts with `{{Update|date=29 March 2004|category=game|...}}` (categorymembers timestamps are categorization dates, NOT publish dates — do not use them).

## File Map

| File | Responsibility |
|---|---|
| `shared/src/patchTypes.ts` (new) | API types shared by server + client |
| `shared/src/index.ts` (modify) | export patchTypes |
| `shared/src/tiers.ts` + `tiers.test.ts` (modify) | `patchAnalysis` entitlement |
| `server/src/config.ts` (modify) | upstream bases + `PATCHES_MAX_ITEMS` knob |
| `server/src/diskCache.ts` (new) + test | JSON file read/write helpers |
| `server/src/updateParse.ts` (new) + test | pure wikitext parsing (template date/category, links, upcoming sections) |
| `server/src/patchStats.ts` (new) + test | pure event-study math |
| `server/src/patchTags.ts` (new) + test | vocabulary, tags, Jaccard analogues, evidence aggregation |
| `server/src/gloop.ts` (new) | weirdgloop client, disk-backed |
| `server/src/updates.ts` (new) | MediaWiki client, disk-backed |
| `server/src/data/patchOverrides.ts` (new) | empty curation overlay |
| `server/src/patches.ts` (new) + test | build orchestrator, overlay merge, serve functions |
| `server/src/routes.ts` (modify) | 3 endpoints |
| `client/src/pages/PatchesPage.tsx` (new) | page: lock, list, sort, URL state |
| `client/src/components/PatchDetailPanel.tsx` (new) | winners/losers detail |
| `client/src/components/UpcomingFeatures.tsx` (new) | upcoming cards |
| `client/src/App.tsx` (modify) | route + nav tab |
| `e2e/patches.spec.ts` (new) | mocked e2e |
| `client/src/pages/FaqPage.tsx` (modify) | 2 FAQ entries |
| `.gitignore`, `README.md`, `DECISIONS.md` (modify) | cache dir, docs |

---

### Task 1: Shared types + `patchAnalysis` entitlement

**Files:**
- Create: `shared/src/patchTypes.ts`
- Modify: `shared/src/index.ts`, `shared/src/tiers.ts`
- Test: `shared/src/tiers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type below (imported by server tasks 5–7 and client tasks 8–10 as `import type {...} from '@osrs-flip/shared'`), and `Entitlements.patchAnalysis: boolean`.

- [ ] **Step 1: Write the failing entitlement test**

Append to the existing `describe` block in `shared/src/tiers.test.ts` (match the file's existing `it(...)` style):

```ts
it('gates patch analysis to premium only', () => {
  expect(getEntitlements('free').patchAnalysis).toBe(false);
  expect(getEntitlements('premium').patchAnalysis).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w shared -- src/tiers.test.ts`
Expected: FAIL — `patchAnalysis` does not exist on `Entitlements` (TS error or undefined ≠ false).

- [ ] **Step 3: Add the entitlement**

In `shared/src/tiers.ts`, append to the `Entitlements` interface (after `savedFiltersMax`):

```ts
  /** Patch Impact: patch winners/losers + upcoming watchlist (/patches). */
  patchAnalysis: boolean;
```

Add `patchAnalysis: false,` to the `free` object and `patchAnalysis: true,` to the `premium` object in `ENTITLEMENTS`.

- [ ] **Step 4: Create `shared/src/patchTypes.ts`**

```ts
/**
 * Patch Impact API types (/api/patches*). Winners/losers are always COMPUTED
 * from price history around update dates — never hand-typed. See
 * docs/superpowers/specs/2026-07-06-patch-impact-design.md.
 */

/** One game update in the /api/patches list. */
export interface PatchSummary {
  pageid: number;
  /** Display title, wiki "Update:" prefix stripped. */
  title: string;
  /** Publication date (ISO yyyy-mm-dd) from the page's {{Update|date=…}} template. */
  date: string;
  /** Link to the update post on the OSRS wiki. */
  wikiUrl: string;
  /**
   * Share (0..1) of screened items whose post-patch move was unusual for that
   * item (|z| >= 2). Null when the patch is too recent to measure.
   */
  impact: number | null;
  /** change is the fractional move over the patch's rank window (see PatchDetail.windowDays). */
  topWinner: { id: number; name: string; change: number } | null;
  topLoser: { id: number; name: string; change: number } | null;
}

export interface PatchesResponse {
  status: 'building' | 'ready';
  /** Build progress 0..1 (1 when ready). */
  progress: number;
  /** Unix seconds of the last completed build; null while the first build runs. */
  builtAt: number | null;
  /** Non-fatal build gaps, e.g. "3 of 400 items unavailable from the price archive". */
  warnings: string[];
  /** Newest first (curation overlay pins may float entries above that). */
  patches: PatchSummary[];
}

/** One item row in a patch's winners/losers tables. All changes are fractions (0.05 = +5%). */
export interface PatchItemRow {
  id: number;
  name: string;
  icon: string | null;
  /** Price change from the patch-eve baseline over +1/+7/+30 days. */
  change1: number | null;
  change7: number | null;
  change30: number | null;
  /** Change over the 7 days BEFORE the patch (anticipation run-up). */
  runup7: number | null;
  /**
   * Rank-window change normalised by the item's own pre-patch daily volatility.
   * |z| >= 2 is flagged "unusual" in the UI.
   */
  zScore: number | null;
  /** Avg daily volume 7d after vs 28d before, as a fraction; null before Sept 2018. */
  volumeDelta7: number | null;
  /** Item is wiki-linked in the update's notes. */
  mentioned: boolean;
}

export interface PatchDetail extends PatchSummary {
  /** priceOnly = patch predates the archive's volume data (Sept 2018). */
  dataQuality: 'full' | 'priceOnly';
  /** Lexical content tags (skills + content keywords), no sentiment. */
  tags: string[];
  /** Items screened for this patch (usable price data around its date). */
  universeSize: number;
  /** 7 normally; 1 for patches younger than a week (ranked on the 1d move). */
  windowDays: 1 | 7;
  winners: PatchItemRow[];
  losers: PatchItemRow[];
}

/** One past patch reaction of an upcoming-feature item. */
export interface MentionReaction {
  pageid: number;
  title: string;
  date: string;
  change7: number | null;
}

export interface UpcomingItem {
  id: number;
  name: string;
  icon: string | null;
  /** Current mid price from the live snapshot. */
  price: number | null;
  /** 7d reactions after past updates that mentioned this item, newest first (max 6). */
  history: MentionReaction[];
}

export interface AnaloguePatch {
  pageid: number;
  title: string;
  date: string;
  /** Tag-set Jaccard similarity 0..1. */
  similarity: number;
}

/** Distribution of mentioned-item 7d moves across the analogue patches. */
export interface UpcomingEvidence {
  median7: number;
  iqrLow7: number;
  iqrHigh7: number;
  /** Share of moves that were positive, 0..1. */
  pctPositive: number;
  sampleSize: number;
}

export interface UpcomingFeature {
  /** Wiki section anchor on the "Upcoming updates" page. */
  anchor: string;
  title: string;
  tags: string[];
  /** Mentioned items that are in the screened universe. Never empty (features without priced mentions are omitted). */
  items: UpcomingItem[];
  analogues: AnaloguePatch[];
  /** Null when fewer than 5 sample moves exist across the analogues. */
  evidence: UpcomingEvidence | null;
  /** Optional hand-written note from the curation overlay. */
  note: string | null;
}

export interface UpcomingResponse {
  status: 'building' | 'ready';
  builtAt: number | null;
  features: UpcomingFeature[];
}
```

In `shared/src/index.ts`, add next to the existing `export * from './dealTypes.js';` line:

```ts
export * from './patchTypes.js';
```

- [ ] **Step 5: Build shared, run tests**

Run: `npm run build -w shared`
Run: `npm test -w shared`
Expected: build clean; all shared tests PASS including the new entitlement test.

- [ ] **Step 6: Typecheck the whole repo**

Run: `npm run typecheck`
Expected: clean (nothing consumes the new types yet).

- [ ] **Step 7: Commit**

```bash
git add shared/src/patchTypes.ts shared/src/index.ts shared/src/tiers.ts shared/src/tiers.test.ts
git commit -m "feat(shared): Patch Impact API types + patchAnalysis entitlement"
```

---

### Task 2: Server config knobs + JSON disk-cache helper

**Files:**
- Modify: `server/src/config.ts`, `.gitignore`
- Create: `server/src/diskCache.ts`
- Test: `server/src/diskCache.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `config.gloopApiBase: string`, `config.mediawikiApiBase: string`, `config.patchesMaxItems: number`; `readJsonFile<T>(file: string): Promise<T | null>`, `writeJsonFile(file: string, value: unknown): Promise<void>` (used by tasks 6–7).

- [ ] **Step 1: Write the failing disk-cache test**

Create `server/src/diskCache.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './diskCache.js';

describe('diskCache', () => {
  it('round-trips a value, creating parent directories', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geff-'));
    const file = path.join(dir, 'nested', 'deep', 'x.json');
    await writeJsonFile(file, { a: 1, b: [null, 'two'] });
    expect(await readJsonFile(file)).toEqual({ a: 1, b: [null, 'two'] });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns null for a missing file', async () => {
    expect(await readJsonFile(path.join(os.tmpdir(), 'geff-definitely-missing.json'))).toBeNull();
  });

  it('returns null for a corrupt file so the caller refetches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geff-'));
    const file = path.join(dir, 'bad.json');
    await fs.writeFile(file, '{not json');
    expect(await readJsonFile(file)).toBeNull();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server -- src/diskCache.test.ts`
Expected: FAIL — cannot resolve `./diskCache.js`.

- [ ] **Step 3: Implement `server/src/diskCache.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal JSON-file persistence for immutable/slow-moving upstream data
 * (multi-year price history, update-post wikitext). NOT a TTL cache —
 * callers decide freshness; this only reads and writes.
 */
export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null; // missing or corrupt -> caller refetches
  }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file); // rename is atomic on one filesystem: no torn reads
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w server -- src/diskCache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add config knobs**

In `server/src/config.ts`, append inside the `config` object after `longtermMaxItems`:

```ts
  gloopApiBase: process.env.GLOOP_API_BASE ?? 'https://api.weirdgloop.org/exchange/history/osrs',
  mediawikiApiBase: process.env.MEDIAWIKI_API_BASE ?? 'https://oldschool.runescape.wiki/api.php',
  patchesMaxItems: num('PATCHES_MAX_ITEMS', 400),
```

- [ ] **Step 6: Gitignore the disk cache**

Append to `.gitignore`:

```
server/data/
```

(The curation overlay lives at `server/src/data/` — different path, stays in git.)

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add server/src/config.ts server/src/diskCache.ts server/src/diskCache.test.ts .gitignore
git commit -m "feat(server): patch-cache disk persistence helper + upstream config knobs"
```

---

### Task 3: Pure wikitext parsing (`updateParse.ts`)

**Files:**
- Create: `server/src/updateParse.ts`
- Test: `server/src/updateParse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by task 7):
  - `parseUpdateTemplate(wikitext: string): { date: string | null; category: string | null }`
  - `parseWikiDate(raw: string): string | null`
  - `extractLinkTargets(wikitext: string): string[]`
  - `matchMentions(targets: string[], nameToId: Map<string, number>): number[]`
  - `splitUpcomingSections(wikitext: string): { anchor: string; title: string; wikitext: string }[]`

- [ ] **Step 1: Write the failing tests**

Create `server/src/updateParse.test.ts` (fixtures are real snippets verified against the live wiki on 2026-07-06):

```ts
import { describe, expect, it } from 'vitest';
import {
  extractLinkTargets,
  matchMentions,
  parseUpdateTemplate,
  parseWikiDate,
  splitUpcomingSections,
} from './updateParse.js';

describe('parseWikiDate', () => {
  it('parses the wiki update-date format to ISO', () => {
    expect(parseWikiDate('29 March 2004')).toBe('2004-03-29');
    expect(parseWikiDate('30 June 2026')).toBe('2026-06-30');
    expect(parseWikiDate('1 January 2020')).toBe('2020-01-01');
  });

  it('rejects garbage', () => {
    expect(parseWikiDate('Marchtember 5th')).toBeNull();
    expect(parseWikiDate('2020-01-01')).toBeNull();
    expect(parseWikiDate('45 March 2004')).toBeNull();
  });
});

describe('parseUpdateTemplate', () => {
  it('extracts date and category from a real modern header', () => {
    const wikitext =
      '{{Update|date=30 June 2026|url=https://secure.runescape.com/m=news/x?oldschool=1|category=game}}\n[[File:X.jpg|right]]\nBody';
    expect(parseUpdateTemplate(wikitext)).toEqual({ date: '2026-06-30', category: 'game' });
  });

  it('extracts from a historical header', () => {
    const wikitext = '{{Update|date=29 March 2004|category=game|time=historical}}\n\nBody text';
    expect(parseUpdateTemplate(wikitext)).toEqual({ date: '2004-03-29', category: 'game' });
  });

  it('handles website-category posts and missing templates', () => {
    expect(parseUpdateTemplate('{{Update|date=1 May 2020|category=website}}x').category).toBe('website');
    expect(parseUpdateTemplate('No template here')).toEqual({ date: null, category: null });
  });
});

describe('extractLinkTargets', () => {
  it('collects link targets, stripping display text and anchors, skipping non-articles', () => {
    const wikitext =
      'The [[Dragon claws]] and [[Abyssal whip|the whip]] drop from [[Slayer#Rewards]]. ' +
      '[[File:Pic.png]] [[Category:Updates]] and [[Dragon claws]] again.';
    expect(extractLinkTargets(wikitext).sort()).toEqual(['Abyssal whip', 'Dragon claws', 'Slayer']);
  });
});

describe('matchMentions', () => {
  it('maps targets to item ids case-insensitively, dropping non-items', () => {
    const nameToId = new Map([
      ['dragon claws', 13652],
      ['abyssal whip', 4151],
    ]);
    expect(matchMentions(['Dragon claws', 'Abyssal whip', 'Slayer'], nameToId).sort()).toEqual([4151, 13652]);
  });
});

describe('splitUpcomingSections', () => {
  const page = [
    'Intro prose.',
    '==Confirmed updates==',
    'Grouping prose.',
    '===Varlamore Part 3===',
    'Brings [[Dragon claws]] changes.',
    '====Sub-detail====',
    'More on the same feature.',
    '===Sailing Rewards===',
    'New [[Abyssal whip]] recolour.',
    '==Other==',
    'Trailing section prose.',
  ].join('\n');

  it('yields one entry per level-3 section, keeping level-4 bodies, stopping at level-2', () => {
    const sections = splitUpcomingSections(page);
    expect(sections.map((s) => s.title)).toEqual(['Varlamore Part 3', 'Sailing Rewards']);
    expect(sections[0]!.anchor).toBe('Varlamore_Part_3');
    expect(sections[0]!.wikitext).toContain('Sub-detail');
    expect(sections[1]!.wikitext).toContain('Abyssal whip');
    expect(sections[1]!.wikitext).not.toContain('Trailing section');
  });

  it('strips wiki markup from section titles', () => {
    const sections = splitUpcomingSections('===[[Sailing]] rework===\nBody');
    expect(sections[0]!.title).toBe('Sailing rework');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w server -- src/updateParse.test.ts`
Expected: FAIL — cannot resolve `./updateParse.js`.

- [ ] **Step 3: Implement `server/src/updateParse.ts`**

```ts
/**
 * Pure parsing of OSRS-wiki wikitext. IO lives in updates.ts; keeping this
 * pure lets the tag vocabulary and parsers evolve against disk-cached
 * wikitext without refetching anything.
 */

/** Parsed head of an Update: page's {{Update|...}} template. */
export interface UpdateTemplate {
  /** ISO yyyy-mm-dd, null when missing/unparseable. */
  date: string | null;
  /** The template's category= field (game, website, support, ...). */
  category: string | null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Parse "29 March 2004" (the wiki's update-date format) to ISO. */
export function parseWikiDate(raw: string): string | null {
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Extract date + category from the {{Update|...}} template heading every update page. */
export function parseUpdateTemplate(wikitext: string): UpdateTemplate {
  const m = /\{\{Update\b([^}]*)\}\}/i.exec(wikitext);
  if (!m) return { date: null, category: null };
  const params = new Map<string, string>();
  for (const part of m[1]!.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  const rawDate = params.get('date');
  return {
    date: rawDate ? parseWikiDate(rawDate) : null,
    category: params.get('category')?.toLowerCase() ?? null,
  };
}

/**
 * All [[link]] targets in the wikitext — pipe display text and #anchors
 * stripped, File:/Category:/etc pages skipped. Links only, no free-text
 * scanning: editors link items religiously in update posts, and links
 * avoid false positives on common words.
 */
export function extractLinkTargets(wikitext: string): string[] {
  const out = new Set<string>();
  for (const m of wikitext.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const target = m[1]!.trim();
    if (!target || /^(file|image|category|update|user|template|special|media|w|wp):/i.test(target)) continue;
    out.add(target);
  }
  return [...out];
}

/** Map link targets to GE item ids (case-insensitive exact name match), deduped. */
export function matchMentions(targets: string[], nameToId: Map<string, number>): number[] {
  const ids = new Set<number>();
  for (const t of targets) {
    const id = nameToId.get(t.toLowerCase());
    if (id !== undefined) ids.add(id);
  }
  return [...ids];
}

export interface UpcomingSection {
  /** MediaWiki-style anchor (spaces -> underscores) for deep links. */
  anchor: string;
  title: string;
  wikitext: string;
}

/**
 * Split the "Upcoming updates" page into one entry per ===feature=== section.
 * Level-3 headings are the per-feature grain on that page; level-2 headings
 * are groupings and terminate the previous feature's body.
 */
export function splitUpcomingSections(wikitext: string): UpcomingSection[] {
  const sections: UpcomingSection[] = [];
  const headings = [...wikitext.matchAll(/^===([^=].*?)===\s*$/gm)];
  for (let i = 0; i < headings.length; i++) {
    const m = headings[i]!;
    const title = m[1]!.replace(/\[\[|\]\]/g, '').replace(/\{\{[^}]*\}\}/g, '').trim();
    const start = m.index! + m[0].length;
    const end = i + 1 < headings.length ? headings[i + 1]!.index! : wikitext.length;
    // stop at the next level-2 heading so grouping prose doesn't bleed in
    const body = wikitext.slice(start, end).split(/^==[^=].*?==\s*$/m)[0]!;
    sections.push({ anchor: title.replace(/\s+/g, '_'), title, wikitext: body });
  }
  return sections;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w server -- src/updateParse.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/updateParse.ts server/src/updateParse.test.ts
git commit -m "feat(server): pure wikitext parsing for update pages + upcoming sections"
```

---

### Task 4: Pure event-study math (`patchStats.ts`)

**Files:**
- Create: `server/src/patchStats.ts`
- Test: `server/src/patchStats.test.ts`

**Interfaces:**
- Consumes: `PatchItemRow` from `@osrs-flip/shared` (task 1).
- Produces (used by task 7):
  - `interface DailyPoint { timestamp: number; price: number; volume: number | null }` (unix **seconds**, ascending)
  - `interface PatchItemInput { id: number; name: string; icon: string | null; series: DailyPoint[]; mentioned: boolean }`
  - `interface PatchComputation { windowDays: 1 | 7; universeSize: number; winners: PatchItemRow[]; losers: PatchItemRow[]; impact: number | null }`
  - `computePatch(items: PatchItemInput[], patchTs: number, hasVolume: boolean): PatchComputation`
  - `change7After(series: DailyPoint[], patchTs: number): number | null`
  - `DAY = 86_400`, `UNUSUAL_Z = 2`

- [ ] **Step 1: Write the failing tests**

Create `server/src/patchStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { change7After, computePatch, DAY, type DailyPoint, type PatchItemInput } from './patchStats.js';

/** Daily series: prices[i] at t0 + i days. */
function series(prices: number[], t0 = 1_600_000_000, volume: (i: number) => number | null = () => 1000): DailyPoint[] {
  return prices.map((price, i) => ({ timestamp: t0 + i * DAY, price, volume: volume(i) }));
}

function input(id: number, s: DailyPoint[], mentioned = false): PatchItemInput {
  return { id, name: `Item ${id}`, icon: null, series: s, mentioned };
}

const T0 = 1_600_000_000;
/** Patch lands at day 100 (baseline = day 99's close). */
const PATCH_TS = T0 + 100 * DAY;

/** 200 flat days at 1000 with ±10 alternation (sigma ~1%), jumping to `after` from day 100. */
function jumpSeries(after: number): DailyPoint[] {
  const prices = Array.from({ length: 200 }, (_, i) =>
    i < 100 ? 1000 + (i % 2 === 0 ? 10 : -10) : after,
  );
  return series(prices);
}

describe('computePatch', () => {
  it('measures changes from the patch-eve baseline over 1/7/30 day windows', () => {
    const c = computePatch([input(1, jumpSeries(1100))], PATCH_TS, true);
    const row = c.winners[0]!;
    // baseline = day 99 close = 990 (odd index); +7d price = 1100
    expect(row.change7).toBeCloseTo((1100 - 990) / 990, 5);
    expect(row.change1).toBeCloseTo((1100 - 990) / 990, 5);
    expect(row.change30).toBeCloseTo((1100 - 990) / 990, 5);
    expect(c.windowDays).toBe(7);
  });

  it('ranks winners by z (own-volatility normalised), not raw %', () => {
    // item 1: sleepy (sigma ~2%) +8%; item 2: volatile (sigma ~16%) +12%
    const sleepy = jumpSeries(1070); // ~ +8.1% vs 990 baseline
    const volatilePrices = Array.from({ length: 200 }, (_, i) =>
      i < 100 ? 1000 + (i % 2 === 0 ? 80 : -80) : 1030,
    );
    const volatile = series(volatilePrices); // ~ +12% vs 920 baseline
    const c = computePatch([input(1, sleepy), input(2, volatile)], PATCH_TS, true);
    expect(c.winners[0]!.id).toBe(1);
    expect(Math.abs(c.winners[0]!.zScore!)).toBeGreaterThan(Math.abs(c.winners[1]!.zScore!));
  });

  it('splits winners and losers and computes impact as the unusual share', () => {
    const c = computePatch(
      [input(1, jumpSeries(1500)), input(2, jumpSeries(600)), input(3, jumpSeries(1001))],
      PATCH_TS,
      true,
    );
    expect(c.winners.map((r) => r.id)).toContain(1);
    expect(c.losers.map((r) => r.id)).toContain(2);
    // items 1 and 2 moved ~±50σ-ish, item 3 barely: impact = 2/3
    expect(c.impact).toBeCloseTo(2 / 3, 5);
    expect(c.universeSize).toBe(3);
  });

  it('computes the pre-patch run-up', () => {
    // ramp into the patch: +2/day for the last 10 days before it, flat after
    const prices = Array.from({ length: 200 }, (_, i) => {
      if (i < 90) return 1000;
      if (i < 100) return 1000 + (i - 89) * 2; // day 99 = 1020
      return 1020;
    });
    const c = computePatch([input(1, series(prices))], PATCH_TS, true);
    const row = [...c.winners, ...c.losers][0];
    // runup7: day 93 (1008) -> day 99 (1020)
    expect(row).toBeUndefined(); // no post-patch move -> neither winner nor loser
    const flat = computePatch([input(1, series(prices.map((p, i) => (i >= 100 ? 1100 : p))))], PATCH_TS, true);
    expect(flat.winners[0]!.runup7).toBeCloseTo((1020 - 1008) / 1008, 5);
  });

  it('falls back to the 1d window for a patch younger than a week', () => {
    // series ends 2 days after the patch
    const prices = Array.from({ length: 103 }, (_, i) => (i < 100 ? 1000 : 1200));
    const c = computePatch([input(1, series(prices))], PATCH_TS, true);
    expect(c.windowDays).toBe(1);
    expect(c.winners[0]!.change1).toBeCloseTo(0.2, 5);
    expect(c.winners[0]!.change7).toBeNull();
  });

  it('skips items with no usable baseline and yields null change across data gaps', () => {
    const startsAfter = series(Array.from({ length: 50 }, () => 500), PATCH_TS + 10 * DAY);
    const c = computePatch([input(1, startsAfter)], PATCH_TS, true);
    expect(c.universeSize).toBe(0);
    expect(c.impact).toBeNull();
  });

  it('reports the volume spike where volume data exists', () => {
    const s = series(
      Array.from({ length: 200 }, (_, i) => (i < 100 ? 1000 : 1100)),
      T0,
      (i) => (i < 100 ? 1000 : 3000),
    );
    const c = computePatch([input(1, s)], PATCH_TS, true);
    expect(c.winners[0]!.volumeDelta7).toBeCloseTo(2, 5);
    const noVol = computePatch([input(1, s)], PATCH_TS, false);
    expect(noVol.winners[0]!.volumeDelta7).toBeNull();
  });

  it('marks mentioned items', () => {
    const c = computePatch([input(1, jumpSeries(1100), true)], PATCH_TS, true);
    expect(c.winners[0]!.mentioned).toBe(true);
  });
});

describe('change7After', () => {
  it('returns the 7d fractional change from the patch-eve baseline', () => {
    expect(change7After(jumpSeries(1100), PATCH_TS)).toBeCloseTo((1100 - 990) / 990, 5);
  });

  it('returns null when either side is missing', () => {
    const short = series(Array.from({ length: 101 }, () => 1000));
    expect(change7After(short, PATCH_TS)).toBeNull();
    expect(change7After(short, T0 - 30 * DAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w server -- src/patchStats.test.ts`
Expected: FAIL — cannot resolve `./patchStats.js`.

- [ ] **Step 3: Implement `server/src/patchStats.ts`**

```ts
import type { PatchItemRow } from '@osrs-flip/shared';

/**
 * Event-study math for Patch Impact: how did each item move around an update
 * date, normalised by that item's own volatility so a sleepy item moving 12%
 * outranks a jittery one moving 15%. Pure functions over daily price series.
 */

/** One daily price point from the exchange archive (weirdgloop). */
export interface DailyPoint {
  /** Unix seconds, ascending. */
  timestamp: number;
  price: number;
  /** Null before Sept 2018 (archive has no volumes there). */
  volume: number | null;
}

export interface PatchItemInput {
  id: number;
  name: string;
  icon: string | null;
  series: DailyPoint[];
  mentioned: boolean;
}

export interface PatchComputation {
  /** 7 normally; 1 when the patch is too recent for any 7d reading. */
  windowDays: 1 | 7;
  /** Items with a usable patch-eve baseline. */
  universeSize: number;
  winners: PatchItemRow[];
  losers: PatchItemRow[];
  /** Share of scored items with |z| >= UNUSUAL_Z; null when nothing scored. */
  impact: number | null;
}

export const DAY = 86_400;
export const UNUSUAL_Z = 2;
/** A window price counts only if a point lands within this many days of the target. */
const TOLERANCE_DAYS = 2;
/** Pre-patch daily-return volatility lookback. */
const SIGMA_DAYS = 90;
/** Fewer pre-patch returns than this -> use the universe median sigma instead. */
const SIGMA_MIN_POINTS = 30;
/** Last-resort sigma when a whole patch lacks history (earliest 2015 patches): ~3%/day. */
const DEFAULT_DAILY_SIGMA = 0.03;
const TOP_N = 20;

/** Index of the last point at/before ts, or -1 (series ascending). */
function lastIndexAtOrBefore(series: DailyPoint[], ts: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.timestamp <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Price nearest ts within TOLERANCE_DAYS, else null. */
export function priceAt(series: DailyPoint[], ts: number): number | null {
  const i = lastIndexAtOrBefore(series, ts);
  const before = i >= 0 ? series[i]! : null;
  const after = i + 1 < series.length ? series[i + 1]! : null;
  const dBefore = before ? ts - before.timestamp : Infinity;
  const dAfter = after ? after.timestamp - ts : Infinity;
  const best = dBefore <= dAfter ? before : after;
  return best !== null && Math.min(dBefore, dAfter) <= TOLERANCE_DAYS * DAY ? best.price : null;
}

/** Patch-eve baseline: last price strictly before the patch, within tolerance. */
export function baselineAt(series: DailyPoint[], patchTs: number): number | null {
  const i = lastIndexAtOrBefore(series, patchTs - 1);
  if (i < 0) return null;
  const p = series[i]!;
  return patchTs - p.timestamp <= TOLERANCE_DAYS * DAY ? p.price : null;
}

/** Std dev of daily returns over SIGMA_DAYS pre-patch; null when history is thin. */
export function preDailySigma(series: DailyPoint[], patchTs: number): number | null {
  const end = lastIndexAtOrBefore(series, patchTs - 1);
  if (end < 0) return null;
  const start = Math.max(0, end - SIGMA_DAYS + 1);
  const returns: number[] = [];
  for (let i = start + 1; i <= end; i++) {
    const prev = series[i - 1]!.price;
    if (prev > 0) returns.push((series[i]!.price - prev) / prev);
  }
  if (returns.length < SIGMA_MIN_POINTS) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

/** 7d fractional change from the patch-eve baseline; null when either side is missing. */
export function change7After(series: DailyPoint[], patchTs: number): number | null {
  const base = baselineAt(series, patchTs);
  const after = priceAt(series, patchTs + 7 * DAY);
  return base !== null && base > 0 && after !== null ? (after - base) / base : null;
}

/** Mean volume over (from, to], needing >= 3 volume-bearing points. */
function avgVolume(series: DailyPoint[], from: number, to: number): number | null {
  const start = Math.max(0, lastIndexAtOrBefore(series, from) + 1);
  const end = lastIndexAtOrBefore(series, to);
  const vols: number[] = [];
  for (let i = start; i <= end; i++) {
    const v = series[i]!.volume;
    if (v !== null) vols.push(v);
  }
  if (vols.length < 3) return null;
  return vols.reduce((s, v) => s + v, 0) / vols.length;
}

export function computePatch(
  items: PatchItemInput[],
  patchTs: number,
  hasVolume: boolean,
): PatchComputation {
  interface Working {
    row: PatchItemRow;
    sigma: number | null;
  }
  const working: Working[] = [];
  for (const item of items) {
    const base = baselineAt(item.series, patchTs);
    if (base === null || base <= 0) continue;
    const rel = (p: number | null): number | null => (p === null ? null : (p - base) / base);
    const before7 = priceAt(item.series, patchTs - 7 * DAY);
    let volumeDelta7: number | null = null;
    if (hasVolume) {
      const before = avgVolume(item.series, patchTs - 28 * DAY, patchTs - 1);
      const after = avgVolume(item.series, patchTs - 1, patchTs + 7 * DAY);
      volumeDelta7 = before !== null && before > 0 && after !== null ? after / before - 1 : null;
    }
    working.push({
      sigma: preDailySigma(item.series, patchTs),
      row: {
        id: item.id,
        name: item.name,
        icon: item.icon,
        change1: rel(priceAt(item.series, patchTs + 1 * DAY)),
        change7: rel(priceAt(item.series, patchTs + 7 * DAY)),
        change30: rel(priceAt(item.series, patchTs + 30 * DAY)),
        runup7: before7 !== null && before7 > 0 ? (base - before7) / before7 : null,
        zScore: null,
        volumeDelta7,
        mentioned: item.mentioned,
      },
    });
  }

  const windowDays: 1 | 7 = working.some((w) => w.row.change7 !== null) ? 7 : 1;
  const chg = (r: PatchItemRow): number | null => (windowDays === 7 ? r.change7 : r.change1);

  // Sigma fallback chain: own history -> universe median -> a sane default.
  // A zero sigma (perfectly flat pre-patch series) is unusable, same as null.
  const sigmas = working
    .map((w) => w.sigma)
    .filter((s): s is number => s !== null && s > 0)
    .sort((a, b) => a - b);
  const medianSigma = sigmas.length > 0 ? sigmas[Math.floor(sigmas.length / 2)]! : null;
  for (const w of working) {
    const change = chg(w.row);
    const own = w.sigma !== null && w.sigma > 0 ? w.sigma : null;
    const sigma = own ?? medianSigma ?? DEFAULT_DAILY_SIGMA;
    w.row.zScore = change === null ? null : change / (sigma * Math.sqrt(windowDays));
  }

  const rows = working.map((w) => w.row);
  const scored = rows.filter((r) => r.zScore !== null);
  const winners = scored
    .filter((r) => (chg(r) ?? 0) > 0)
    .sort((a, b) => b.zScore! - a.zScore! || (chg(b) ?? 0) - (chg(a) ?? 0))
    .slice(0, TOP_N);
  const losers = scored
    .filter((r) => (chg(r) ?? 0) < 0)
    .sort((a, b) => a.zScore! - b.zScore! || (chg(a) ?? 0) - (chg(b) ?? 0))
    .slice(0, TOP_N);

  return {
    windowDays,
    universeSize: rows.length,
    winners,
    losers,
    impact:
      scored.length === 0
        ? null
        : scored.filter((r) => Math.abs(r.zScore!) >= UNUSUAL_Z).length / scored.length,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w server -- src/patchStats.test.ts`
Expected: PASS (all tests). If the run-up or baseline assertions disagree by one day, re-read `baselineAt` — the baseline must be **strictly before** `patchTs` (day 99, not day 100).

- [ ] **Step 5: Commit**

```bash
git add server/src/patchStats.ts server/src/patchStats.test.ts
git commit -m "feat(server): event-study math — windows, z-scores, impact, volume spikes"
```

---

### Task 5: Tags, analogues, evidence (`patchTags.ts`)

**Files:**
- Create: `server/src/patchTags.ts`
- Test: `server/src/patchTags.test.ts`

**Interfaces:**
- Consumes: `AnaloguePatch`, `UpcomingEvidence` from `@osrs-flip/shared`.
- Produces (used by task 7):
  - `TAG_VOCABULARY: readonly string[]`
  - `extractTags(title: string, wikitext: string): string[]`
  - `tagSimilarity(a: string[], b: string[]): number`
  - `pickAnalogues(featureTags: string[], patches: { pageid: number; title: string; date: string; tags: string[] }[]): AnaloguePatch[]`
  - `aggregateEvidence(changes: number[]): UpcomingEvidence | null`

- [ ] **Step 1: Write the failing tests**

Create `server/src/patchTags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aggregateEvidence, extractTags, pickAnalogues, tagSimilarity } from './patchTags.js';

describe('extractTags', () => {
  it('tags a term found in the title even once', () => {
    expect(extractTags('New Slayer Boss!', 'body without keywords')).toEqual(
      expect.arrayContaining(['slayer', 'boss']),
    );
  });

  it('requires two body occurrences when the title lacks the term', () => {
    expect(extractTags('Weekly update', 'the raid was fun')).not.toContain('raid');
    expect(extractTags('Weekly update', 'the raid begins. A raid party forms.')).toContain('raid');
  });

  it('matches whole words only — no "boss" inside "embossed"', () => {
    expect(extractTags('Embossed leather', 'embossed and embossed again')).not.toContain('boss');
  });

  it('matches multi-word terms across whitespace', () => {
    expect(extractTags('Drop Table Changes', '')).toContain('drop table');
  });
});

describe('tagSimilarity', () => {
  it('is Jaccard: identical 1, disjoint 0, half-overlap computed', () => {
    expect(tagSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(tagSimilarity(['a'], ['b'])).toBe(0);
    expect(tagSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('is 0 when either set is empty', () => {
    expect(tagSimilarity([], ['a'])).toBe(0);
    expect(tagSimilarity(['a'], [])).toBe(0);
  });
});

describe('pickAnalogues', () => {
  const patch = (pageid: number, date: string, tags: string[]) => ({
    pageid,
    title: `P${pageid}`,
    date,
    tags,
  });

  it('returns the most similar patches above the floor, capped at 5, newest breaking ties', () => {
    const patches = [
      patch(1, '2024-01-01', ['slayer', 'boss']),
      patch(2, '2025-01-01', ['slayer', 'boss']),
      patch(3, '2023-01-01', ['cooking']),
      patch(4, '2023-06-01', ['slayer', 'boss', 'reward']),
      patch(5, '2022-01-01', ['slayer']),
      patch(6, '2021-01-01', ['slayer', 'boss']),
      patch(7, '2020-01-01', ['slayer', 'boss']),
    ];
    const picked = pickAnalogues(['slayer', 'boss'], patches);
    expect(picked).toHaveLength(5);
    expect(picked[0]!.pageid).toBe(2); // similarity 1, newest first
    expect(picked.map((p) => p.pageid)).not.toContain(3); // disjoint -> below floor
    expect(picked[0]!.similarity).toBe(1);
  });
});

describe('aggregateEvidence', () => {
  it('summarises median, IQR and positive share', () => {
    const e = aggregateEvidence([-0.1, -0.05, 0, 0.05, 0.1])!;
    expect(e.median7).toBeCloseTo(0, 5);
    expect(e.iqrLow7).toBeCloseTo(-0.05, 5);
    expect(e.iqrHigh7).toBeCloseTo(0.05, 5);
    expect(e.pctPositive).toBeCloseTo(2 / 5, 5);
    expect(e.sampleSize).toBe(5);
  });

  it('refuses to summarise under 5 samples', () => {
    expect(aggregateEvidence([0.1, 0.2, 0.3, 0.4])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w server -- src/patchTags.test.ts`
Expected: FAIL — cannot resolve `./patchTags.js`.

- [ ] **Step 3: Implement `server/src/patchTags.ts`**

```ts
import type { AnaloguePatch, UpcomingEvidence } from '@osrs-flip/shared';

/**
 * Lexical tagging + analogue matching for Patch Impact. The vocabulary is
 * content signals ONLY — deliberately no sentiment terms (buff/nerf):
 * direction always comes from measured history of analogous patches, never
 * from parsing an announcement's wording (see the design spec).
 */
export const TAG_VOCABULARY: readonly string[] = [
  // skills (incl. Sailing)
  'attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft',
  'construction', 'hitpoints', 'agility', 'herblore', 'thieving', 'crafting',
  'fletching', 'slayer', 'hunter', 'mining', 'smithing', 'fishing', 'cooking',
  'firemaking', 'woodcutting', 'farming', 'sailing',
  // content signals
  'boss', 'raid', 'quest', 'minigame', 'wilderness', 'pvp', 'pvm',
  'drop table', 'reward', 'tradeable', 'cosmetic', 'holiday', 'leagues',
  'deadman', 'poll', 'combat', 'achievement diary',
];

/** Tags = vocabulary terms in the title, or appearing >= 2 times in the body. */
export function extractTags(title: string, wikitext: string): string[] {
  const tags: string[] = [];
  const t = title.toLowerCase();
  const body = wikitext.toLowerCase();
  for (const term of TAG_VOCABULARY) {
    const pattern = `\\b${term.replace(/ /g, '\\s+')}\\b`;
    if (new RegExp(pattern).test(t)) {
      tags.push(term);
      continue;
    }
    const hits = body.match(new RegExp(pattern, 'g'));
    if (hits !== null && hits.length >= 2) tags.push(term);
  }
  return tags;
}

/** Jaccard similarity of two tag sets (0 when either is empty). */
export function tagSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const inter = a.filter((tag) => setB.has(tag)).length;
  return inter / new Set([...a, ...b]).size;
}

/** Analogues need at least this much tag overlap to count as "similar". */
const MIN_SIMILARITY = 0.25;
const MAX_ANALOGUES = 5;

/** Top analogues among past patches: highest tag similarity, newest breaking ties. */
export function pickAnalogues(
  featureTags: string[],
  patches: { pageid: number; title: string; date: string; tags: string[] }[],
): AnaloguePatch[] {
  return patches
    .map((p) => ({
      pageid: p.pageid,
      title: p.title,
      date: p.date,
      similarity: tagSimilarity(featureTags, p.tags),
    }))
    .filter((p) => p.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity || b.date.localeCompare(a.date))
    .slice(0, MAX_ANALOGUES);
}

/** Linear-interpolated quantile of an ascending-sorted array. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Distribution of 7d moves; null under 5 samples (too few to summarise honestly). */
export function aggregateEvidence(changes: number[]): UpcomingEvidence | null {
  if (changes.length < 5) return null;
  const sorted = [...changes].sort((a, b) => a - b);
  return {
    median7: quantile(sorted, 0.5),
    iqrLow7: quantile(sorted, 0.25),
    iqrHigh7: quantile(sorted, 0.75),
    pctPositive: changes.filter((c) => c > 0).length / changes.length,
    sampleSize: changes.length,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w server -- src/patchTags.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/patchTags.ts server/src/patchTags.test.ts
git commit -m "feat(server): lexical tags, Jaccard analogues, evidence aggregation"
```

---

### Task 6: Upstream IO clients (`gloop.ts`, `updates.ts`)

Thin IO wrappers, disk-backed via task 2's helpers. No unit tests — matches the codebase convention (`wiki.ts` has none; the logic worth testing is pure and already tested). Verified live in task 7.

**Files:**
- Create: `server/src/gloop.ts`, `server/src/updates.ts`

**Interfaces:**
- Consumes: `config` (task 2), `readJsonFile`/`writeJsonFile` (task 2), `DailyPoint` (task 4).
- Produces (used by task 7):
  - `getFullHistory(id: number): Promise<DailyPoint[]>`
  - `listUpdatePages(): Promise<{ pageid: number; title: string }[]>`
  - `getUpdatePages(refs, onProgress?): Promise<{ pageid: number; title: string; wikitext: string }[]>`
  - `getUpcomingWikitext(): Promise<{ wikitext: string; fetchedAt: number }>`

- [ ] **Step 1: Implement `server/src/gloop.ts`**

```ts
import path from 'node:path';
import { config, repoRoot } from './config.js';
import { readJsonFile, writeJsonFile } from './diskCache.js';
import type { DailyPoint } from './patchStats.js';

/**
 * Weirdgloop exchange archive: full multi-year daily price history, one item
 * per request (verified: the /all route rejects multiple ids). Disk-cached —
 * history is immutable, so a restart must never re-hammer the API.
 */
const CACHE_DIR = path.join(repoRoot, 'server', 'data', 'patch-cache', 'prices');
/** One point moves per day; a refetch replaces the whole file with one cheap call. */
const FRESH_MS = 24 * 60 * 60 * 1000;

interface GloopPoint {
  id: string;
  price: number;
  volume: number | null;
  /** Unix MILLISECONDS in the upstream payload. */
  timestamp: number;
}

interface StoredHistory {
  fetchedAt: number;
  points: DailyPoint[];
}

export async function getFullHistory(id: number): Promise<DailyPoint[]> {
  const file = path.join(CACHE_DIR, `${id}.json`);
  const cached = await readJsonFile<StoredHistory>(file);
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return cached.points;
  try {
    const res = await fetch(`${config.gloopApiBase}/all?id=${id}`, {
      headers: { 'User-Agent': config.userAgent },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`weirdgloop ${id} responded ${res.status}`);
    const body = (await res.json()) as Record<string, GloopPoint[]>;
    const points: DailyPoint[] = (body[String(id)] ?? []).map((p) => ({
      timestamp: Math.floor(p.timestamp / 1000),
      price: p.price,
      volume: p.volume,
    }));
    await writeJsonFile(file, { fetchedAt: Date.now(), points } satisfies StoredHistory);
    return points;
  } catch (err) {
    if (cached) return cached.points; // stale archive beats no archive
    throw err;
  }
}
```

- [ ] **Step 2: Implement `server/src/updates.ts`**

```ts
import path from 'node:path';
import { config, repoRoot } from './config.js';
import { readJsonFile, writeJsonFile } from './diskCache.js';

/**
 * OSRS wiki MediaWiki API client for update posts. Listing is 500 pages per
 * request (~3 calls for the whole Update: namespace); wikitext comes in bulk
 * batches of 50 pageids and is disk-cached FOREVER — update posts are
 * immutable once published, so each page is fetched exactly once, ever.
 */
const CACHE_DIR = path.join(repoRoot, 'server', 'data', 'patch-cache', 'updates');
const UPCOMING_FILE = path.join(repoRoot, 'server', 'data', 'patch-cache', 'upcoming.json');
const UPCOMING_FRESH_MS = 12 * 60 * 60 * 1000;
const PAGE_BATCH = 50;
/** Pause between bulk wikitext calls — backfill politeness. */
const BATCH_DELAY_MS = 250;
/** The wiki's Update: namespace. */
const UPDATE_NS = '112';

export interface UpdatePageRef {
  pageid: number;
  title: string;
}

export interface StoredUpdatePage {
  pageid: number;
  title: string;
  wikitext: string;
}

async function mwFetch<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(`${config.mediawikiApiBase}?${qs}`, {
    headers: { 'User-Agent': config.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`mediawiki API responded ${res.status}`);
  return (await res.json()) as T;
}

/** Every page in the Update: namespace (~1,100 refs). */
export async function listUpdatePages(): Promise<UpdatePageRef[]> {
  const refs: UpdatePageRef[] = [];
  let apcontinue: string | undefined;
  do {
    const body = await mwFetch<{
      continue?: { apcontinue: string };
      query: { allpages: { pageid: number; title: string }[] };
    }>({
      action: 'query',
      list: 'allpages',
      apnamespace: UPDATE_NS,
      aplimit: '500',
      ...(apcontinue ? { apcontinue } : {}),
    });
    refs.push(...body.query.allpages);
    apcontinue = body.continue?.apcontinue;
  } while (apcontinue !== undefined);
  return refs;
}

/** Wikitext per page: disk first, then missing pages in bulk batches of 50. */
export async function getUpdatePages(
  refs: UpdatePageRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<StoredUpdatePage[]> {
  const pages: StoredUpdatePage[] = [];
  const missing: UpdatePageRef[] = [];
  for (const ref of refs) {
    const cached = await readJsonFile<StoredUpdatePage>(path.join(CACHE_DIR, `${ref.pageid}.json`));
    if (cached) pages.push(cached);
    else missing.push(ref);
  }
  let done = refs.length - missing.length;
  onProgress?.(done, refs.length);

  for (let i = 0; i < missing.length; i += PAGE_BATCH) {
    const batch = missing.slice(i, i + PAGE_BATCH);
    const body = await mwFetch<{
      query: {
        pages: {
          pageid: number;
          title: string;
          missing?: boolean;
          revisions?: { slots: { main: { content: string } } }[];
        }[];
      };
    }>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      pageids: batch.map((r) => r.pageid).join('|'),
    });
    for (const p of body.query.pages) {
      const content = p.revisions?.[0]?.slots.main.content;
      if (p.missing === true || content === undefined) continue;
      const stored: StoredUpdatePage = { pageid: p.pageid, title: p.title, wikitext: content };
      await writeJsonFile(path.join(CACHE_DIR, `${p.pageid}.json`), stored);
      pages.push(stored);
    }
    done += batch.length;
    onProgress?.(done, refs.length);
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return pages;
}

/** The "Upcoming updates" page's wikitext, disk-cached 12h, stale-on-error. */
export async function getUpcomingWikitext(): Promise<{ wikitext: string; fetchedAt: number }> {
  const cached = await readJsonFile<{ fetchedAt: number; wikitext: string }>(UPCOMING_FILE);
  if (cached && Date.now() - cached.fetchedAt < UPCOMING_FRESH_MS) return cached;
  try {
    const body = await mwFetch<{ parse: { wikitext: string } }>({
      action: 'parse',
      page: 'Upcoming updates',
      prop: 'wikitext',
    });
    const fresh = { fetchedAt: Date.now(), wikitext: body.parse.wikitext };
    await writeJsonFile(UPCOMING_FILE, fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached; // stale beats nothing
    throw err;
  }
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add server/src/gloop.ts server/src/updates.ts
git commit -m "feat(server): weirdgloop + MediaWiki clients, disk-backed"
```

---

### Task 7: Overlay, build orchestrator, API routes

**Files:**
- Create: `server/src/data/patchOverrides.ts`, `server/src/patches.ts`
- Modify: `server/src/routes.ts`
- Test: `server/src/patches.test.ts`

**Interfaces:**
- Consumes: everything produced by tasks 1–6.
- Produces: `getPatches(): PatchesResponse`, `getPatchDetail(pageid: number): PatchDetail | null`, `getUpcoming(): UpcomingResponse`, `applyOverrides(summaries: PatchSummary[], overrides: PatchOverrides): PatchSummary[]`; HTTP endpoints `GET /api/patches`, `GET /api/patches/upcoming`, `GET /api/patches/:pageid` (client tasks 8–10 consume these).

- [ ] **Step 1: Create the empty curation overlay `server/src/data/patchOverrides.ts`**

```ts
/**
 * OPTIONAL hand-curation overlay for Patch Impact — SHIPPED EMPTY, and the
 * feature is complete without it (zero-maintenance by default, per the
 * design spec). Fill in to hide a noise post, pin a landmark patch, or
 * annotate an upcoming feature with a hand-written note.
 */
export interface PatchOverrides {
  /** Update pageids to drop from the list entirely. */
  hidePatches: number[];
  /** Update pageids to float to the top of the list, in this order. */
  pinPatches: number[];
  /** Notes shown on upcoming features, keyed by the feature's section anchor. */
  upcomingNotes: Record<string, string>;
}

export const PATCH_OVERRIDES: PatchOverrides = {
  hidePatches: [],
  pinPatches: [],
  upcomingNotes: {},
};
```

- [ ] **Step 2: Write the failing overlay test**

Create `server/src/patches.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PatchSummary } from '@osrs-flip/shared';
import { applyOverrides } from './patches.js';

function summary(pageid: number, date: string): PatchSummary {
  return {
    pageid,
    title: `Patch ${pageid}`,
    date,
    wikiUrl: `https://oldschool.runescape.wiki/w/Update:Patch_${pageid}`,
    impact: 0.1,
    topWinner: null,
    topLoser: null,
  };
}

describe('applyOverrides', () => {
  const list = [summary(3, '2026-03-01'), summary(2, '2026-02-01'), summary(1, '2026-01-01')];

  it('is identity for the shipped-empty overlay', () => {
    expect(applyOverrides(list, { hidePatches: [], pinPatches: [], upcomingNotes: {} })).toEqual(list);
  });

  it('hides listed pageids', () => {
    const out = applyOverrides(list, { hidePatches: [2], pinPatches: [], upcomingNotes: {} });
    expect(out.map((s) => s.pageid)).toEqual([3, 1]);
  });

  it('floats pins to the top in pin order, keeping the rest in date order', () => {
    const out = applyOverrides(list, { hidePatches: [], pinPatches: [1, 2], upcomingNotes: {} });
    expect(out.map((s) => s.pageid)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -w server -- src/patches.test.ts`
Expected: FAIL — cannot resolve `./patches.js`.

- [ ] **Step 4: Implement `server/src/patches.ts`**

```ts
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
```

- [ ] **Step 5: Run the overlay test**

Run: `npm test -w server -- src/patches.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Register the routes**

In `server/src/routes.ts`, add imports:

```ts
import { getPatchDetail, getPatches, getUpcoming } from './patches.js';
```

and inside `registerApiRoutes`, after the `/api/longterm` route:

```ts
  // Patch Impact (premium page; enforcement is client-side until payments exist)
  app.get('/api/patches', async () => getPatches());

  app.get('/api/patches/upcoming', async () => getUpcoming());

  app.get<{ Params: { pageid: string } }>('/api/patches/:pageid', async (req, reply) => {
    const pageid = Number(req.params.pageid);
    if (!Number.isInteger(pageid) || pageid <= 0) {
      return reply.code(400).send({ error: 'pageid must be a positive integer' });
    }
    const detail = getPatchDetail(pageid);
    if (detail === null) {
      return reply.code(404).send({ error: 'Unknown patch (or analysis still building)' });
    }
    return detail;
  });
```

(Fastify's router matches the static `/upcoming` segment before the `:pageid` param regardless of registration order, but keeping this order makes the intent obvious.)

- [ ] **Step 7: Typecheck + full server tests**

Run: `npm run typecheck`
Run: `npm test -w server`
Expected: both clean.

- [ ] **Step 8: Live verification (backfill run)**

This is the one-time backfill — expect a few minutes on first run.

Run: `npm run build`
Run (background): `npm start`
Then poll:

```bash
curl -s localhost:3000/api/patches | head -c 400
```

Expected first: `{"status":"building","progress":0.0...}`. Repeat every ~30s until `"status":"ready"`. Then verify, recording actual outputs:

```bash
curl -s localhost:3000/api/patches | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['status'], len(d['patches']), d['warnings']); print(d['patches'][0])"
curl -s "localhost:3000/api/patches/$(curl -s localhost:3000/api/patches | python3 -c "import json,sys; print(json.load(sys.stdin)['patches'][0]['pageid'])")" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['title'], d['windowDays'], d['dataQuality'], len(d['winners']), len(d['losers']), d['tags'][:5])"
curl -s localhost:3000/api/patches/upcoming | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['status'], [(f['title'], len(f['items']), f['evidence'] is not None) for f in d['features']][:6])"
curl -s localhost:3000/api/patches/999999999 -o /dev/null -w "%{http_code}\n"
```

Expected: several hundred patches, newest first; a plausible detail (20/20 winners/losers on a major patch, sane tags); at least one upcoming feature with items; `404` for the bogus pageid. Sanity-check one famous patch by eye (e.g. a Leagues launch should show high impact). Restart the server and confirm `/api/patches` reaches `ready` in seconds (disk cache hit, no re-backfill) — check `ls server/data/patch-cache/prices | wc -l` ≈ 400. Kill the background server when done. Record the observed numbers in the task summary for the DECISIONS entry (task 11).

- [ ] **Step 9: Commit**

```bash
git add server/src/patches.ts server/src/patches.test.ts server/src/data/patchOverrides.ts server/src/routes.ts
git commit -m "feat(server): Patch Impact build orchestrator + /api/patches endpoints"
```

---

### Task 8: Client page — lock, list, sort, URL state

**Files:**
- Create: `client/src/pages/PatchesPage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `/api/patches` (task 7), `useTier` (`entitlements.patchAnalysis`), `PatchesResponse`/`PatchSummary` types, `Icon`/`GpText`/`ItemIcon`/`TableSkeleton`/`UnlockStrip` components.
- Produces: route `/patches` with URL state `?patch=<pageid>&sort=date|impact`; exports `Pct` (shared by tasks 9–10); renders `<PatchDetailPanel pageid={n} />` and `<UpcomingFeatures />` — task 8 ships with both **stubbed as `null` returns** in their own files so this task typechecks alone.

- [ ] **Step 1: Create stub components** (filled in by tasks 9–10)

`client/src/components/PatchDetailPanel.tsx`:

```tsx
export function PatchDetailPanel(_props: { pageid: number }) {
  return null; // implemented in the next task
}
```

`client/src/components/UpcomingFeatures.tsx`:

```tsx
export function UpcomingFeatures() {
  return null; // implemented in a later task
}
```

- [ ] **Step 2: Create `client/src/pages/PatchesPage.tsx`**

```tsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { PatchesResponse, PatchSummary } from '@osrs-flip/shared';
import { Icon } from '../components/Icon';
import { PatchDetailPanel } from '../components/PatchDetailPanel';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';
import { UpcomingFeatures } from '../components/UpcomingFeatures';
import { useTier } from '../lib/tier';

/** Coloured percent, shared by the patch tables and upcoming cards. */
export function Pct({ value, digits = 1 }: { value: number | null; digits?: number }) {
  if (value === null) return <span className="opacity-40">—</span>;
  const cls = value > 0 ? 'text-osrs-green' : value < 0 ? 'text-osrs-red' : 'opacity-70';
  return (
    <span className={`${cls} tabular-nums`}>
      {value > 0 ? '+' : ''}
      {(value * 100).toFixed(digits)}%
    </span>
  );
}

function LockedPatches() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="rounded border border-panel-border bg-panel p-6 text-center">
        <Icon name="lock" size={28} className="text-gold" />
        <h1 className="mt-2 text-xl font-bold text-gold">Patch Impact is a Premium feature</h1>
        <p className="mt-2 text-sm opacity-80">
          Every OSRS update since 2015, ranked by how hard it actually moved the market — the
          biggest winners and losers of each patch, anticipation run-ups, and an items-to-watch
          list for announced content backed by measured history instead of hype.
        </p>
      </div>
      <UnlockStrip>
        Patch winners &amp; losers back to 2015, plus the upcoming-content watchlist.
      </UnlockStrip>
    </div>
  );
}

async function fetchPatches(): Promise<PatchesResponse> {
  const res = await fetch('/api/patches');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<PatchesResponse>;
}

function ImpactBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs opacity-40">too recent</span>;
  const pct = Math.round(value * 100);
  return (
    <span
      className="flex items-center gap-2"
      title="Share of screened items whose move after this update was unusual for that item (≥2σ vs its own history)"
    >
      <span className="h-1.5 w-24 overflow-hidden rounded bg-panel-light">
        <span
          className="block h-full bg-gold"
          style={{ width: `${Math.min(100, value * 300)}%` }}
        />
      </span>
      <span className="text-xs tabular-nums opacity-70">{pct}%</span>
    </span>
  );
}

type SortMode = 'date' | 'impact';

function PatchesContent() {
  const [params, setParams] = useSearchParams();
  const sort: SortMode = params.get('sort') === 'impact' ? 'impact' : 'date';
  const selectedRaw = Number(params.get('patch'));
  const selected = Number.isInteger(selectedRaw) && selectedRaw > 0 ? selectedRaw : null;

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['patches'],
    queryFn: fetchPatches,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 2_000 : 15 * 60_000),
  });

  const patches = useMemo(() => {
    if (!data) return [];
    if (sort === 'date') return data.patches;
    return [...data.patches].sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
  }, [data, sort]);

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  if (isPending) return <TableSkeleton rows={12} />;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  const sortButton = (value: SortMode, label: string) => (
    <button
      onClick={() => setParam('sort', value === 'date' ? null : value)}
      className={`rounded px-3 py-1 text-xs font-medium ${
        sort === value ? 'bg-gold text-ink' : 'bg-panel-light text-parchment/70 hover:text-parchment'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
        <Icon name="warning" className="mr-1" /> Historical evidence, not financial advice —
        patch reactions vary wildly, and past updates don't bind future ones.
      </div>

      <UpcomingFeatures />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gold">Past patches</h2>

        {data.warnings.map((w) => (
          <div
            key={w}
            className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-xs text-amber-300"
          >
            <Icon name="warning" className="mr-1" size={12} /> {w}
          </div>
        ))}

        {data.status === 'building' && (
          <div className="rounded border border-panel-border bg-panel px-3 py-2 text-sm">
            <div className="mb-1 flex justify-between text-xs opacity-70">
              <span>Analysing every update since 2015 against the price archive…</span>
              <span>{Math.round(data.progress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-panel-light">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${data.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {sortButton('date', 'Newest first')}
          {sortButton('impact', 'Biggest impact')}
          <span className="text-xs opacity-60">{patches.length} game updates analysed</span>
        </div>

        <div
          className="overflow-auto rounded border border-panel-border bg-panel"
          style={{ maxHeight: 'calc(100vh - 340px)', minHeight: 160 }}
        >
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-panel-light shadow">
              <tr>
                {['Date', 'Update', 'Market impact', 'Top winner', 'Top loser'].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patches.map((p: PatchSummary) => (
                <tr
                  key={p.pageid}
                  onClick={() => setParam('patch', selected === p.pageid ? null : String(p.pageid))}
                  aria-selected={selected === p.pageid}
                  className={`cursor-pointer border-t border-panel-border/50 hover:bg-panel-light ${
                    selected === p.pageid ? 'bg-panel-light' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums opacity-80">{p.date}</td>
                  <td className="px-3 py-1.5">{p.title}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <ImpactBar value={p.impact} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {p.topWinner ? (
                      <span>
                        {p.topWinner.name} <Pct value={p.topWinner.change} />
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {p.topLoser ? (
                      <span>
                        {p.topLoser.name} <Pct value={p.topLoser.change} />
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {patches.length === 0 && data.status === 'ready' && (
            <div className="p-10 text-center text-sm opacity-60">No analysed updates yet.</div>
          )}
        </div>
      </section>

      {selected !== null && <PatchDetailPanel pageid={selected} />}
    </div>
  );
}

export default function PatchesPage() {
  const { entitlements } = useTier();
  if (!entitlements.patchAnalysis) return <LockedPatches />;
  return <PatchesContent />;
}
```

- [ ] **Step 3: Register route + nav tab in `client/src/App.tsx`**

Add the import with the other page imports:

```tsx
import PatchesPage from './pages/PatchesPage';
```

Add the tab after the Long-term tab (`<Tab to="/longterm" ... />`):

```tsx
<Tab to="/patches" label="Patches" />
```

Add the route after the `/longterm` route:

```tsx
<Route path="/patches" element={<PatchesPage />} />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Visual smoke check**

Run: `npm run dev` (background), open http://localhost:5173/patches.
- Free tier: lock panel + "Unlock with Premium", **no** `/api/patches` request in the network tab.
- Redeem `GEFF-DEV-2026` on `/premium`, revisit `/patches`: building bar then the table; sort buttons flip order and set `?sort=impact`; clicking a row sets `?patch=<id>` (detail panel is still a stub — nothing renders yet, that's expected).
Stop the dev server after.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/PatchesPage.tsx client/src/components/PatchDetailPanel.tsx client/src/components/UpcomingFeatures.tsx client/src/App.tsx
git commit -m "feat(client): /patches page — premium lock, patch list, impact sort, URL state"
```

---

### Task 9: Patch detail panel (winners/losers)

**Files:**
- Modify: `client/src/components/PatchDetailPanel.tsx` (replace the stub)

**Interfaces:**
- Consumes: `/api/patches/:pageid`, `PatchDetail`/`PatchItemRow` types, `Pct` from `../pages/PatchesPage`, `ItemIcon`, `Icon`, `TableSkeleton`.
- Produces: `PatchDetailPanel({ pageid: number })` — already mounted by task 8.

- [ ] **Step 1: Implement the panel**

Replace the stub file's content:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PatchDetail, PatchItemRow } from '@osrs-flip/shared';
import { Pct } from '../pages/PatchesPage';
import { ItemIcon } from './ItemIcon';
import { TableSkeleton } from './Skeleton';

async function fetchDetail(pageid: number): Promise<PatchDetail> {
  const res = await fetch(`/api/patches/${pageid}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<PatchDetail>;
}

function MoveTable({
  title,
  rows,
  hasVolume,
  windowDays,
}: {
  title: string;
  rows: PatchItemRow[];
  hasVolume: boolean;
  windowDays: 1 | 7;
}) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">{title}</h3>
      <div className="overflow-auto rounded border border-panel-border bg-panel">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-panel-light">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold">Item</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">7d</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">1d</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">30d</th>
              <th
                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold"
                title="Change over the 7 days BEFORE the patch — anticipation buying"
              >
                Run-up
              </th>
              {hasVolume && (
                <th
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold"
                  title="Avg daily volume 7d after vs 28d before"
                >
                  Vol Δ
                </th>
              )}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-panel-border/50 hover:bg-panel-light">
                <td className="whitespace-nowrap px-3 py-1.5">
                  <Link to={`/item/${r.id}`} className="flex items-center gap-2 hover:text-gold">
                    <ItemIcon icon={r.icon} name={r.name} />
                    {r.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.change7} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.change1} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.change30} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.runup7} /></td>
                {hasVolume && (
                  <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.volumeDelta7} digits={0} /></td>
                )}
                <td className="whitespace-nowrap px-3 py-1.5">
                  {r.zScore !== null && Math.abs(r.zScore) >= 2 && (
                    <span
                      className="mr-1 rounded bg-purple-900/60 px-1 text-[10px] uppercase tracking-wide text-purple-300"
                      title={`Moved ${Math.abs(r.zScore).toFixed(1)}σ vs its own ${windowDays}d volatility`}
                    >
                      unusual
                    </span>
                  )}
                  {r.mentioned && (
                    <span
                      className="rounded bg-sky-900/60 px-1 text-[10px] uppercase tracking-wide text-sky-300"
                      title="This item is linked in the update's patch notes"
                    >
                      mentioned
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-6 text-center text-sm opacity-60">No significant movers.</div>
        )}
      </div>
    </div>
  );
}

export function PatchDetailPanel({ pageid }: { pageid: number }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['patch', pageid],
    queryFn: () => fetchDetail(pageid),
    staleTime: 15 * 60_000,
  });

  if (isPending) return <TableSkeleton rows={6} />;
  if (isError) {
    return (
      <div className="p-6 text-center text-osrs-red">
        Failed to load patch: {(error as Error).message}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label={`Patch detail: ${data.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gold">{data.title}</h2>
        <span className="text-xs tabular-nums opacity-70">{data.date}</span>
        <a
          href={data.wikiUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gold underline"
        >
          Wiki
        </a>
        {data.tags.map((t) => (
          <span
            key={t}
            className="rounded bg-panel-light px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-parchment/70"
          >
            {t}
          </span>
        ))}
      </div>

      <p className="text-xs opacity-70">
        {data.universeSize.toLocaleString('en-US')} liquid items screened
        {data.windowDays === 1 && ' · ranked on the 1-day move (patch is under a week old)'}
        {data.dataQuality === 'priceOnly' &&
          ' · price archive only — the exchange has no volume data before Sept 2018'}
      </p>

      <div className="flex flex-col gap-4 lg:flex-row">
        <MoveTable
          title="Winners"
          rows={data.winners}
          hasVolume={data.dataQuality === 'full'}
          windowDays={data.windowDays}
        />
        <MoveTable
          title="Losers"
          rows={data.losers}
          hasVolume={data.dataQuality === 'full'}
          windowDays={data.windowDays}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Visual check**

With `npm run dev` and premium unlocked: select a major patch row — winners/losers tables render side by side (stacked below `lg`), item links navigate to item detail, "unusual"/"mentioned" badges appear, a pre-2018 patch shows the priceOnly notice and no Vol Δ column. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/PatchDetailPanel.tsx
git commit -m "feat(client): patch detail panel — winners/losers with z badges and run-up"
```

---

### Task 10: Upcoming watchlist section

**Files:**
- Modify: `client/src/components/UpcomingFeatures.tsx` (replace the stub)

**Interfaces:**
- Consumes: `/api/patches/upcoming`, `UpcomingResponse`/`UpcomingFeature`/`UpcomingItem` types, `Pct`, `GpText`, `ItemIcon`.
- Produces: `UpcomingFeatures()` — already mounted at the top of the page by task 8.

- [ ] **Step 1: Implement the section**

Replace the stub file's content:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { UpcomingFeature, UpcomingResponse } from '@osrs-flip/shared';
import { Pct } from '../pages/PatchesPage';
import { GpText } from './GpText';
import { ItemIcon } from './ItemIcon';

async function fetchUpcoming(): Promise<UpcomingResponse> {
  const res = await fetch('/api/patches/upcoming');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<UpcomingResponse>;
}

function EvidenceLine({ feature }: { feature: UpcomingFeature }) {
  const e = feature.evidence;
  if (e === null) {
    return (
      <p className="text-xs opacity-60">Not enough similar past updates to summarise honestly.</p>
    );
  }
  return (
    <p className="text-xs opacity-80">
      In the {feature.analogues.length} most similar past updates, mentioned items moved a median
      of <Pct value={e.median7} /> over 7 days (middle half <Pct value={e.iqrLow7} />…
      <Pct value={e.iqrHigh7} />; {Math.round(e.pctPositive * 100)}% rose; n={e.sampleSize}).
    </p>
  );
}

function FeatureCard({ feature }: { feature: UpcomingFeature }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-panel-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://oldschool.runescape.wiki/w/Upcoming_updates#${feature.anchor}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-parchment hover:text-gold"
        >
          {feature.title}
        </a>
        {feature.tags.map((t) => (
          <span
            key={t}
            className="rounded bg-panel-light px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-parchment/70"
          >
            {t}
          </span>
        ))}
      </div>

      {feature.note !== null && <p className="text-xs italic opacity-80">{feature.note}</p>}
      <EvidenceLine feature={feature} />

      <ul className="flex flex-col gap-1">
        {feature.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Link to={`/item/${item.id}`} className="flex items-center gap-2 hover:text-gold">
              <ItemIcon icon={item.icon} name={item.name} size={20} />
              {item.name}
            </Link>
            <GpText amount={item.price === null ? null : Math.round(item.price)} />
            {item.history.length > 0 && (
              <span className="text-xs opacity-80">
                past mentions:{' '}
                {item.history.map((h, i) => (
                  <span key={h.pageid} title={`${h.title} (${h.date})`}>
                    {i > 0 && ' · '}
                    <Pct value={h.change7} />
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Items to watch": announced future content + measured historical evidence. */
export function UpcomingFeatures() {
  const { data } = useQuery({
    queryKey: ['patches-upcoming'],
    queryFn: fetchUpcoming,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 5_000 : 30 * 60_000),
  });

  if (!data || data.status === 'building') return null; // page-level progress bar covers this
  if (data.features.length === 0) {
    return (
      <p className="text-sm opacity-60">
        No announced upcoming content currently mentions tradeable items.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gold">
        Upcoming — items to watch
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.features.map((f) => (
          <FeatureCard key={f.anchor} feature={f} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Visual check**

With `npm run dev` and premium unlocked: `/patches` shows the upcoming cards above the past-patches table — feature titles link to the wiki page anchors, tag chips render, evidence sentence or the "not enough similar" fallback appears, item rows show price + past-mention percents with patch-title tooltips. Check 390px width: cards stack single-column. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/UpcomingFeatures.tsx
git commit -m "feat(client): upcoming watchlist — analogue evidence + same-item history"
```

---

### Task 11: e2e, FAQ, README, DECISIONS, final verification

**Files:**
- Create: `e2e/patches.spec.ts`
- Modify: `client/src/pages/FaqPage.tsx`, `README.md`, `DECISIONS.md`

**Interfaces:**
- Consumes: the shipped feature; `unlockPremium` pattern from `e2e/premium-features.spec.ts`; mock pattern from `e2e/tools.spec.ts`.
- Produces: nothing downstream — this is the closing task.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/patches.spec.ts`. The three `/api/patches*` routes are **mocked** (hiscores-mock precedent): a cold live build takes minutes, unfit for the suite; the live pipeline was verified in task 7 step 8.

```ts
import { expect, test, type Page } from '@playwright/test';
import type { PatchDetail, PatchesResponse, UpcomingResponse } from '@osrs-flip/shared';

async function unlockPremium(page: Page) {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText('Premium is active on this browser')).toBeVisible();
}

const LIST: PatchesResponse = {
  status: 'ready',
  progress: 1,
  builtAt: 1_780_000_000,
  warnings: [],
  patches: [
    {
      pageid: 111,
      title: 'The Blood Moon Rises',
      date: '2026-06-30',
      wikiUrl: 'https://oldschool.runescape.wiki/w/Update:The_Blood_Moon_Rises',
      impact: 0.18,
      topWinner: { id: 4151, name: 'Abyssal whip', change: 0.21 },
      topLoser: { id: 13652, name: 'Dragon claws', change: -0.09 },
    },
    {
      pageid: 222,
      title: 'Quiet Week Patch',
      date: '2026-06-10',
      wikiUrl: 'https://oldschool.runescape.wiki/w/Update:Quiet_Week_Patch',
      impact: 0.01,
      topWinner: null,
      topLoser: null,
    },
  ],
};

const DETAIL: PatchDetail = {
  ...LIST.patches[0]!,
  dataQuality: 'full',
  tags: ['slayer', 'boss', 'quest'],
  universeSize: 400,
  windowDays: 7,
  winners: [
    {
      id: 4151,
      name: 'Abyssal whip',
      icon: 'Abyssal whip.png',
      change1: 0.05,
      change7: 0.21,
      change30: 0.18,
      runup7: 0.04,
      zScore: 5.2,
      volumeDelta7: 1.4,
      mentioned: true,
    },
  ],
  losers: [
    {
      id: 13652,
      name: 'Dragon claws',
      icon: 'Dragon claws.png',
      change1: -0.02,
      change7: -0.09,
      change30: -0.11,
      runup7: 0.01,
      zScore: -2.4,
      volumeDelta7: 0.2,
      mentioned: false,
    },
  ],
};

const UPCOMING: UpcomingResponse = {
  status: 'ready',
  builtAt: 1_780_000_000,
  features: [
    {
      anchor: 'Sailing_Rewards',
      title: 'Sailing Rewards',
      tags: ['sailing', 'reward'],
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          icon: 'Abyssal whip.png',
          price: 1_500_000,
          history: [
            { pageid: 111, title: 'The Blood Moon Rises', date: '2026-06-30', change7: 0.21 },
          ],
        },
      ],
      analogues: [
        {
          pageid: 111,
          title: 'The Blood Moon Rises',
          date: '2026-06-30',
          similarity: 0.5,
        },
      ],
      evidence: { median7: -0.04, iqrLow7: -0.09, iqrHigh7: 0.03, pctPositive: 0.4, sampleSize: 18 },
      note: null,
    },
  ],
};

async function mockPatchApi(page: Page) {
  await page.route('**/api/patches/upcoming', (route) => route.fulfill({ json: UPCOMING }));
  await page.route('**/api/patches/111', (route) => route.fulfill({ json: DETAIL }));
  await page.route('**/api/patches', (route) => route.fulfill({ json: LIST }));
}

test('free: patches page is fully locked and fetches no patch data', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/patches')) calls.push(r.url());
  });
  await page.goto('/patches');
  await expect(page.getByText('Patch Impact is a Premium feature')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unlock with Premium' })).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('premium: list renders, impact sort updates the URL, detail expands', async ({ page }) => {
  await mockPatchApi(page);
  await unlockPremium(page);
  await page.goto('/patches');

  await expect(page.getByText('The Blood Moon Rises', { exact: true })).toBeVisible();
  await expect(page.getByText('2 game updates analysed')).toBeVisible();

  await page.getByRole('button', { name: 'Biggest impact' }).click();
  await expect(page).toHaveURL(/sort=impact/);

  await page.getByText('The Blood Moon Rises', { exact: true }).click();
  await expect(page).toHaveURL(/patch=111/);
  await expect(page.getByRole('heading', { name: 'Winners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Losers' })).toBeVisible();
  await expect(page.getByText('unusual').first()).toBeVisible();
  await expect(page.getByText('mentioned', { exact: true })).toBeVisible();
  await expect(page.getByText('400 liquid items screened')).toBeVisible();
});

test('premium: upcoming watchlist shows evidence and item history', async ({ page }) => {
  await mockPatchApi(page);
  await unlockPremium(page);
  await page.goto('/patches');

  await expect(page.getByText('Upcoming — items to watch')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sailing Rewards' })).toBeVisible();
  await expect(page.getByText(/mentioned items moved a median/)).toBeVisible();
  await expect(page.getByText('past mentions:')).toBeVisible();
  await expect(
    page.getByText('Historical evidence, not financial advice', { exact: false }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Build + run the new spec**

Run: `npm run build`
Run: `npx playwright test e2e/patches.spec.ts`
Expected: 3 desktop tests PASS (mobile project only runs `mobile.spec.ts`). The three route globs don't overlap — `**/api/patches` must match the full URL, so it does not swallow `/api/patches/111` or `/upcoming` — registration order is therefore irrelevant.

- [ ] **Step 3: FAQ entries**

In `client/src/pages/FaqPage.tsx`, add a new `Section` immediately after the Section that contains the `deal-score` entry (search for `id="deal-score"`):

```tsx
<Section title="Patch impact">
  <Q id="patch-impact" q="What does a patch's market impact score mean?">
    <p>
      For every game update since 2015 we measure how each of the ~400 most liquid items moved
      in the week after it, normalised by that item's own volatility — a sleepy item moving 12%
      counts for more than a jittery one moving 15%. The impact score is simply the share of
      screened items whose move was unusual for them (at least 2 standard deviations). Routine
      weekly patches score near zero; expansion-sized updates light the bar up.
    </p>
    <p>
      Winners and losers are always computed from the price archive — nothing on that page is a
      hand-picked opinion. "Mentioned" badges mean the item is linked in the update's own patch
      notes on the OSRS wiki.
    </p>
  </Q>
  <Q id="patch-watchlist" q="How are the upcoming 'items to watch' picked?">
    <p>
      They're the tradeable items linked in announced future content on the OSRS wiki's
      Upcoming updates page. For each one we show its own track record — how it moved after past
      updates that mentioned it — plus how items moved in the most similar past updates
      (matched by content tags like slayer, boss, or reward).
    </p>
    <p>
      That's evidence, not a prediction: we deliberately never guess direction from an
      announcement's wording. If the history says "items like this usually dip 4% in week one",
      that's all we'll claim — and past patches don't bind future ones.
    </p>
  </Q>
</Section>
```

- [ ] **Step 4: README architecture note**

In `README.md` under "Architecture notes", append a bullet:

```markdown
- **Patch Impact (`/patches`, premium)** adds two more server-side upstreams, same rule as
  the prices API (browser never calls them): the weirdgloop exchange archive (multi-year
  daily prices, volumes from Sept 2018) and the wiki's MediaWiki API (update posts + the
  Upcoming updates page). The first build backfills a few minutes into a disk cache at
  `server/data/patch-cache/` (gitignored); restarts serve from disk. Winners/losers are
  event-study computations (see `server/src/patchStats.ts`), never hand-curated; the
  optional overlay in `server/src/data/patchOverrides.ts` ships empty.
```

Also extend the "Tiers" paragraph's premium sentence to mention the patch page, e.g. change "unlocks the full long-term screener and full-year history" to "unlocks the full long-term screener, full-year history and the Patch Impact page".

- [ ] **Step 5: DECISIONS entry**

Append to `DECISIONS.md`:

```markdown
## Patch Impact — winners/losers of updates + upcoming watchlist (2026-07-06)

Spec: docs/superpowers/specs/2026-07-06-patch-impact-design.md (Stefan: zero-maintenance,
multi-year, fully premium, category-analogue evidence). Notable calls:

- **Two new upstreams, both server-side only**: weirdgloop `/exchange/history/osrs/all`
  (ONE id per request — verified the multi-id form 400s) and the wiki MediaWiki API.
  `allpages` (ns 112) lists ~1,100 update posts in 3 calls; bulk `prop=revisions` fetches
  wikitext 50 pages per call, so the whole update backfill is ~30 requests, not 1,100.
- **categorymembers timestamps are categorization dates, not publish dates** ("RS2
  Launched!" showed 2026) — the real date comes from each page's `{{Update|date=…}}`
  template, which also carries `category=game` to drop website/support posts mechanically.
- **First disk cache in the app** (`server/data/patch-cache/`, gitignored): history is
  immutable and update posts never change, so restarts must not re-hammer either API.
  Corrupt/missing files just refetch.
- **Event study**: baseline = last close strictly before the patch date; +1/+7/+30d and
  −7d run-up windows; z = change / (own 90d daily σ · √days), σ falling back to the
  universe median for thin histories. Impact = share of screened items with |z| ≥ 2 —
  that's the zero-maintenance notability signal ("Known Issues" posts sink on their own).
  Patches under a week old rank on the 1d window (windowDays on the detail payload).
- **Predictions never parse sentiment**: tags are lexical (skills + content keywords),
  analogues = tag-set Jaccard ≥ 0.25 (top 5), and the direction shown is the measured
  distribution of mentioned-item 7d moves in those analogues (median/IQR/% positive,
  refused under 5 samples). Same-item track records cap at 6 past mentions.
- e2e mocks all three /api/patches* endpoints (cold live build takes minutes); the live
  pipeline was verified by hand: [FILL IN from task 7 step 8: patch count, build time,
  example detail, restart-from-disk time].
```

Replace the `[FILL IN …]` bracket with the numbers actually observed in task 7 step 8 — do not commit the placeholder.

- [ ] **Step 6: Full verification**

Run: `npm run build`
Run: `npm test`
Run: `npm run lint`
Run: `npm run typecheck`
Run: `npm run e2e`
Expected: all clean/green. The e2e suite boots the production build; the live `/api/patches` endpoints will serve from the disk cache warmed in task 7 (unmocked specs don't touch them; only `patches.spec.ts` does, mocked).

- [ ] **Step 7: Commit**

```bash
git add e2e/patches.spec.ts client/src/pages/FaqPage.tsx README.md DECISIONS.md
git commit -m "test+docs: Patch Impact e2e (mocked), FAQ entries, README + DECISIONS notes"
```

---

## Plan Self-Review Notes

- **Spec coverage**: pipeline+storage → tasks 2/6/7; event study → task 4; tags/analogues/evidence → task 5; API + gating → tasks 1/7/8; UI (lock, upcoming, list, detail) → tasks 8–10; error handling (warnings, stale-on-error, skip-and-count) → tasks 6/7/8; testing + FAQ/README → task 11. Overlay → task 7 (types + merge + test).
- **Known simplifications vs spec prose**: the spec's per-file cache layout is honoured (`prices/<id>.json`, `updates/<pageid>.json`, `upcoming.json`) with wikitext stored raw so tag-vocabulary changes never refetch. `topWinner.change7` from the spec's API sketch became `topWinner.change` + `windowDays` so patches younger than a week stay useful — the spec's intent (honest rank basis) is preserved.
- **Type consistency**: `zScore`/`windowDays`/`change` naming is uniform across tasks 1, 4, 7, 9 and the e2e fixtures.





