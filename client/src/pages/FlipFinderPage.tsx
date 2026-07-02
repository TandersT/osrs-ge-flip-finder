import { useMemo, useState } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useAppConfig, useItems } from '../lib/api';
import { applyFilters, buildRows, EMPTY_FILTERS, type Filters } from '../lib/rows';
import { useWatchlist } from '../lib/watchlist';
import { FilterBar } from '../components/FilterBar';
import { FlipTable, rowMid, type TableContext } from '../components/FlipTable';

export default function FlipFinderPage() {
  const config = useAppConfig();
  const { data, isPending, isError, error } = useItems(config.clientRefreshSeconds);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'profitPer4h', desc: true }]);
  const { isWatched, toggle } = useWatchlist();

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
    return <div className="p-10 text-center opacity-60">Loading live prices…</div>;
  }
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load prices: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.upstreamStale && (
        <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
          The wiki price API is unreachable — showing the last cached data.
        </div>
      )}
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="text-xs opacity-50">
        {filtered.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} items
      </div>
      <FlipTable rows={filtered} context={tableContext} sorting={sorting} onSortingChange={setSorting} />
    </div>
  );
}
