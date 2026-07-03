import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Timestep } from '@osrs-flip/shared';
import { breakEvenSell, computeFlip, formatGpFull } from '@osrs-flip/shared';
import { useAppConfig, useItems, useTimeseries } from '../lib/api';
import { computeItemStats, currentMid } from '../lib/itemStats';
import { useWatchlist } from '../lib/watchlist';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';
import { PriceVolumeChart } from '../components/PriceVolumeChart';
import { ChartSkeleton, Skeleton } from '../components/Skeleton';

const NATURE_RUNE_ID = 561;
const TIMESTEPS: Timestep[] = ['5m', '1h', '6h', '24h'];

function PctText({ value }: { value: number | null }) {
  if (value === null) return <span className="opacity-40">—</span>;
  const cls = value > 0 ? 'text-osrs-green' : value < 0 ? 'text-osrs-red' : 'opacity-70';
  return (
    <span className={`${cls} tabular-nums`}>
      {value > 0 ? '+' : ''}
      {(value * 100).toFixed(1)}%
    </span>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-panel-border/40 py-1.5 text-sm last:border-b-0">
      <span className="opacity-60">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-panel-border bg-panel p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">{title}</h2>
      {children}
    </section>
  );
}

export default function ItemDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const config = useAppConfig();
  const [timestep, setTimestep] = useState<Timestep>('1h');
  const { isWatched, toggle } = useWatchlist();

  const items = useItems(config.clientRefreshSeconds);
  const chart = useTimeseries(id, timestep);
  const daily = useTimeseries(id, '24h');

  const item = useMemo(
    () => items.data?.items.find((i) => i.id === id) ?? null,
    [items.data, id],
  );
  const natureRune = useMemo(
    () => items.data?.items.find((i) => i.id === NATURE_RUNE_ID) ?? null,
    [items.data],
  );
  const stats = useMemo(
    () => (item && daily.data ? computeItemStats(daily.data.data, item) : null),
    [daily.data, item],
  );

  useEffect(() => {
    document.title = item ? `${item.name} — GE Flip Finder` : 'GE Flip Finder — OSRS';
    return () => {
      document.title = 'GE Flip Finder — OSRS';
    };
  }, [item]);

  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-10 text-center text-osrs-red">Invalid item id.</div>;
  }
  if (items.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded border border-panel-border bg-panel p-4 lg:col-span-2">
            <ChartSkeleton />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (items.isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(items.error as Error).message}
      </div>
    );
  }
  if (!item) {
    return (
      <div className="p-10 text-center opacity-60">
        Item #{id} not found. <Link className="text-gold underline" to="/">Back to the finder</Link>
      </div>
    );
  }

  const flip = computeFlip(
    {
      low: item.low,
      high: item.high,
      isExempt: item.taxExempt,
      buyLimit: item.limit,
      volumePer4h: item.volume1h > 0 ? item.volume1h * 4 : null,
    },
    config,
  );

  const natCost = natureRune?.low !== null && natureRune !== null ? natureRune.low + config.offerOffset : null;
  const alchProfit =
    item.highalch !== null && flip !== null && natCost !== null
      ? item.highalch - flip.buyAt - natCost
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-gold hover:underline">← Flip Finder</Link>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <ItemIcon icon={item.icon} name={item.name} size={36} />
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <button
          onClick={() => toggle(item.id, currentMid(item))}
          title={isWatched(item.id) ? 'Remove from watchlist' : 'Add to watchlist'}
          className={`text-2xl leading-none ${
            isWatched(item.id) ? 'text-gold' : 'text-parchment/30 hover:text-parchment/70'
          }`}
        >
          {isWatched(item.id) ? '★' : '☆'}
        </button>
        {item.members && (
          <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-amber-300" title="Members-only item">
            members
          </span>
        )}
        {item.taxExempt && (
          <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-emerald-300" title="Exempt from GE tax">
            tax exempt
          </span>
        )}
        <span className="text-xs opacity-40">#{item.id}</span>
        <a
          href={`https://oldschool.runescape.wiki/w/${encodeURIComponent(item.name.replaceAll(' ', '_'))}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gold/70 underline hover:text-gold"
          title="Open this item on the OSRS Wiki"
        >
          Wiki ↗
        </a>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Price & volume">
            <div className="mb-3 flex gap-1">
              {TIMESTEPS.map((ts) => (
                <button
                  key={ts}
                  onClick={() => setTimestep(ts)}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    ts === timestep
                      ? 'bg-gold text-ink'
                      : 'bg-panel-light text-parchment/70 hover:text-parchment'
                  }`}
                >
                  {ts}
                </button>
              ))}
            </div>
            {chart.isPending ? (
              <ChartSkeleton />
            ) : chart.isError ? (
              <div className="flex h-72 items-center justify-center text-sm text-osrs-red">
                Failed to load history: {(chart.error as Error).message}
              </div>
            ) : (
              <PriceVolumeChart points={chart.data.data} timestep={timestep} />
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Flip at current prices">
            <StatRow label="Buy at (insta-sell +1)"><GpText amount={flip?.buyAt ?? null} /></StatRow>
            <StatRow label="Sell at (insta-buy −1)"><GpText amount={flip?.sellAt ?? null} /></StatRow>
            <StatRow label="Tax per item">
              {flip ? (
                <span className="tabular-nums opacity-80">{formatGpFull(flip.tax)}</span>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Post-tax margin"><GpText amount={flip?.marginPerItem ?? null} signed /></StatRow>
            <StatRow label="ROI"><PctText value={flip ? flip.roi : null} /></StatRow>
            <StatRow label="Break-even sell">
              {flip ? (
                <span
                  className="tabular-nums opacity-80"
                  title="Lowest sell price that doesn't lose money after tax, given the buy price above"
                >
                  {formatGpFull(breakEvenSell(item.taxExempt, flip.buyAt))}
                </span>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Buy limit / 4h">
              {item.limit !== null ? item.limit.toLocaleString('en-US') : '—'}
            </StatRow>
            <StatRow label="Profit / 4h limit"><GpText amount={flip?.profitPer4h ?? null} signed /></StatRow>
            <div className="pt-3">
              <Link
                to={`/log?item=${item.id}`}
                className="block rounded bg-gold px-3 py-1.5 text-center text-sm font-semibold text-ink hover:brightness-110"
              >
                📒 Log this flip
              </Link>
            </div>
          </Panel>

          <Panel title="Statistics">
            <StatRow label="Today's move"><PctText value={stats?.todayMove ?? null} /></StatRow>
            <StatRow label="7-day change"><PctText value={stats?.change7d ?? null} /></StatRow>
            <StatRow label="30-day change"><PctText value={stats?.change30d ?? null} /></StatRow>
            <StatRow label="90-day change"><PctText value={stats?.change90d ?? null} /></StatRow>
            <StatRow label="Volatility (30d)">
              {stats?.volatility30d != null ? (
                <span className="tabular-nums">{(stats.volatility30d * 100).toFixed(1)}%</span>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Avg daily volume (30d)">
              {stats?.avgDailyVolume30d != null ? (
                <span className="tabular-nums">{Math.round(stats.avgDailyVolume30d).toLocaleString('en-US')}</span>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
          </Panel>

          <Panel title="High alchemy">
            {item.highalch === null || item.highalch === 0 ? (
              <p className="text-sm opacity-50">This item cannot be alched for profit tracking.</p>
            ) : (
              <>
                <StatRow label="High alch value"><GpText amount={item.highalch} /></StatRow>
                <StatRow label="Buy price"><GpText amount={flip?.buyAt ?? null} /></StatRow>
                <StatRow label="Nature rune"><GpText amount={natCost} /></StatRow>
                <StatRow label="Profit per cast"><GpText amount={alchProfit} signed /></StatRow>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
