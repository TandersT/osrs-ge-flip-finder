import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { formatAge } from '@osrs-flip/shared';
import type { FlipRow } from '../lib/rows';
import { GpText } from './GpText';
import { ItemIcon } from './ItemIcon';

const col = createColumnHelper<FlipRow>();

function numCell(value: number | null | undefined) {
  if (value === null || value === undefined) return <span className="opacity-40">—</span>;
  return <span className="tabular-nums">{value.toLocaleString('en-US')}</span>;
}

export function rowMid(row: FlipRow): number | null {
  if (row.high !== null && row.low !== null) return (row.high + row.low) / 2;
  return row.high ?? row.low;
}

/** Gp amount that briefly tints when the underlying price moved on refresh. */
function FlashCell({ value, move }: { value: number | null; move: -1 | 0 | 1 }) {
  return (
    <span
      // re-key on the value so the CSS animation restarts on every change
      key={value ?? 'none'}
      className={`-mx-1 inline-block rounded px-1 ${
        move === 1 ? 'flash-up' : move === -1 ? 'flash-down' : ''
      }`}
    >
      <GpText amount={value} />
    </span>
  );
}

function FlagBadge({ label, className, title }: { label: string; className: string; title: string }) {
  return (
    <span className={`rounded px-1 text-[10px] uppercase tracking-wide ${className}`} title={title}>
      {label}
    </span>
  );
}

export interface TableContext {
  nowSec: number;
  isWatched: (id: number) => boolean;
  onToggleWatch: (row: FlipRow) => void;
  /** When set (watchlist view), adds a "Since added" column: id -> fractional change. */
  sinceAdded?: Map<number, number | null>;
}

