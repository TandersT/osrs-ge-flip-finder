import { useRef } from 'react';
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

export function buildColumns(nowSec: number) {
  return [
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
      header: 'Buy',
      cell: (info) => <GpText amount={info.getValue() ?? null} />,
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.sellAt ?? undefined, {
      id: 'sellAt',
      header: 'Sell',
      cell: (info) => <GpText amount={info.getValue() ?? null} />,
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.marginPerItem ?? undefined, {
      id: 'margin',
      header: 'Margin',
      cell: (info) => <GpText amount={info.getValue() ?? null} signed />,
      sortUndefined: 'last',
    }),
    col.accessor((r) => (r.flip ? r.flip.roi : undefined), {
      id: 'roi',
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
      header: 'Limit',
      cell: (info) => numCell(info.getValue() ?? null),
      sortUndefined: 'last',
    }),
    col.accessor('volume1h', {
      header: 'Vol/1h',
      cell: (info) => numCell(info.getValue()),
    }),
    col.accessor((r) => r.dailyVolume ?? undefined, {
      id: 'dailyVolume',
      header: 'Vol/day',
      cell: (info) => numCell(info.getValue() ?? null),
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.flip?.profitPer4h ?? undefined, {
      id: 'profitPer4h',
      header: 'Profit/4h',
      cell: (info) => <GpText amount={info.getValue() ?? null} signed />,
      sortUndefined: 'last',
    }),
    col.accessor((r) => r.ageSeconds ?? undefined, {
      id: 'age',
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
  ];
}

interface FlipTableProps {
  rows: FlipRow[];
  nowSec: number;
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
}

export function FlipTable({ rows, nowSec, sorting, onSortingChange }: FlipTableProps) {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data: rows,
    columns: buildColumns(nowSec),
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
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold hover:text-osrs-yellow"
                  style={header.column.id === 'name' ? { width: 280 } : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                </th>
              ))}
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
                className="h-10 cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-3 py-1.5">
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
