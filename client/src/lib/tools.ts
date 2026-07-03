import type { AppConfig, ItemSnapshot } from '@osrs-flip/shared';
import { geTax } from '@osrs-flip/shared';
import { COMBINES, type CombineDef } from '../data/combines';
import { ITEM_SETS, type ItemSetDef } from '../data/itemSets';
import { METHODS, type MethodDef } from '../data/methods';

export const NATURE_RUNE_ID = 561;
/** Casts/hour for High Level Alchemy (standard rate). */
export const ALCH_CASTS_PER_HOUR = 1_200;

export interface AlchRow {
  item: ItemSnapshot;
  buyAt: number;
  natureCost: number;
  /** highalch − buy − nature rune. */
  profitPerCast: number;
  gpPerHour: number;
}

/** All items where buying and alching beats the GE, sorted by profit. */
export function computeAlchRows(items: ItemSnapshot[], cfg: AppConfig): AlchRow[] {
  const nature = items.find((i) => i.id === NATURE_RUNE_ID);
  if (!nature || nature.low === null) return [];
  const natureCost = nature.low + cfg.offerOffset;

  const rows: AlchRow[] = [];
  for (const item of items) {
    if (item.highalch === null || item.highalch <= 0 || item.low === null) continue;
    if (item.id === NATURE_RUNE_ID) continue;
    const buyAt = item.low + cfg.offerOffset;
    const profitPerCast = item.highalch - buyAt - natureCost;
    rows.push({ item, buyAt, natureCost, profitPerCast, gpPerHour: profitPerCast * ALCH_CASTS_PER_HOUR });
  }
  rows.sort((a, b) => b.profitPerCast - a.profitPerCast);
  return rows;
}

export interface DecantRow {
  /** Potion family, e.g. "Prayer potion". */
  family: string;
  /** Buy this form… */
  buyDoses: number;
  buyAt: number;
  /** …decant and sell as this form. */
  sellDoses: number;
  sellAt: number;
  /** Post-tax profit per single dose moved through the flip. */
  marginPerDose: number;
  /** Convenience: margin on a 4-dose-equivalent. */
  marginPer4: number;
  /** Hourly volume of the LESS liquid side (the realistic constraint). */
  volume1h: number;
}

export interface SetRow {
  def: ItemSetDef;
  set: ItemSnapshot;
  /** How the exchange happens — both are doable at the GE. */
  via: 'GE clerk' | 'inventory';
  /** Buy the pieces, exchange at a GE clerk, sell the set (post-tax). */
  combineMargin: number;
  /** Buy the set, exchange, sell the pieces (post-tax each). */
  splitMargin: number;
  best: 'combine' | 'split';
  bestMargin: number;
  /** Hourly volume of the least liquid leg — the realistic constraint. */
  volume1h: number;
}

/**
 * GE clerks exchange sets <-> pieces for free, so any price gap between a set
 * and the sum of its pieces is arbitrage. Both directions computed per set.
 */
export function computeSetRows(
  items: ItemSnapshot[],
  cfg: AppConfig,
  sets: ItemSetDef[] = ITEM_SETS,
  combos: CombineDef[] = COMBINES,
): SetRow[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map(items.map((i) => [i.name, i]));
  const rows: SetRow[] = [];

  // inventory combinables resolve by name; unresolvable ones are skipped
  const comboDefs: { def: ItemSetDef; via: SetRow['via'] }[] = [];
  for (const c of combos) {
    const result = byName.get(c.result);
    const pieces = c.pieces.map((n) => byName.get(n));
    if (!result || pieces.some((p) => p === undefined)) continue;
    comboDefs.push({
      def: {
        setId: result.id,
        setName: result.name,
        pieces: (pieces as ItemSnapshot[]).map((p) => ({ id: p.id, name: p.name })),
      },
      via: 'inventory',
    });
  }

  const all: { def: ItemSetDef; via: SetRow['via'] }[] = [
    ...sets.map((def) => ({ def, via: 'GE clerk' as const })),
    ...comboDefs,
  ];

  for (const { def, via } of all) {
    const set = byId.get(def.setId);
    const pieces = def.pieces.map((p) => byId.get(p.id));
    if (!set || pieces.some((p) => p === undefined)) continue;
    if (set.low === null || set.high === null) continue;
    if (pieces.some((p) => p!.low === null || p!.high === null)) continue;

    const setBuy = set.low + cfg.offerOffset;
    const setSell = Math.max(1, set.high - cfg.offerOffset);
    let piecesBuy = 0;
    let piecesSellNet = 0;
    let minVolume = set.volume1h;
    for (const p of pieces as ItemSnapshot[]) {
      // non-null: the some() guard above already rejected null-priced pieces
      const pieceSell = Math.max(1, p.high! - cfg.offerOffset);
      piecesBuy += p.low! + cfg.offerOffset;
      piecesSellNet += pieceSell - geTax(p.taxExempt, pieceSell);
      minVolume = Math.min(minVolume, p.volume1h);
    }

    const combineMargin = setSell - geTax(set.taxExempt, setSell) - piecesBuy;
    const splitMargin = piecesSellNet - setBuy;
    const best = combineMargin >= splitMargin ? 'combine' : 'split';
    rows.push({
      def,
      via,
      set,
      combineMargin,
      splitMargin,
      best,
      bestMargin: Math.max(combineMargin, splitMargin),
      volume1h: minVolume,
    });
  }
  rows.sort((a, b) => b.bestMargin - a.bestMargin);
  return rows;
}

