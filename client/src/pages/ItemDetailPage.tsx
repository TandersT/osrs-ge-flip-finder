import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Timestep } from '@osrs-flip/shared';
import { breakEvenSell, computeFlip, formatGpFull } from '@osrs-flip/shared';
import { useAppConfig, useItems, useTimeseries } from '../lib/api';
import { computeItemStats, currentMid } from '../lib/itemStats';
import { useGatedWatchlist } from '../lib/useGatedWatchlist';
import { useTier } from '../lib/tier';
import { CopyValue } from '../components/CopyValue';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';
import { PriceVolumeChart } from '../components/PriceVolumeChart';
import { ChartSkeleton, Skeleton } from '../components/Skeleton';
import { AlertForm } from '../components/AlertForm';
import { ItemAnalytics } from '../components/ItemAnalytics';
import { UpsellDialog } from '../components/UpsellDialog';
import { Icon } from '../components/Icon';

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
    <div className="flex items-baseline justify-between gap-4 border-b border-panel-border/50 py-1.5 text-sm last:border-b-0">
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
  const [range, setRange] = useState<'1m' | '3m' | 'all'>('3m');
  const { isWatched, toggle, upsellOpen, closeUpsell, watchlistMax } = useGatedWatchlist();
  const { entitlements } = useTier();
  const [historyUpsell, setHistoryUpsell] = useState(false);

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

  // The 24h series is ~a year; the range chips window it client-side.
  // Free tier sees at most `historyDays` of it (premium: the full year).
  const chartPoints = useMemo(() => {
    const pts = chart.data?.data ?? [];
    if (timestep !== '24h' || pts.length === 0) return pts;
    const rangeDays = range === '1m' ? 30 : range === '3m' ? 90 : Infinity;
    const days = Math.min(rangeDays, entitlements.historyDays ?? Infinity);
    if (!Number.isFinite(days)) return pts;
    const last = pts[pts.length - 1]!.timestamp;
    return pts.filter((p) => p.timestamp >= last - days * 86_400);
  }, [chart.data, timestep, range, entitlements.historyDays]);

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
        <Link to="/" className="text-sm text-gold hover:underline">
          <Icon name="arrow-left" className="mr-1" /> Flip Finder
        </Link>
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
          <Icon name={isWatched(item.id) ? 'star-fill' : 'star'} />
        </button>
        {item.members && (
          <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300" title="Members-only item">
            members
          </span>
        )}
        {item.taxExempt && (
          <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300" title="Exempt from the 2% GE tax">
            tax-free
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
          Wiki <Icon name="external" size={11} />
        </a>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Price & volume">
            <div className="mb-3 flex flex-wrap items-center gap-1">
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
              {timestep === '24h' && (
                <span className="ml-2 flex items-center gap-1 border-l border-panel-border pl-2">
                  {(['1m', '3m', 'all'] as const).map((r) => {
                    const locked = r === 'all' && entitlements.historyDays !== null;
                    return (
                      <button
                        key={r}
                        onClick={() => (locked ? setHistoryUpsell(true) : setRange(r))}
                        title={locked ? 'Full-year history is a Premium feature' : undefined}
                        className={`rounded px-2 py-1 text-xs ${
                          r === range && !locked
                            ? 'bg-panel-light text-gold'
                            : 'text-parchment/50 hover:text-parchment'
                        }`}
                      >
                        {r === 'all' ? (
                          locked ? (
                            <>
                              1y <Icon name="lock" size={10} />
                            </>
                          ) : (
                            '1y'
                          )
                        ) : (
                          r
                        )}
                      </button>
                    );
                  })}
                </span>
              )}
            </div>
            {chart.isPending ? (
              <ChartSkeleton />
            ) : chart.isError ? (
              <div className="flex h-72 items-center justify-center text-sm text-osrs-red">
                Failed to load history: {(chart.error as Error).message}
              </div>
            ) : (
              <PriceVolumeChart
                points={chartPoints}
                timestep={timestep}
                currentHigh={item.high}
                currentLow={item.low}
              />
            )}
          </Panel>
          <div className="mt-4">
            <ItemAnalytics item={item} chartPoints={chartPoints} timestep={timestep} config={config} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Flip at current prices">
            <StatRow label="Buy at (insta-sell +1)">
              {flip ? (
                <CopyValue value={flip.buyAt}>
                  <span className="tabular-nums">{formatGpFull(flip.buyAt)}</span>
                </CopyValue>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Sell at (insta-buy −1)">
              {flip ? (
                <CopyValue value={flip.sellAt}>
                  <span className="tabular-nums">{formatGpFull(flip.sellAt)}</span>
                </CopyValue>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Tax per item">
              {flip ? (
                <CopyValue value={flip.tax}>
                  <span className="tabular-nums opacity-80">{formatGpFull(flip.tax)}</span>
                </CopyValue>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Post-tax margin">
              <CopyValue value={flip?.marginPerItem ?? null}>
                <GpText amount={flip?.marginPerItem ?? null} signed />
              </CopyValue>
            </StatRow>
            <StatRow label="ROI"><PctText value={flip ? flip.roi : null} /></StatRow>
            <StatRow label="Break-even sell">
              {flip ? (
                <CopyValue value={breakEvenSell(item.taxExempt, flip.buyAt)}>
                  <span
                    className="tabular-nums opacity-80"
                    title="Lowest sell price that doesn't lose money after tax, given the buy price above"
                  >
                    {formatGpFull(breakEvenSell(item.taxExempt, flip.buyAt))}
                  </span>
                </CopyValue>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </StatRow>
            <StatRow label="Buy limit / 4h">
              {item.limit !== null ? item.limit.toLocaleString('en-US') : '—'}
            </StatRow>
            <StatRow label="Profit / 4h limit">
              <CopyValue value={flip?.profitPer4h ?? null}>
                <GpText amount={flip?.profitPer4h ?? null} signed />
              </CopyValue>
            </StatRow>
            <div className="pt-3">
              <Link
                to={`/log?item=${item.id}`}
                className="block rounded bg-gold px-3 py-1.5 text-center text-sm font-semibold text-ink hover:brightness-110"
              >
                <Icon name="book" className="mr-1" /> Log this flip
              </Link>
            </div>
            <AlertForm item={item} defaultThreshold={flip?.marginPerItem ?? null} />
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
                <StatRow label="High alch value">
                  <CopyValue value={item.highalch}>
                    <GpText amount={item.highalch} />
                  </CopyValue>
                </StatRow>
                <StatRow label="Buy price">
                  <CopyValue value={flip?.buyAt ?? null}>
                    <GpText amount={flip?.buyAt ?? null} />
                  </CopyValue>
                </StatRow>
                <StatRow label="Nature rune">
                  <CopyValue value={natCost}>
                    <GpText amount={natCost} />
                  </CopyValue>
                </StatRow>
                <StatRow label="Profit per cast">
                  <CopyValue value={alchProfit}>
                    <GpText amount={alchProfit} signed />
                  </CopyValue>
                </StatRow>
              </>
            )}
          </Panel>
        </div>
      </div>
      <UpsellDialog open={upsellOpen} onClose={closeUpsell} title="Watchlist full">
        The free tier tracks up to {watchlistMax} items. Premium removes the cap.
      </UpsellDialog>
      <UpsellDialog open={historyUpsell} onClose={() => setHistoryUpsell(false)} title="Full-year history">
        Free shows the last {entitlements.historyDays} days of price history. Premium unlocks
        the full year — seasonal patterns, Leagues spikes and all.
      </UpsellDialog>
    </div>
  );
}
