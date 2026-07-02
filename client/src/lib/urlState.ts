import type { SortingState } from '@tanstack/react-table';
import { EMPTY_FILTERS, type Filters, type Membership } from './rows';

/** Default sort when the URL has none. */
export const DEFAULT_SORTING: SortingState = [{ id: 'profitPer4h', desc: true }];

const num = (v: string | null): number | null => {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
    taxExemptOnly: p.get('exempt') === '1',
    hideStale: p.get('nostale') === '1',
    hideRisky: p.get('norisk') === '1',
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
  if (f.taxExemptOnly) p.set('exempt', '1');
  if (f.hideStale) p.set('nostale', '1');
  if (f.hideRisky) p.set('norisk', '1');
  const sort = sorting[0];
  const def = DEFAULT_SORTING[0]!;
  if (sort && (sort.id !== def.id || sort.desc !== def.desc)) {
    p.set('sort', `${sort.id}.${sort.desc ? 'desc' : 'asc'}`);
  }
  return p;
}
