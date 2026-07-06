import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { PatchesResponse, PatchSummary } from '@osrs-flip/shared';
import { Icon } from '../components/Icon';
import { PatchDetailPanel } from '../components/PatchDetailPanel';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';
import { UpcomingFeatures } from '../components/UpcomingFeatures';
import { useTier } from '../lib/tier';

/** Coloured percent, shared by the patch tables and upcoming cards. */
export function Pct({ value, digits = 1 }: { value: number | null; digits?: number }) {
  if (value === null) return <span className="opacity-40">—</span>;
  const cls = value > 0 ? 'text-osrs-green' : value < 0 ? 'text-osrs-red' : 'opacity-70';
  return (
    <span className={`${cls} tabular-nums`}>
      {value > 0 ? '+' : ''}
      {(value * 100).toFixed(digits)}%
    </span>
  );
}

function LockedPatches() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="rounded border border-panel-border bg-panel p-6 text-center">
        <Icon name="lock" size={28} className="text-gold" />
        <h1 className="mt-2 text-xl font-bold text-gold">Patch Impact is a Premium feature</h1>
        <p className="mt-2 text-sm opacity-80">
          Every OSRS update since 2015, ranked by how hard it actually moved the market — the
          biggest winners and losers of each patch, anticipation run-ups, and an items-to-watch
          list for announced content backed by measured history instead of hype.
        </p>
      </div>
      <UnlockStrip>
        Patch winners &amp; losers back to 2015, plus the upcoming-content watchlist.
      </UnlockStrip>
    </div>
  );
}

async function fetchPatches(): Promise<PatchesResponse> {
  const res = await fetch('/api/patches');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<PatchesResponse>;
}

function ImpactBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs opacity-40">too recent</span>;
  const pct = Math.round(value * 100);
  return (
    <span
      className="flex items-center gap-2"
      title="Share of screened items whose move after this update was unusual for that item (≥2σ vs its own history)"
    >
      <span className="h-1.5 w-24 overflow-hidden rounded bg-panel-light">
        <span
          className="block h-full bg-gold"
          style={{ width: `${Math.min(100, value * 300)}%` }}
        />
      </span>
      <span className="text-xs tabular-nums opacity-70">{pct}%</span>
    </span>
  );
}

type SortMode = 'date' | 'impact';

function PatchesContent() {
  const [params, setParams] = useSearchParams();
  const sort: SortMode = params.get('sort') === 'impact' ? 'impact' : 'date';
  const selectedRaw = Number(params.get('patch'));
  const selected = Number.isInteger(selectedRaw) && selectedRaw > 0 ? selectedRaw : null;

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['patches'],
    queryFn: fetchPatches,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 2_000 : 15 * 60_000),
  });

  const patches = useMemo(() => {
    if (!data) return [];
    if (sort === 'date') return data.patches;
    return [...data.patches].sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
  }, [data, sort]);

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  if (isPending) return <TableSkeleton rows={12} />;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  const sortButton = (value: SortMode, label: string) => (
    <button
      onClick={() => setParam('sort', value === 'date' ? null : value)}
      className={`rounded px-3 py-1 text-xs font-medium ${
        sort === value ? 'bg-gold text-ink' : 'bg-panel-light text-parchment/70 hover:text-parchment'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
        <Icon name="warning" className="mr-1" /> Historical evidence, not financial advice —
        patch reactions vary wildly, and past updates don't bind future ones.
      </div>

      <UpcomingFeatures />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gold">Past patches</h2>

        {data.warnings.map((w) => (
          <div
            key={w}
            className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-xs text-amber-300"
          >
            <Icon name="warning" className="mr-1" size={12} /> {w}
          </div>
        ))}

        {data.status === 'building' && (
          <div className="rounded border border-panel-border bg-panel px-3 py-2 text-sm">
            <div className="mb-1 flex justify-between text-xs opacity-70">
              <span>Analysing every update since 2015 against the price archive…</span>
              <span>{Math.round(data.progress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-panel-light">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${data.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {sortButton('date', 'Newest first')}
          {sortButton('impact', 'Biggest impact')}
          <span className="text-xs opacity-60">{patches.length} game updates analysed</span>
        </div>

        <div
          className="overflow-auto rounded border border-panel-border bg-panel"
          style={{ maxHeight: 'calc(100vh - 340px)', minHeight: 160 }}
        >
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-panel-light shadow">
              <tr>
                {['Date', 'Update', 'Market impact', 'Top winner', 'Top loser'].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patches.map((p: PatchSummary) => (
                <tr
                  key={p.pageid}
                  onClick={() => setParam('patch', selected === p.pageid ? null : String(p.pageid))}
                  aria-selected={selected === p.pageid}
                  className={`cursor-pointer border-t border-panel-border/50 hover:bg-panel-light ${
                    selected === p.pageid ? 'bg-panel-light' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums opacity-80">{p.date}</td>
                  <td className="px-3 py-1.5">{p.title}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <ImpactBar value={p.impact} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {p.topWinner ? (
                      <span>
                        {p.topWinner.name} <Pct value={p.topWinner.change} />
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {p.topLoser ? (
                      <span>
                        {p.topLoser.name} <Pct value={p.topLoser.change} />
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {patches.length === 0 && data.status === 'ready' && (
            <div className="p-10 text-center text-sm opacity-60">No analysed updates yet.</div>
          )}
        </div>
      </section>

      {selected !== null && <PatchDetailPanel pageid={selected} />}
    </div>
  );
}

export default function PatchesPage() {
  const { entitlements } = useTier();
  if (!entitlements.patchAnalysis) return <LockedPatches />;
  return <PatchesContent />;
}
