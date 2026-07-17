import { describe, expect, it } from 'vitest';
import type {
  DivergenceDeal,
  ItemCategory,
  ItemSnapshot,
  TimeseriesPoint,
} from '@osrs-flip/shared';
import {
  alignPair,
  attachPatchBadges,
  computeDivergence,
  computePair,
  dailyMids,
  parseRecentUpdates,
  scanEpisodes,
  spreadZSeries,
  weeklyLogReturns,
} from './divergence.js';

const DAY = 86_400;
const T0 = 1_700_000_000;

/** Synthetic daily series: price(i) drives both sides of the day's mid. */
export function mkSeries(days: number, price: (i: number) => number): TimeseriesPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    timestamp: T0 + i * DAY,
    avgHighPrice: Math.round(price(i) * 101) / 100,
    avgLowPrice: Math.round(price(i) * 99) / 100,
    highPriceVolume: 500,
    lowPriceVolume: 500,
  }));
}

describe('dailyMids', () => {
  it('averages high/low, falls back to the present side, drops empty days', () => {
    const pts: TimeseriesPoint[] = [
      { timestamp: 1, avgHighPrice: 110, avgLowPrice: 90, highPriceVolume: 1, lowPriceVolume: 1 },
      { timestamp: 2, avgHighPrice: null, avgLowPrice: 80, highPriceVolume: 0, lowPriceVolume: 1 },
      {
        timestamp: 3,
        avgHighPrice: null,
        avgLowPrice: null,
        highPriceVolume: 0,
        lowPriceVolume: 0,
      },
    ];
    expect(dailyMids(pts)).toEqual([
      { t: 1, mid: 100 },
      { t: 2, mid: 80 },
    ]);
  });
});

describe('alignPair', () => {
  it('joins on timestamp and skips days either side is missing', () => {
    const a = [
      { t: 1, mid: 10 },
      { t: 2, mid: 11 },
      { t: 4, mid: 12 },
    ];
    const b = [
      { t: 2, mid: 20 },
      { t: 3, mid: 21 },
      { t: 4, mid: 22 },
    ];
    expect(alignPair(a, b)).toEqual([
      { t: 2, a: 11, b: 20 },
      { t: 4, a: 12, b: 22 },
    ]);
  });
});

describe('weeklyLogReturns', () => {
  it('takes non-overlapping 7-step log returns, newest-aligned', () => {
    // 15 values 100..114: two full windows fit, anchored at the newest value
    const values = Array.from({ length: 15 }, (_, i) => 100 + i);
    const rs = weeklyLogReturns(values);
    expect(rs).toHaveLength(2);
    expect(rs[1]).toBeCloseTo(Math.log(114 / 107), 9);
    expect(rs[0]).toBeCloseTo(Math.log(107 / 100), 9);
  });

  it('returns empty when under 8 values', () => {
    expect(weeklyLogReturns([1, 2, 3, 4, 5, 6, 7])).toEqual([]);
  });
});

describe('spreadZSeries', () => {
  it('is null until the window fills, then z-scores the log spread', () => {
    // flat ratio for 10 days, then a jump: z must spike positive at the end
    const aligned = Array.from({ length: 11 }, (_, i) => ({
      t: i,
      a: i === 10 ? 150 : 100 + (i % 2), // tiny wobble so variance is nonzero
      b: 100,
    }));
    const z = spreadZSeries(aligned, 10);
    expect(z.slice(0, 9).every((v) => v === null)).toBe(true);
    expect(z[9]).not.toBeNull();
    expect(z[10]!).toBeGreaterThan(2);
  });
});

