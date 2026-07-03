import { describe, expect, it } from 'vitest';
import type { ItemSnapshot } from '@osrs-flip/shared';
import { computeAlchRows, computeDecantRows, NATURE_RUNE_ID } from './tools';

const cfg = { captureRate: 0.1, offerOffset: 1, clientRefreshSeconds: 60, staleAfterSeconds: 1800 };

function item(over: Partial<ItemSnapshot>): ItemSnapshot {
  return {
    id: 1,
    name: 'Test',
    icon: null,
    members: false,
    limit: null,
    value: null,
    highalch: null,
    high: null,
    highTime: null,
    low: null,
    lowTime: null,
    avgHighPrice1h: null,
    avgLowPrice1h: null,
    volume1h: 100,
    dailyVolume: null,
    taxExempt: false,
    ...over,
  };
}

const nature = item({ id: NATURE_RUNE_ID, name: 'Nature rune', low: 129, high: 131 });

describe('computeAlchRows', () => {
  it('computes profit per cast against the live nature rune', () => {
    const yewLong = item({ id: 858, name: 'Yew longbow', highalch: 768, low: 500 });
    const rows = computeAlchRows([nature, yewLong], cfg);
    expect(rows).toHaveLength(1);
    // 768 - (500+1) - (129+1) = 137
    expect(rows[0]!.profitPerCast).toBe(137);
    expect(rows[0]!.gpPerHour).toBe(137 * 1200);
  });

  it('skips items without alch value or price, and nature rune itself', () => {
    const rows = computeAlchRows(
      [nature, item({ id: 2, highalch: null, low: 10 }), item({ id: 3, highalch: 100, low: null })],
      cfg,
    );
    expect(rows).toHaveLength(0);
  });

  it('returns empty when the nature rune price is unknown', () => {
    expect(computeAlchRows([item({ id: 858, highalch: 768, low: 500 })], cfg)).toHaveLength(0);
  });
});

describe('computeDecantRows', () => {
  it('finds the best per-dose arbitrage inside a potion family', () => {
    const p3 = item({ id: 10, name: 'Prayer potion(3)', low: 9_000, high: 9_100, volume1h: 500 });
    const p4 = item({ id: 11, name: 'Prayer potion(4)', low: 11_900, high: 12_600, volume1h: 800 });
    const rows = computeDecantRows([p3, p4], cfg);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.family).toBe('Prayer potion');
    // buy (3) at 9001 -> 3000.33/dose; sell (4) at 12599, tax 251 -> 3087/dose
    expect(r.buyDoses).toBe(3);
    expect(r.sellDoses).toBe(4);
    expect(r.marginPerDose).toBeCloseTo(12_348 / 4 - 9_001 / 3, 2);
    expect(r.volume1h).toBe(500); // constrained by the less liquid side
  });

  it('needs two priced variants and ignores non-dose items', () => {
    const solo = item({ id: 10, name: 'Prayer potion(3)', low: 9_000, high: 9_100 });
    const whip = item({ id: 4151, name: 'Abyssal whip', low: 1, high: 2 });
    expect(computeDecantRows([solo, whip], cfg)).toHaveLength(0);
  });
});
