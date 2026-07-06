# Design rules

The UI's look is deliberately simple: a dark OSRS-flavoured surface, one gold accent,
dense data tables. These rules keep every page on that system. When adding UI, copy an
existing recipe from this file rather than inventing a variant; if a new pattern is
genuinely needed, add it here in the same PR.

## 1. Color — tokens only

All colors come from `tailwind.config.js`. No raw hex, no default Tailwind palette
colors (`red-400`, `zinc-800`, …) in components.

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#13110d` | Page background, input backgrounds |
| `panel` | `#1e1b16` | Cards / panels |
| `panel-light` | `#2a251d` | Raised chips, active tab, slider track |
| `panel-border` | `#3d362a` | All borders and dividers |
| `parchment` | `#e2dbc8` | Body text |
| `gold` | `#ffb83f` | THE accent: interactive affordances, headings, primary buttons, focus |
| `osrs-green` | `#00ff80` | Positive numbers only (profit, price up) |
| `osrs-red` | `#ff6b6b` | Negative numbers, risk, destructive hover |
| `osrs-yellow` | `#ffff00` | OSRS-flavour highlights only (in-game price text) |

- Dimming: `opacity-60` on labels and `opacity-40/50/70/80` on secondary blocks is the
  house style; use `text-parchment/NN` when only the text color should dim (e.g. a ghost
  button whose hover restores full color). Don't mix both on one element.
- Charts (Recharts) can't read Tailwind classes; all chart hex values live in
  `client/src/lib/chartTheme.ts` and mirror/derive from the tokens. Never inline a hex in
  a component.
- Green/red always mean "number went well / went badly". Never use them decoratively.

### Status-tint palette (badges & banners)

Small `text-[10px] uppercase` pill badges and full-width notice banners use muted
Tailwind tints — the neon `osrs-*` colors are too loud at badge size. This is the ONLY
sanctioned use of the default Tailwind palette, with fixed meanings:

| Tint | Recipe (badge) | Meaning |
| --- | --- | --- |
| emerald | `bg-emerald-900/60 text-emerald-300` | good / tax-free / rising / requirement met |
| red | `bg-red-900/50 text-red-300` | risk / thin / falling / requirement unmet |
| orange | `bg-orange-900/60 text-orange-300` | instability (latest price vs 1h average) |
| amber | `bg-amber-900/50 text-amber-300` | caution / members / semi-AFK; banners use `border-amber-700 bg-amber-950/50` |
| sky | `bg-sky-900/60 text-sky-300` | informational kind (flip, dip, open position) |
| purple | `bg-purple-900/60 text-purple-300` | special kind (method, momentum, hot) |
| zinc | `bg-zinc-700/60 text-zinc-300` | neutral / stale |

Row flags (tax-free, stale, thin, unstable, hot, rising, falling) are defined once in
`client/src/lib/flags.ts` — label, tooltip, tints, and row getter together — and every
rendering (table badge, phone-card text, filter chip) reads from that list.

One value, one hue — a flag must keep its hue in every rendering (the "stale" flag is
zinc in the table badge AND on the phone card). Badge micro-size is always `text-[10px]`.

## 2. Icons — one system, no emoji

- Every glyph in UI chrome is an `<Icon name="…" />` (`client/src/components/Icon.tsx`):
  24×24 stroke SVGs that inherit `currentColor`, so an icon is colored by the text style
  around it and automatically matches the theme.
- No emoji (💰 🔒 ⭐ …) and no unicode dingbats (★ ✕ ▲ ✓ →) in JSX. Emoji render in the
  platform's color font, ignore `color:`, and clash with the palette; unicode glyphs vary
  in size/weight per font. Item sprites from the wiki (`ItemIcon`) are the one sanctioned
  pictorial element.
- Typographic characters in prose are fine: — – … “ ” · are text, not icons.
- One meaning, one icon, everywhere:
  - close/dismiss → `close` · confirm/included → `check` · watchlist → `star` /
    `star-fill` (toggled) · saved filter views → `bookmark` / `bookmark-fill`
  - premium gating → `lock` · premium branding & magic/alchemy flavor → `sparkle`
  - sort indicator and collapse toggles → `chevron-up` / `chevron-down`
  - import/export & price direction → `arrow-up` / `arrow-down` · buy-to-sell →
    `arrow-right` · back-navigation → `arrow-left` · external link → `external`
  - alerts → `bell` · flip log → `book` · warnings → `warning` · refresh → `refresh`
  - brand & gp flavor → `coins` · subject flavor (personas, tools) → `sword` `bolt`
    `gem` `chart` `flask` `shield` `moon`
