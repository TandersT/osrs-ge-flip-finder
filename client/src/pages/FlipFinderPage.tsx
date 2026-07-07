import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SortingState } from '@tanstack/react-table';
import { useAppConfig, useItems } from '../lib/api';
import { applyFilters, buildRows, type Filters, type PrevPrices } from '../lib/rows';
import { setDefsById, type ResolvedSet } from '../lib/tools';
import { filtersFromParams, paramsFromState, sortingFromParams } from '../lib/urlState';
import { useGatedWatchlist } from '../lib/useGatedWatchlist';
import { FilterBar } from '../components/FilterBar';
import { Icon } from '../components/Icon';
import { FlipTable, rowMid, type TableContext } from '../components/FlipTable';
import { NewUserBanner } from '../components/NewUserBanner';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { SetBreakdownDialog } from '../components/SetBreakdownDialog';
import { TableSkeleton } from '../components/Skeleton';
import { UpsellDialog } from '../components/UpsellDialog';

export default function FlipFinderPage() {
  const config = useAppConfig();
  const { data, isPending, isError, error, refetch, isFetching, dataUpdatedAt } = useItems(
    config.clientRefreshSeconds,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const { isWatched, toggle, upsellOpen, closeUpsell, watchlistMax } = useGatedWatchlist();

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

  // Prices from the previous refresh, so changed cells can flash
  const prevPricesRef = useRef<PrevPrices | undefined>(undefined);
  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), [data]);
  const rows = useMemo(
    () => (data ? buildRows(data.items, config, nowSec, prevPricesRef.current) : []),
    [data, config, nowSec],
  );
  useEffect(() => {
    if (!data) return;
    prevPricesRef.current = new Map(
      data.items.map((i) => [i.id, { low: i.low, high: i.high }]),
    );
  }, [data]);
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const setById = useMemo(
    () => (data ? setDefsById(data.items) : new Map<number, ResolvedSet>()),
    [data],
  );
  const [openSet, setOpenSet] = useState<ResolvedSet | null>(null);
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

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <TableSkeleton rows={14} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-14 text-center">
        <Icon name="warning" size={32} className="text-parchment/40" />
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
    <div className="flex flex-col gap-4">
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
      <SetBreakdownDialog
        set={openSet}
        items={data.items}
        config={config}
        onClose={() => setOpenSet(null)}
      />
      <UpsellDialog open={upsellOpen} onClose={closeUpsell} title="Watchlist full">
        The free tier tracks up to {watchlistMax} items. Premium removes the cap — star as
        many as you like.
      </UpsellDialog>
    </div>
  );
}
