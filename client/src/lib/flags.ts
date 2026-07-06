import { FLAG_GETTERS, type FlagKey, type FlipRow } from './rows';

/**
 * One definition per filterable flag: what it means, how its badge is tinted
 * (status-tint palette, docs/design.md §1), and how to read it off a row.
 * The FilterBar chips and the FlipTable badges both render from this list so
 * a flag always keeps its name and hue.
 */
export interface FlagDef {
  key: FlagKey;
  label: string;
  title: string;
  /** Pill badge recipe for the desktop table. */
  badgeClass: string;
  /** Text-only tint for the phone card's meta line. */
  textClass: string;
  /** Rendered next to the item name instead of the Flags column. */
  inline?: boolean;
  get: (row: FlipRow) => boolean;
}

export const FLAG_DEFS: FlagDef[] = [
  {
    key: 'exempt',
    label: 'tax-free',
    title: 'Exempt from the 2% GE tax',
    badgeClass: 'bg-emerald-900/60 text-emerald-300',
    textClass: 'text-emerald-300',
    inline: true,
    get: FLAG_GETTERS.exempt,
  },
  {
    key: 'stale',
    label: 'stale',
    title: "One of the price sides hasn't updated recently",
    badgeClass: 'bg-zinc-700/60 text-zinc-300',
    textClass: 'text-zinc-300',
    get: FLAG_GETTERS.stale,
  },
  {
    key: 'thin',
    label: 'thin',
    title: 'Juicy margin on tiny volume — possible manipulation or unfillable offer',
    badgeClass: 'bg-red-900/60 text-red-300',
    textClass: 'text-red-300',
    get: FLAG_GETTERS.thin,
  },
  {
    key: 'unstable',
    label: 'unstable',
    title: 'Latest price disagrees sharply with the 1h average',
    badgeClass: 'bg-orange-900/60 text-orange-300',
    textClass: 'text-orange-300',
    get: FLAG_GETTERS.unstable,
  },
  {
    key: 'hot',
    label: 'hot',
    title: 'Trading well above its usual hourly volume right now',
    badgeClass: 'bg-purple-900/60 text-purple-300',
    textClass: 'text-purple-300',
    get: FLAG_GETTERS.hot,
  },
  {
    key: 'rising',
    label: 'rising',
    title: 'Mid price at least 3% above its 1h average',
    badgeClass: 'bg-emerald-900/60 text-emerald-300',
    textClass: 'text-emerald-300',
    get: FLAG_GETTERS.rising,
  },
  {
    key: 'falling',
    label: 'falling',
    title: 'Mid price at least 3% below its 1h average',
    badgeClass: 'bg-red-900/60 text-red-300',
    textClass: 'text-red-300',
    get: FLAG_GETTERS.falling,
  },
];

/** Flags shown as pills in the table's Flags column (exempt renders inline by the name). */
export const MARKET_FLAG_DEFS = FLAG_DEFS.filter((d) => !d.inline);
