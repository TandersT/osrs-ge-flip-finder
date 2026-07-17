import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SortingState } from '@tanstack/react-table';
import { pctChange } from '@osrs-flip/shared';
import { useAppConfig, useItems } from '../lib/api';
import { buildRows, EMPTY_FLAGS, matchesFlagFilters, type FlagFilters } from '../lib/rows';
import { useGatedWatchlist } from '../lib/useGatedWatchlist';
import { FlipTable, rowMid, type TableContext } from '../components/FlipTable';
import { FlagSelector } from '../components/FlagSelector';
import { TableSkeleton } from '../components/Skeleton';
import { UpsellDialog } from '../components/UpsellDialog';
import { AlertsSection } from '../components/AlertsSection';
import { Icon } from '../components/Icon';

export default function WatchlistPage() {
  const config = useAppConfig();
  const { data, isPending, isError, error } = useItems(config.clientRefreshSeconds);
  const { entries, isWatched, toggle, upsellOpen, closeUpsell, watchlistMax } = useGatedWatchlist();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'profitPer4h', desc: true }]);
  const [flags, setFlags] = useState<FlagFilters>(EMPTY_FLAGS);

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

  const shown = useMemo(() => rows.filter((r) => matchesFlagFilters(r, flags)), [rows, flags]);

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

  if (isPending) return <TableSkeleton rows={6} />;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 p-14 text-center">
        <Icon name="star" size={40} className="text-parchment/40" />
        <p className="opacity-70">Nothing on your watchlist yet.</p>
        <p className="text-sm opacity-50">
          Star items in the <Link to="/" className="text-gold underline">Flip Finder</Link> to track
          them here — changes are measured from the moment you star.
        </p>
      </div>
      <AlertsSection />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs opacity-50">
        {entries.length.toLocaleString('en-US')} watched item{entries.length === 1 ? '' : 's'} —
        stored in this browser
      </div>
      <FlagSelector flags={flags} onChange={setFlags} />
      <FlipTable rows={shown} context={tableContext} sorting={sorting} onSortingChange={setSorting} />
      <AlertsSection />
      <UpsellDialog open={upsellOpen} onClose={closeUpsell} title="Watchlist full">
        The free tier tracks up to {watchlistMax} items. Premium removes the cap.
      </UpsellDialog>
    </div>
  );
}
