import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { atLimit } from '@osrs-flip/shared';
import { useSavedFilters } from '../lib/savedFilters';
import { useTier } from '../lib/tier';
import { UpsellDialog } from './UpsellDialog';
import { formatGpCompact } from '@osrs-flip/shared';
import {
  FILTER_PRESETS,
  EMPTY_FILTERS,
  type Filters,
  type Membership,
} from '../lib/rows';
import { Icon } from './Icon';
import { SliderInput } from './SliderInput';
import { FlagSelector } from './FlagSelector';

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

  // Saved views: name the current URL state and recall it with one click
  const [searchParams, setSearchParams] = useSearchParams();
  const { saved, save, remove } = useSavedFilters();
  const { entitlements } = useTier();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [savedUpsell, setSavedUpsell] = useState(false);

  const startSave = () => {
    if (atLimit(saved.length, entitlements.savedFiltersMax)) {
      setSavedUpsell(true);
      return;
    }
    setNaming(true);
  };
  const confirmSave = () => {
    if (name.trim() === '') return;
    save(name, searchParams.toString());
    setName('');
    setNaming(false);
  };

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
        <span className="mx-1 h-4 w-px bg-panel-border" />
        {saved.map((f) => (
          <span key={f.id} className="flex items-center rounded bg-panel-light">
            <button
              onClick={() => setSearchParams(new URLSearchParams(f.search))}
              title="Apply this saved view"
              className="px-2.5 py-1 text-xs font-medium text-gold/90 hover:text-gold"
            >
              <Icon name="bookmark-fill" className="mr-1" size={11} />
              {f.name}
            </button>
            <button
              onClick={() => remove(f.id)}
              title="Delete saved view"
              aria-label={`Delete saved view ${f.name}`}
              className="pr-1.5 text-xs text-parchment/30 hover:text-osrs-red"
            >
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
        {naming ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSave();
                if (e.key === 'Escape') setNaming(false);
              }}
              placeholder="View name…"
              className="w-32 rounded border border-panel-border bg-ink px-2 py-1 text-xs text-parchment outline-none focus:border-gold"
              aria-label="Saved view name"
            />
            <button
              onClick={confirmSave}
              className="rounded bg-gold px-2 py-1 text-xs font-semibold text-ink hover:brightness-110"
            >
              Save
            </button>
          </span>
        ) : (
          <button
            onClick={startSave}
            title="Save the current filters and sort as a named view"
            className="rounded px-2.5 py-1 text-xs text-parchment/50 hover:text-gold"
          >
            <Icon name="bookmark" className="mr-1" size={11} />
            Save view
          </button>
        )}
      </div>

      <FlagSelector flags={filters.flags} onChange={(next) => set('flags', next)} />

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
          Filters <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={11} />
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

        </div>
      </div>
      <UpsellDialog open={savedUpsell} onClose={() => setSavedUpsell(false)} title="Saved views">
        The free tier keeps {entitlements.savedFiltersMax} saved view. Premium saves as many
        as you like.
      </UpsellDialog>
    </div>
  );
}
