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

## Production

```bash
npm run build      # builds shared, server, client
npm start          # one Node process serving app + API on PORT (default 3000)
```

## Repository

Published at [github.com/TandersT/osrs-ge-flip-finder](https://github.com/TandersT/osrs-ge-flip-finder)
(private). On the dev machine the remote uses the `github-tanderst` SSH alias.
See `DECISIONS.md` ("Repo conventions") for the history of how it got there.

## Architecture notes

- **Why every wiki call goes through our backend:** the wiki asks for a descriptive
  `User-Agent` with contact info, which a browser cannot send. The server centralises
  that plus TTL caching with single-flight, so any number of clients cause at most one
  upstream call per endpoint per TTL window. `/api/health` exposes upstream call counters.
- **Wiki downtime:** the server keeps serving the last good payload flagged
  `upstreamStale`; the UI shows an amber banner.
- **Tax/margin math lives once** in `shared/` and is unit-tested there (GE tax: 2%
  floor-per-item, 5m cap, sub-50gp free, ~45 exempt items seeded from the wiki category).
- The long-term screener fetches 24h timeseries for the ~250 most liquid items with a
  throttled worker pool and caches the screen for 12h (see `DECISIONS.md`).
