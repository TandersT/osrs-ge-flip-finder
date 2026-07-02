import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { LongtermResponse, LongtermRow } from '@osrs-flip/shared';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';

type Lens = 'all' | 'dips' | 'momentum';

async function fetchLongterm(): Promise<LongtermResponse> {
  const res = await fetch('/api/longterm');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<LongtermResponse>;
}

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="opacity-40">—</span>;
  const cls = value > 0 ? 'text-osrs-green' : value < 0 ? 'text-osrs-red' : 'opacity-70';
  return (
    <span className={`${cls} tabular-nums`}>
      {value > 0 ? '+' : ''}
      {(value * 100).toFixed(1)}%
    </span>
  );
}

type SortKey = keyof Pick<
  LongtermRow,
  'name' | 'price' | 'change7d' | 'change30d' | 'change90d' | 'zScore90' | 'volatility30' | 'volumeTrend30' | 'dailyVolume'
>;

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Item' },
  { key: 'price', label: 'Price' },
  { key: 'change7d', label: '7d' },
  { key: 'change30d', label: '30d' },
  { key: 'change90d', label: '90d' },
  { key: 'zScore90', label: 'Z (90d)', title: 'Std deviations from the 90-day mean price' },
  { key: 'volatility30', label: 'Volatility', title: '30-day coefficient of variation' },
  { key: 'volumeTrend30', label: 'Vol trend', title: '30-day volume slope (per day)' },
  { key: 'dailyVolume', label: 'Vol/day' },
];

export default function LongTermPage() {
  const navigate = useNavigate();
  const [lens, setLens] = useState<Lens>('all');
  const [sortKey, setSortKey] = useState<SortKey>('zScore90');
  const [sortDesc, setSortDesc] = useState(false);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['longterm'],
    queryFn: fetchLongterm,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 2_000 : 15 * 60_000),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    let filtered = data.rows;
    if (lens === 'dips') filtered = filtered.filter((r) => r.isDip);
    if (lens === 'momentum') filtered = filtered.filter((r) => r.isMomentum);
    const dir = sortDesc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return dir * av.localeCompare(bv);
      return dir * ((av as number) - (bv as number));
    });
  }, [data, lens, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key !== 'name' && key !== 'zScore90');
    }
  };

  if (isPending) return <div className="p-10 text-center opacity-60">Loading screen…</div>;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  const lensButton = (value: Lens, label: string, count?: number) => (
    <button
      onClick={() => setLens(value)}
      className={`rounded px-3 py-1 text-xs font-medium ${
        lens === value ? 'bg-gold text-ink' : 'bg-panel-light text-parchment/70 hover:text-parchment'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1 opacity-60">{count}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-300">
        ⚠ OSRS prices move on game updates — new content, Leagues, holiday events. These are
        statistical signals, not guarantees.
      </div>

      {data.status === 'building' && (
        <div className="rounded border border-panel-border bg-panel px-3 py-2 text-sm">
          <div className="mb-1 flex justify-between text-xs opacity-70">
            <span>Screening the most liquid items against their 24h history…</span>
            <span>{Math.round(data.progress * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-panel-light">
            <div className="h-full bg-gold transition-all" style={{ width: `${data.progress * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {lensButton('all', 'All screened', data.rows.length)}
        {lensButton('dips', 'Dip candidates', data.rows.filter((r) => r.isDip).length)}
        {lensButton('momentum', 'Momentum', data.rows.filter((r) => r.isMomentum).length)}
      </div>

      <div className="overflow-auto rounded border border-panel-border bg-panel" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 200 }}>
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-light shadow">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  onClick={() => toggleSort(c.key)}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold hover:text-osrs-yellow"
                >
                  {c.label}
                  {sortKey === c.key ? (sortDesc ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold">Signals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => navigate(`/item/${row.id}`)}
                className="cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
              >
                <td className="whitespace-nowrap px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <ItemIcon icon={row.icon} name={row.name} />
                    {row.name}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <GpText amount={row.price === null ? null : Math.round(row.price)} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5"><Pct value={row.change7d} /></td>
                <td className="whitespace-nowrap px-3 py-1.5"><Pct value={row.change30d} /></td>
                <td className="whitespace-nowrap px-3 py-1.5"><Pct value={row.change90d} /></td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {row.zScore90 === null ? (
                    <span className="opacity-40">—</span>
                  ) : (
                    <span className={`tabular-nums ${row.zScore90 <= -1 ? 'text-osrs-green' : row.zScore90 >= 1 ? 'text-osrs-red' : 'opacity-70'}`}>
                      {row.zScore90.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {row.volatility30 === null ? (
                    <span className="opacity-40">—</span>
                  ) : (
                    <span className="tabular-nums opacity-80">{(row.volatility30 * 100).toFixed(1)}%</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5"><Pct value={row.volumeTrend30} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums opacity-80">
                  {row.dailyVolume === null ? '—' : row.dailyVolume.toLocaleString('en-US')}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {row.isDip && (
                    <span className="mr-1 rounded bg-sky-900/60 px-1 text-[10px] uppercase tracking-wide text-sky-300" title="Trading >=1 std dev below its 90-day mean">
                      dip
                    </span>
                  )}
                  {row.isMomentum && (
                    <span className="rounded bg-purple-900/60 px-1 text-[10px] uppercase tracking-wide text-purple-300" title="Sustained uptrend with rising volume">
                      momentum
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && data.status === 'ready' && (
          <div className="p-10 text-center text-sm opacity-60">No items match this signal right now.</div>
        )}
      </div>
    </div>
  );
}
