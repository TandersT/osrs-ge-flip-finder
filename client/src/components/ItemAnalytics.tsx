import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppConfig, ItemSnapshot, TimeseriesPoint, Timestep } from '@osrs-flip/shared';
import { formatGpAxis, formatGpFull, geTax } from '@osrs-flip/shared';
import { useTimeseries } from '../lib/api';
import { useTier } from '../lib/tier';

const MARGIN_COLOR = '#c98500';
const VOLUME_COLOR = '#6d675a';
const GRID_COLOR = '#3d362a';
const AXIS_TEXT = '#a89f8c';

interface MarginPoint {
  t: number;
  margin: number;
}

function marginSeries(points: TimeseriesPoint[], item: ItemSnapshot, cfg: AppConfig): MarginPoint[] {
  const out: MarginPoint[] = [];
  for (const p of points) {
    if (p.avgHighPrice === null || p.avgLowPrice === null) continue;
    const buyAt = Math.max(1, p.avgLowPrice + cfg.offerOffset);
    const sellAt = Math.max(1, p.avgHighPrice - cfg.offerOffset);
    out.push({ t: p.timestamp, margin: sellAt - buyAt - geTax(item.taxExempt, sellAt) });
  }
  return out;
}

interface HourBucket {
  hour: number;
  volume: number;
  spreadPct: number | null;
}

/** Average traded volume + spread by local hour of day, from the ~15-day 1h series. */
function hourlyProfile(points: TimeseriesPoint[]): HourBucket[] {
  const sums = Array.from({ length: 24 }, () => ({ vol: 0, n: 0, spread: 0, spreadN: 0 }));
  for (const p of points) {
    const h = new Date(p.timestamp * 1000).getHours();
    const bucket = sums[h]!;
    bucket.vol += p.highPriceVolume + p.lowPriceVolume;
    bucket.n++;
    if (p.avgHighPrice !== null && p.avgLowPrice !== null && p.avgLowPrice > 0) {
      bucket.spread += (p.avgHighPrice - p.avgLowPrice) / p.avgLowPrice;
      bucket.spreadN++;
    }
  }
  return sums.map((b, hour) => ({
    hour,
    volume: b.n === 0 ? 0 : Math.round(b.vol / b.n),
    spreadPct: b.spreadN === 0 ? null : (b.spread / b.spreadN) * 100,
  }));
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-parchment/70 first:mt-0">
      {children}
    </h3>
  );
}

export function ItemAnalytics({
  item,
  chartPoints,
  timestep,
  config,
}: {
  item: ItemSnapshot;
  chartPoints: TimeseriesPoint[];
  timestep: Timestep;
  config: AppConfig;
}) {
  const { entitlements } = useTier();
  const unlocked = entitlements.advancedCharts;
  // hourly profile always uses the 1h series (~15 days); only fetch when unlocked
  const hourly = useTimeseries(item.id, '1h', unlocked);

  const margins = useMemo(
    () => (unlocked ? marginSeries(chartPoints, item, config) : []),
    [unlocked, chartPoints, item, config],
  );
  const profile = useMemo(
    () => (unlocked && hourly.data ? hourlyProfile(hourly.data.data) : []),
    [unlocked, hourly.data],
  );

  if (!unlocked) {
    return (
      <section className="rounded border border-panel-border bg-panel p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
          Flip analytics
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm opacity-70">
            🔒 Margin history and hour-by-hour trading activity — see when this item&apos;s
            spread widens and when it&apos;s most liquid.
          </span>
          <Link
            to="/premium"
            className="rounded bg-gold px-3 py-1.5 text-sm font-semibold text-ink hover:brightness-110"
          >
            Unlock with Premium
          </Link>
        </div>
      </section>
    );
  }

  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    ...(timestep === '24h' ? {} : { hour: '2-digit', minute: '2-digit' }),
  });

  return (
    <section className="rounded border border-panel-border bg-panel p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
        Flip analytics <span className="ml-1 font-normal normal-case text-gold/60">⭐ premium</span>
      </h2>

      <PanelTitle>Post-tax margin over time ({timestep} view)</PanelTitle>
      {margins.length < 2 ? (
        <p className="py-4 text-sm opacity-50">Not enough two-sided trades in this window.</p>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={margins} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => timeFmt.format(new Date(t * 1000))}
              stroke={GRID_COLOR}
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatGpAxis(v)}
              stroke={GRID_COLOR}
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              width={64}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: AXIS_TEXT, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) =>
                active && payload?.[0] ? (
                  <div className="rounded border border-panel-border bg-ink/95 px-3 py-2 text-xs shadow-lg">
                    <div className="text-parchment">{timeFmt.format(new Date(Number(label) * 1000))}</div>
                    <div className="opacity-70">margin: {formatGpFull(Number(payload[0].value))}</div>
                  </div>
                ) : null
              }
            />
            <ReferenceLine y={0} stroke={AXIS_TEXT} strokeDasharray="4 4" strokeOpacity={0.4} />
            <Line type="monotone" dataKey="margin" stroke={MARGIN_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      <PanelTitle>Trading activity by hour of day (last ~15 days, your timezone)</PanelTitle>
      {profile.length === 0 ? (
        <p className="py-4 text-sm opacity-50">Loading hourly profile…</p>
      ) : (
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={profile} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              tickFormatter={(h: number) => `${h}`}
              stroke={GRID_COLOR}
              tick={{ fill: AXIS_TEXT, fontSize: 10 }}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tickFormatter={(v: number) => formatGpAxis(v)}
              stroke={GRID_COLOR}
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              width={64}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: '#ffffff10' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as HourBucket | undefined;
                return active && p ? (
                  <div className="rounded border border-panel-border bg-ink/95 px-3 py-2 text-xs shadow-lg">
                    <div className="text-parchment">{String(p.hour).padStart(2, '0')}:00–{String(p.hour).padStart(2, '0')}:59</div>
                    <div className="opacity-70">avg volume: {p.volume.toLocaleString('en-US')}/h</div>
                    {p.spreadPct !== null && (
                      <div className="opacity-70">avg spread: {p.spreadPct.toFixed(2)}%</div>
                    )}
                  </div>
                ) : null;
              }}
            />
            <Bar dataKey="volume" fill={VOLUME_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
