/**
 * The GEFF Deal Score — TRADE SECRET. This module never leaves the server;
 * the API exposes only the final 1–100 score plus qualitative hints.
 * Conceptually: expected hourly return, multiplicatively discounted by
 * everything that makes it less certain or more costly to earn.
 */
import type { Deal, FlipRow, MethodRow } from '@osrs-flip/shared';
import { geTax } from '@osrs-flip/shared';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0 at/below `lo`, 1 at/above `hi`, log-interpolated between. */
export function logRamp(value: number, lo: number, hi: number): number {
  if (value <= lo) return 0;
  return clamp01(Math.log(value / lo) / Math.log(hi / lo));
}

// --- The opinionated constants (do not document publicly) ---
const RETURN_FLOOR = 50_000;
const RETURN_CEIL = 5_000_000;
const LIQ_FLOOR = 10;
const LIQ_CEIL = 1_000;
const CAPITAL_START = 1_000_000;
const CAPITAL_FULL = 100_000_000;
const EFFORT: Record<'flip' | 'low' | 'medium' | 'high', number> = {
  flip: 1.0,
  low: 0.8,
  medium: 0.65,
  high: 0.45,
};
const FLAG_STALE = 0.3;
const FLAG_THIN = 0.25;
const FLAG_UNSTABLE = 0.5;
const METHOD_CONSISTENCY = 0.9;

interface Breakdown {
  return: number;
  liquidity: number;
  effort: number;
  capital: number;
  flags: number;
  consistency: number;
}

function combine(b: Breakdown): number {
  const product = b.return * b.liquidity * b.effort * b.capital * b.flags * b.consistency;
  return Math.max(1, Math.round(100 * product));
}

function capitalFactor(capital: number): number {
  return 1 - 0.5 * logRamp(capital, CAPITAL_START, CAPITAL_FULL);
}

/**
 * The shareable bits: up to two qualitative labels for whatever drags the
 * score down the most. No numbers, no factor names beyond plain language.
 */
function hints(b: Breakdown): string[] {
  const candidates: [number, string][] = [
    [b.liquidity, 'shallow market'],
    [b.effort, 'costs your attention'],
    [b.capital, 'big capital at risk'],
    [b.flags, 'risk flags'],
    [b.consistency, 'spread may be a blip'],
  ];
  return candidates
    .filter(([v]) => v < 0.75)
    .sort((a, b2) => a[0] - b2[0])
    .slice(0, 2)
    .map(([, label]) => label);
}

/** Spread consistency: current margin vs the margin implied by 1h averages. */
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
  const breakdown: Breakdown = {
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
    detail: `flip · margin ${flip.marginPerItem.toLocaleString('en-US')} gp`,
    hints: hints(breakdown),
  };
}

export function scoreMethod(row: MethodRow): Deal | null {
  if (row.gpPerHour <= 0) return null;

  const capital = row.costPerAction * row.def.actionsPerHour;
  const breakdown: Breakdown = {
    return: logRamp(row.gpPerHour, RETURN_FLOOR, RETURN_CEIL),
    liquidity: logRamp(row.volume1h, LIQ_FLOOR, LIQ_CEIL),
    effort: EFFORT[row.def.intensity],
    capital: capitalFactor(capital),
    flags: 1,
    consistency: METHOD_CONSISTENCY,
  };
  const intensityLabel =
    row.def.intensity === 'low' ? 'AFK' : row.def.intensity === 'medium' ? 'semi-AFK' : 'click-heavy';
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
    detail: `${row.def.category} · ${intensityLabel}`,
    hints: hints(breakdown),
    atGE: row.def.atGE,
    requirements: row.def.requirements,
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
