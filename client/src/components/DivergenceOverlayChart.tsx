import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART } from '../lib/chartTheme';

const ITEM_COLOR = CHART.line;
const PEER_COLOR = CHART.lineAlt;

const dayFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
const pct = (v: number) => `${v >= 1 ? '+' : ''}${((v - 1) * 100).toFixed(0)}%`;

/** Tooltip content — mirrors PriceVolumeChart's custom-`content` idiom (design-token colors). */
function OverlayTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: number | string | null }[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0 || label === undefined) return null;
  return (
    <div className="rounded border border-panel-border bg-ink/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-parchment">{dayFmt.format(new Date(label * 1000))}</div>
      {payload.map((entry) => {
        const value = entry.value;
        if (value === null || value === undefined) return null;
        const swatch = entry.dataKey === 'item' ? ITEM_COLOR : PEER_COLOR;
        return (
          <div key={String(entry.dataKey)} className="flex items-center gap-2 text-parchment/90">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: swatch }} />
            <span className="opacity-70">{entry.name}</span>
            <span className="ml-auto pl-4 tabular-nums">{pct(Number(value))}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Both legs of a diverged pair, normalized to the window start (1 = start price). */
export function DivergenceOverlayChart({
  series,
  itemName,
  peerName,
}: {
  series: { t: number; item: number; peer: number }[];
  itemName: string;
  peerName: string;
}) {
  return (
    <div>
      <div className="mb-1 flex gap-4 text-xs opacity-80">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ITEM_COLOR }} />
          {itemName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PEER_COLOR }} />
          {peerName}
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t: number) => dayFmt.format(new Date(t * 1000))}
              stroke={CHART.axisText}
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={pct}
              stroke={CHART.axisText}
              fontSize={11}
              width={48}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={<OverlayTooltipContent />}
              cursor={{ stroke: CHART.axisText, strokeDasharray: '3 3' }}
              isAnimationActive={false}
            />
            <Line
              dataKey="item"
              name={itemName}
              stroke={ITEM_COLOR}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              dataKey="peer"
              name={peerName}
              stroke={PEER_COLOR}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
