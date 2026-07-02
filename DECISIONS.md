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

## Post-completion: published to GitHub (2026-07-02)

Stefan confirmed the intended account was `TandersT` (the `github-tanderst` SSH alias's
account), created the empty private repo in the web UI, and the full history was pushed:
`git@github-tanderst:TandersT/osrs-ge-flip-finder.git`, branch `main` tracking origin.
The README fallback section was replaced with a plain repository pointer.
