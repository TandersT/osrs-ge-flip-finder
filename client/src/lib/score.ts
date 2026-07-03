import type { FlipRow } from './rows';
import type { MethodRow } from './tools';
import { geTax } from '@osrs-flip/shared';

/**
 * The GEFF Deal Score (1–100): one OPINIONATED number ranking every way to
 * make money right now — flips and bankstand methods on the same scale.
 *
 * Philosophy: expected hourly return, multiplicatively discounted by
 * everything that makes that return less certain or more costly to earn:
 * shallow markets, active click-time, big capital at risk, risk flags, and
 * spreads that didn't exist an hour ago. Tax is already inside every margin.
 * 100 ≈ a liquid, passive, cheap-to-enter, flag-free flip printing millions
 * per hour on a stable spread.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0 at/below `lo`, 1 at/above `hi`, log-interpolated between. */
export function logRamp(value: number, lo: number, hi: number): number {
  if (value <= lo) return 0;
  return clamp01(Math.log(value / lo) / Math.log(hi / lo));
}

// --- Opinionated constants (documented in the FAQ) ---
/** gp/hour mapping: below the floor isn't worth the GE trip; the ceiling is "great". */
const RETURN_FLOOR = 50_000;
const RETURN_CEIL = 5_000_000;
/** Min-leg hourly volume: full marks at 1000+/h. */
const LIQ_FLOOR = 10;
const LIQ_CEIL = 1_000;
/** Capital in motion per hour: penalty starts at 1m, bottoms at ×0.5 from 100m. */
const CAPITAL_START = 1_000_000;
const CAPITAL_FULL = 100_000_000;
/** Active-time multipliers — flips are passive, methods cost your attention. */
const EFFORT: Record<'flip' | 'low' | 'medium' | 'high', number> = {
  flip: 1.0,
  low: 0.8,
  medium: 0.65,
  high: 0.45,
};
/** Risk-flag multipliers (flips). */
const FLAG_STALE = 0.3;
const FLAG_THIN = 0.25;
const FLAG_UNSTABLE = 0.5;
/** Methods carry flat rate-estimate uncertainty instead of spread consistency. */
const METHOD_CONSISTENCY = 0.9;

export interface DealBreakdown {
  return: number;
  liquidity: number;
  effort: number;
  capital: number;
  flags: number;
  consistency: number;
}

export interface Deal {
  kind: 'flip' | 'method';
  /** Item id for flips; method id for methods. */
  id: string;
  name: string;
  icon: string | null;
  /** Route to open on click. */
  link: string;
  score: number;
  gpPerHour: number;
  /** Capital in motion per hour of working the deal. */
  capital: number;
  volume1h: number;
  breakdown: DealBreakdown;
  /** Short detail line, e.g. "margin +2.4k · buy 12k" or "Herblore · semi-AFK". */
  detail: string;
}

function combine(breakdown: DealBreakdown): number {
  const product =
    breakdown.return *
    breakdown.liquidity *
    breakdown.effort *
    breakdown.capital *
    breakdown.flags *
    breakdown.consistency;
  return Math.max(1, Math.round(100 * product));
}

function capitalFactor(capital: number): number {
  return 1 - 0.5 * logRamp(capital, CAPITAL_START, CAPITAL_FULL);
}

/**
 * Spread consistency: does the CURRENT margin agree with the margin implied
 * by the last hour's average prices? A spread that wasn't there an hour ago
 * is probably a blip. Maps to 0.4–1.0; unknowable → 0.7.
 */
export function flipConsistency(row: FlipRow): number {
  if (row.flip === null) return 0.7;
  if (row.avgHighPrice1h === null || row.avgLowPrice1h === null) return 0.7;
  const avgSell = Math.max(1, row.avgHighPrice1h - 1);
  const avgBuy = row.avgLowPrice1h + 1;
  const avgMargin = avgSell - avgBuy - geTax(row.taxExempt, avgSell);
  const current = row.flip.marginPerItem;
  const scale = Math.max(Math.abs(avgMargin), 0.25 * Math.abs(current), 1);
  const agreement = 1 - Math.min(1, Math.abs(current - avgMargin) / scale);
  return 0.4 + 0.6 * agreement;
}

export function scoreFlip(row: FlipRow): Deal | null {
  const flip = row.flip;
  if (flip === null || flip.gpPerHour === null || flip.gpPerHour <= 0) return null;
  if (flip.feasibleQtyPer4h === null || flip.feasibleQtyPer4h < 1) return null;

  const capital = (flip.buyAt * flip.feasibleQtyPer4h) / 4;
  const breakdown: DealBreakdown = {
    return: logRamp(flip.gpPerHour, RETURN_FLOOR, RETURN_CEIL),
    liquidity: logRamp(row.volume1h, LIQ_FLOOR, LIQ_CEIL),
    effort: EFFORT.flip,
    capital: capitalFactor(capital),
    flags:
      (row.isStale ? FLAG_STALE : 1) *
      (row.isThin ? FLAG_THIN : 1) *
      (row.isUnstable ? FLAG_UNSTABLE : 1),
    consistency: flipConsistency(row),
  };
  return {
    kind: 'flip',
    id: `flip-${row.id}`,
    name: row.name,
    icon: row.icon,
    link: `/item/${row.id}`,
    score: combine(breakdown),
    gpPerHour: flip.gpPerHour,
    capital,
    volume1h: row.volume1h,
    breakdown,
    detail: `flip · margin ${flip.marginPerItem.toLocaleString('en-US')} gp`,
  };
}

export function scoreMethod(row: MethodRow): Deal | null {
  if (row.gpPerHour <= 0) return null;
  if (row.meetsReqs === false) return null; // the imported character can't do it

  const capital = row.costPerAction * row.def.actionsPerHour;
  const breakdown: DealBreakdown = {
    return: logRamp(row.gpPerHour, RETURN_FLOOR, RETURN_CEIL),
    liquidity: logRamp(row.volume1h, LIQ_FLOOR, LIQ_CEIL),
    effort: EFFORT[row.def.intensity],
    capital: capitalFactor(capital),
    flags: 1,
    consistency: METHOD_CONSISTENCY,
  };
  return {
    kind: 'method',
    id: row.def.id,
    name: row.def.name,
    icon: null,
    link: '/tools?tool=methods',
    score: combine(breakdown),
    gpPerHour: row.gpPerHour,
    capital,
    volume1h: row.volume1h,
    breakdown,
    detail: `${row.def.category} · ${row.def.intensity === 'low' ? 'AFK' : row.def.intensity === 'medium' ? 'semi-AFK' : 'click-heavy'}`,
  };
}

/** One ranked list across every opportunity type. */
export function rankDeals(flips: FlipRow[], methods: MethodRow[]): Deal[] {
  const deals: Deal[] = [];
  for (const f of flips) {
    const d = scoreFlip(f);
    if (d !== null) deals.push(d);
  }
  for (const m of methods) {
    const d = scoreMethod(m);
    if (d !== null) deals.push(d);
  }
  deals.sort((a, b) => b.score - a.score || b.gpPerHour - a.gpPerHour);
  return deals;
}

export function describeBreakdown(b: DealBreakdown): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return [
    `return ${pct(b.return)}`,
    `liquidity ${pct(b.liquidity)}`,
    `effort ×${b.effort}`,
    `capital ×${b.capital.toFixed(2)}`,
    `flags ×${b.flags.toFixed(2)}`,
    `consistency ×${b.consistency.toFixed(2)}`,
  ].join(' · ');
}
