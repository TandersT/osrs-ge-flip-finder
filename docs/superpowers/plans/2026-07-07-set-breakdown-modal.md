# Set-piece buy/sell + set-breakdown modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show set/combo piece buy/sell prices on the Combining tab and add a reusable set-breakdown modal openable from the Flip Finder, the Combining tab, and set item detail pages.

**Architecture:** One shared foundation in `client/src/lib/tools.ts` (resolve a set→pieces, compute a single set's economics, look sets up by id) feeds three UI surfaces. A new controlled `SetBreakdownDialog` component builds finder-style `FlipRow`s over the `[set, ...pieces]` subset so its numbers match the finder exactly. Deliverable 1 (Combining columns) and deliverables on the finder/IDP all reuse that foundation.

**Tech Stack:** React 18 + TypeScript (strict), Tailwind (dark theme), TanStack Table/Virtual (finder only), Vitest (logic), Playwright (UI), npm workspaces. Shared flip/tax math in `@osrs-flip/shared`.

## Global Constraints

- TypeScript strict everywhere; **no new dependencies**.
- Style with the existing Tailwind design tokens only: `gold`, `panel`, `panel-light`, `panel-border`, `parchment`, `ink`, `osrs-red`, `osrs-green`, `emerald-*`, `sky-*`, `amber-*`.
- Reuse existing components: `GpText`, `CopyValue`, `ItemIcon`, `Icon` (available icon names include `shield`, `close`, `arrow-right`, `copy`, `check`).
- **No component-render unit tests** — the repo tests pure logic with Vitest (`client/src/lib/*.test.ts`) and all UI with Playwright e2e. Follow that split: logic → Vitest, dialog/triggers → e2e.
- Run the client unit suite from repo root with `npm test -w client` (fast; no `cd`).
- e2e runs against the production build: `npm run build` then `npm run e2e`. First run may need `npx playwright install chromium`.
- Do **not** modify `WatchlistPage.tsx` (it shares `FlipTable`; the new context fields are optional so it keeps working untouched).
- Conventional-commit messages. End the run with `npm run lint` and `npm run typecheck` green.
- Premium dev unlock code (used in e2e): `GEFF-DEV-2026`.

---

### Task 1: Set-resolution foundation + offer-price fields (`tools.ts`)

**Files:**
- Modify: `client/src/lib/tools.ts` (the `SetRow` interface ~55-68 and `computeSetRows` ~74-141)
- Test: `client/src/lib/tools.test.ts` (add to the existing `describe('computeSetRows', …)` and a new `describe`)

**Interfaces:**
- Consumes: existing `ITEM_SETS`, `COMBINES`, `ItemSetDef`, `CombineDef`, `geTax`, `AppConfig`, `ItemSnapshot`.
- Produces:
  - `interface ResolvedSet { def: ItemSetDef; via: SetRow['via'] }`
  - `resolveSetDefs(items: ItemSnapshot[], sets?: ItemSetDef[], combos?: CombineDef[]): ResolvedSet[]`
  - `computeSetRow(byId: Map<number, ItemSnapshot>, cfg: AppConfig, resolved: ResolvedSet): SetRow | null`
  - `setDefsById(items: ItemSnapshot[], sets?: ItemSetDef[], combos?: CombineDef[]): Map<number, ResolvedSet>`
  - `SetRow` gains `setBuy: number`, `setSell: number`, `piecesBuyTotal: number`, `piecesSellTotal: number` (raw GE offer prices; tax stays in `combineMargin`/`splitMargin`).

- [ ] **Step 1: Write the failing tests**

Add these tests to `client/src/lib/tools.test.ts`. First, extend the existing "computes both directions" test (inside `describe('computeSetRows', …)`) by appending these assertions to its body (after the existing `expect(r.volume1h).toBe(50);`):

```ts
    // raw GE offer prices surfaced for the buy/sell columns (tax lives in the margins)
    expect(r.setBuy).toBe(10_001);
    expect(r.setSell).toBe(11_999);
    expect(r.piecesBuyTotal).toBe(4_001 + 5_001);
    expect(r.piecesSellTotal).toBe(4_499 + 5_499);
```

Then add a new top-level `describe` block at the end of the file:

```ts
describe('resolveSetDefs / computeSetRow / setDefsById', () => {
  const setDef: ItemSetDef = {
    setId: 100,
    setName: 'Test armour set',
    pieces: [
      { id: 101, name: 'Test helm' },
      { id: 102, name: 'Test body' },
    ],
  };
  const items = [
    item({ id: 100, name: 'Test armour set', low: 10_000, high: 12_000, volume1h: 50 }),
    item({ id: 101, name: 'Test helm', low: 4_000, high: 4_500, volume1h: 200 }),
    item({ id: 102, name: 'Test body', low: 5_000, high: 5_500, volume1h: 300 }),
    item({ id: 200, name: 'Test godsword', low: 20_000, high: 25_000, volume1h: 40 }),
    item({ id: 201, name: 'Test blade', low: 8_000, high: 9_000, volume1h: 90 }),
    item({ id: 202, name: 'Test hilt', low: 10_000, high: 11_000, volume1h: 60 }),
  ];
  const combos = [{ result: 'Test godsword', pieces: ['Test blade', 'Test hilt'] }];

  it('resolves GE sets by id and combos by name', () => {
    const resolved = resolveSetDefs(items, [setDef], combos);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.via).toBe('GE clerk');
    expect(resolved[1]!.via).toBe('inventory');
    expect(resolved[1]!.def.setId).toBe(200);
    expect(resolved[1]!.def.pieces.map((p) => p.id)).toEqual([201, 202]);
  });

  it('computeSetRow matches the corresponding computeSetRows entry', () => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const resolved = resolveSetDefs(items, [setDef], combos);
    const single = computeSetRow(byId, cfg, resolved[0]!);
    const fromAll = computeSetRows(items, cfg, [setDef], combos).find((r) => r.def.setId === 100);
    expect(single).toEqual(fromAll);
  });

  it('setDefsById maps set ids but not piece ids', () => {
    const map = setDefsById(items, [setDef], combos);
    expect(map.get(100)?.via).toBe('GE clerk');
    expect(map.get(200)?.via).toBe('inventory');
    expect(map.has(101)).toBe(false);
  });
});
```

Update the import line at the top of the test file to pull in the new exports:

```ts
import {
  computeAlchRows,
  computeDecantRows,
  computeMethodRows,
  computeSetRow,
  computeSetRows,
  resolveSetDefs,
  setDefsById,
  NATURE_RUNE_ID,
} from './tools';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w client`
Expected: FAIL — `resolveSetDefs`/`computeSetRow`/`setDefsById` are not exported; `r.setBuy` etc. are `undefined`.

- [ ] **Step 3: Refactor `tools.ts`**

In `client/src/lib/tools.ts`, extend the `SetRow` interface — add these four fields inside it (e.g. after `bestMargin`):

```ts
  /** Raw GE offer price for the set: low + offerOffset. */
  setBuy: number;
  /** Raw GE offer price for the set: high − offerOffset (min 1). */
  setSell: number;
  /** Sum of each piece's buy offer (low + offerOffset). */
  piecesBuyTotal: number;
  /** Sum of each piece's sell offer (high − offerOffset, min 1). */
  piecesSellTotal: number;
```

Replace the whole `computeSetRows` function (the body that builds `comboDefs`, loops, and pushes rows) with the extracted helpers plus a thin `computeSetRows`:

```ts
export interface ResolvedSet {
  def: ItemSetDef;
  via: SetRow['via'];
}

/**
 * Resolve every set/combo definition to concrete piece ids against the live
 * item list. GE-clerk sets carry ids already; inventory combos resolve by name
 * and are skipped when a part is missing.
 */
export function resolveSetDefs(
  items: ItemSnapshot[],
  sets: ItemSetDef[] = ITEM_SETS,
  combos: CombineDef[] = COMBINES,
): ResolvedSet[] {
  const byName = new Map(items.map((i) => [i.name, i]));
  const comboDefs: ResolvedSet[] = [];
  for (const c of combos) {
    const result = byName.get(c.result);
    const pieces = c.pieces.map((n) => byName.get(n));
    if (!result || pieces.some((p) => p === undefined)) continue;
    comboDefs.push({
      def: {
        setId: result.id,
        setName: result.name,
        pieces: (pieces as ItemSnapshot[]).map((p) => ({ id: p.id, name: p.name })),
      },
      via: 'inventory',
    });
  }
  return [...sets.map((def) => ({ def, via: 'GE clerk' as const })), ...comboDefs];
}

/**
 * Economics for a single resolved set, or null when the set or any piece is
 * missing or unpriced. Combine = buy pieces, exchange, sell set; split = the
 * reverse. Both post-tax; the raw offer prices are surfaced for display.
 */
export function computeSetRow(
  byId: Map<number, ItemSnapshot>,
  cfg: AppConfig,
  { def, via }: ResolvedSet,
): SetRow | null {
  const set = byId.get(def.setId);
  const pieces = def.pieces.map((p) => byId.get(p.id));
  if (!set || pieces.some((p) => p === undefined)) return null;
  if (set.low === null || set.high === null) return null;
  if (pieces.some((p) => p!.low === null || p!.high === null)) return null;

  const setBuy = set.low + cfg.offerOffset;
  const setSell = Math.max(1, set.high - cfg.offerOffset);
  let piecesBuyTotal = 0;
  let piecesSellTotal = 0;
  let piecesSellNet = 0;
  let minVolume = set.volume1h;
  for (const p of pieces as ItemSnapshot[]) {
    const pieceSell = Math.max(1, p.high! - cfg.offerOffset);
    piecesBuyTotal += p.low! + cfg.offerOffset;
    piecesSellTotal += pieceSell;
    piecesSellNet += pieceSell - geTax(p.taxExempt, pieceSell);
    minVolume = Math.min(minVolume, p.volume1h);
  }

  const combineMargin = setSell - geTax(set.taxExempt, setSell) - piecesBuyTotal;
  const splitMargin = piecesSellNet - setBuy;
  const best = combineMargin >= splitMargin ? 'combine' : 'split';
  return {
    def,
    via,
    set,
    combineMargin,
    splitMargin,
    best,
    bestMargin: Math.max(combineMargin, splitMargin),
    volume1h: minVolume,
    setBuy,
    setSell,
    piecesBuyTotal,
    piecesSellTotal,
  };
}

/**
 * GE clerks exchange sets <-> pieces for free, so any price gap between a set
 * and the sum of its pieces is arbitrage. Both directions computed per set.
 */
export function computeSetRows(
  items: ItemSnapshot[],
  cfg: AppConfig,
  sets: ItemSetDef[] = ITEM_SETS,
  combos: CombineDef[] = COMBINES,
): SetRow[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows: SetRow[] = [];
  for (const resolved of resolveSetDefs(items, sets, combos)) {
    const row = computeSetRow(byId, cfg, resolved);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => b.bestMargin - a.bestMargin);
  return rows;
}

/** Sets/combos keyed by their set-item id, for O(1) "is this a set?" checks. */
export function setDefsById(
  items: ItemSnapshot[],
  sets: ItemSetDef[] = ITEM_SETS,
  combos: CombineDef[] = COMBINES,
): Map<number, ResolvedSet> {
  return new Map(resolveSetDefs(items, sets, combos).map((r) => [r.def.setId, r]));
}
```

Keep the existing `import { COMBINES, type CombineDef } from '../data/combines';` and `import { ITEM_SETS, type ItemSetDef } from '../data/itemSets';` lines. The `AppConfig`/`ItemSnapshot`/`geTax` imports at the top are already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w client`
Expected: PASS (all previous `computeSetRows` tests plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/tools.ts client/src/lib/tools.test.ts
git commit -m "feat(client): resolveSetDefs/computeSetRow/setDefsById + set offer-price fields"
```

---

### Task 2: Set + pieces buy/sell columns on the Combining tab

**Files:**
- Modify: `client/src/pages/ToolsPage.tsx` (imports; the `tool === 'sets'` table, `thead` ~312-322 and `tbody` row ~324-364; the `<table>` `min-w`)

**Interfaces:**
- Consumes: `SetRow.setBuy/setSell/piecesBuyTotal/piecesSellTotal` (Task 1), `CopyValue`, `GpText`, `Icon`.
- Produces: nothing new for later tasks (UI only).

- [ ] **Step 1: Add the `CopyValue` import**

At the top of `client/src/pages/ToolsPage.tsx`, add next to the other component imports:

```ts
import { CopyValue } from '../components/CopyValue';
```

- [ ] **Step 2: Add two header cells**

In the sets `thead` row, insert two `<th>` cells right after `<th className={th(false)}>Best move</th>` and before `<th className={th(true)}>Combine margin</th>`:

```tsx
                  <th className={th(true)}>Set (buy → sell)</th>
                  <th className={th(true)}>Pieces (buy → sell)</th>
```

- [ ] **Step 3: Add the two matching body cells**

In the sets `tbody` row, insert these two `<td>` cells right after the "Best move" cell (the one containing the `combine`/`split` badge `</td>`) and before `<td className={`${td} text-right`}><GpText amount={r.combineMargin} signed /></td>`:

```tsx
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CopyValue value={r.setBuy}><GpText amount={r.setBuy} /></CopyValue>
                        <Icon name="arrow-right" size={11} className="opacity-40" />
                        <CopyValue value={r.setSell}><GpText amount={r.setSell} /></CopyValue>
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CopyValue value={r.piecesBuyTotal}><GpText amount={r.piecesBuyTotal} /></CopyValue>
                        <Icon name="arrow-right" size={11} className="opacity-40" />
                        <CopyValue value={r.piecesSellTotal}><GpText amount={r.piecesSellTotal} /></CopyValue>
                      </span>
                    </td>
```

- [ ] **Step 4: Widen the table**

In the sets `<table>` element, change `className="w-full min-w-[860px] border-collapse text-sm"` to:

```tsx
            <table className="w-full min-w-[1040px] border-collapse text-sm">
```

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors).

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ToolsPage.tsx
git commit -m "feat(client): set + pieces buy/sell columns on the Combining tab"
```

---

### Task 3: `SetBreakdownDialog` + open it from the Combining tab

**Files:**
- Create: `client/src/components/SetBreakdownDialog.tsx`
- Modify: `client/src/pages/ToolsPage.tsx` (imports; `useState` for the open set; a trigger button in the "Set / combo" cell; render the dialog)
- Test: `e2e/tools.spec.ts` (extend the existing set-combining test)

**Interfaces:**
- Consumes: `ResolvedSet`, `computeSetRow` (Task 1); `buildRows`, `FlipRow`, `AppConfig`, `ItemSnapshot` from `@osrs-flip/shared`; `CopyValue`, `GpText`, `ItemIcon`, `Icon`.
- Produces: `export function SetBreakdownDialog(props: { set: ResolvedSet | null; items: ItemSnapshot[]; config: AppConfig; onClose: () => void }): JSX.Element | null` — reused by Tasks 4 and 5.

- [ ] **Step 1: Create the dialog component**

Create `client/src/components/SetBreakdownDialog.tsx`:

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppConfig, FlipRow, ItemSnapshot } from '@osrs-flip/shared';
import { buildRows } from '@osrs-flip/shared';
import { computeSetRow, type ResolvedSet } from '../lib/tools';
import { CopyValue } from './CopyValue';
import { GpText } from './GpText';
import { Icon } from './Icon';
import { ItemIcon } from './ItemIcon';

const th = (right: boolean) =>
  `whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold ${
    right ? 'text-right' : 'text-left'
  }`;
const td = 'whitespace-nowrap px-3 py-1.5';

/**
 * Reusable modal: a finder-style breakdown of one set/combo — the set row plus
 * one row per piece, with a combine-vs-split arbitrage summary. `set === null`
 * renders nothing (closed). Rows are built from the live snapshots so their
 * numbers match the Flip Finder exactly.
 */
export function SetBreakdownDialog({
  set,
  items,
  config,
  onClose,
}: {
  set: ResolvedSet | null;
  items: ItemSnapshot[];
  config: AppConfig;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!set) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [set, onClose]);

  if (!set) return null;

  const byId = new Map(items.map((i) => [i.id, i]));
  const summary = computeSetRow(byId, config, set);
  const setItem = byId.get(set.def.setId);
  const pieceItems = set.def.pieces
    .map((p) => byId.get(p.id))
    .filter((i): i is ItemSnapshot => i !== undefined);
  const nowSec = Math.floor(Date.now() / 1000);
  const rows: FlipRow[] = buildRows(
    setItem ? [setItem, ...pieceItems] : pieceItems,
    config,
    nowSec,
  );

  const open = (id: number) => {
    onClose();
    navigate(`/item/${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${set.def.setName} pieces`}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded border border-gold/40 bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-panel-border p-4">
          <div>
            <h2 className="text-lg font-bold text-gold">{set.def.setName}</h2>
            {summary && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 uppercase tracking-wide ${
                    summary.best === 'combine'
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-sky-900/60 text-sky-300'
                  }`}
                >
                  {summary.best}
                </span>
                <span className="opacity-70">via {summary.via}</span>
                <span className="opacity-70">
                  combine <GpText amount={summary.combineMargin} signed />
                </span>
                <span className="opacity-70">
                  split <GpText amount={summary.splitMargin} signed />
                </span>
                <span className="opacity-70">
                  min leg {summary.volume1h.toLocaleString('en-US')}/h
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-parchment/40 hover:text-osrs-red"
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 bg-panel-light">
              <tr>
                <th className={th(false)}>Item</th>
                <th className={th(true)}>Buy</th>
                <th className={th(true)}>Sell</th>
                <th className={th(true)}>Margin</th>
                <th className={th(true)}>ROI</th>
                <th className={th(true)}>Vol/1h</th>
                <th className={th(true)}>Limit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSet = row.id === set.def.setId;
                return (
                  <tr
                    key={row.id}
                    onClick={() => open(row.id)}
                    className={`cursor-pointer border-t border-panel-border/50 hover:bg-panel-light ${
                      isSet ? 'bg-panel-light/50 font-medium' : ''
                    }`}
                  >
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={row.icon} name={row.name} />
                        {row.name}
                        {isSet && (
                          <span className="rounded bg-gold/20 px-1 text-[10px] uppercase tracking-wide text-gold">
                            set
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <CopyValue value={row.flip?.buyAt ?? null}>
                        <GpText amount={row.flip?.buyAt ?? null} />
                      </CopyValue>
                    </td>
                    <td className={`${td} text-right`}>
                      <CopyValue value={row.flip?.sellAt ?? null}>
                        <GpText amount={row.flip?.sellAt ?? null} />
                      </CopyValue>
                    </td>
                    <td className={`${td} text-right`}>
                      <GpText amount={row.flip?.marginPerItem ?? null} signed />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {row.flip ? (
                        `${(row.flip.roi * 100).toFixed(1)}%`
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {row.volume1h.toLocaleString('en-US')}
                    </td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {row.limit === null ? '—' : row.limit.toLocaleString('en-US')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the trigger into `ToolsPage`**

In `client/src/pages/ToolsPage.tsx`, add imports:

```ts
import { SetBreakdownDialog } from '../components/SetBreakdownDialog';
import { type ResolvedSet } from '../lib/tools';
```

(`useState` is already imported from `react`.) Inside `ToolsPage`, add state near the other `useState` calls:

```ts
  const [openSet, setOpenSet] = useState<ResolvedSet | null>(null);
```

In the sets `tbody` row, in the first cell (the "Set / combo" `<td>` whose `<span>` shows the icon + `r.set.name`), add a trigger button right after `{r.set.name}` and before the closing `</span>`:

```tsx
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSet({ def: r.def, via: r.via });
                          }}
                          title="View set pieces"
                          className="text-parchment/40 hover:text-gold"
                        >
                          <Icon name="shield" size={13} />
                        </button>
```

At the very end of the `ToolsPage` return, just before the final closing `</div>`, render the dialog:

```tsx
      <SetBreakdownDialog
        set={openSet}
        items={data?.items ?? []}
        config={config}
        onClose={() => setOpenSet(null)}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Write the failing e2e**

In `e2e/tools.spec.ts`, append this test:

```ts
test('set breakdown modal opens from the combining tab', async ({ page }) => {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();

  await page.goto('/tools?tool=sets');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  await page.locator('tbody tr').first().getByRole('button', { name: 'View set pieces' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // set row + at least one piece row
  expect(await dialog.locator('tbody tr').count()).toBeGreaterThanOrEqual(2);
  await expect(dialog.getByText('set', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
```

- [ ] **Step 5: Build + run the new e2e**

Run: `npm run build`
Expected: builds shared, server, client with no errors.

Run: `npm run e2e -- tools.spec.ts`
Expected: PASS (all tools specs, including the new modal test).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/SetBreakdownDialog.tsx client/src/pages/ToolsPage.tsx e2e/tools.spec.ts
git commit -m "feat(client): SetBreakdownDialog + open it from the Combining tab"
```

---

### Task 4: Open the modal from Flip Finder rows

**Files:**
- Modify: `client/src/components/FlipTable.tsx` (`TableContext` ~56-62; `buildColumns` destructure + the `name` column cell ~179-196; `FlipCard` header ~101-118)
- Modify: `client/src/pages/FlipFinderPage.tsx` (imports; `useState`; `setById` memo; `tableContext`; render dialog)
- Test: `e2e/finder.spec.ts` (append a test)

**Interfaces:**
- Consumes: `SetBreakdownDialog` (Task 3), `setDefsById` + `ResolvedSet` (Task 1).
- Produces: `TableContext` gains optional `setIds?: Set<number>` and `onOpenPieces?: (row: FlipRow) => void`.

- [ ] **Step 1: Extend `TableContext`**

In `client/src/components/FlipTable.tsx`, add two optional fields to the `TableContext` interface:

```ts
export interface TableContext {
  nowSec: number;
  isWatched: (id: number) => boolean;
  onToggleWatch: (row: FlipRow) => void;
  /** When set (watchlist view), adds a "Since added" column: id -> fractional change. */
  sinceAdded?: Map<number, number | null>;
  /** Set-item ids that should show a "view pieces" trigger. */
  setIds?: Set<number>;
  /** Open the set-breakdown modal for a set/combo row. */
  onOpenPieces?: (row: FlipRow) => void;
}
```

- [ ] **Step 2: Render the trigger in the `name` column**

In `buildColumns`, change the destructure to include the new fields:

```ts
export function buildColumns({ nowSec, isWatched, onToggleWatch, sinceAdded, setIds, onOpenPieces }: TableContext) {
```

In the `col.accessor('name', …)` cell, add the button after the tax-free badge block and before the closing `</span>` of the outer `<span className="flex items-center gap-2 whitespace-nowrap">`:

```tsx
          {setIds?.has(info.row.original.id) && onOpenPieces && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenPieces(info.row.original);
              }}
              title="View set pieces"
              className="text-parchment/40 hover:text-gold"
            >
              <Icon name="shield" size={12} />
            </button>
          )}
```

- [ ] **Step 3: Render the trigger in `FlipCard`**

In `FlipCard`, in the first header `<span className="flex w-full items-center gap-2">`, add the button after the tax-free badge and before the watch-star `<span onClick=…>`:

```tsx
        {context.setIds?.has(row.id) && context.onOpenPieces && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              context.onOpenPieces!(row);
            }}
            title="View set pieces"
            className="text-parchment/40 hover:text-gold"
          >
            <Icon name="shield" size={13} />
          </button>
        )}
```

- [ ] **Step 4: Wire `FlipFinderPage`**

In `client/src/pages/FlipFinderPage.tsx`:

Change the React import to include `useState`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

Add imports:

```ts
import { setDefsById, type ResolvedSet } from '../lib/tools';
import { SetBreakdownDialog } from '../components/SetBreakdownDialog';
```

Add the set lookup + modal state near the other hooks (after the `rows` memo is fine):

```ts
  const setById = useMemo(
    () => (data ? setDefsById(data.items) : new Map<number, ResolvedSet>()),
    [data],
  );
  const [openSet, setOpenSet] = useState<ResolvedSet | null>(null);
```

Replace the `tableContext` memo with one that passes the new fields:

```ts
  const tableContext: TableContext = useMemo(
    () => ({
      nowSec,
      isWatched,
      onToggleWatch: (row) => toggle(row.id, rowMid(row)),
      setIds: new Set(setById.keys()),
      onOpenPieces: (row) => setOpenSet(setById.get(row.id) ?? null),
    }),
    [nowSec, isWatched, toggle, setById],
  );
```

Render the dialog right after the `<FlipTable … />` element (still inside the returned `<div>`):

```tsx
      <SetBreakdownDialog
        set={openSet}
        items={data.items}
        config={config}
        onClose={() => setOpenSet(null)}
      />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Write the failing e2e**

In `e2e/finder.spec.ts`, append this test (searches for a set that is always in the item list):

```ts
test('set breakdown modal opens from a finder row', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  // the finder search input is an implicitly-labelled text input ("Search")
  await page.getByLabel('Search').fill('Adamant set (lg)');
  const row = page.locator('tbody tr').first();
  await row.getByRole('button', { name: 'View set pieces' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('tbody tr').count()).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
```

- [ ] **Step 7: Build + run the e2e**

Run: `npm run build`
Expected: PASS.

Run: `npm run e2e -- finder.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/FlipTable.tsx client/src/pages/FlipFinderPage.tsx e2e/finder.spec.ts
git commit -m "feat(client): open set-breakdown modal from Flip Finder rows"
```

---

### Task 5: Open the modal from set item detail pages

**Files:**
- Modify: `client/src/pages/ItemDetailPage.tsx` (imports; `useState`; `setDef` memo; header button; render dialog)
- Test: `e2e/detail.spec.ts` (append a test)

**Interfaces:**
- Consumes: `SetBreakdownDialog` (Task 3), `setDefsById` + `ResolvedSet` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add imports + state + lookup**

In `client/src/pages/ItemDetailPage.tsx`:

Add imports:

```ts
import { setDefsById, type ResolvedSet } from '../lib/tools';
import { SetBreakdownDialog } from '../components/SetBreakdownDialog';
```

Add modal state next to the other `useState` calls at the top of `ItemDetailPage`:

```ts
  const [piecesOpen, setPiecesOpen] = useState(false);
```

Add a memo alongside the other `useMemo` blocks (e.g. after `stats`), so it runs before the early returns:

```ts
  const setDef = useMemo<ResolvedSet | null>(
    () => (items.data ? setDefsById(items.data.items).get(id) ?? null : null),
    [items.data, id],
  );
```

- [ ] **Step 2: Add the header button**

In the `<header …>` block, after the Wiki `<a>…</a>` link and before the closing `</header>`, add:

```tsx
        {setDef && (
          <button
            onClick={() => setPiecesOpen(true)}
            title="Break this set down into its pieces"
            className="rounded border border-panel-border px-2 py-1 text-xs text-gold hover:border-gold"
          >
            <Icon name="shield" size={12} className="mr-1" /> View set pieces
          </button>
        )}
```

- [ ] **Step 3: Render the dialog**

Just before the two existing `<UpsellDialog …>` elements near the end of the return, add:

```tsx
      <SetBreakdownDialog
        set={piecesOpen ? setDef : null}
        items={items.data?.items ?? []}
        config={config}
        onClose={() => setPiecesOpen(false)}
      />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e**

In `e2e/detail.spec.ts`, append this test (13012 = "Adamant set (lg)", a GE set):

```ts
test('set detail page opens the pieces breakdown modal', async ({ page }) => {
  await page.goto('/item/13012');
  await page.getByRole('button', { name: 'View set pieces' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('tbody tr').count()).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
```

- [ ] **Step 6: Build + run the e2e**

Run: `npm run build`
Expected: PASS.

Run: `npm run e2e -- detail.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/ItemDetailPage.tsx e2e/detail.spec.ts
git commit -m "feat(client): open set-breakdown modal from set item detail pages"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS across all workspaces.

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Full e2e**

Run: `npm run build`
Expected: PASS.

Run: `npm run e2e`
Expected: PASS. Note: the new `finder`/`tools`/`detail` specs run under the **desktop** project only (the mobile project matches `mobile.spec.ts` alone). The mobile `FlipCard` trigger added in Task 4 is real but not e2e-covered here; verify it in the manual smoke below if desired.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Use the `/run` skill or `npm run dev`, then: open `/tools?tool=sets` (unlock premium with `GEFF-DEV-2026`) → confirm the two new price columns and the shield button → modal; open `/` and search a set → shield → modal; open `/item/13012` → "View set pieces" → modal. Confirm click-to-copy works inside the modal and row-click navigates.

## Self-Review Notes

- **Spec coverage:** Deliverable 1 (Combining buy/sell) → Task 2; reusable modal → Task 3; triggers on both lists + IDP → Tasks 3/4/5; shared lookup refactor + `SetRow` fields → Task 1; no new gating (dialog ungated) → honored (no entitlement touched); tests → unit in Task 1, e2e in Tasks 3/4/5, full pass in Task 6.
- **Type consistency:** `ResolvedSet`, `resolveSetDefs`, `computeSetRow`, `setDefsById`, and the four `SetRow` fields are defined in Task 1 and consumed with identical names/signatures in Tasks 2-5. `SetBreakdownDialog`'s prop shape is fixed in Task 3 and reused verbatim in Tasks 4-5. `TableContext.setIds`/`onOpenPieces` are optional so `WatchlistPage` is unaffected.
- **Out of scope (per spec):** piece→parent-set links, `WatchlistPage` trigger, new entitlements.
