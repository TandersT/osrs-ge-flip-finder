import type { AppConfig, ItemSnapshot } from '@osrs-flip/shared';
import { geTax } from '@osrs-flip/shared';

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
