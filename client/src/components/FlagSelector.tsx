import type { FlagFilters, FlagMode } from '../lib/rows';
import { FLAG_DEFS, type FlagDef } from '../lib/flags';
import { Icon } from './Icon';

const NEXT_MODE: Record<FlagMode, FlagMode> = { any: 'only', only: 'hide', hide: 'any' };

/** Tri-state flag filter: click cycles ignore → only flagged rows → hide flagged rows. */
function FlagChip({ def, mode, onCycle }: { def: FlagDef; mode: FlagMode; onCycle: () => void }) {
  const cls =
    mode === 'only'
      ? 'bg-gold font-medium text-ink'
      : mode === 'hide'
        ? 'bg-red-900/50 text-red-300'
        : 'bg-panel-light text-parchment/50 hover:text-parchment';
  return (
    <button
      onClick={onCycle}
      title={`${def.title} — click to cycle: only → hide → any`}
      aria-label={`${def.label} flag: ${mode}`}
      className={`rounded px-2 py-1 text-xs ${cls}`}
    >
      {mode === 'only' && <Icon name="check" size={10} className="mr-1" />}
      {mode === 'hide' && <Icon name="close" size={10} className="mr-1" />}
      {def.label}
    </button>
  );
}

/**
 * The tri-state flag chip row, shared by every list. Gold = keep only flagged
 * rows, red = hide them, neutral = ignore. Shows one chip per flag definition.
 */
export function FlagSelector({
  flags,
  onChange,
  defs = FLAG_DEFS,
  className = '',
}: {
  flags: FlagFilters;
  onChange: (next: FlagFilters) => void;
  defs?: FlagDef[];
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 text-xs ${className}`}>
      <span
        className="uppercase tracking-wide opacity-60"
        title="Click a flag to cycle: gold = only flagged rows, red = hide flagged rows"
      >
        Flags — only / hide
      </span>
      <div className="flex flex-wrap gap-1">
        {defs.map((def) => (
          <FlagChip
            key={def.key}
            def={def}
            mode={flags[def.key]}
            onCycle={() => onChange({ ...flags, [def.key]: NEXT_MODE[flags[def.key]] })}
          />
        ))}
      </div>
    </div>
  );
}
