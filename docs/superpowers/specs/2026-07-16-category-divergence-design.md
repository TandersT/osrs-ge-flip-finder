# Divergence — category-mismatch deals (pairwise spreads in curated groups)

**Date:** 2026-07-16 · **Status:** approved design, pre-implementation

## Goal

Items of the same kind (sharks and sea turtles are both high-heal food; bows, logs,
ores…) tend to move together in price. When one member breaks away from peers it
historically tracks, that mismatch is a potential deal: **buy the laggard, wait for the
spread to close**. New premium page **Divergence** (`/divergence`) surfaces those
mismatches with the evidence to judge them.

## Decisions (agreed in brainstorming)

- **Horizon: days-to-weeks.** Detection runs on daily (`24h`) timeseries — same data and
  build pattern as the long-term screener. No intraday signals.
- **Thesis: buy-the-laggard only.** No "rich vs peers / sell" side in v1 (no shorting in
  OSRS). Honest caveat in copy: a spread can close from either side — history shows how
  often the pair snapped back, not which leg moved.
- **Categories are curated data**, not scraped or clustered: `shared/src/categories.ts`
  (precedent: `methods.ts`). Semantic grouping is only a *candidate* prior — every pair
  must additionally prove co-movement statistically before it may signal.
- **Engine is pairwise** (approach B): per-pair correlation gate + z-scored spread,
  presented with plain-language return-gap headlines. Deals aggregate by laggard item.
- **Patch badge ships in v1**: divergences coinciding with a game update that names a leg
  get a ⚠ "may not reconverge" badge (reuses the Patch Impact update-post store).
- **Fully premium**, like Patch Impact. Free users get the upsell pitch.
- **Name: Divergence** — route `/divergence`, module/endpoint named to match.

## Curated groups — `shared/src/categories.ts`

`{ id: string; label: string; members: string[] }` — members are **exact GE item
names**, resolved against the live mapping at build time (the `methods.ts` convention;
avoids hand-typing ~80 item ids). Unresolved names surface as `missing` in the groups
panel and in `coverage` — visible, never silent. Data only, editable without touching
code. Starter set (~15 groups, liquid staples): high-heal food (Shark, Sea turtle,
Manta ray, Anglerfish, Dark crab, Monkfish, Cooked karambwan), raw fish (raw versions of
the same), logs (Oak→Redwood), planks (all four), ores (Iron→Runite, Coal), metal bars
(Iron→Runite), elemental runes, catalytic runes (Nature, Law, Death, Blood, Chaos,
Cosmic, Astral, Wrath), clean herbs (Ranarr…Torstol tier), restore potions (Prayer
potion(4), Super restore(4), Saradomin brew(4)), dragonhide (Green/Blue/Red/Black),
high-tier bones (Dragon, Superior dragon, Wyvern, Lava dragon), arrows (Adamant, Rune,
Amethyst, Dragon), chinchompas (grey/red/black), uncut gems (Sapphire→Dragonstone).
Thin groups are fine — ineligible pairs just stay quiet, visibly, in the groups panel.

## Engine — `server/src/divergence.ts` (mirrors `longterm.ts`)

Rebuild at most every 12h; throttled pool (concurrency 4, 50ms delay) fetching 365-day
`24h` series per member via the existing `getTimeseries` (~90 items ≈ seconds, polite).
In-memory state + `building` progress, exactly the longterm pattern. Per group, for
every unordered member pair, on daily **mid** prices:

- **Eligibility gate** (kills multiple-comparison noise): ≥ `MIN_OVERLAP_DAYS` (180)
  overlapping days; Pearson r of **non-overlapping 7-day log returns** over the trailing
  180d ≥ `MIN_WEEKLY_R` (0.4) — weekly returns smooth daily noise without rewarding
  shared drift; both legs' snapshot `dailyVolume` ≥ `VOLUME_FLOOR` (2,000, you must be
  able to fill both ends). Constants are named and tunable; the groups panel exposes
  measured r so tuning after the first real build is informed.
- **Divergence**: spread `s_t = ln(P_a) − ln(P_b)`, z-scored against its trailing 90d
  (rolling mean/std). `|z| ≥ ENTRY_Z` (2) flags the pair; the relatively-cheap leg is
  the **laggard**.
- **Reconvergence evidence**: scan the year's rolling z for past episodes (entry
  `|z| ≥ 2`, close `|z| ≤ 0.5`): episode count, fraction closed within 30 days, median
  days to close. Shown on every deal.
- **Patch badge**: any `category=game` update post dated within 21 days of build time
  that **links** either leg (via the existing, tested
  `extractLinkTargets`/`matchMentions` helpers from `updateParse.ts` — editors link
  items religiously, the Patch Impact convention) → `{ title, url, date }` attached to
  the deal. Update pages come from the shared disk cache (`listUpdatePages` +
  `getUpdatePages`), so this is cheap after the first Patch Impact build.
