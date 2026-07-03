# Decisions log

Running log of choices made where the spec was ambiguous, plus interruption-recovery notes.
Newest entries at the bottom. Each Build Order step gets a `[step N]` marker when completed.

## Repo conventions (Build Order step 1)

- **Location:** `~/source/repos/osrs-ge-flip-finder/` as a *flat* repo (like `dotfiles`,
  `aurocon-claude-skills`), not the bundled `main/` + `worktrees/` layout — that layout is
  created by the worktree manager for existing work projects; a fresh standalone project
  matches the flat convention.
- **Branch:** `main` (personal repos here use `main`; only work repos use `develop`).
- **Remote protocol:** SSH (all local remotes are SSH).
- **GitHub account:** spec asks for the `tanders` account. `gh` is authenticated as
  `aurocon-sta` only, which has no rights to `tanders` (a distinct user account, not an org).
  Personal repos on this machine push via the SSH host alias `github-tanderst` to the
  `TandersT` account — close to but not the same as `tanders`. Per the spec's fallback rule:
  keep the full local repo and document exact publish commands in the README instead of
  guessing at an account we can't verify. See "Publishing to GitHub" in README.md.

## Stack details

- Node 24 on this machine (spec needs 20+). ESM (`"type": "module"`) throughout.
- `shared` compiles with tsc to `dist/` (with `.d.ts`); server and client import the built
  output. Root `dev` script builds shared first, then runs tsc-watch + tsx-watch + Vite via
  `concurrently`.
- Fastify v4 + `@fastify/static` v7 (mature pairing). Vite 5, React 18, Tailwind 3.
- Server exposes runtime config (capture rate, offsets, refresh interval, stale threshold)
  at `/api/config` so client and server share one `.env` source of truth.

## Domain module (Build Order step 2) — [step 2 complete]

- **Tax exemption list** is generated (not hand-typed): `scripts/generate-tax-exemptions.mjs`
  pulls the wiki category and resolves page titles to GE item ids via `/mapping`, because
  titles differ from item names (charged jewellery "Ring of dueling" → "Ring of dueling(8)",
  dosed "Energy potion" → 4 items, some teleport tablets drop the "(tablet)" suffix).
  45 wiki pages → 48 item ids, baked into `shared/src/taxExemptions.ts`.
- **`/volumes` verified to exist** (returns `{timestamp, data: {id: dailyUnits}}`) — no
  1h aggregation fallback needed.
- **Offer clamping:** `buyAt`/`sellAt` are clamped to ≥ 1 gp so 1–2 gp items can't produce
  a 0/negative offer price; margins can still legitimately go negative via tax.
- **Missing throughput inputs:** `feasibleQtyPer4h` uses whichever of buy-limit / volume is
  known, and is `null` (rendered "—") only when both are unknown, so items aren't silently
  dropped just because the wiki lacks a limit.
- **Flip math runs client-side** (server serves merged raw snapshots): capture-rate and
  offset knobs can then be tweaked in the UI without waiting on the server cache.

## Server proxy (Build Order step 3) — [step 3 complete]

- Client-facing API is intentionally small: `/api/items` (mapping+latest+1h+volumes merged
  server-side, one payload for the whole table), `/api/timeseries`, `/api/config`,
  `/api/health`. Raw wiki passthrough endpoints are not exposed — nothing needs them and it
  keeps the browser off the wiki API by construction.
- `TtlCache` counts upstream calls per key; `/api/health` exposes the counters, which is how
  the "N client requests -> 1 upstream call" acceptance check is verified (confirmed live:
  6x `/api/items` -> `{mapping:1, latest:1, 1h:1, volumes:1}`).
- `upstreamStale` on responses = any underlying payload came from the fallback path after an
  upstream failure. Per-item price staleness (old highTime/lowTime) is a separate,
  client-computed flag using `staleAfterSeconds`.
- Wiki fetches carry a 15s AbortSignal timeout so a hung upstream can't pile up requests
  behind the single-flight lock.

## Flip Finder + item detail (Build Order steps 4–5) — [steps 4, 5 complete]

- **volumePer4h = 1h volume × 4** (more current than dailyVolume/6; both shown as columns).
- **"Data age" column shows the OLDER of the two price timestamps** (worst case), and the
  stale flag keys off the same number vs `STALE_AFTER_SECONDS`.
