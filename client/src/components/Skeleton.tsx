/** Pulsing placeholder bar. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse motion-reduce:animate-none rounded bg-panel-light ${className}`} />;
}

/** Table-shaped loading state for the finder/watchlist/long-term views. */
export function TableSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-panel-border bg-panel p-3">
      <Skeleton className="h-8 w-full opacity-70" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 shrink-0" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Chart-shaped loading state for the item detail page. */
export function ChartSkeleton() {
  return (
    <div className="flex h-[390px] flex-col justify-end gap-2 p-2">
      <div className="flex flex-1 items-end gap-1.5">
        {Array.from({ length: 24 }, (_, i) => (
          // deterministic pseudo-random heights so the pulse looks chart-like
          <div
            key={i}
            className="w-full animate-pulse motion-reduce:animate-none rounded bg-panel-light"
            style={{ height: `${30 + ((i * 37) % 60)}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
