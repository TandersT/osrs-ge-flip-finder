import { describe, expect, it } from 'vitest';
import { atLimit, ENTITLEMENTS, getEntitlements } from './tiers.js';

describe('entitlements', () => {
  it('premium is a strict superset of free', () => {
    const free = ENTITLEMENTS.free;
    const premium = ENTITLEMENTS.premium;
    // every numeric cap is lifted, every boolean is enabled
    for (const key of Object.keys(premium) as (keyof typeof premium)[]) {
      const p = premium[key];
      const f = free[key];
      if (typeof p === 'boolean') {
        expect(p, key).toBe(true); // premium enables every boolean
      } else {
        expect(p, key).toBeNull(); // premium lifts every cap
        expect(f, key).not.toBeNull(); // free has a real cap for each
      }
    }
  });

  it('free caps are positive so the tier stays usable', () => {
    const free = getEntitlements('free');
    expect(free.watchlistMax).toBeGreaterThan(0);
    expect(free.fliplogMax).toBeGreaterThan(0);
    expect(free.historyDays).toBeGreaterThanOrEqual(30);
    expect(free.longtermRows).toBeGreaterThan(0);
  });

  it('atLimit handles capped and unlimited values', () => {
    expect(atLimit(5, 5)).toBe(true);
    expect(atLimit(4, 5)).toBe(false);
    expect(atLimit(9_999, null)).toBe(false);
  });

  it('gates patch analysis to premium only', () => {
    expect(getEntitlements('free').patchAnalysis).toBe(false);
    expect(getEntitlements('premium').patchAnalysis).toBe(true);
  });
});
