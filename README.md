# GE Flip Finder — OSRS

Find profitable Grand Exchange flips in **Old School RuneScape**: live prices, traded
volumes, buy limits, **post-tax** margins, and a longer-horizon investment screen.

Data comes from the [OSRS Wiki Real-time Prices API](https://prices.runescape.wiki/) —
always via our own caching backend, never directly from the browser.

## Stack

- **Frontend:** React 18 + Vite, TanStack Query/Table/Virtual, Recharts, Tailwind (dark theme)
- **Backend:** Fastify caching proxy + JSON API; serves the built SPA in production
- **Shared:** `@osrs-flip/shared` — domain types and all tax/margin math, used by both sides
- npm workspaces · TypeScript everywhere · Vitest · ESLint + Prettier

## Setup

```bash
npm install
cp .env.example .env   # then set WIKI_USER_AGENT to include YOUR contact info
```

The wiki API asks for a descriptive User-Agent with contact details — please set it.

## Development

```bash
npm run dev        # shared (tsc watch) + server (tsx watch, :3000) + client (Vite, :5173)
```

Open http://localhost:5173 — Vite proxies `/api/*` to the Fastify server.

```bash
npm test           # Vitest across workspaces
npm run lint       # ESLint
npm run typecheck  # tsc across workspaces
```

### End-to-end tests

```bash
npm run build      # e2e runs against the production build
npm run e2e        # Playwright: desktop + mobile projects (boots the server itself)
npm run e2e:ui     # interactive runner
```

The suite covers the finder (live data, URL state, keyboard nav, zero direct wiki
calls), item detail (charts, ranges, break-even), the starter budget math, the full
flip-log lifecycle (open → complete → CSV), the mobile card layout and the PWA
manifest. Tests hit the real wiki API through the server cache, so assertions are
structural rather than value-exact. First run may need `npx playwright install chromium`.

## Production

```bash
npm run build      # builds shared, server, client
npm start          # one Node process serving app + API on PORT (default 3000)
```

## Repository

Published at [github.com/TandersT/osrs-ge-flip-finder](https://github.com/TandersT/osrs-ge-flip-finder)
(private). On the dev machine the remote uses the `github-tanderst` SSH alias.
See `DECISIONS.md` ("Repo conventions") for the history of how it got there.

## Tiers

Free covers the whole flipping loop (finder, filters, risk flags, charts, starter guide).
Premium removes scale limits (watchlist, flip log + CSV) and unlocks the full long-term
screener, full-year history, the Patch Impact page and the Divergence screener. Entitlements live in
`shared/src/tiers.ts` as data; payments are not integrated yet — see
[docs/payments-plan.md](docs/payments-plan.md) for the Stripe follow-up plan. Until then
`/premium` accepts the dev unlock code.

## Architecture notes

- **Why every wiki call goes through our backend:** the wiki asks for a descriptive
  `User-Agent` with contact info, which a browser cannot send. The server centralises
  that plus TTL caching with single-flight, so any number of clients cause at most one
  upstream call per endpoint per TTL window. `/api/health` exposes upstream call counters.
- **Wiki downtime:** the server keeps serving the last good payload flagged
  `upstreamStale`; the UI shows an amber banner.
- **Tax/margin math lives once** in `shared/` and is unit-tested there (GE tax: 2%
  floor-per-item, 5m cap, sub-50gp free, ~45 exempt items seeded from the wiki category).
- `/tools` bundles four money-making screeners (high-alch, decanting, set combining,
  AFK processing methods with hiscores character import) — set components are generated
  from the wiki (`scripts/generate-item-sets.mjs`), methods are curated data.
- The long-term screener fetches 24h timeseries for the ~250 most liquid items with a
  throttled worker pool and caches the screen for 12h (see `DECISIONS.md`).
- **Divergence (`/divergence`, premium)** screens ~15 curated item categories (shared data,
  `shared/src/categories.ts`) for pairwise mismatches: pairs must prove co-movement (weekly
  log-return correlation ≥ 0.4 over 180 overlapping days, both legs ≥ 2k daily volume) before
  a z-scored log-price spread (|z| ≥ 2 vs its trailing 90d) may flag the cheap leg as a
  laggard deal. Deals carry the pair's past reconvergence record and a ⚠ badge when a recent
  game update links either leg (reusing the Patch Impact update store). Same 12h lazy build
  pattern as the long-term screener (`server/src/divergence.ts`).
- **Patch Impact (`/patches`, premium)** adds two more server-side upstreams, same rule as
  the prices API (browser never calls them): the weirdgloop exchange archive (multi-year
  daily prices, volumes from Sept 2018) and the wiki's MediaWiki API (update posts + the
  Upcoming updates page). The first build backfills a few minutes into a disk cache at
  `server/data/patch-cache/` (gitignored); restarts serve from disk. Winners/losers are
  event-study computations (see `server/src/patchStats.ts`), never hand-curated; the
  optional overlay in `server/src/data/patchOverrides.ts` ships empty.
