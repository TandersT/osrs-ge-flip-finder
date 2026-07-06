# Patch Impact — winners/losers of past updates + evidence-based upcoming watchlist

**Date:** 2026-07-06 · **Status:** approved design, pre-implementation

## Goal

OSRS game updates move item prices. Add a premium `/patches` page with two sections:

1. **Past patches** — for every game update since 2015, which items won and lost, computed
   from price data (never hand-typed).
2. **Upcoming — items to watch** — items mentioned in announced future content, backed by
   *measured historical evidence*: how those same items and how items in *similar past
   patches* actually moved. No sentiment parsing, no invented predictions.

## Decisions (agreed in brainstorming)

- **Zero maintenance** — everything is scraped/computed automatically. An optional,
  empty-by-default curation overlay (`server/src/data/patchOverrides.ts`) can later hide a
  noise patch, pin one, or attach hand-written prediction notes; the system is complete
  without it.
- **Multi-year horizon** — back to ~2015 via a second upstream (weirdgloop exchange API).
  Verified: full daily history per item (~4,050 points for whip), volumes from 2018-09-25,
  data current to today, **one id per request** (no batching).
- **Fully premium** — free users see a lock panel and fetch no data. New boolean
  entitlement `patchAnalysis` in `shared/src/tiers.ts`. Client-side enforcement only, like
  every entitlement today (documented limitation until the payments backend exists).
- **Category-analogue predictions** — tags are lexical (skill/content keywords), direction
  always comes from measured history of analogous patches, never from parsing buff/nerf
  wording.

## Data pipeline

Two new server-side clients, browser never touches either upstream (same architecture rule
as the wiki prices API):

- **`server/src/gloop.ts`** — weirdgloop: `GET api.weirdgloop.org/exchange/history/osrs/all?id=X`
  → full daily `{price, volume|null, timestamp}` history. Descriptive User-Agent, 15s
  timeout.
- **`server/src/updates.ts`** — OSRS wiki MediaWiki API:
  - list `Update:` namespace (ns=112) pages since 2015-03 → `{pageid, title, timestamp}`
    (page creation ≈ publish date ≈ patch date);
  - fetch each page's wikitext once (immutable after publication);
  - fetch the `Upcoming updates` page every 12h (verified: parseable wikitext, one
    `==`/`===` section per announced feature).

**Universe:** top `PATCHES_MAX_ITEMS` (.env, default 400) items by current daily volume —
same selection logic as the long-term screener. Known limitation: items dead *today* don't
appear in old patches' winners/losers.

**Persistent disk cache** at `server/data/patch-cache/` (gitignored) — first disk cache in
the app, justified by backfill size: ~400 price fetches + ~1,100 update pages ≈ 3–5 min at
the polite 4-worker/50 ms-delay pattern. Restarts must not re-hammer upstreams.

- `prices/<id>.json` — refreshed when >24 h old (refresh = the same single cheap call);
- `updates/<pageid>.json` — `{title, date, wikitext}`, fetched once, never refetched.
  Mentions and tags are *derived at build time* by pure functions, so evolving the tag
  vocabulary never requires refetching;
- `upcoming.json` — 12 h TTL.

**Build orchestration** mirrors `longterm.ts`: lazy build on first request, worker pool,
`{status, progress}` served with partial rows, per-item/per-page failures skipped and
counted.

**Item mentions** = `[[wiki links]]` in update wikitext matched case-insensitively against
the item mapping. Links only — no free-text scanning (editors link items religiously;
free text produces false positives).

## Analytics

All pure functions, unit-tested.

**Event study** (`server/src/patchStats.ts`) — per patch date × universe item:

- Baseline `P0` = last daily price strictly before the patch date.
- `change_w = (P(t+w) − P0) / P0` for windows **+1d, +7d, +30d**, plus a **−7d run-up**
  column (anticipation buying).
- `z_w = change_w / (σ·√w)` where σ = stddev of daily returns over the 90 days pre-patch
  (needs ≥30 points; else z is null).
- Winners/losers rank by `|z7|`, falling back to raw `|change7|` when z is null; top 20
  each side per patch. "Unusual" badge at `|z| ≥ 2`. Volume-delta column where volume data
  exists (post-2018).
