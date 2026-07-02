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
