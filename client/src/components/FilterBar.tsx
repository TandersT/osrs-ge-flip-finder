import { useEffect, useRef, useState } from 'react';
import { formatGpCompact } from '@osrs-flip/shared';
import { FILTER_PRESETS, EMPTY_FILTERS, type Filters, type Membership } from '../lib/rows';
import { SliderInput } from './SliderInput';

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

const gp = (v: number) => formatGpCompact(v);

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  // Sliders/toggles collapse behind a "Filters" button on phones
  const [expanded, setExpanded] = useState(false);

  // "/" jumps to search from anywhere on the page (unless already typing)
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide opacity-60">Search</span>
          <input
            ref={searchRef}
            type="text"
            className="w-44 rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold"
            value={filters.search}
            placeholder="Item name…  ( / )"
            title='Press "/" anywhere to search'
            onChange={(e) => set('search', e.target.value)}
          />
        </label>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded border border-panel-border px-2.5 py-1.5 text-xs hover:border-gold hover:text-gold sm:hidden"
        >
          Filters {expanded ? '▴' : '▾'}
        </button>

        <div
          className={`${expanded ? 'flex' : 'hidden'} w-full flex-wrap items-end gap-x-6 gap-y-4 sm:flex sm:w-auto`}
        >
          <SliderInput
            label="Min margin"
            title="Post-tax profit per item, in gp"
            value={filters.minMargin}
            onChange={(v) => set('minMargin', v)}
            min={1}
            max={1_000_000}
            format={(v) => `≥ ${gp(v)}`}
          />
          <SliderInput
            label="Min ROI"
            title="Margin as a percentage of the buy price"
            value={filters.minRoi}
            onChange={(v) => set('minRoi', v)}
            min={0}
            max={25}
            scale="linear"
            format={(v) => `≥ ${v}%`}
          />
          <SliderInput
            label="Min vol/1h"
            title="Units traded in the last hour — higher fills faster"
            value={filters.minVolume1h}
            onChange={(v) => set('minVolume1h', v)}
            min={1}
            max={50_000}
            format={(v) => `≥ ${v.toLocaleString('en-US')}`}
          />
          <SliderInput
            label="Min buy"
            title="Lower bound of the price band"
            value={filters.minBuyPrice}
            onChange={(v) => set('minBuyPrice', v)}
            min={1}
            max={2_000_000_000}
            format={(v) => `≥ ${gp(v)}`}
          />
          <SliderInput
            label="Max buy"
            title="Your budget per item — hides anything you can't afford"
            value={filters.maxBuyPrice}
            onChange={(v) => set('maxBuyPrice', v)}
            min={100}
            max={2_000_000_000}
            nullAt="max"
            offLabel="no cap"
            format={(v) => `≤ ${gp(v)}`}
          />

          <label className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wide opacity-60">World</span>
            <select
              className="rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold"
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
    </div>
  );
}
