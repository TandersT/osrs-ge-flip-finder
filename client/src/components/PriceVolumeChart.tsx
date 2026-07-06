import { useMemo } from 'react';
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
import type { TimeseriesPoint, Timestep } from '@osrs-flip/shared';
import { formatGpAxis, formatGpFull } from '@osrs-flip/shared';
import { CHART } from '../lib/chartTheme';

// Validated for CVD + contrast on the dark panel surface (dataviz six-checks)
const HIGH_COLOR = CHART.line; // insta-buy (high)
const LOW_COLOR = CHART.lineAlt; // insta-sell (low)
const VOLUME_COLOR = CHART.volume;
const GRID_COLOR = CHART.grid;
const AXIS_TEXT = CHART.axisText;

interface ChartPoint {
  t: number;
  high: number | null;
  low: number | null;
  volume: number;
}

function tickFormatter(timestep: Timestep): (t: number) => string {
  const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
  const dayTimeFmt = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
  });
  return (t) => {
    const d = new Date(t * 1000);
    if (timestep === '5m' || timestep === '1h') return timeFmt.format(d);
    if (timestep === '6h') return dayTimeFmt.format(d);
    return dayFmt.format(d);
  };
}

function TooltipContent({
  active,
  payload,
  label,
  timestep,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string | null }[];
  label?: number;
  timestep: Timestep;
}) {
  if (!active || !payload || payload.length === 0 || label === undefined) return null;
  const fullFmt = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(timestep === '24h' ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
  return (
    <div className="rounded border border-panel-border bg-ink/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-parchment">{fullFmt.format(new Date(label * 1000))}</div>
      {payload.map((entry) => {
        const key = String(entry.dataKey);
        const value = entry.value;
        if (value === null || value === undefined) return null;
        const name = key === 'high' ? 'Insta-buy' : key === 'low' ? 'Insta-sell' : 'Volume';
        const swatch = key === 'high' ? HIGH_COLOR : key === 'low' ? LOW_COLOR : VOLUME_COLOR;
        return (
          <div key={key} className="flex items-center gap-2 text-parchment/90">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: swatch }} />
            <span className="opacity-70">{name}</span>
            <span className="ml-auto pl-4 tabular-nums">
              {key === 'volume'
                ? Number(value).toLocaleString('en-US')
                : formatGpFull(Number(value))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PriceVolumeChart({
  points,
  timestep,
  currentHigh,
  currentLow,
}: {
  points: TimeseriesPoint[];
  timestep: Timestep;
  /** Live insta-buy price — drawn as a dashed reference line. */
  currentHigh?: number | null;
  /** Live insta-sell price — drawn as a dashed reference line. */
  currentLow?: number | null;
}) {
  const data: ChartPoint[] = useMemo(
    () =>
      points.map((p) => ({
        t: p.timestamp,
        high: p.avgHighPrice,
        low: p.avgLowPrice,
        volume: p.highPriceVolume + p.lowPriceVolume,
      })),
    [points],
  );
  const formatTick = useMemo(() => tickFormatter(timestep), [timestep]);

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm opacity-50">
        No trade history for this window.
      </div>
    );
  }

  const xAxisProps = {
    dataKey: 't',
    type: 'number' as const,
    domain: ['dataMin', 'dataMax'] as [string, string],
    tickFormatter: formatTick,
    stroke: GRID_COLOR,
    tick: { fill: AXIS_TEXT, fontSize: 11 },
    tickLine: false as const,
  };

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center gap-4 px-2 text-xs text-parchment/80">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: HIGH_COLOR }} />
          Insta-buy (high)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: LOW_COLOR }} />
          Insta-sell (low)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: VOLUME_COLOR }} />
          Volume
        </span>
        {(currentHigh != null || currentLow != null) && (
          <span className="flex items-center gap-1.5 opacity-70">
            <span
              className="inline-block w-4 border-t-2 border-dashed"
              style={{ borderColor: AXIS_TEXT }}
            />
            Live price
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} syncId="item-detail" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis {...xAxisProps} tick={false} height={4} />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatGpAxis(v)}
            stroke={GRID_COLOR}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickLine={false}
            width={64}
          />
          <Tooltip
            content={<TooltipContent timestep={timestep} />}
            cursor={{ stroke: AXIS_TEXT, strokeDasharray: '3 3' }}
            isAnimationActive={false}
          />
          {currentHigh != null && (
            <ReferenceLine
              y={currentHigh}
              stroke={HIGH_COLOR}
              strokeDasharray="5 5"
              strokeOpacity={0.55}
              ifOverflow="extendDomain"
            />
          )}
          {currentLow != null && (
            <ReferenceLine
              y={currentLow}
              stroke={LOW_COLOR}
              strokeDasharray="5 5"
              strokeOpacity={0.55}
              ifOverflow="extendDomain"
            />
          )}
          <Line type="monotone" dataKey="high" stroke={HIGH_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="low" stroke={LOW_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={data} syncId="item-detail" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis {...xAxisProps} />
          <YAxis
            tickFormatter={(v: number) => formatGpAxis(v)}
            stroke={GRID_COLOR}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickLine={false}
            width={64}
          />
          <Tooltip
            content={<TooltipContent timestep={timestep} />}
            cursor={{ fill: CHART.cursor }}
            isAnimationActive={false}
          />
          <Bar dataKey="volume" fill={VOLUME_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
