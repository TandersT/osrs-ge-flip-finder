import type { FlipRow } from '../lib/rows';
import { MARKET_FLAG_DEFS, type FlagDef } from '../lib/flags';

/**
 * Pill badges for whichever flags a row carries. Shared by the tabs that
 * resolve flags by item id; renders nothing when the row is missing (no live
 * snapshot for this id) or carries no flags.
 */
export function FlagBadges({
  row,
  defs = MARKET_FLAG_DEFS,
  className = '',
}: {
  row: FlipRow | undefined;
  defs?: FlagDef[];
  className?: string;
}) {
  if (!row) return null;
  const active = defs.filter((d) => d.get(row));
  if (active.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 align-middle ${className}`}>
      {active.map((d) => (
        <span
          key={d.key}
          className={`rounded px-1 text-[10px] uppercase tracking-wide ${d.badgeClass}`}
          title={d.title}
        >
          {d.label}
        </span>
      ))}
    </span>
  );
}
