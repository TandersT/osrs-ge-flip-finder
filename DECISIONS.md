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