- **Aggregation → deals**: group flagged pairs by laggard item; a deal = item +
  `laggingPairs`/`eligiblePairs` counts + its flagged pairs (worst |z| first) + headline (item's 30d %
  change vs peers' median 30d change — peers = its eligible partners) + current buy/sell
  and post-tax margin from the snapshot via shared flip math + optional patch badge.
  Sanity direction check: only list when the item's 30d change is below the peers'
  median. Rank by `laggingPairs` desc, then worst |z| desc.

**New shared helper:** `pearson(xs, ys)` in `shared/src/stats.ts` (unit-tested there).
The weekly-return builder and the episode scanner live in `divergence.ts` (tested in
`divergence.test.ts`). Types in `shared/src/divergenceTypes.ts` (precedent:
`dealTypes.ts`, `patchTypes.ts`).

## API — `GET /api/divergence`

```ts
interface DivergenceResponse {
  builtAt: number;                       // unix seconds
  building?: { total: number; done: number };
  deals: DivergenceDeal[];
  groups: DivergenceGroup[];             // cohesion overview for the panel
  coverage: { itemsRequested: number; itemsWithSeries: number };
}
interface DivergenceDeal {
  itemId: number; name: string; icon: string | null;
  groupId: string; groupLabel: string;
  laggingPairs: number; eligiblePairs: number;
  headline: { item30d: number | null; peersMedian30d: number | null };
  /** All flagged pairs where this item is the laggard, worst (max |z|) first. */
  pairs: PairSignal[];
  buy: number | null; sell: number | null; margin: number | null; // post-tax
  patch?: { title: string; url: string; date: string };
}
interface PairSignal {
  peerId: number; peerName: string;
  z: number; weeklyR: number;
  episodes: { count: number; closedWithin30d: number; medianDays: number | null };
  /** Present only on the worst pair, to keep the payload small. */
  series90?: { t: number; item: number; peer: number }[]; // normalized to window start
}
interface DivergenceGroup {
  id: string; label: string; eligiblePairs: number;
  members: { itemId: number | null; name: string; icon: string | null;
             eligible: boolean; avgR: number | null; missing: boolean }[];
}
```

`series90` ships only on each deal's worst pair, keeping the payload small; full
history stays on the item detail page. Route follows the existing handler pattern
(serve last good state on build failure; `upstreamStale` via the shared wrapper if the
underlying fetches report it).

## Client — `DivergencePage.tsx` (`/divergence`)

Premium-gated like Patches (entitlement added to `shared/src/tiers.ts`; free users see
the upsell). Layout, top to bottom:

- **How-it-works blurb** (short): correlation-gated pairs, buy-the-laggard, the
  either-side caveat, link to FAQ.
- **Deal cards**: icon + name + group label; headline "peers +12% · this −3% (30d)";
  worst-pair z and peer name; reconvergence record ("closed 4 of 5 past episodes,
  median 9 days"); ⚠ patch badge linking the update when present; buy/sell (click-to-
  copy, existing idiom) + post-tax margin. Card expands to a normalized two-leg overlay
  chart (Recharts, existing chart idioms, `series90`) and a small table of all its
  flagged pairs.
- **Groups panel** (compact): every curated group with member eligibility dots, avg r,
  eligible-pair count — quiet groups are explainably quiet, and it doubles as the
  tuning view. Missing-series members marked.
- **Empty state**: "No mismatches right now — most days everything tracks."
- No URL-state params in v1. Nav entry added; FAQ entries (what it is, how to read the
  evidence, why an item you expected is missing); README + DECISIONS.md notes.

## Error handling

Build failure → keep serving last good state (existing pattern, amber banner via
`upstreamStale`). Individual series failures → skip those members, count them in
`coverage`, mark `missing` in the groups panel. Update-store failure → deals ship
without badges (badge is additive). No deals is a normal, designed-for state.

## Testing

- **shared**: `pearson` fixtures (hand-computed, incl. constant-series → null/0 guard).
- **server** (`divergence.test.ts`, synthetic series): correlated pair + injected
  divergence → flagged, correct laggard side, episode stats; low-r pair never signals;
  volume floor enforced; direction sanity check; patch-badge matching (linked-item
  mentions, `category=game` filter, 21-day window); aggregation and ranking.
- **e2e** (mocked `/api/divergence`, precedent: patches spec): page renders deals +
  groups panel, premium gate blocks free tier, card expands to chart. Desktop + mobile.

## Out of scope (v1)

Intraday confirmation signals, sell-side/rich flags, auto-generated or clustered
categories, URL state, alerting/notifications, backtested "expected profit" claims.