export function buildColumns({ nowSec, isWatched, onToggleWatch, sinceAdded }: TableContext) {
  return [
    col.display({
      id: 'watch',
      header: '',
      size: 36,
      cell: (info) => {
        const watched = isWatched(info.row.original.id);
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch(info.row.original);
            }}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            className={`px-1 text-base leading-none ${watched ? 'text-gold' : 'text-parchment/30 hover:text-parchment/70'}`}
          >
            {watched ? '★' : '☆'}
          </button>
        );
      },
    }),
    col.accessor('name', {
      header: 'Item',
      cell: (info) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <ItemIcon icon={info.row.original.icon} name={info.getValue()} />
          <span className="truncate">{info.getValue()}</span>
          {info.row.original.taxExempt && (
            <span
              className="rounded bg-emerald-900/60 px-1 text-[10px] uppercase tracking-wide text-emerald-300"
              title="Exempt from GE tax"
            >
              exempt
            </span>
          )}
        </span>
      ),
      size: 260,
    }),
    col.accessor((r) => r.flip?.buyAt ?? undefined, {
      id: 'buyAt',
      meta: { align: 'right', title: 'What you pay: latest insta-sell price + 1 gp' },
      header: 'Buy',
      cell: (info) => (
        <FlashCell value={info.getValue() ?? null} move={info.row.original.buyMove} />
      ),
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.sellAt ?? undefined, {
      id: 'sellAt',
      meta: { align: 'right', title: 'What you list at: latest insta-buy price − 1 gp' },
      header: 'Sell',
      cell: (info) => (
        <FlashCell value={info.getValue() ?? null} move={info.row.original.sellMove} />
      ),
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.marginPerItem ?? undefined, {
      id: 'margin',
      meta: { align: 'right', title: 'Profit per item AFTER the 2% GE tax' },
      header: 'Margin',
      cell: (info) => <GpText amount={info.getValue() ?? null} signed />,
      sortUndefined: 'last',
    }),
    col.accessor((r) => (r.flip ? r.flip.roi : undefined), {
      id: 'roi',
      meta: { align: 'right', title: 'Margin as a percentage of the buy price' },
      header: 'ROI',
      cell: (info) => {
        const roi = info.getValue();
        if (roi === undefined) return <span className="opacity-40">—</span>;
        const cls = roi < 0 ? 'text-osrs-red' : roi >= 0.02 ? 'text-osrs-green' : 'text-parchment';
        return <span className={`${cls} tabular-nums`}>{(roi * 100).toFixed(1)}%</span>;
      },
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.tax ?? undefined, {
      id: 'tax',
      meta: { align: 'right', title: 'GE tax per item at the sell price (2%, rounded down, capped at 5m)' },
      header: 'Tax',
      cell: (info) => {
        const v = info.getValue();
        if (v === undefined) return <span className="opacity-40">—</span>;
        return <span className="tabular-nums opacity-70">{v.toLocaleString('en-US')}</span>;
      },
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.limit ?? undefined, {
      id: 'limit',
      meta: { align: 'right', title: 'Max you can buy per rolling 4 hours' },
      header: 'Limit',
      cell: (info) => numCell(info.getValue() ?? null),
      sortUndefined: 'last',
    }),
    col.accessor('volume1h', {
      header: 'Vol/1h',
      meta: { align: 'right', title: 'Units traded in the last hour — higher fills faster' },
      cell: (info) => numCell(info.getValue()),
    }),
    col.accessor((r) => r.dailyVolume ?? undefined, {
      id: 'dailyVolume',
      meta: { align: 'right', title: 'Units traded per day' },
      header: 'Vol/day',
      cell: (info) => numCell(info.getValue() ?? null),
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.profitPer4h ?? undefined, {
      id: 'profitPer4h',
      meta: { align: 'right', title: 'Margin × what you can realistically buy in one 4h window' },
      header: 'Profit/4h',
      cell: (info) => <GpText amount={info.getValue() ?? null} signed />,
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.ageSeconds ?? undefined, {
      id: 'age',
      meta: { align: 'right', title: 'Age of the older price side — red means stale' },
      header: 'Age',
      cell: (info) => {
        const row = info.row.original;
        const age = formatAge(
          row.ageSeconds === null ? null : nowSec - row.ageSeconds,
          nowSec * 1000,
        );
        return (
          <span className={`tabular-nums ${row.isStale ? 'text-osrs-red' : 'opacity-60'}`}>
            {age}
          </span>
        );
      },
      sortUndefined: 'last',
    }),
    ...(sinceAdded
      ? [
          col.accessor((r) => sinceAdded.get(r.id) ?? undefined, {
            id: 'sinceAdded',
      meta: { align: 'right' as const, title: 'Mid-price change since you starred it' },
            header: 'Since added',
            cell: (info) => {
              const v = info.getValue();
              if (v === undefined || v === null) return <span className="opacity-40">—</span>;
              const cls = v > 0 ? 'text-osrs-green' : v < 0 ? 'text-osrs-red' : 'opacity-70';
              return (
                <span className={`${cls} tabular-nums`}>
                  {v > 0 ? '+' : ''}
                  {(v * 100).toFixed(1)}%
                </span>
              );
            },
            sortUndefined: 'last' as const,
          }),
        ]
      : []),
    col.display({
      id: 'flags',
      header: 'Flags',
      enableSorting: false,
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className="flex gap-1">
            {row.isStale && (
              <FlagBadge
                label="stale"
                className="bg-zinc-700/60 text-zinc-300"
                title="One of the price sides hasn't updated recently"
              />
            )}
            {row.isThin && (
              <FlagBadge
                label="thin"
                className="bg-red-900/60 text-red-300"
                title="Juicy margin on tiny volume — possible manipulation or unfillable offer"
              />
            )}
            {row.isUnstable && (
              <FlagBadge
                label="unstable"
                className="bg-orange-900/60 text-orange-300"
                title="Latest price disagrees sharply with the 1h average"
              />
            )}
          </span>
        );
      },
    }),
  ];
}

interface FlipTableProps {
  rows: FlipRow[];
  context: TableContext;
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
}

export function FlipTable({ rows, context, sorting, onSortingChange }: FlipTableProps) {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => buildColumns(context), [context]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  // ↑/↓ walk the (sorted, filtered) rows, Enter opens, Escape clears
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (tableRows.length === 0) return;
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.min(Math.max((activeIndex ?? -1) + delta, 0), tableRows.length - 1);
        setActiveIndex(next);
        virtualizer.scrollToIndex(next, { align: 'auto' });
      } else if (e.key === 'Enter' && activeIndex !== null) {
        const row = tableRows[activeIndex];
        if (row) navigate(`/item/${row.original.id}`);
      } else if (e.key === 'Escape') {
        setActiveIndex(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tableRows, activeIndex, virtualizer, navigate]);
  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]!.start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
      : 0;

  return (
    <div ref={parentRef} className="overflow-auto rounded border border-panel-border bg-panel"
      style={{ height: 'calc(100vh - 230px)', minHeight: 300 }}>
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-panel-light shadow">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    title={meta?.title}
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                    }
                    className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold hover:text-osrs-yellow ${
                      meta?.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                    style={header.column.id === 'name' ? { width: 280 } : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[sorted as string] ?? ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((vi) => {
            const row = tableRows[vi.index]!;
            return (
              <tr
                key={row.original.id}
                onClick={() => navigate(`/item/${row.original.id}`)}
                className={`h-10 cursor-pointer border-t border-panel-border/50 hover:bg-panel-light ${
                  vi.index === activeIndex ? 'bg-panel-light outline outline-1 -outline-offset-1 outline-gold/60' : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`whitespace-nowrap px-3 py-1.5 ${
                      cell.column.columnDef.meta?.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-10 text-center text-sm opacity-60">
          No items match the current filters.
        </div>
      )}
    </div>
  );
}
