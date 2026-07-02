import { describe, expect, it } from 'vitest';
import type { ItemMapping } from '@osrs-flip/shared';
import { mergeItems } from './items.js';

const mapping: ItemMapping[] = [
  { id: 4151, name: 'Abyssal whip', members: true, limit: 70, value: 120001, highalch: 72000, icon: 'Abyssal whip.png' },
  { id: 13190, name: 'Old school bond', members: false },
  { id: 999999, name: 'Ghost item', members: false },
];

describe('mergeItems', () => {
  it('joins mapping, latest, 1h and volumes by item id', () => {
    const items = mergeItems(
      mapping,
      { '4151': { high: 1_500_000, highTime: 100, low: 1_480_000, lowTime: 90 } },
      { '4151': { avgHighPrice: 1_505_000, highPriceVolume: 700, avgLowPrice: 1_475_000, lowPriceVolume: 800 } },
      { '4151': 24_000 },
    );

    const whip = items.find((i) => i.id === 4151)!;
    expect(whip.high).toBe(1_500_000);
    expect(whip.low).toBe(1_480_000);
    expect(whip.volume1h).toBe(1_500);
    expect(whip.dailyVolume).toBe(24_000);
    expect(whip.limit).toBe(70);
    expect(whip.taxExempt).toBe(false);
  });

  it('never drops items with missing price/volume data — fields become null', () => {
    const items = mergeItems(mapping, {}, {}, {});
    expect(items).toHaveLength(3);
    const ghost = items.find((i) => i.id === 999999)!;
    expect(ghost.high).toBeNull();
    expect(ghost.low).toBeNull();
    expect(ghost.volume1h).toBe(0);
    expect(ghost.dailyVolume).toBeNull();
    expect(ghost.limit).toBeNull();
    expect(ghost.icon).toBeNull();
  });

  it('flags exempt items from the shared list', () => {
    const items = mergeItems(mapping, {}, {}, {});
    expect(items.find((i) => i.id === 13190)!.taxExempt).toBe(true);
  });

  it('handles null high/low inside latest (thinly traded)', () => {
    const items = mergeItems(
      mapping,
      { '4151': { high: null, highTime: null, low: 5, lowTime: 50 } },
      {},
      {},
    );
    const whip = items.find((i) => i.id === 4151)!;
    expect(whip.high).toBeNull();
    expect(whip.low).toBe(5);
  });
});
