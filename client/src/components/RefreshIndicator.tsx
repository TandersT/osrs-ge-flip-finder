import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface RefreshIndicatorProps {
  /** Epoch ms of the last successful fetch (TanStack's dataUpdatedAt). */
  dataUpdatedAt: number;
  refreshSeconds: number;
  isFetching: boolean;
  onRefresh: () => void;
}

/** "updated Xs ago · next in Ys" countdown with a manual refresh button. */
export function RefreshIndicator({
  dataUpdatedAt,
  refreshSeconds,
  isFetching,
  onRefresh,
}: RefreshIndicatorProps) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const ageSec = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000));
  const remaining = Math.max(0, refreshSeconds - ageSec);

  return (
    <div className="flex items-center gap-2 text-xs opacity-70">
      {isFetching ? (
        <span className="text-gold">refreshing…</span>
      ) : (
        <span>
          updated {ageSec}s ago · next in <span className="tabular-nums">{remaining}s</span>
        </span>
      )}
      <button
        onClick={onRefresh}
        title="Refresh now"
        aria-label="Refresh now"
        disabled={isFetching}
        className={`rounded border border-panel-border px-1.5 py-0.5 hover:border-gold hover:text-gold ${
          isFetching ? 'animate-spin' : ''
        }`}
      >
        <Icon name="refresh" size={12} />
      </button>
    </div>
  );
}
