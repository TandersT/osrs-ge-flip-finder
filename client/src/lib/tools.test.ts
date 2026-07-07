import { describe, expect, it } from 'vitest';
import type { ItemSnapshot } from '@osrs-flip/shared';
import type { ItemSetDef } from '../data/itemSets';
import type { MethodDef } from '@osrs-flip/shared';
import {
  computeAlchRows,
  computeDecantRows,
  computeMethodRows,
  computeSetRow,
  computeSetRows,
  resolveSetDefs,
  setDefsById,
  NATURE_RUNE_ID,
} from './tools';

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

describe('computeSetRows', () => {
  const setDef: ItemSetDef = {
    setId: 100,
    setName: 'Test armour set',
    pieces: [
      { id: 101, name: 'Test helm' },
      { id: 102, name: 'Test body' },
    ],
  };

  it('computes both directions post-tax and picks the better one', () => {
    const rows = computeSetRows(
      [
        item({ id: 100, name: 'Test armour set', low: 10_000, high: 12_000, volume1h: 50 }),
        item({ id: 101, name: 'Test helm', low: 4_000, high: 4_500, volume1h: 200 }),
        item({ id: 102, name: 'Test body', low: 5_000, high: 5_500, volume1h: 300 }),
      ],
      cfg,
      [setDef],
      [],
    );
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    // combine: sell set 11,999 - tax 239 - buy pieces (4,001+5,001) = 2,758
    expect(r.combineMargin).toBe(11_999 - 239 - 9_002);
    // split: sell pieces (4,499-89)+(5,499-109) - buy set 10,001 = -201
    expect(r.splitMargin).toBe(4_410 + 5_390 - 10_001);
    expect(r.best).toBe('combine');
    expect(r.via).toBe('GE clerk');
    expect(r.volume1h).toBe(50); // least liquid leg is the set itself
    // raw GE offer prices surfaced for the buy/sell columns (tax lives in the margins)
    expect(r.setBuy).toBe(10_001);
    expect(r.setSell).toBe(11_999);
    expect(r.piecesBuyTotal).toBe(4_001 + 5_001);
    expect(r.piecesSellTotal).toBe(4_499 + 5_499);
  });

  it('resolves inventory combinables by name and tags them', () => {
    const rows = computeSetRows(
      [
        item({ id: 200, name: 'Test godsword', low: 20_000, high: 25_000, volume1h: 40 }),
        item({ id: 201, name: 'Test blade', low: 8_000, high: 9_000, volume1h: 90 }),
        item({ id: 202, name: 'Test hilt', low: 10_000, high: 11_000, volume1h: 60 }),
      ],
      cfg,
      [],
      [{ result: 'Test godsword', pieces: ['Test blade', 'Test hilt'] }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.via).toBe('inventory');
    // combine: 24,999 - tax 499 - (8,001 + 10,001) = 6,498
    expect(rows[0]!.combineMargin).toBe(24_999 - 499 - 18_002);
    expect(rows[0]!.volume1h).toBe(40);
  });

  it('skips sets with unresolved or unpriced legs', () => {
    const noPrices = computeSetRows(
      [
        item({ id: 100, name: 'Test armour set', low: 10_000, high: 12_000 }),
        item({ id: 101, name: 'Test helm', low: null, high: null }),
        item({ id: 102, name: 'Test body', low: 5_000, high: 5_500 }),
      ],
      cfg,
      [setDef],
      [],
    );
    expect(noPrices).toHaveLength(0);
    expect(computeSetRows([], cfg, [setDef], [])).toHaveLength(0);
  });
});

describe('computeMethodRows', () => {
  const method: MethodDef = {
    id: 'test-clean',
    name: 'Clean test herb',
    category: 'Herblore',
    members: true,
    intensity: 'high',
    atGE: true,
    requirements: [{ skill: 'Herblore', level: 60 }],
    inputs: [{ name: 'Grimy test', qty: 1 }],
    outputs: [{ name: 'Clean test', qty: 1 }],
    actionsPerHour: 2_000,
  };
  const market = [
    item({ id: 1, name: 'Grimy test', low: 5_000, high: 5_200, volume1h: 900 }),
    item({ id: 2, name: 'Clean test', low: 5_400, high: 5_600, volume1h: 400 }),
  ];

  it('computes per-action and hourly profit post-tax', () => {
    const rows = computeMethodRows(market, cfg, undefined, [method]);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    // buy grimy 5,001; sell clean 5,599 - tax 111 = 5,488
    expect(r.costPerAction).toBe(5_001);
    expect(r.revenuePerAction).toBe(5_488);
    expect(r.gpPerHour).toBe((5_488 - 5_001) * 2_000);
    expect(r.volume1h).toBe(400);
    expect(r.meetsReqs).toBeNull(); // no character imported
  });

  it('marks requirements against imported levels and counts coin fees', () => {
    const fee: MethodDef = { ...method, id: 'fee', coinsPerAction: 100 };
    const [row] = computeMethodRows(market, cfg, { Herblore: 60 }, [fee]);
    expect(row!.meetsReqs).toBe(true);
    expect(row!.costPerAction).toBe(5_101);
    const [tooLow] = computeMethodRows(market, cfg, { Herblore: 59 }, [fee]);
    expect(tooLow!.meetsReqs).toBe(false);
  });

  it('skips methods whose items are missing or unpriced', () => {
    expect(computeMethodRows([market[0]!], cfg, undefined, [method])).toHaveLength(0);
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

describe('resolveSetDefs / computeSetRow / setDefsById', () => {
  const setDef: ItemSetDef = {
    setId: 100,
    setName: 'Test armour set',
    pieces: [
      { id: 101, name: 'Test helm' },
      { id: 102, name: 'Test body' },
    ],
  };
  const items = [
    item({ id: 100, name: 'Test armour set', low: 10_000, high: 12_000, volume1h: 50 }),
    item({ id: 101, name: 'Test helm', low: 4_000, high: 4_500, volume1h: 200 }),
    item({ id: 102, name: 'Test body', low: 5_000, high: 5_500, volume1h: 300 }),
    item({ id: 200, name: 'Test godsword', low: 20_000, high: 25_000, volume1h: 40 }),
    item({ id: 201, name: 'Test blade', low: 8_000, high: 9_000, volume1h: 90 }),
    item({ id: 202, name: 'Test hilt', low: 10_000, high: 11_000, volume1h: 60 }),
  ];
  const combos = [{ result: 'Test godsword', pieces: ['Test blade', 'Test hilt'] }];

  it('resolves GE sets by id and combos by name', () => {
    const resolved = resolveSetDefs(items, [setDef], combos);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.via).toBe('GE clerk');
    expect(resolved[1]!.via).toBe('inventory');
    expect(resolved[1]!.def.setId).toBe(200);
    expect(resolved[1]!.def.pieces.map((p) => p.id)).toEqual([201, 202]);
  });

  it('computeSetRow matches the corresponding computeSetRows entry', () => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const resolved = resolveSetDefs(items, [setDef], combos);
    const single = computeSetRow(byId, cfg, resolved[0]!);
    const fromAll = computeSetRows(items, cfg, [setDef], combos).find((r) => r.def.setId === 100);
    expect(single).toEqual(fromAll);
  });

  it('setDefsById maps set ids but not piece ids', () => {
    const map = setDefsById(items, [setDef], combos);
    expect(map.get(100)?.via).toBe('GE clerk');
    expect(map.get(200)?.via).toBe('inventory');
    expect(map.has(101)).toBe(false);
  });
});
