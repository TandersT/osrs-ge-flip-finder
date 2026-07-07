# Set-piece buy/sell + reusable set-breakdown modal

**Date:** 2026-07-07 · **Status:** approved design, pre-implementation

## Goal

Make the buy/sell prices of set/combo *pieces* visible where a flipper needs them:

1. **Combining tab** (`/tools?tool=sets`) — show the explicit buy/sell offer prices for the
   set and for its pieces, alongside the existing combine/split margins.
2. **A reusable set-breakdown modal** — a finder-style table of a set's individual pieces
   (plus the set itself and an arbitrage summary), openable from both item-list surfaces
   (the Flip Finder and the Combining tab) and from the item detail page of a set/combo.

## Decisions (agreed in brainstorming)

- **Modal triggers from both lists.** The Flip Finder rows *and* the Combining tab rows get
  the trigger, plus the item detail page of a set/combo item.
- **Modal = pieces + set + summary.** A finder-style row per piece and a row for the set
  itself, with a combine-vs-split arbitrage summary header.
- **Combining table gets set + pieces-total buy/sell**, rendered as two grouped `buy → sell`
  columns (not four separate numeric columns — the table is already `min-w-[860px]`).
- **No new gating.** The modal is read-only detail of an already-visible item. Free tier
  already sees all items on the finder/IDP; the combining teaser only caps how many rows
  *list*, and the modal opens from a visible row.
- **Only the set item gets the IDP trigger.** A piece's page linking back to its parent set
  is out of scope for this change.

## Shared foundation — set lookup (`client/src/lib/tools.ts`)

Refactor the piece-resolution currently inline in `computeSetRows` so a single set can be
resolved and computed on demand:

- `type ResolvedSet = { def: ItemSetDef; via: SetRow['via'] }`
- `resolveSetDefs(items, sets = ITEM_SETS, combos = COMBINES): ResolvedSet[]` — resolves
  GE-clerk sets (by id) and name-based combos (godswords, resolved via a `byName` map) to
  concrete piece ids. This is the existing logic lifted out verbatim.
- `computeSetRow(byId: Map<number, ItemSnapshot>, cfg, resolved): SetRow | null` — the
  per-set body of the current loop. `computeSetRows` becomes:
  `resolveSetDefs → map(computeSetRow) → filter(Boolean) → sort`. Behaviour is unchanged
  (existing `tools.test.ts` and `tools.spec.ts` must still pass).
- `setDefsById(items, sets?, combos?): Map<number, ResolvedSet>` — keyed by `def.setId`,
  for O(1) "is this item a set?" checks on the finder and IDP.

### `SetRow` additions (deliverable 1 data)

Surface the offer prices already computed internally so the table can render them:

- `setBuy` = `set.low + offerOffset`
- `setSell` = `max(1, set.high − offerOffset)`
- `piecesBuyTotal` = Σ piece `(low + offerOffset)`
- `piecesSellTotal` = Σ piece `max(1, high − offerOffset)`

These are raw GE offer prices you'd type in; **tax stays reflected in the existing
`combineMargin`/`splitMargin` columns**, so the new columns are informational, not a second
tax model.

## Deliverable 1 — Combining tab columns (`ToolsPage.tsx`)

Add two grouped columns to the sets table, between "Best move" and the margin columns:

- **Set** — `setBuy → setSell` (`GpText` + `CopyValue`, `Icon name="arrow-right"` between).
- **Pieces** — `piecesBuyTotal → piecesSellTotal`, same rendering.

Matches the mobile-card `buy → sell` idiom and the recently shipped click-to-copy prices.

## Deliverable 2 — `SetBreakdownDialog.tsx`

New `client/src/components/SetBreakdownDialog.tsx`, controlled like `UpsellDialog` but
carrying a payload:

```ts
{ set: ResolvedSet | null; items: ItemSnapshot[]; config: AppConfig; onClose: () => void }
```

`set === null` ⇒ closed (nothing rendered). Escape + backdrop click close it; body uses
`onClick={stopPropagation}`; `role="dialog"` / `aria-modal` like `UpsellDialog`.

- **Summary header**: combine/split "best move" badge (reuse the tab's emerald/sky badge
  styling), combine margin, split margin, min-volume leg, and via (GE clerk / inventory) —
  computed with `computeSetRow`.
- **Table (finder-style)**: a highlighted **set** row followed by one row per **piece**.
  Columns: Item, Buy, Sell, Margin, ROI, Vol/1h, Limit. Rows come from `buildRows` over the
  `[set, ...pieces]` snapshot subset (with `Math.floor(Date.now()/1000)` for `nowSec`), so
  values match the finder exactly. Row click → `navigate('/item/:id')` + `onClose()`. Buy/Sell
  cells wrapped in `CopyValue`.
- **Rendering**: a plain `<table>` reusing the Tools `th`/`td` class helpers inside an
  `overflow-auto` wrapper for mobile. Not the virtualized `FlipTable` — its global keyboard
  listeners, `calc(100vh…)` sizing and mobile card mode don't belong in a modal, and the
  Tools tables are already plain `<table>`s, so this is consistent.

## Triggers

- **Combining tab** (`ToolsPage`): each set row gets a small `shield`-icon button
  (`stopPropagation`) → sets `openSet`. Page renders one `<SetBreakdownDialog>`.
- **Flip Finder** (`FlipTable` + `FlipFinderPage`): set/combo rows show an inline `shield`
  button in the Item cell (`stopPropagation` so it opens the modal, not navigates). Extend
  `TableContext` with **optional** `setIds?: Set<number>` and `onOpenPieces?: (row) => void`;
  render the button only when `setIds?.has(row.id)`. Mirror on mobile `FlipCard`.
  `FlipFinderPage` builds `setDefsById`, owns modal state, and passes the callback.
  Optionality keeps `WatchlistPage` (same `FlipTable`/`TableContext`) unaffected; it can gain
  the trigger later.
- **Item Detail Page** (`ItemDetailPage`): if `setDefsById.get(item.id)` exists, a
  "View set pieces" button in the header opens the modal.

## Testing

- **Unit** (`client/src/lib/tools.test.ts`):
  - `resolveSetDefs` resolves a GE set (by id) and a name-based combo (godsword) to concrete
    piece ids; skips defs with an unpriced/missing piece.
  - `computeSetRow` for a given set equals the matching entry from `computeSetRows`.
  - `setDefsById` maps set ids (and does **not** map a piece id).
  - New `SetRow` fields (`setBuy`/`setSell`/`piecesBuyTotal`/`piecesSellTotal`) match a
    hand-computed fixture.
- **e2e** (structural, live data — matches the suite):
  - Extend `tools.spec.ts`: under the premium unlock, open the modal from a combining row;
    assert the summary badge and ≥2 piece rows render, and Escape closes it.
  - Extend `detail.spec.ts`: navigate to a known set item's IDP, click "View set pieces",
    assert the modal opens with piece rows.

## Out of scope

- A piece's IDP linking back to its parent set(s).
- The set-breakdown trigger on `WatchlistPage`.
- Any new premium entitlement.
