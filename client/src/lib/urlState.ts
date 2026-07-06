import type { SortingState } from '@tanstack/react-table';
import {
  EMPTY_FILTERS,
  EMPTY_FLAGS,
  FLAG_KEYS,
  type FlagFilters,
  type Filters,
  type Membership,
} from './rows';

/** Default sort when the URL has none. */
export const DEFAULT_SORTING: SortingState = [{ id: 'profitPer4h', desc: true }];

const num = (v: string | null): number | null => {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Each flag is its own param (`stale=hide`, `exempt=only`); `any` is omitted. */
function flagsFromParams(p: URLSearchParams): FlagFilters {
  const flags = { ...EMPTY_FLAGS };
  for (const key of FLAG_KEYS) {
    const v = p.get(key);
    if (v === 'only' || v === 'hide') flags[key] = v;
  }
  // Legacy params from bookmarks / old links (pre tri-state).
  if (p.get('exempt') === '1') flags.exempt = 'only';
  if (p.get('nostale') === '1') flags.stale = 'hide';
  if (p.get('norisk') === '1') {
    flags.thin = 'hide';
    flags.unstable = 'hide';
  }
  return flags;
}

/** Filters/sorting live in the URL so any view is shareable. Defaults are omitted. */
export function filtersFromParams(p: URLSearchParams): Filters {
  const world = p.get('world');
  return {
    search: p.get('q') ?? '',
    minMargin: num(p.get('mm')),
    minRoi: num(p.get('roi')),
    minVolume1h: num(p.get('mv')),
    minBuyPrice: num(p.get('bmin')),
    maxBuyPrice: num(p.get('bmax')),
    membership: world === 'members' || world === 'f2p' ? (world as Membership) : 'all',
    flags: flagsFromParams(p),
  };
}

export function sortingFromParams(p: URLSearchParams): SortingState {
  const raw = p.get('sort');
  if (!raw) return DEFAULT_SORTING;
  const [id, dir] = raw.split('.');
  if (!id) return DEFAULT_SORTING;
  return [{ id, desc: dir !== 'asc' }];
}

export function paramsFromState(f: Filters, sorting: SortingState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search !== EMPTY_FILTERS.search) p.set('q', f.search);
  if (f.minMargin !== null) p.set('mm', String(f.minMargin));
  if (f.minRoi !== null) p.set('roi', String(f.minRoi));
  if (f.minVolume1h !== null) p.set('mv', String(f.minVolume1h));
  if (f.minBuyPrice !== null) p.set('bmin', String(f.minBuyPrice));
  if (f.maxBuyPrice !== null) p.set('bmax', String(f.maxBuyPrice));
  if (f.membership !== 'all') p.set('world', f.membership);
  for (const key of FLAG_KEYS) {
    if (f.flags[key] !== 'any') p.set(key, f.flags[key]);
  }
  const sort = sorting[0];
  const def = DEFAULT_SORTING[0]!;
  if (sort && (sort.id !== def.id || sort.desc !== def.desc)) {
    p.set('sort', `${sort.id}.${sort.desc ? 'desc' : 'asc'}`);
  }
  return p;
}
