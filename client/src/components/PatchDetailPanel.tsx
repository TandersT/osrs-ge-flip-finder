import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PatchDetail, PatchItemRow } from '@osrs-flip/shared';
import { Pct } from '../pages/PatchesPage';
import { ItemIcon } from './ItemIcon';
import { TableSkeleton } from './Skeleton';

async function fetchDetail(pageid: number): Promise<PatchDetail> {
  const res = await fetch(`/api/patches/${pageid}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<PatchDetail>;
}

function MoveTable({
  title,
  rows,
  hasVolume,
  windowDays,
}: {
  title: string;
  rows: PatchItemRow[];
  hasVolume: boolean;
  windowDays: 1 | 7;
}) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">{title}</h3>
      <div className="overflow-auto rounded border border-panel-border bg-panel">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-panel-light">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold">Item</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">7d</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">1d</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">30d</th>
              <th
                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold"
                title="Change over the 7 days BEFORE the patch — anticipation buying"
              >
                Run-up
              </th>
              {hasVolume && (
                <th
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold"
                  title="Avg daily volume 7d after vs 28d before"
                >
                  Vol Δ
                </th>
              )}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-panel-border/50 hover:bg-panel-light">
                <td className="whitespace-nowrap px-3 py-1.5">
                  <Link to={`/item/${r.id}`} className="flex items-center gap-2 hover:text-gold">
                    <ItemIcon icon={r.icon} name={r.name} />
                    {r.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.change7} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.change1} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.change30} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.runup7} /></td>
                {hasVolume && (
                  <td className="whitespace-nowrap px-3 py-1.5 text-right"><Pct value={r.volumeDelta7} digits={0} /></td>
                )}
                <td className="whitespace-nowrap px-3 py-1.5">
                  {r.zScore !== null && Math.abs(r.zScore) >= 2 && (
                    <span
                      className="mr-1 rounded bg-purple-900/60 px-1 text-[10px] uppercase tracking-wide text-purple-300"
                      title={`Moved ${Math.abs(r.zScore).toFixed(1)}σ vs its own ${windowDays}d volatility`}
                    >
                      unusual
                    </span>
                  )}
                  {r.mentioned && (
                    <span
                      className="rounded bg-sky-900/60 px-1 text-[10px] uppercase tracking-wide text-sky-300"
                      title="This item is linked in the update's patch notes"
                    >
                      mentioned
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-6 text-center text-sm opacity-60">No significant movers.</div>
        )}
      </div>
    </div>
  );
}

export function PatchDetailPanel({ pageid }: { pageid: number }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['patch', pageid],
    queryFn: () => fetchDetail(pageid),
    staleTime: 15 * 60_000,
  });

  if (isPending) return <TableSkeleton rows={6} />;
  if (isError) {
    return (
      <div className="p-6 text-center text-osrs-red">
        Failed to load patch: {(error as Error).message}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label={`Patch detail: ${data.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gold">{data.title}</h2>
        <span className="text-xs tabular-nums opacity-70">{data.date}</span>
        <a
          href={data.wikiUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gold underline"
        >
          Wiki
        </a>
        {data.tags.map((t) => (
          <span
            key={t}
            className="rounded bg-panel-light px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-parchment/70"
          >
            {t}
          </span>
        ))}
      </div>

      <p className="text-xs opacity-70">
        {data.universeSize.toLocaleString('en-US')} liquid items screened
        {data.windowDays === 1 && ' · ranked on the 1-day move (patch is under a week old)'}
        {data.dataQuality === 'priceOnly' &&
          ' · price archive only — the exchange has no volume data before Sept 2018'}
      </p>

      <div className="flex flex-col gap-4 lg:flex-row">
        <MoveTable
          title="Winners"
          rows={data.winners}
          hasVolume={data.dataQuality === 'full'}
          windowDays={data.windowDays}
        />
        <MoveTable
          title="Losers"
          rows={data.losers}
          hasVolume={data.dataQuality === 'full'}
          windowDays={data.windowDays}
        />
      </div>
    </section>
  );
}
