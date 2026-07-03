import { useCallback, useState } from 'react';
import { atLimit } from '@osrs-flip/shared';
import { useWatchlist } from './watchlist';
import { useTier } from './tier';

/**
 * Watchlist with the free-tier cap applied on ADD (removal is always allowed).
 * Hitting the cap opens the upsell dialog instead of starring.
 */
export function useGatedWatchlist() {
  const { entries, isWatched, toggle } = useWatchlist();
  const { entitlements } = useTier();
  const [upsellOpen, setUpsellOpen] = useState(false);

  const gatedToggle = useCallback(
    (id: number, currentPrice: number | null) => {
      if (!isWatched(id) && atLimit(entries.length, entitlements.watchlistMax)) {
        setUpsellOpen(true);
        return;
      }
      toggle(id, currentPrice);
    },
    [isWatched, toggle, entries.length, entitlements.watchlistMax],
  );

  return {
    entries,
    isWatched,
    toggle: gatedToggle,
    watchlistMax: entitlements.watchlistMax,
    upsellOpen,
    closeUpsell: useCallback(() => setUpsellOpen(false), []),
  };
}