export interface MethodRow {
  def: MethodDef;
  /** Σ inputs at buy price + coin costs, per action. */
  costPerAction: number;
  /** Σ outputs at sell price minus tax, per action. */
  revenuePerAction: number;
  profitPerAction: number;
  gpPerHour: number;
  /** Hourly volume of the least liquid input/output. */
  volume1h: number;
  /** null when no character is imported. */
  meetsReqs: boolean | null;
}

/**
 * Live profit for each curated processing method; `levels` (from an imported
 * character) marks which methods the player can actually do.
 */
export function computeMethodRows(
  items: ItemSnapshot[],
  cfg: AppConfig,
  levels?: Record<string, number>,
  methods: MethodDef[] = METHODS,
): MethodRow[] {
  const byName = new Map(items.map((i) => [i.name, i]));
  const rows: MethodRow[] = [];

  for (const def of methods) {
    let cost = def.coinsPerAction ?? 0;
    let revenue = 0;
    let minVolume = Infinity;
    let resolvable = true;

    for (const input of def.inputs) {
      const item = byName.get(input.name);
      if (!item || item.low === null) {
        resolvable = false;
        break;
      }
      cost += (item.low + cfg.offerOffset) * input.qty;
      minVolume = Math.min(minVolume, item.volume1h);
    }
    if (resolvable) {
      for (const output of def.outputs) {
        const item = byName.get(output.name);
        if (!item || item.high === null) {
          resolvable = false;
          break;
        }
        const sellAt = Math.max(1, item.high - cfg.offerOffset);
        revenue += (sellAt - geTax(item.taxExempt, sellAt)) * output.qty;
        minVolume = Math.min(minVolume, item.volume1h);
      }
    }
    if (!resolvable) continue;

    const profitPerAction = revenue - cost;
    rows.push({
      def,
      costPerAction: cost,
      revenuePerAction: revenue,
      profitPerAction,
      gpPerHour: profitPerAction * def.actionsPerHour,
      volume1h: minVolume === Infinity ? 0 : minVolume,
      meetsReqs: levels
        ? def.requirements.every((r) => (levels[r.skill] ?? 1) >= r.level)
        : null,
    });
  }
  rows.sort((a, b) => b.gpPerHour - a.gpPerHour);
  return rows;
}

const DOSE_RE = /^(.+)\((\d)\)$/;

/**
 * Dose arbitrage: doses are conserved when decanting, so buy the cheapest
 * per-dose variant, decant, sell the priciest per-dose variant (after tax).
 * Best pair per family, sorted by margin per dose.
 */
export function computeDecantRows(items: ItemSnapshot[], cfg: AppConfig): DecantRow[] {
  const families = new Map<string, { doses: number; item: ItemSnapshot }[]>();
  for (const item of items) {
    const m = DOSE_RE.exec(item.name);
    if (!m) continue;
    const doses = Number(m[2]);
    if (doses < 1 || doses > 4) continue;
    const family = m[1]!.trim();
    if (!families.has(family)) families.set(family, []);
    families.get(family)!.push({ doses, item });
  }

  const rows: DecantRow[] = [];
  for (const [family, variants] of families) {
    if (variants.length < 2) continue;
    let best: DecantRow | null = null;
    for (const buy of variants) {
      if (buy.item.low === null) continue;
      const buyAt = buy.item.low + cfg.offerOffset;
      const costPerDose = buyAt / buy.doses;
      for (const sell of variants) {
        if (sell === buy || sell.item.high === null) continue;
        const sellAt = Math.max(1, sell.item.high - cfg.offerOffset);
        const netPerDose = (sellAt - geTax(sell.item.taxExempt, sellAt)) / sell.doses;
        const marginPerDose = netPerDose - costPerDose;
        if (best === null || marginPerDose > best.marginPerDose) {
          best = {
            family,
            buyDoses: buy.doses,
            buyAt,
            sellDoses: sell.doses,
            sellAt,
            marginPerDose,
            marginPer4: marginPerDose * 4,
            volume1h: Math.min(buy.item.volume1h, sell.item.volume1h),
          };
        }
      }
    }
    if (best !== null) rows.push(best);
  }
  rows.sort((a, b) => b.marginPerDose - a.marginPerDose);
  return rows;
}