describe('scanEpisodes', () => {
  it('counts entry->close cycles and their durations', () => {
    const z = [0, 0.3, 2.4, 2.1, 1.4, 0.4, 0.1, -2.2, -1.0, -0.3, 0];
    // episode 1: idx2 -> closes idx5 (3 days); episode 2: idx7 -> closes idx9 (2 days)
    const stats = scanEpisodes(z, 2, 0.5, 30);
    expect(stats).toEqual({ count: 2, closedWithin30d: 2, medianDays: 2.5 });
  });

  it('drops the live episode still open at the end, keeps slow closers in count only', () => {
    const slow = Array.from({ length: 40 }, (_, i) => (i === 0 ? 2.5 : 1.5));
    slow.push(0.4); // closes after 40 days: counted, but not within 30
    const live = [...slow, 0, 2.6, 2.4]; // reopens at the end: live, dropped
    const stats = scanEpisodes(live, 2, 0.5, 30);
    expect(stats.count).toBe(1);
    expect(stats.closedWithin30d).toBe(0);
    expect(stats.medianDays).toBe(40);
  });

  it('skips null gaps without breaking state', () => {
    const z = [null, null, 2.5, null, 2.2, 0.2];
    expect(scanEpisodes(z, 2, 0.5, 30).count).toBe(1);
  });
});

/** Minimal live snapshot for tests; override what a case cares about. */
function mkItem(id: number, name: string, over: Partial<ItemSnapshot> = {}): ItemSnapshot {
  return {
    id,
    name,
    icon: `${name}.png`,
    members: true,
    limit: 10_000,
    value: null,
    highalch: null,
    high: 1_050,
    highTime: T0,
    low: 1_000,
    lowTime: T0,
    avgHighPrice1h: null,
    avgLowPrice1h: null,
    volume1h: 0,
    dailyVolume: 50_000,
    taxExempt: false,
    ...over,
  };
}

/** Shared market wave both legs of a healthy pair follow. */
const wave = (i: number) => 1_000 + 150 * Math.sin(i / 9);
/** Small independent wobble so pair spreads have nonzero variance. */
const wobble = (i: number) => 1 + 0.01 * Math.sin(i / 5);

describe('computePair', () => {
  it('qualifies co-moving pairs and reports no signal when the spread is normal', () => {
    const a = dailyMids(mkSeries(365, wave));
    const b = dailyMids(mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i)));
    const pair = computePair(a, b);
    expect(pair.eligible).toBe(true);
    expect(pair.weeklyR!).toBeGreaterThan(0.4);
    expect(Math.abs(pair.z!)).toBeLessThan(2);
  });

  it('rejects pairs with insufficient overlap or low correlation', () => {
    const short = dailyMids(mkSeries(100, wave));
    expect(computePair(short, short).eligible).toBe(false);
    const a = dailyMids(mkSeries(365, wave));
    const noise = dailyMids(mkSeries(365, (i) => 1_000 + 300 * Math.sin(i / 2.3 + 1)));
    const pair = computePair(a, noise);
    expect(pair.eligible).toBe(false);
    expect(pair.z).toBeNull();
  });

  it('flags a leg that breaks away downward', () => {
    const a = dailyMids(mkSeries(365, wave));
    const drop = (i: number) => wave(i) * wobble(i) * (i >= 350 ? 1 - 0.015 * (i - 350) : 1);
    const pair = computePair(dailyMids(mkSeries(365, drop)), a);
    expect(pair.eligible).toBe(true);
    expect(pair.z!).toBeLessThanOrEqual(-2); // a-leg (the dropper) is cheap
  });
});

