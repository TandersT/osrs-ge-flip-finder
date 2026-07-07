import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppConfig, FlipRow, ItemSnapshot } from '@osrs-flip/shared';
import { buildRows } from '@osrs-flip/shared';
import { computeSetRow, type ResolvedSet } from '../lib/tools';
import { CopyValue } from './CopyValue';
import { GpText } from './GpText';
import { Icon } from './Icon';
import { ItemIcon } from './ItemIcon';

const th = (right: boolean) =>
  `whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold ${
    right ? 'text-right' : 'text-left'
  }`;
const td = 'whitespace-nowrap px-3 py-1.5';

/**
 * Reusable modal: a finder-style breakdown of one set/combo — the set row plus
 * one row per piece, with a combine-vs-split arbitrage summary. `set === null`
 * renders nothing (closed). Rows are built from the live snapshots so their
 * numbers match the Flip Finder exactly.
 */
export function SetBreakdownDialog({
  set,
  items,
  config,
  onClose,
}: {
  set: ResolvedSet | null;
  items: ItemSnapshot[];
  config: AppConfig;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!set) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [set, onClose]);

  if (!set) return null;

  const byId = new Map(items.map((i) => [i.id, i]));
  const summary = computeSetRow(byId, config, set);
  const setItem = byId.get(set.def.setId);
  const pieceItems = set.def.pieces
    .map((p) => byId.get(p.id))
    .filter((i): i is ItemSnapshot => i !== undefined);
  const nowSec = Math.floor(Date.now() / 1000);
  const rows: FlipRow[] = buildRows(
    setItem ? [setItem, ...pieceItems] : pieceItems,
    config,
    nowSec,
  );

  const open = (id: number) => {
    onClose();
    navigate(`/item/${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${set.def.setName} pieces`}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded border border-gold/40 bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-panel-border p-4">
          <div>
            <h2 className="text-lg font-bold text-gold">{set.def.setName}</h2>
            {summary && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 uppercase tracking-wide ${
                    summary.best === 'combine'
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-sky-900/60 text-sky-300'
                  }`}
                >
                  {summary.best}
                </span>
                <span className="opacity-70">via {summary.via}</span>
                <span className="opacity-70">
                  combine <GpText amount={summary.combineMargin} signed />
                </span>
                <span className="opacity-70">
                  split <GpText amount={summary.splitMargin} signed />
                </span>
                <span className="opacity-70">
                  min leg {summary.volume1h.toLocaleString('en-US')}/h
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-parchment/40 hover:text-osrs-red"
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 bg-panel-light">
              <tr>
                <th className={th(false)}>Item</th>
                <th className={th(true)}>Buy</th>
                <th className={th(true)}>Sell</th>
                <th className={th(true)}>Margin</th>
                <th className={th(true)}>ROI</th>
                <th className={th(true)}>Vol/1h</th>
                <th className={th(true)}>Limit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSet = row.id === set.def.setId;
                return (
                  <tr
                    key={row.id}
                    onClick={() => open(row.id)}
                    className={`cursor-pointer border-t border-panel-border/50 hover:bg-panel-light ${
                      isSet ? 'bg-panel-light/50 font-medium' : ''
                    }`}
                  >
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={row.icon} name={row.name} />
                        {row.name}
                        {isSet && (
                          <span className="rounded bg-gold/20 px-1 text-[10px] uppercase tracking-wide text-gold">
                            set
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <CopyValue value={row.flip?.buyAt ?? null}>
                        <GpText amount={row.flip?.buyAt ?? null} />
                      </CopyValue>
                    </td>
                    <td className={`${td} text-right`}>
                      <CopyValue value={row.flip?.sellAt ?? null}>
                        <GpText amount={row.flip?.sellAt ?? null} />
                      </CopyValue>
                    </td>
                    <td className={`${td} text-right`}>
                      <GpText amount={row.flip?.marginPerItem ?? null} signed />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {row.flip ? (
                        `${(row.flip.roi * 100).toFixed(1)}%`
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {row.volume1h.toLocaleString('en-US')}
                    </td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {row.limit === null ? '—' : row.limit.toLocaleString('en-US')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