- **Price/volume chart is two stacked panels** (price lines above, volume bars below, synced
  tooltips) rather than one dual-axis chart — finance convention, and dual y-scales are a
  known chart anti-pattern. Series colours (#c98500 high / #3987e5 low) were validated for
  colour-blind separation + contrast on the dark panel background.
- Item detail's long-horizon stats always use the 24h timeseries (separate cached query)
  regardless of the chart's selected timestep.
- High-alch panel prices nature runes live from the same /api/items payload (id 561).

## Long-term screener (Build Order step 6) — [step 6 complete]

- The wiki timeseries endpoint is per-item, so screening ALL ~4.6k items would mean 4.6k
  upstream calls. Instead the server screens the **top `LONGTERM_MAX_ITEMS` (250) most
  liquid items** with `dailyVolume >= LONGTERM_MIN_DAILY_VOLUME` (5000) — both .env knobs.
  The "liquid items only" constraint is also what the spec's dip definition wants.
- Build runs lazily on first request with 4 workers + 50ms per-fetch delay (~20s for 250
  items), result cached 12h in memory; `/api/longterm` reports `{status, progress}` so the
  UI shows a progress bar with partial data. State is lost on restart; first request
  rebuilds.
- **Momentum** = 14-day price slope > +0.3%/day AND 30-day volume slope > 0 AND 7-day
  change > 0. The last clause was added after live testing surfaced "momentum" items whose
  2-week-old rally had already faded (negative 7d change).
- **Dip** = z <= -1 vs the 90-day mean (needs >= 30 daily buckets of history). In a broadly
  falling market ~half the screen qualifies — expected; the view sorts deepest-z first.

## Watchlist, flags, presets (Build Order step 7) — [step 7 complete]

- Watchlist stores `{id, addedAt, priceAtAdd}` in localStorage (`geff:watchlist:v1`) via a
  `useSyncExternalStore` store so stars stay in sync across table/detail/watchlist views.
  "Since added" compares current mid price to `priceAtAdd`.
- **Thin** = ROI >= 4% on < 30 units/1h. **Unstable** = latest high or low deviating > 10%
  from its 1h average. Both are display badges plus one combined "hide risky" filter.
- Presets replace the whole filter state (not merge): Low risk high volume (vol>=1000,
  margin>0, hide stale+risky), Big ticket (buy>=1m, margin>=10k), Tax-free only, F2P.
- **volume1h = 0 is treated as a real zero, not "unknown"** — throughput falls back to
  dailyVolume/6, else 0. Found live: a dead item (0 volume, 6-day-old prices) showed a
  fantasy "+7.7b profit/4h" because zero-volume fell through to the 11k buy limit.

## Polish (Build Order step 8) — [step 8 complete]

- Flip Finder filters + sort live entirely in the URL (`?q=&mm=&roi=&mv=&bmin=&bmax=&world=
  &exempt=&nostale=&norisk=&sort=col.dir`), defaults omitted, `replace` navigation so typing
  doesn't spam history. The URL is the single source of truth — no duplicated state.
- Auto-refresh countdown ("updated Xs ago · next in Ys" + manual ⟳) driven by TanStack
  Query's dataUpdatedAt; interval comes from `/api/config`.
- Loading skeletons for table/chart/panels; error states include a retry button.

## Final verification (Build Order step 9) — [step 9 complete — ALL DONE]

Acceptance checks, all verified on 2026-07-02:

- `npm run build` / `npm test` (52 tests) / `npm run lint` / `npm run typecheck`: clean.
- Tax function: edge tests pass (49/50 boundary, 250m cap boundary, per-item application,
  exemptions, nulls) and match the wiki's worked examples (1,000 → 20; 10m → 200k).
- Server boots; `/api/items` returns 4,589 live items; 8 back-to-back client requests →
  `{mapping:1, latest:1, 1h:1, volumes:1}` upstream calls (single-flight + TTL confirmed).
- Sorting 4.6k rows: 76–99ms warm (first-ever click ~120ms cold JIT); filtering ~48ms.
  Columns array memoized after profiling showed table model rebuilds on every render.
- Zero direct browser calls to prices.runescape.wiki in every Playwright session.
- Outage drill: warmed cache through a local relay, killed the relay, waited past the 60s
  TTL — `/api/items` kept serving all items with `upstreamStale: true` and the UI showed
  the amber stale banner.
- GitHub: `gh` on this machine cannot create repos under `tanders` (authenticated as
  `aurocon-sta`; `tanders` is a distinct user account, not an org) → executed the spec's
  local fallback: full history kept locally, exact publish commands in README
  ("Publishing to GitHub").

## Post-completion: new-user UX pass (2026-07-02)

Stefan asked for a friendlier, service-grade experience for new players:

- **Sliders**: numeric filter fields became slider+input combos (`SliderInput`), log-scaled
  for gp/volume (position → value via exp interpolation, snapped to 2 significant digits),
  linear for ROI %. Dragging to the "off" end clears the filter (null); the tiny number
  input stays for exact values. URL state unchanged.
- **Get Started page** (`/starter`): budget-first view for small banks. Pure math in
  `lib/starter.ts` (unit-tested): position size = min(floor(budget/buy), feasibleQty);
  excludes stale/thin/unstable, <100 units/h, unaffordable and negative-margin items.
  Includes a 3-step how-flipping-works explainer, small-bank tips, and five persona cards
  (F2P, high-volume, big-ticket, passive investor, high-alch) linking to preset URLs.
- **FAQ** (`/faq`): 22 questions as native `<details>` accordions covering tax mechanics,
  offsets, capture-rate honesty, flags, z-score/dip/momentum, data source/etiquette,
  storage/privacy. Deep links (`/faq#high-alch`) auto-open and scroll to the entry.
- **Polish**: dismissible first-visit banner (localStorage), attribution footer on every
  page, nav gains Get Started + FAQ. Client workspace gained vitest for the starter math.
- Budget preset chips needed explicit short labels ("25k") — `formatGpCompact`
  intentionally shows full digits below 100k, which is wrong for chip labels.

## Post-completion: service extras (2026-07-02)

Creative-license pass ("anything else relevant, be creative"):

- **Flip Log** (`/log`): record real flips, localStorage-only. Item autocomplete pre-fills
  live buy/sell (adjustable), tax/profit preview before saving, stat tiles (total profit,
  win rate, best flip), cumulative "bank growth" line chart, CSV export (chronological,
  quote-escaped), per-entry delete. Item pages link in via "Log this flip" (`/log?item=id`,
  applied once via ref so clearing the picker doesn't resurrect it). Entry names/icons are
  denormalised so old logs survive item-list changes.
- **`breakEvenSell(isExempt, buy)`** in shared: min sell price that doesn't lose money.
  Closed-form estimate 50·buy/49 + a ±3 verify window (floor jitter), flat +5m above the
  cap. Property-tested (no loss at S, loss at S−1). Shown on item detail and in the FAQ
  calculator.
- **Interactive tax calculator** at the top of the FAQ's tax section.
- **`/` keyboard shortcut** focuses the finder search (skipped while typing).
- **Meta/OG tags** + theme-color for link sharing.

## Post-completion: polish pass 2 (2026-07-03)

Four verified batches:

1. **Quick wins**: numeric columns right-aligned everywhere; header tooltips + FAQ pointer;
   wiki link on item detail; `@fastify/compress` (items JSON 1.3MB → 199KB) + immutable
   cache headers for hashed assets / no-cache for index.html; `aria-sort`; skeletons
   respect `prefers-reduced-motion`.
2. **Flip Log open positions**: v2 schema (nullable sell/tax/profit + `soldAt`, v1 migrates
   on load; `taxExempt` stored per entry so completion can compute tax later). Open
   positions table shows live unrealized P&L and completes inline. gp/hour derives only
   from closed flips with real buy→sell durations (same-timestamp legacy entries excluded).
3. **Live UX**: buy/sell cells flash green/red on refresh deltas (prev-price map threaded
   into buildRows; spans re-keyed by value so the CSS animation restarts; reduced-motion
   disables). Chart gains dashed live-price ReferenceLines + 1m/3m/1y range chips on the
   24h series (defaults to 3m — a year squashed too much). ↑/↓/Enter/Escape row navigation.
4. **Mobile + PWA**: below 640px the finder renders virtualised cards (margin/ROI headline,
   buy→sell, vol/age/flags) with a sort dropdown, since card layouts have no sortable
   headers; sliders collapse behind a "Filters" disclosure; nav scrolls horizontally.
   PWA manifest + PNG icons rendered from an in-repo SVG via headless Chromium (no image
   tooling dependency). No service worker yet — installability only.
   Also: the site brand is no longer an `<h1>` (one h1 per page).

## Post-completion: visual review fixes (2026-07-03)

A 13-screenshot sweep (all pages, desktop + mobile) surfaced four real issues, all fixed:

- **Chart axes showed duplicate ticks** ("1.1m, 1.1m, 1m, 1m") — `formatGpCompact`'s
  1-decimal m-band loses precision in tight ranges. New `formatGpAxis` (up to 2 decimals,
  trimmed) used by all chart axes; compact stays 1-decimal elsewhere (RS convention).
- **Detail flip panel rounded away the spread** for >1m items ("Buy 1m / Sell 1m") —
  those two rows now show exact gp like the tax/break-even rows.
- **Manipulated spreads showed absurd ROIs** (1,224,900% on a stale+thin javelin) —
  display capped at ">1000%"; sorting still uses the true value.
- **Flip-log item picker kept the previous search text** after logging — query now clears
  when a selection is made.

Note: the Playwright MCP plugin (browser channel "chrome") can't run on this box — Chrome
isn't installed (needs sudo) and editing the plugin config is gated. The review used the
same Playwright engine scripted; to enable the plugin, either install Chrome or add
`--browser chromium` to the plugin's `.mcp.json` and reconnect.

## Post-completion: subscription model (2026-07-03)

Two tiers, free/premium. Split philosophy: **free stays genuinely useful for casual
flipping and never paywalls safety** (risk flags, starter guide, FAQ, live finder all
free); **premium sells scale + long-horizon analytics**:

| | Free | Premium ($3.99/mo · $29.99/yr placeholder) |
|---|---|---|
| Watchlist | 5 items | unlimited |
| Flip log | 25 entries, no CSV | unlimited + CSV |
| Chart history | 90 days | full year |
| Long-term screener | top-5 teaser (honest counts) | all ~250 rows |

- Entitlements are **data in `shared/src/tiers.ts`** (`ENTITLEMENTS[tier]`), not code
  branches — the future payment service just changes which tier the client is told.
- Gating is add-only/never-read-blocking: hitting a cap opens an UpsellDialog; existing
  data is never hidden (a 30-entry log from before a downgrade stays visible).
- Until payments exist, premium is a local flag redeemed with `GEFF-DEV-2026` on
  `/premium` (explicitly not a secret — nothing is protected server-side yet).
- The wiki's price data itself is never gated (etiquette + the FAQ says so publicly).
- Payment integration is planned in **docs/payments-plan.md**: Phase 1 Stripe Checkout +
  account-less license keys validated server-side (SQLite), Phase 2 accounts only if
  cross-device sync demands it. 5 new e2e specs cover caps, teaser, locks, unlock, bad codes.

## Post-completion: set combining, AFK methods, character import (2026-07-03)

- **Set combining** (`/tools?tool=sets`): GE clerks exchange sets <-> pieces for free, so
  any price gap is arbitrage. Component data is GENERATED (`scripts/generate-item-sets.mjs`)
  from each set page's `==Components==` `{{CostLine|...}}` wikitext — all 124 tradeable
  sets resolved, zero hand-curated. Both directions computed post-tax; throughput bound by
  the least liquid leg. Live check passed the smell test: Barrows sets combine-positive,
  cheap metal sets flip to "split".
- **AFK methods** (`/tools?tool=methods`): 27 curated processing methods (herb cleaning,
  potions, cooking, fletching, gems/battlestaves/glass, tanning, sawmill, Blast Furnace
  runite, Superglass, orb charging) as data (`client/src/data/methods.ts`): inputs/outputs
  by GE name + qty, optional coin fees, skill requirements, intensity rating, and
  actions/hour marked as wiki-guide ESTIMATES. Profit computed live, post-tax; methods with
  unpriced items are skipped. Rates sanity-checked against the wiki's Processing guide.
- **Character import**: official OSRS hiscores (`index_lite.json`) proxied via
  `/api/hiscores` (name regex-validated, 10-min TtlCache, 404 mapped) since Jagex sends no
  CORS headers. Stored in localStorage; requirement chips go green/red and an "only methods
  I can do" filter appears. Import is free-tier (it's a hook); both new screeners teaser at
  top-5 rows like alch/decant (new entitlements setRows/methodRows).
- e2e mocks `/api/hiscores` for determinism (live route verified by hand incl. 404 path).

## Post-completion: premium feature expansion (2026-07-03)

All planned premium tiers built (S, A, and the account-less subset of B):

- **Price alerts** (`lib/alerts.ts`): margin/buy/sell vs threshold, one-shot with re-arm.
  An app-level `AlertWatcher` re-evaluates on every items refresh (only the alerted item
  ids are rebuilt) and fires browser Notifications. Created inline on item pages, managed
  on the watchlist page. Free: 1 armed alert.
- **Flip analytics** on item pages (premium): post-tax margin-over-time (from the selected
  chart window) + hour-of-day volume/spread profile from the ~15-day 1h series. Locked
  strip for free — data isn't even fetched when locked (`enabled` on the query).
- **/tools**: high-alch screener (profit/cast vs live nature rune; gp/h at 1,200 casts) and
  decanting screener (per-dose arbitrage across dose variants, doses conserved, post-tax,
  volume = min of both sides). Free: top-5 teasers.
- **Budget allocator** on the starter page (premium): greedy split of the budget across the
  strongest safe flips (≤5 items, sized by limit/volume/budget). Greedy over knapsack on
  purpose — with 4h re-buys and moving prices, robustness beats optimality.
- **Flip-log analytics** (premium): per-item flips/win-rate/hold-time/profit + monthly P&L.
- **Saved filter views**: named snapshots of the finder's URL state as chips. Free: 1.
- **CSV import/restore** (premium): export gained item_id/tax_exempt columns; import is
  header-mapped (tolerates old exports), quote-aware, skips malformed rows. e2e does a
  full export→wipe→import round-trip. The import button also lives in the empty state —
  found via a failing e2e: restoring into an empty log was otherwise impossible.
- Long-term screener universe default raised 250 → 400 (~35s build).
- Tier B leftovers (Discord/email push, cross-device sync, RuneLite import mapping) are
  documented in docs/payments-plan.md as unlocked by the license backend.

## Post-completion: spacing/whitespace pass (2026-07-03)

Stefan reported overlapping elements. Root cause found at 640–1024px widths: the slider
controls were laid out as [label+value row] over [slider + orphan number-input], all in
fixed-width boxes inside a flex-wrap — each control's trailing input visually attached to
the NEXT control's label, and value labels ("any") collided with neighbouring labels.

- `SliderInput` redesigned to the standard self-contained pattern: label left + editable
  value input right on the top row, slider full-width beneath. No orphan boxes, no
  duplicate value text (the input IS the value, gold when set, "any"/"no cap" placeholder
  when off). `w-full sm:w-44` so phones stack cleanly.
- Whitespace rhythm normalised: page sections gap-4 (16px) everywhere, filter groups
  gap-x-6/gap-y-4.
- Verified at 390/768/1024/1440 with screenshots; zero horizontal overflow; e2e green.

## Post-completion: Playwright e2e suite (2026-07-03)

- 19 specs in `e2e/` (`npm run e2e`), two projects: desktop (1440px) and mobile (Pixel 7,
  `mobile.spec.ts` only). The config's `webServer` boots `npm start`, so the suite tests the
  production build end to end — build first.
- Tests run against **live wiki data** through the server cache (that's the product), so
  assertions are structural (counts, URL state, element presence) rather than value-exact.
  The flip-log specs type deterministic prices so tax/profit maths can be asserted exactly
  (e.g. 10 × (1100−1000−22) = +780).
- Chose NOT to mock the API layer: a mock would re-test our own fixtures, and the wiki
  endpoint being reachable is exactly what an ops smoke test should catch. Retries: 1
  locally / 2 in CI absorb transient price-data weirdness.

## Post-completion: published to GitHub (2026-07-02)

Stefan confirmed the intended account was `TandersT` (the `github-tanderst` SSH alias's
account), created the empty private repo in the web UI, and the full history was pushed:
`git@github-tanderst:TandersT/osrs-ge-flip-finder.git`, branch `main` tracking origin.
The README fallback section was replaced with a plain repository pointer.