describe('computeDivergence', () => {
  const CATS: ItemCategory[] = [
    { id: 'test-fish', label: 'Test fish', members: ['Alpha fish', 'Beta fish', 'Gamma fish'] },
  ];
  const alpha = mkItem(1, 'Alpha fish');
  const beta = mkItem(2, 'Beta fish');
  const gamma = mkItem(3, 'Gamma fish');
  const flipCfg = { captureRate: 0.1, offerOffset: 1 };

  function series(drop: boolean) {
    const gammaPrice = (i: number) =>
      (wave(i) * 0.8 + 200) * wobble(i) * (drop && i >= 350 ? 1 - 0.015 * (i - 350) : 1);
    return new Map([
      [1, mkSeries(365, wave)],
      [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
      [3, mkSeries(365, gammaPrice)],
    ]);
  }

  it('aggregates flagged pairs into a laggard deal with evidence', () => {
    const { deals, groups } = computeDivergence(CATS, [alpha, beta, gamma], series(true), flipCfg);
    expect(deals).toHaveLength(1);
    const deal = deals[0]!;
    expect(deal.itemId).toBe(3);
    expect(deal.groupId).toBe('test-fish');
    expect(deal.laggingPairs).toBeGreaterThanOrEqual(1);
    expect(deal.eligiblePairs).toBe(2);
    expect(deal.pairs[0]!.z).toBeLessThanOrEqual(-2);
    expect(deal.pairs[0]!.series90).toHaveLength(90);
    expect(deal.pairs[0]!.series90![0]!.item).toBeCloseTo(1, 6); // normalized to window start
    expect(deal.headline.item30d!).toBeLessThan(deal.headline.peersMedian30d!);
    expect(deal.buy).toBe(1_001); // low + offerOffset
    expect(deal.sell).toBe(1_049); // high - offerOffset
    expect(deal.margin).not.toBeNull();
    // groups panel reflects the same build
    expect(groups).toHaveLength(1);
    expect(groups[0]!.eligiblePairs).toBeGreaterThanOrEqual(2);
    expect(groups[0]!.members.every((m) => !m.missing)).toBe(true);
  });

  it('returns no deals when everything tracks', () => {
    const { deals } = computeDivergence(CATS, [alpha, beta, gamma], series(false), flipCfg);
    expect(deals).toHaveLength(0);
  });

  it('enforces the volume floor', () => {
    const thinGamma = mkItem(3, 'Gamma fish', { dailyVolume: 500 });
    const { deals, groups } = computeDivergence(
      CATS,
      [alpha, beta, thinGamma],
      series(true),
      flipCfg,
    );
    expect(deals).toHaveLength(0);
    const member = groups[0]!.members.find((m) => m.name === 'Gamma fish')!;
    expect(member.eligible).toBe(false);
    expect(member.missing).toBe(false);
  });

  it('marks unresolved names and missing series as missing', () => {
    const { deals, groups } = computeDivergence(
      CATS,
      [alpha, beta], // gamma not in the mapping at all
      new Map([
        [1, mkSeries(365, wave)],
        [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
      ]),
      flipCfg,
    );
    expect(deals).toHaveLength(0); // remaining pair tracks fine
    const member = groups[0]!.members.find((m) => m.name === 'Gamma fish')!;
    expect(member.missing).toBe(true);
    expect(member.itemId).toBeNull();
  });

  it('marks a resolved member missing (with its real itemId) when only its series is absent', () => {
    // gamma resolves via `items`, but seriesById has no entry for its id: distinct
    // from the unresolved-name case above, which reports itemId: null.
    const { deals, groups } = computeDivergence(
      CATS,
      [alpha, beta, gamma],
      new Map([
        [1, mkSeries(365, wave)],
        [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
        // no entry for id 3
      ]),
      flipCfg,
    );
    expect(deals).toHaveLength(0); // alpha/beta pair tracks fine
    const member = groups[0]!.members.find((m) => m.name === 'Gamma fish')!;
    expect(member.missing).toBe(true);
    expect(member.itemId).toBe(3);
  });

  it('flags the quiet item when a peer soars (the shark-vs-turtle case)', () => {
    const soar = new Map([
      [1, mkSeries(365, (i) => wave(i) * wobble(i))],
      [2, mkSeries(365, (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3))],
      [
        3,
        mkSeries(
          365,
          (i) => (wave(i) * 0.8 + 200) * wobble(i / 3 + 1) * (i >= 350 ? 1 + 0.015 * (i - 350) : 1),
        ),
      ],
    ]);
    const { deals } = computeDivergence(CATS, [alpha, beta, gamma], soar, flipCfg);
    // gamma soared: the deal (if the gate passes) must be a QUIET item, never gamma
    for (const d of deals) expect(d.itemId).not.toBe(3);
  });

  it('direction gate: a flagged laggard whose 30d change beats its peers median is not listed', () => {
    // Alpha (L) is quiet; Beta (P1) soars late so the L-P1 spread genuinely
    // flags L as the cheap leg. But Gamma (P2) crashes even harder, so the
    // median 30d change across L's peers (P1 way up, P2 way down) lands
    // below L's own ~flat 30d change — the direction-sanity gate must block L.
    const seriesL = mkSeries(365, (i) => wave(i) * wobble(i));
    const seriesP1 = mkSeries(
      365,
      (i) => (wave(i) * 0.6 + 400) * wobble(i / 2 + 3) * (i >= 345 ? 1 + 0.012 * (i - 345) : 1),
    );
    const seriesP2 = mkSeries(
      365,
      (i) => (wave(i) * 0.8 + 200) * wobble(i / 3 + 1) * (i >= 340 ? 1 - 0.013 * (i - 340) : 1),
    );

    // Prove the L-P1 pair genuinely flags, with L (alpha) as the cheap leg.
    const pairLP1 = computePair(dailyMids(seriesL), dailyMids(seriesP1));
    expect(pairLP1.eligible).toBe(true);
    expect(pairLP1.z!).toBeLessThanOrEqual(-2);

    const { deals } = computeDivergence(
      CATS,
      [alpha, beta, gamma],
      new Map([
        [1, seriesL],
        [2, seriesP1],
        [3, seriesP2],
      ]),
      flipCfg,
    );

    // The gate blocks alpha even though it was flagged as a cheap leg vs beta.
    expect(deals.some((d) => d.itemId === 1)).toBe(false);
    // Sanity guard so this can't pass vacuously: gamma crashed harder than
    // both peers, so it genuinely lags and must list.
    expect(deals.length).toBeGreaterThan(0);
  });
});

describe('patch badges', () => {
  const nameToId = new Map([
    ['shark', 385],
    ['sea turtle', 397],
  ]);
  const page = (pageid: number, title: string, date: string, body: string) => ({
    pageid,
    title,
    // parseUpdateTemplate reads the category via a `category=` param (not `type=`)
    // and the date via parseWikiDate("12 July 2026") — mirror both exactly.
    wikitext: `{{Update|date=${date}|category=game}}\n${body}`,
  });

  it('keeps only recent game updates and resolves linked items', () => {
    const updates = parseRecentUpdates(
      [
        page(1, 'Update:Fishing Rework', '12 July 2026', 'The [[Shark]] spawn rate changed.'),
        page(2, 'Update:Ancient News', '1 January 2020', '[[Shark]] nerf of old.'),
        page(3, 'Update:No Items Here', '13 July 2026', 'Only [[Sailing]] things.'),
      ],
      nameToId,
      '2026-07-01',
    );
    expect(updates).toHaveLength(2);
    const fishing = updates.find((u) => u.title === 'Fishing Rework')!;
    expect(fishing.date).toBe('2026-07-12');
    expect(fishing.url).toContain('Fishing_Rework');
    expect([...fishing.mentions]).toEqual([385]);
  });

  it('badges deals whose laggard or flagged peer is mentioned, newest update first', () => {
    const deal = (itemId: number, peerId: number): DivergenceDeal => ({
      itemId,
      name: `item-${itemId}`,
      icon: null,
      groupId: 'g',
      groupLabel: 'G',
      laggingPairs: 1,
      eligiblePairs: 1,
      headline: { item30d: -0.1, peersMedian30d: 0.05 },
      pairs: [
        {
          peerId,
          peerName: `item-${peerId}`,
          z: -2.5,
          weeklyR: 0.8,
          episodes: { count: 0, closedWithin30d: 0, medianDays: null },
        },
      ],
      buy: null,
      sell: null,
      margin: null,
    });
    const updates = [
      { title: 'Old', date: '2026-07-02', url: 'u1', mentions: new Set([397]) },
      { title: 'New', date: '2026-07-12', url: 'u2', mentions: new Set([397]) },
    ];
    const [laggardHit, peerHit, noHit] = attachPatchBadges(
      [deal(397, 385), deal(1, 397), deal(1, 2)],
      updates,
    );
    expect(laggardHit!.patch?.title).toBe('New'); // newest wins
    expect(peerHit!.patch?.title).toBe('New'); // peer mention badges too
    expect(noHit!.patch).toBeUndefined();
  });
});