- The `×` multiplication sign in quantities ("62 ×") is math notation, not an icon — it is
  the one look-alike glyph that stays text.
- Icon size defaults to `1em` (scales with the text). Don't hardcode pixel sizes except in
  empty states (`size={40}`, `text-parchment/40`) and micro-contexts (10–13px inside
  `text-xs` buttons).

## 3. Native controls

Browser chrome that can't be themed is hidden or replaced (`index.css`):

- `input[type=number]` spin buttons are hidden — a paired slider or typing is the stepper.
- `select` uses `appearance: none` plus a parchment chevron background image.
- Checkboxes stay native with `accent-gold` (accepted exception: `accent-color` themes them
  well enough, and native hit targets/a11y are better than a rebuild).
- Range inputs use the explicit track/thumb styling in `index.css` (gold thumb, panel-light
  track). Never restyle per-page.

## 4. Surfaces

- Panel: `rounded border border-panel-border bg-panel` — `p-3` compact (filter bar), `p-4`
  standard content, `p-5` marketing/pricing cards, no padding when a table fills it.
- Gold-accent panel (premium teasers, welcome banner, upsell dialog): same recipe with
  `border-gold/40`; stronger alphas (`/50`, `/60`) are reserved for selected/emphasized
  states (chosen item chip, highlighted plan). Premium teaser strips must use the
  `UnlockStrip` component, not hand-rolled copies.
- Raised chip / preset: `rounded bg-panel-light px-2.5 py-1 text-xs`.
- Dividers and row separators: `border-panel-border/50` (footer too).
- Border radius is always Tailwind's bare `rounded` (4px). No `rounded-md/lg/xl` on chrome;
  `rounded-full` only for genuinely circular things (slider thumb, step number badges).

## 5. Buttons

Three recipes in two sizes (regular `px-3 py-1.5 text-sm`, compact `px-2.5 py-1 text-xs`
for inline/form contexts) — pick one, don't blend:

- **Primary** (one per view): `rounded bg-gold font-semibold text-ink
  hover:brightness-110` (+ `disabled:opacity-30 enabled:hover:brightness-110` when it can
  disable).
- **Secondary / outline**: `rounded border border-panel-border hover:border-gold
  hover:text-gold`.
- **Ghost** (inline, low emphasis): `rounded text-parchment/50 hover:text-parchment`
  (destructive ghosts hover `hover:text-osrs-red`; icon-only delete buttons rest at
  `text-parchment/30`).
- **Segmented pills / tool tabs**: active `bg-gold text-ink`, inactive `bg-panel-light
  text-parchment/70 hover:text-parchment`, `rounded font-medium`. The top nav is the one
  exception: active tabs use `bg-panel-light text-gold` so the gold fill stays reserved
  for actions.
- **Tri-state flag chips** (FilterBar): click cycles any → only → hide. Off state
  `bg-panel-light text-parchment/50`; "only" is the gold fill + `check` icon; "hide" is
  the red status tint (`bg-red-900/50 text-red-300`) + `close` icon.

## 6. Type scale

- Page title: `text-2xl font-bold text-gold` (one per page, sentence case). Exceptions:
  the header brand (`text-xl`) and the item-detail H1 (item name in parchment — content,
  not chrome).
- Page subtitle / intro: `text-sm opacity-70`.
- Section heading & table column header: `text-xs font-semibold uppercase tracking-wide
  text-gold` (sortable headers add `hover:text-osrs-yellow`).
- Form / field label: `text-xs uppercase tracking-wide opacity-60`.
- Data cells and body: `text-sm`; dense meta lines `text-xs`; badge micro-size
  `text-[10px]`.
- Numbers in tables are right-aligned `tabular-nums`; gp values via `GpText` /
  `formatGpCompact`.

## 7. Forms

Single input recipe: `rounded border border-panel-border bg-ink px-2 py-1.5 text-sm
text-parchment outline-none focus:border-gold` (compact contexts drop to `px-1.5 py-0.5
text-xs`). Focus is always the gold border — no rings, no shadows.

## 8. Motion

Subtle and purposeful only: `transition-colors` on interactive elements, the flash-up/down
price tints, skeleton pulse. Everything respects `prefers-reduced-motion` (see `index.css`).
