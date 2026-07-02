import { FILTER_PRESETS, EMPTY_FILTERS, type Filters, type Membership } from '../lib/rows';

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="uppercase tracking-wide opacity-60">{label}</span>
      <input
        type="number"
        step={step}
        className="w-24 rounded border border-panel-border bg-ink px-2 py-1 text-sm text-parchment outline-none focus:border-gold"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-gold"
      />
      <span>{label}</span>
    </label>
  );
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-3 rounded border border-panel-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide opacity-60">Presets</span>
        {FILTER_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onChange(preset.filters)}
            className="rounded bg-panel-light px-2.5 py-1 text-xs font-medium text-parchment/80 hover:text-gold"
          >
            {preset.name}
          </button>
        ))}
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="rounded px-2.5 py-1 text-xs text-parchment/50 hover:text-parchment"
        >
          Reset
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide opacity-60">Search</span>
        <input
          type="text"
          className="w-44 rounded border border-panel-border bg-ink px-2 py-1 text-sm text-parchment outline-none focus:border-gold"
          value={filters.search}
          placeholder="Item name…"
          onChange={(e) => set('search', e.target.value)}
        />
      </label>
      <NumberInput label="Min margin" value={filters.minMargin} onChange={(v) => set('minMargin', v)} placeholder="gp" />
      <NumberInput label="Min ROI %" value={filters.minRoi} onChange={(v) => set('minRoi', v)} step={0.1} placeholder="%" />
      <NumberInput label="Min vol/1h" value={filters.minVolume1h} onChange={(v) => set('minVolume1h', v)} />
      <NumberInput label="Min buy" value={filters.minBuyPrice} onChange={(v) => set('minBuyPrice', v)} placeholder="gp" />
      <NumberInput label="Max buy" value={filters.maxBuyPrice} onChange={(v) => set('maxBuyPrice', v)} placeholder="budget" />
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide opacity-60">World</span>
        <select
          className="rounded border border-panel-border bg-ink px-2 py-1 text-sm text-parchment outline-none focus:border-gold"
          value={filters.membership}
          onChange={(e) => set('membership', e.target.value as Membership)}
        >
          <option value="all">All</option>
          <option value="members">Members</option>
          <option value="f2p">F2P</option>
        </select>
      </label>
      <div className="flex flex-col gap-1.5 pb-0.5">
        <Toggle
          label="Tax-exempt only"
          checked={filters.taxExemptOnly}
          onChange={(v) => set('taxExemptOnly', v)}
          title="Only items exempt from the 2% GE tax"
        />
        <Toggle
          label="Hide stale"
          checked={filters.hideStale}
          onChange={(v) => set('hideStale', v)}
          title="Hide items whose prices haven't updated recently"
        />
        <Toggle
          label="Hide risky"
          checked={filters.hideRisky}
          onChange={(v) => set('hideRisky', v)}
          title="Hide thin-volume and unstable-spread items"
        />
      </div>
      </div>
    </div>
  );
}
