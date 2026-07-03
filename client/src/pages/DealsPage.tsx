import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Deal, DealsResponse } from '@osrs-flip/shared';
import { formatGpCompact } from '@osrs-flip/shared';
import { useCharacter } from '../lib/character';
import { useTier } from '../lib/tier';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';
import { SliderInput } from '../components/SliderInput';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';

async function fetchDeals(): Promise<DealsResponse> {
  const res = await fetch('/api/deals');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<DealsResponse>;
}

function scoreColour(score: number): string {
  if (score >= 70) return 'text-osrs-green';
  if (score >= 40) return 'text-gold';
  return 'text-parchment/60';
}

function meetsRequirements(deal: Deal, levels: Record<string, number> | undefined): boolean {
  if (!levels || !deal.requirements) return true;
  return deal.requirements.every((r) => (levels[r.skill] ?? 1) >= r.level);
}

export default function DealsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['deals'],
    queryFn: fetchDeals,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { character } = useCharacter();
  const { entitlements } = useTier();
  const navigate = useNavigate();
  const [maxCapital, setMaxCapital] = useState<number | null>(null);
  const [geOnly, setGeOnly] = useState(true);

  const deals = useMemo(() => {
    if (!data) return [];
    return data.deals.filter((d) => {
      if (maxCapital !== null && d.capital > maxCapital) return false;
      if (geOnly && d.kind === 'method' && d.atGE === false) return false;
      if (!meetsRequirements(d, character?.levels)) return false;
      return true;
    });
  }, [data, maxCapital, geOnly, character]);

  const visible = entitlements.dealRows === null ? deals.slice(0, 100) : deals.slice(0, entitlements.dealRows);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gold">Best deals right now</h1>
        <p className="mt-1 max-w-3xl text-sm opacity-70">
          Every flip and bankstand method on one opinionated 1–100 scale — our secret sauce
          weighs the expected gp/hour against market depth, your attention, capital at risk
          and how trustworthy the numbers look right now.{' '}
          <Link to="/faq#deal-score" className="text-gold underline">
            What the score means.
          </Link>
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <SliderInput
          label="Max capital"
          title="Hide deals needing more gp in motion per hour than this"
          value={maxCapital}
          onChange={setMaxCapital}
          min={10_000}
          max={1_000_000_000}
          nullAt="max"
          offLabel="no cap"
          format={(v) => `≤ ${formatGpCompact(v)}`}
        />
        <label
          className="flex cursor-pointer items-center gap-1.5 pb-1 text-xs"
          title="Only include methods doable standing at the Grand Exchange"
        >
          <input
            type="checkbox"
            checked={geOnly}
            onChange={(e) => setGeOnly(e.target.checked)}
            className="accent-gold"
          />
          <span>GE-only methods</span>
        </label>
        {character && (
          <span className="pb-1 text-xs opacity-50">
            methods filtered to {character.name}&apos;s levels
          </span>
        )}
      </div>

      {isPending ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <div className="p-10 text-center text-osrs-red">
          Failed to load: {(error as Error).message}
        </div>
      ) : (
        <>
          <section className="overflow-auto rounded border border-panel-border bg-panel">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-panel-light">
                <tr>
                  {(
                    [
                      ['#', false],
                      ['Deal', false],
                      ['Score', true],
                      ['est. gp/hour', true],
                      ['Capital in motion', true],
                      ['Vol/1h', true],
                    ] as const
                  ).map(([h, right]) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold ${right ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((deal, i) => (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(deal.link)}
                    className="cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
                  >
                    <td className="px-3 py-2 tabular-nums opacity-50">{i + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={deal.icon} name={deal.name} size={22} />
                        <span>
                          <span className="font-medium">{deal.name}</span>
                          <span
                            className={`ml-2 rounded px-1 text-[10px] uppercase tracking-wide ${
                              deal.kind === 'flip'
                                ? 'bg-sky-900/60 text-sky-300'
                                : 'bg-purple-900/60 text-purple-300'
                            }`}
                          >
                            {deal.kind}
                          </span>
                          <span className="block text-xs opacity-50">
                            {deal.detail}
                            {deal.hints.length > 0 && (
                              <span className="text-amber-300/70"> · held back: {deal.hints.join(', ')}</span>
                            )}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-lg font-bold tabular-nums ${scoreColour(deal.score)}`}>
                        {deal.score}
                      </span>
                      <span className="ml-1 block h-1 w-20 overflow-hidden rounded bg-panel-light">
                        <span
                          className="block h-full rounded bg-gold"
                          style={{ width: `${deal.score}%` }}
                        />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right"><GpText amount={Math.round(deal.gpPerHour)} signed /></td>
                    <td className="px-3 py-2 text-right"><GpText amount={Math.round(deal.capital)} /></td>
                    <td className="px-3 py-2 text-right tabular-nums opacity-80">
                      {deal.volume1h.toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="p-10 text-center text-sm opacity-60">
                Nothing scores above zero right now — loosen the capital cap?
              </div>
            )}
            <p className="border-t border-panel-border/50 px-3 py-2 text-xs opacity-50">
              Opinionated estimates, not guarantees. Method rates are wiki-guide estimates;
              flips assume competitive offers fill.
            </p>
          </section>
          {entitlements.dealRows !== null && deals.length > visible.length && (
            <UnlockStrip>
              {(deals.length - visible.length).toLocaleString('en-US')} more scored deals with
              Premium — the full cross-tool ranking.
            </UnlockStrip>
          )}
        </>
      )}
    </div>
  );
}
