import { describe, expect, it } from 'vitest';
import { buildRows } from './rows.js';
import type { AppConfig, ItemSnapshot } from './types.js';

const cfg: AppConfig = {
  captureRate: 0.1,
  offerOffset: 1,
  clientRefreshSeconds: 60,
  staleAfterSeconds: 1800,
};

const NOW = 1_000_000;

function snapshot(overrides: Partial<ItemSnapshot> = {}): ItemSnapshot {
  return {
    id: 1,
    name: 'Test item',
    icon: null,
    members: false,
    limit: 100,
    value: null,
    highalch: null,
    high: 1_100,
    highTime: NOW - 60,
    low: 1_000,
    lowTime: NOW - 60,
    avgHighPrice1h: 1_100,
    avgLowPrice1h: 1_000,
    volume1h: 500,
    dailyVolume: 12_000,
    taxExempt: false,
    ...overrides,
  };
}

const row = (overrides: Partial<ItemSnapshot> = {}) => buildRows([snapshot(overrides)], cfg, NOW)[0]!;

describe('market flags', () => {
  it('hot: 1h volume above 2× the usual hourly pace, with a volume floor', () => {
    // 12k/day = 500/h pace; 1,001 > 2×500
    expect(row({ volume1h: 1_001 }).isHot).toBe(true);
    expect(row({ volume1h: 1_000 }).isHot).toBe(false);
    // below the 50-unit floor, a "surge" on a dead item doesn't count
    expect(row({ volume1h: 49, dailyVolume: 100 }).isHot).toBe(false);
    // unknown daily volume: no baseline, no flag
    expect(row({ volume1h: 5_000, dailyVolume: null }).isHot).toBe(false);
  });

  it('rising/falling: latest mid drifting ≥3% from the 1h-average mid', () => {
    // avg mid 1050; latest mid 1100 = +4.8%
    const rising = row({ high: 1_150, low: 1_050 });
    expect(rising.isRising).toBe(true);
    expect(rising.isFalling).toBe(false);
    // latest mid 1000 = −4.8%
    const falling = row({ high: 1_050, low: 950 });
    expect(falling.isFalling).toBe(true);
    expect(falling.isRising).toBe(false);
    // +2% drift is within the calm band
    const calm = row({ high: 1_121, low: 1_021 });
    expect(calm.isRising).toBe(false);
    expect(calm.isFalling).toBe(false);
    // missing a side: no drift signal
    const oneSided = row({ high: null, highTime: null });
    expect(oneSided.isRising).toBe(false);
    expect(oneSided.isFalling).toBe(false);
  });

  it('existing flags still hold: stale by age, thin by roi-on-no-volume', () => {
    expect(row({ highTime: NOW - 3_600, lowTime: NOW - 3_600 }).isStale).toBe(true);
    expect(row({}).isStale).toBe(false);
    // 25% ROI on 10 units/h
    const thin = row({ low: 1_000, high: 1_300, volume1h: 10, dailyVolume: 100 });
    expect(thin.isThin).toBe(true);
  });

  it('fat/whale/prime: large margins keyed off ROI (share of the buy price)', () => {
    // default snapshot is ~7.7% ROI — below the 10% "fat" line
    expect(row({}).isFat).toBe(false);
    // ~15.5% ROI on 500 units/h: fat and fillable (prime), but not a whale
    const fat = row({ low: 1_000, high: 1_180 });
    expect(fat.isFat).toBe(true);
    expect(fat.isPrime).toBe(true);
    expect(fat.isWhale).toBe(false);
    // ~37% ROI clears the whale line too
    const whale = row({ low: 1_000, high: 1_400 });
    expect(whale.isWhale).toBe(true);
    expect(whale.isFat).toBe(true);
    // a fat margin on fewer than 50 units/h is not "prime" — can't reliably fill
    const illiquid = row({ low: 1_000, high: 1_180, volume1h: 49 });
    expect(illiquid.isFat).toBe(true);
    expect(illiquid.isPrime).toBe(false);
  });
});
