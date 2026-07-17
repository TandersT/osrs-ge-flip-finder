export {
  buildRows,
  type FlipRow,
  type PrevPrices,
} from '@osrs-flip/shared';
import type { FlipRow } from '@osrs-flip/shared';

export type Membership = 'all' | 'members' | 'f2p';

/** Row flags a user can filter on. Order here is the display order of the chips. */
export const FLAG_KEYS = [
  'exempt',
  'fat',
  'whale',
  'prime',
  'stale',
  'thin',
  'unstable',
  'hot',
  'rising',
  'falling',
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];
/** Tri-state per flag: ignore it, keep only flagged rows, or hide flagged rows. */
export type FlagMode = 'any' | 'only' | 'hide';
export type FlagFilters = Record<FlagKey, FlagMode>;

export const EMPTY_FLAGS: FlagFilters = {
  exempt: 'any',
  fat: 'any',
  whale: 'any',
  prime: 'any',
  stale: 'any',
  thin: 'any',
  unstable: 'any',
  hot: 'any',
  rising: 'any',
  falling: 'any',
};

export const FLAG_GETTERS: Record<FlagKey, (row: FlipRow) => boolean> = {
  exempt: (r) => r.taxExempt,
  fat: (r) => r.isFat,
  whale: (r) => r.isWhale,
  prime: (r) => r.isPrime,
  stale: (r) => r.isStale,
  thin: (r) => r.isThin,
  unstable: (r) => r.isUnstable,
  hot: (r) => r.isHot,
  rising: (r) => r.isRising,
  falling: (r) => r.isFalling,
};

/**
 * Tri-state flag test for a single row, reused by the item lists and by the
 * other tabs (deals/long-term/tools) that resolve a row's flags by item id.
 * A missing row (no live snapshot for this id) counts every flag as absent:
 * it survives "hide", is dropped by "only", and is untouched by "any".
 */
export function matchesFlagFilters(row: FlipRow | undefined, flags: FlagFilters): boolean {
  for (const key of FLAG_KEYS) {
    const mode = flags[key];
    if (mode === 'any') continue;
    const flagged = row !== undefined && FLAG_GETTERS[key](row);
    if (mode === 'only' && !flagged) return false;
    if (mode === 'hide' && flagged) return false;
  }
  return true;
}

export interface Filters {
  search: string;
  minMargin: number | null;
  /** Percent, e.g. 2 == 2%. */
  minRoi: number | null;
  minVolume1h: number | null;
  minBuyPrice: number | null;
  maxBuyPrice: number | null;
  membership: Membership;
  flags: FlagFilters;
}

/** Default Min vol/1h floor — hides all-but-dead items unless the user opts out. */
export const DEFAULT_MIN_VOLUME_1H = 5;

export const EMPTY_FILTERS: Filters = {
  search: '',
  minMargin: null,
  minRoi: null,
  minVolume1h: DEFAULT_MIN_VOLUME_1H,
  minBuyPrice: null,
  maxBuyPrice: null,
  membership: 'all',
  flags: EMPTY_FLAGS,
};

export interface FilterPreset {
  name: string;
  filters: Filters;
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    name: 'Low risk, high volume',
    filters: {
      ...EMPTY_FILTERS,
      minVolume1h: 1000,
      minMargin: 1,
      flags: { ...EMPTY_FLAGS, stale: 'hide', thin: 'hide', unstable: 'hide' },
    },
  },
  {
    name: 'Big ticket',
    filters: { ...EMPTY_FILTERS, minBuyPrice: 1_000_000, minMargin: 10_000 },
  },
  {
    name: 'Tax-free only',
    filters: { ...EMPTY_FILTERS, flags: { ...EMPTY_FLAGS, exempt: 'only' } },
  },
  {
    name: 'F2P',
    filters: { ...EMPTY_FILTERS, membership: 'f2p', minVolume1h: 100 },
  },
];

/** Case-insensitive substring, falling back to in-order subsequence ("fuzzy"). */
export function nameMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const n = name.toLowerCase();
  if (n.includes(q)) return true;
  let i = 0;
  for (const ch of n) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export function applyFilters(rows: FlipRow[], f: Filters): FlipRow[] {
  return rows.filter((row) => {
    if (!nameMatches(row.name, f.search)) return false;
    if (f.membership === 'members' && !row.members) return false;
    if (f.membership === 'f2p' && row.members) return false;
    if (!matchesFlagFilters(row, f.flags)) return false;
    if (f.minVolume1h !== null && row.volume1h < f.minVolume1h) return false;
    if (f.minMargin !== null || f.minRoi !== null || f.minBuyPrice !== null || f.maxBuyPrice !== null) {
      if (row.flip === null) return false;
      if (f.minMargin !== null && row.flip.marginPerItem < f.minMargin) return false;
      if (f.minRoi !== null && row.flip.roi * 100 < f.minRoi) return false;
      if (f.minBuyPrice !== null && row.flip.buyAt < f.minBuyPrice) return false;
      if (f.maxBuyPrice !== null && row.flip.buyAt > f.maxBuyPrice) return false;
    }
    return true;
  });
}
