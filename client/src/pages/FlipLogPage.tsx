import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppConfig, ItemSnapshot } from '@osrs-flip/shared';
import { computeFlip, formatGpCompact, formatGpFull, geTax } from '@osrs-flip/shared';
import { useAppConfig, useItems } from '../lib/api';
import { nameMatches } from '../lib/rows';
import {
  cumulativeProfit,
  computeStats,
  isOpen,
  useFlipLog,
  type FlipLogEntry,
} from '../lib/fliplog';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';

const LINE_COLOR = '#c98500'; // CVD-validated on the dark panel surface
const GRID_COLOR = '#3d362a';
const AXIS_TEXT = '#a89f8c';

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-panel-border bg-panel px-4 py-3">
      <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{children}</span>
    </div>
  );
}

function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: ItemSnapshot[];
  selected: ItemSnapshot | null;
  onSelect: (item: ItemSnapshot | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (query.trim() === '') return [];
    return items.filter((i) => nameMatches(i.name, query)).slice(0, 8);
  }, [items, query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide opacity-60">Item</span>
        {selected ? (
          <button
            onClick={() => {
              onSelect(null);
              setQuery('');
            }}
            className="flex w-56 items-center gap-2 rounded border border-gold/50 bg-ink px-2 py-1.5 text-left text-sm"
            title="Click to change item"
          >
            <ItemIcon icon={selected.icon} name={selected.name} size={20} />
            <span className="truncate">{selected.name}</span>
            <span className="ml-auto opacity-40">✕</span>
          </button>
        ) : (
          <input
            type="text"
            value={query}
            placeholder="Search an item…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="w-56 rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold"
          />
        )}
      </label>
      {open && matches.length > 0 && !selected && (
        <ul className="absolute z-20 mt-1 w-64 overflow-hidden rounded border border-panel-border bg-panel shadow-xl">
          {matches.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-panel-light"
              >
                <ItemIcon icon={item.icon} name={item.name} size={20} />
                <span className="truncate">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  width = 'w-28',
  placeholder,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  width?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="uppercase tracking-wide opacity-60">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
        className={`${width} rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold`}
      />
    </label>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: { n: number; total: number; entry: FlipLogEntry } }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded border border-panel-border bg-ink/95 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-parchment">
        #{point.n} · {point.entry.itemName}
      </div>
      <div className="opacity-70">
        this flip: {formatGpFull(point.entry.profit!)} · total: {formatGpFull(point.total)}
      </div>
    </div>
  );
}

/** One open position: live unrealized P&L + inline completion. */
function OpenPositionRow({
  entry,
  liveItem,
  config,
  onComplete,
  onRemove,
}: {
  entry: FlipLogEntry;
  liveItem: ItemSnapshot | undefined;
  config: AppConfig;
  onComplete: (id: string, sellPrice: number) => void;
  onRemove: (id: string) => void;
}) {
  const liveSell = useMemo(() => {
    if (!liveItem || liveItem.high === null) return null;
    return Math.max(1, liveItem.high - config.offerOffset);
  }, [liveItem, config.offerOffset]);
  const [sell, setSell] = useState<number | ''>('');
  const effectiveSell = sell === '' ? liveSell : sell;

  const unrealized =
    effectiveSell === null
      ? null
      : (effectiveSell - entry.buyPrice - geTax(entry.taxExempt, effectiveSell)) * entry.qty;

  return (
    <tr className="border-t border-panel-border/50">
      <td className="whitespace-nowrap px-3 py-1.5">
        <Link to={`/item/${entry.itemId}`} className="flex items-center gap-2 hover:text-gold">
          <ItemIcon icon={entry.icon} name={entry.itemName} size={20} />
          {entry.itemName}
        </Link>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{entry.qty.toLocaleString('en-US')}</td>
      <td className="px-3 py-1.5 text-right"><GpText amount={entry.buyPrice} /></td>
      <td className="px-3 py-1.5 text-right"><GpText amount={entry.qty * entry.buyPrice} /></td>
      <td className="px-3 py-1.5 text-right">
        <span title="At the current sell price (or the price you type)">
          <GpText amount={unrealized} signed />
        </span>
      </td>
      <td className="px-3 py-1.5">
        <span className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min={0}
            value={sell}
            placeholder={liveSell === null ? 'sell price' : String(liveSell)}
            onChange={(e) => setSell(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
            className="w-28 rounded border border-panel-border bg-ink px-2 py-1 text-right text-xs text-parchment outline-none focus:border-gold"
            title="Sell price per item — pre-filled with the live price"
          />
          <button
            onClick={() => effectiveSell !== null && onComplete(entry.id, effectiveSell)}
            disabled={effectiveSell === null}
            className="rounded bg-gold px-2 py-1 text-xs font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-30"
            title="Mark as sold at this price"
          >
            ✓ Sold
          </button>
          <button
            onClick={() => onRemove(entry.id)}
            title="Delete position"
            className="px-1 text-parchment/30 hover:text-osrs-red"
          >
            ✕
          </button>
        </span>
      </td>
    </tr>
  );
}

export default function FlipLogPage() {
  const config = useAppConfig();
  const { data } = useItems(config.clientRefreshSeconds);
  const { entries, add, complete, remove } = useFlipLog();
  const [params] = useSearchParams();

  const [selected, setSelected] = useState<ItemSnapshot | null>(null);
  const [qty, setQty] = useState<number | ''>(1);
  const [buy, setBuy] = useState<number | ''>('');
  const [sell, setSell] = useState<number | ''>('');

  // /log?item=4151 preselects once (arriving from an item page's "Log this flip")
  const appliedParamRef = useRef(false);
  useEffect(() => {
    const id = Number(params.get('item'));
    if (appliedParamRef.current || !data || !Number.isInteger(id) || id <= 0) return;
    const item = data.items.find((i) => i.id === id);
    if (item) {
      appliedParamRef.current = true;
      selectItem(item);
    }
  });

  function selectItem(item: ItemSnapshot | null) {
    setSelected(item);
    if (!item) return;
    const flip = computeFlip(
      {
        low: item.low,
        high: item.high,
        isExempt: item.taxExempt,
        buyLimit: item.limit,
        volumePer4h: null,
      },
      config,
    );
    if (flip) {
      setBuy(flip.buyAt);
      setSell(flip.sellAt);
    }
  }

  const preview = useMemo(() => {
    if (!selected || qty === '' || buy === '' || qty <= 0) return null;
    if (sell === '') return { open: true as const };
    const tax = geTax(selected.taxExempt, sell);
    return { open: false as const, tax, profit: (sell - buy - tax) * qty };
  }, [selected, qty, buy, sell]);

  const openPositions = useMemo(() => entries.filter(isOpen), [entries]);
  const closed = useMemo(() => entries.filter((e) => !isOpen(e)), [entries]);
  const stats = useMemo(() => computeStats(entries), [entries]);
  const series = useMemo(() => cumulativeProfit(entries), [entries]);

  const submit = () => {
    if (!selected || preview === null || qty === '' || buy === '') return;
    add({
      itemId: selected.id,
      itemName: selected.name,
      icon: selected.icon,
      taxExempt: selected.taxExempt,
      qty,
      buyPrice: buy,
      sellPrice: sell === '' ? null : sell,
    });
    setSelected(null);
    setQty(1);
    setBuy('');
    setSell('');
  };

  const exportCsv = async () => {
    const { toCsv } = await import('../lib/fliplog');
    const blob = new Blob([toCsv(entries)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flip-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gold">Flip Log</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-70">
          Record the flips you actually make and watch your bank grow. Leave the sell price
          empty to track an open position and complete it when your offer fills. Stored in this
          browser only.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded border border-panel-border bg-panel p-4">
        <ItemPicker items={data?.items ?? []} selected={selected} onSelect={selectItem} />
        <NumberField label="Quantity" value={qty} onChange={setQty} width="w-24" />
        <NumberField label="Bought at (each)" value={buy} onChange={setBuy} />
        <NumberField
          label="Sold at (each)"
          value={sell}
          onChange={setSell}
          placeholder="not yet"
        />
        <div className="flex flex-col gap-1 pb-0.5 text-xs">
          <span className="uppercase tracking-wide opacity-60">Result</span>
          {preview === null ? (
            <span className="text-sm opacity-40">pick an item…</span>
          ) : preview.open ? (
            <span className="text-sm text-sky-300">open position — complete it when it sells</span>
          ) : (
            <span className="text-sm">
              tax {formatGpCompact(preview.tax)}/ea → <GpText amount={preview.profit} signed />
            </span>
          )}
        </div>
        <button
          onClick={submit}
          disabled={preview === null}
          className="rounded bg-gold px-4 py-1.5 text-sm font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-30"
        >
          {preview?.open ? 'Log buy' : 'Log flip'}
        </button>
      </section>

      {entries.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Realized profit"><GpText amount={stats.realizedProfit} signed /></StatTile>
          <StatTile label="Open positions">
            {stats.openCount === 0 ? (
              '—'
            ) : (
              <span className="text-sm">
                {stats.openCount} · <GpText amount={stats.openCapital} /> tied up
              </span>
            )}
          </StatTile>
          <StatTile label="Win rate">
            {stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`}
          </StatTile>
          <StatTile label="gp/hour">
            {stats.gpPerHour === null ? (
              <span title="Needs completed positions with real durations">—</span>
            ) : (
              <GpText amount={Math.round(stats.gpPerHour)} signed />
            )}
          </StatTile>
          <StatTile label="Best flip">
            {stats.best ? (
              <span className="flex items-center gap-2 text-sm">
                <ItemIcon icon={stats.best.icon} name={stats.best.itemName} size={20} />
                <GpText amount={stats.best.profit} signed />
              </span>
            ) : (
              '—'
            )}
          </StatTile>
        </section>
      )}

      {openPositions.length > 0 && (
        <section className="overflow-auto rounded border border-sky-800/60 bg-panel">
          <div className="px-3 py-2 text-xs uppercase tracking-wide text-sky-300">
            Open positions — waiting to sell
          </div>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-panel-light">
              <tr>
                {(
                  [
                    ['Item', false],
                    ['Qty', true],
                    ['Bought', true],
                    ['Capital', true],
                    ['Unrealized', true],
                    ['Complete', true],
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
              {openPositions.map((entry) => (
                <OpenPositionRow
                  key={entry.id}
                  entry={entry}
                  liveItem={data?.items.find((i) => i.id === entry.itemId)}
                  config={config}
                  onComplete={complete}
                  onRemove={remove}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {series.length >= 2 && (
        <section className="rounded border border-panel-border bg-panel p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
            Bank growth (cumulative realized profit)
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="n"
                stroke={GRID_COLOR}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                label={{ value: 'flip #', fill: AXIS_TEXT, fontSize: 11, dy: 12 }}
                height={36}
              />
              <YAxis
                tickFormatter={(v: number) => formatGpCompact(v)}
                stroke={GRID_COLOR}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                width={64}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: AXIS_TEXT, strokeDasharray: '3 3' }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={LINE_COLOR}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {closed.length > 0 && (
        <section className="overflow-auto rounded border border-panel-border bg-panel">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-gold">History</span>
            <button
              onClick={exportCsv}
              className="rounded border border-panel-border px-2 py-1 text-xs hover:border-gold hover:text-gold"
            >
              ⬇ Export CSV
            </button>
          </div>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-panel-light">
              <tr>
                {(
                  [
                    ['When', false],
                    ['Item', false],
                    ['Qty', true],
                    ['Bought', true],
                    ['Sold', true],
                    ['Tax/item', true],
                    ['Profit', true],
                    ['', false],
                  ] as const
                ).map(([h, right], i) => (
                  <th
                    key={i}
                    className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold ${right ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {closed.map((e) => (
                <tr key={e.id} className="border-t border-panel-border/50">
                  <td className="whitespace-nowrap px-3 py-1.5 opacity-60">
                    {dateFmt.format(new Date((e.soldAt ?? e.loggedAt) * 1000))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <Link to={`/item/${e.itemId}`} className="flex items-center gap-2 hover:text-gold">
                      <ItemIcon icon={e.icon} name={e.itemName} size={20} />
                      {e.itemName}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.qty.toLocaleString('en-US')}</td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={e.buyPrice} /></td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={e.sellPrice} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
                    {e.taxPerItem === null ? '—' : e.taxPerItem.toLocaleString('en-US')}
                  </td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={e.profit} signed /></td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => remove(e.id)}
                      title="Delete entry"
                      className="px-1 text-parchment/30 hover:text-osrs-red"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {entries.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded border border-panel-border bg-panel p-14 text-center">
          <span className="text-4xl">📒</span>
          <p className="opacity-70">No flips logged yet.</p>
          <p className="max-w-md text-sm opacity-50">
            Find a flip in the <Link to="/" className="text-gold underline">finder</Link> or the{' '}
            <Link to="/starter" className="text-gold underline">Get Started guide</Link>, place your
            buy offer in-game, then log it here — leave the sell empty until it completes.
          </p>
        </div>
      )}
    </div>
  );
}