- **Patch impact score** = share of universe with `|z7| ≥ 2`. This is the zero-maintenance
  notability signal: major updates score high, "Known Issues" posts score ~0 and sink. No
  title-based filtering.

**Tags & analogues** (`server/src/patchTags.ts`):

- Fixed lexical vocabulary, in code as data (extending it is a one-line change). Initial
  set: the 23 skill names + `boss, raid, quest, minigame, wilderness, pvp, pvm, drop
  table, reward, tradeable, cosmetic, holiday, leagues, deadman, poll, combat, achievement
  diary`.
- A patch's tags = vocabulary terms found in title + wikitext (title hits weighted).
  Upcoming-feature sections are tagged identically. **No sentiment terms.**
- Analogues of an upcoming feature = top-5 past patches by tag-set Jaccard similarity,
  above a minimum-similarity floor.

**Upcoming evidence** per feature:

- mentioned items (in universe) with current price — features whose mentions include no
  priced universe item are omitted from the section entirely;
- per item, its own track record: 7d changes after each past patch that mentioned it;
- per feature, the aggregate distribution of mentioned-item 7d moves across the analogue
  patches: median, IQR, % positive.

## API

Rebuilt every 12 h (longterm pattern). Overlay merged at serve time.

- `GET /api/patches` → `{status, progress, builtAt, patches: [{pageid, title, date,
  impact, topWinner, topLoser}]}`
- `GET /api/patches/:pageid` → patch meta + `dataQuality: 'full' | 'priceOnly'` (pre-2018)
  + winners/losers rows `{id, name, icon, change1, change7, change30, runup7, z7,
  volumeDelta7|null, mentioned}`
- `GET /api/patches/upcoming` → `{features: [{anchor, title, tags, items: [{id, name,
  icon, price, history: [{pageid, title, date, change7}]}], analogues: [{pageid, title,
  date, similarity}], evidence: {median7, iqr7, pctPositive, sampleSize}}]}`

## UI — `/patches` (nav "Patches")

- URL state: `?patch=<pageid>` selects a patch, `?sort=date|impact` orders the list
  (existing urlState pattern; shareable).
- **Locked (free):** lock panel describing the feature + existing UpsellDialog. Queries are
  `enabled`-gated — no data fetched, nothing hidden-but-present in the DOM.
- **Upcoming — items to watch** (top): one card per feature — title linking to the wiki
  section, tag chips, mentioned items with price + compact track-record line
  ("+8% · −2% · +15%"), analogue evidence sentence ("in the 5 most similar past updates,
  mentioned items moved median −4% (IQR −9%…+3%) over 7d"). Persistent disclaimer banner:
  historical evidence, not advice.
- **Past patches:** table (date, title, impact bar, top winner/loser chips) with
  build-progress bar; selecting a row expands winners + losers tables (%, z, run-up,
  volume delta, "mentioned" badge, `priceOnly` notice pre-2018), item names link to item
  detail. Mobile card layout per existing convention; visuals follow `docs/design.md`
  recipes.

## Error handling

- Partial backfill: build continues, skipped counts surface as an amber note ("12 of 1,100
  update pages unavailable — will retry next rebuild").
- Upstream down with warm disk cache: serve cached analysis flagged stale (amber banner,
  same as items).
- A patch whose wikitext failed still appears — winners/losers need only the date; it just
  lacks mention badges/tags.

## Testing

- **Unit:** event-study math on synthetic series (known changes/z, missing-data edges),
  tag extraction + Jaccard on real wikitext fixtures, mention extraction, overlay merge.
- **e2e:** locked page (free), unlocked list/detail/upcoming rendering with
  `/api/patches*` mocked (hiscores-mock precedent — cold live build takes minutes). Live
  pipeline verified manually once, recorded in DECISIONS.md.
- **Docs:** FAQ entries (impact meaning, how the watchlist evidence works and its limits);
  README second-upstream architecture note.

## Out of scope (deliberately)

- Sentiment analysis of patch notes (unreliable → dishonest output).
- Server-side entitlement enforcement (blocked on payments backend, see
  docs/payments-plan.md).
- Items outside the liquid universe; non-GE effects (XP, quests) except as tags.
- Alerts/notifications tied to upcoming patches (possible later layer).
