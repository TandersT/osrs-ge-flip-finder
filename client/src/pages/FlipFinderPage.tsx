import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SortingState } from '@tanstack/react-table';
import { useAppConfig, useItems } from '../lib/api';
import { applyFilters, buildRows, type Filters } from '../lib/rows';
import { filtersFromParams, paramsFromState, sortingFromParams } from '../lib/urlState';
import { useWatchlist } from '../lib/watchlist';
import { FilterBar } from '../components/FilterBar';
import { FlipTable, rowMid, type TableContext } from '../components/FlipTable';
import { NewUserBanner } from '../components/NewUserBanner';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { TableSkeleton } from '../components/Skeleton';

export default function FlipFinderPage() {
  const config = useAppConfig();
  const { data, isPending, isError, error, refetch, isFetching, dataUpdatedAt } = useItems(
    config.clientRefreshSeconds,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const { isWatched, toggle } = useWatchlist();

  // URL is the single source of truth for filters + sort, so views are shareable
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const sorting = useMemo(() => sortingFromParams(searchParams), [searchParams]);

  const setFilters = useCallback(
    (next: Filters) => setSearchParams(paramsFromState(next, sorting), { replace: true }),
    [setSearchParams, sorting],
  );
  const setSorting = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSearchParams(paramsFromState(filters, next), { replace: true });
    },
    [setSearchParams, filters, sorting],
  );

  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), [data]);
  const rows = useMemo(
    () => (data ? buildRows(data.items, config, nowSec) : []),
    [data, config, nowSec],
  );
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const tableContext: TableContext = useMemo(
    () => ({ nowSec, isWatched, onToggleWatch: (row) => toggle(row.id, rowMid(row)) }),
    [nowSec, isWatched, toggle],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <TableSkeleton rows={14} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-14 text-center">
        <span className="text-3xl">⚠</span>
        <p className="text-osrs-red">Failed to load prices: {(error as Error).message}</p>
        <button
          onClick={() => refetch()}
          className="rounded border border-panel-border px-3 py-1.5 text-sm hover:border-gold hover:text-gold"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <NewUserBanner />
      {data.upstreamStale && (
        <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
          The wiki price API is unreachable — showing the last cached data.
        </div>
      )}
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs opacity-50">
          {filtered.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} items
          <span className="mx-2 opacity-50">·</span>
          <Link to="/faq" className="underline hover:text-gold">
            what do these numbers mean?
          </Link>
        </div>
        <RefreshIndicator
          dataUpdatedAt={dataUpdatedAt}
          refreshSeconds={config.clientRefreshSeconds}
          isFetching={isFetching}
          onRefresh={() => refetch()}
        />
      </div>
      <FlipTable rows={filtered} context={tableContext} sorting={sorting} onSortingChange={setSorting} />
    </div>
  );
}
