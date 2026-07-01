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
