import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SortingState } from '@tanstack/react-table';
import { pctChange } from '@osrs-flip/shared';
import { useAppConfig, useItems } from '../lib/api';
import { buildRows } from '../lib/rows';
import { useWatchlist } from '../lib/watchlist';
import { FlipTable, rowMid, type TableContext } from '../components/FlipTable';

export default function WatchlistPage() {
  const config = useAppConfig();
  const { data, isPending, isError, error } = useItems(config.clientRefreshSeconds);
  const { entries, isWatched, toggle } = useWatchlist();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'profitPer4h', desc: true }]);

  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const ids = new Set(entries.map((e) => e.id));
    return buildRows(
      data.items.filter((i) => ids.has(i.id)),
      config,
      nowSec,
    );
  }, [data, entries, config, nowSec]);

  const sinceAdded = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const row of rows) {
      const entry = entries.find((e) => e.id === row.id);
      const current = rowMid(row);
      map.set(
        row.id,
        entry?.priceAtAdd != null && current !== null ? pctChange(entry.priceAtAdd, current) : null,
      );
    }
    return map;
  }, [rows, entries]);

  const tableContext: TableContext = useMemo(
    () => ({ nowSec, isWatched, onToggleWatch: (row) => toggle(row.id, rowMid(row)), sinceAdded }),
    [nowSec, isWatched, toggle, sinceAdded],
  );

  if (isPending) return <div className="p-10 text-center opacity-60">Loading watchlist…</div>;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-14 text-center">
        <span className="text-4xl">☆</span>
        <p className="opacity-70">Nothing on your watchlist yet.</p>
        <p className="text-sm opacity-50">
          Star items in the <Link to="/" className="text-gold underline">Flip Finder</Link> to track
          them here — changes are measured from the moment you star.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs opacity-50">
        {entries.length.toLocaleString('en-US')} watched item{entries.length === 1 ? '' : 's'} —
        stored in this browser
      </div>
      <FlipTable rows={rows} context={tableContext} sorting={sorting} onSortingChange={setSorting} />
    </div>
  );
}
