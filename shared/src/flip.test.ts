import { describe, expect, it } from 'vitest';
import { computeFlip, computeFlipFromPrices } from './flip.js';

const cfg = { captureRate: 0.1, offerOffset: 1 };

describe('computeFlip', () => {
  it('computes post-tax margin, roi and throughput', () => {
    // Buy at 981, sell at 1099; tax at 1099 = 21
    const flip = computeFlip(
      { low: 980, high: 1100, isExempt: false, buyLimit: 100, volumePer4h: 5000 },
      cfg,
    );
    expect(flip).not.toBeNull();
    expect(flip!.buyAt).toBe(981);
    expect(flip!.sellAt).toBe(1099);
    expect(flip!.tax).toBe(21);
    expect(flip!.marginPerItem).toBe(1099 - 981 - 21);
    expect(flip!.roi).toBeCloseTo(97 / 981);
    // min(limit 100, floor(5000 * 0.1) = 500) = 100
    expect(flip!.feasibleQtyPer4h).toBe(100);
    expect(flip!.profitPer4h).toBe(97 * 100);
    expect(flip!.gpPerHour).toBe((97 * 100) / 4);
  });

  it('returns null when either price is missing (thinly traded items)', () => {
    expect(computeFlip({ low: null, high: 100, isExempt: false, buyLimit: 1, volumePer4h: 1 }, cfg)).toBeNull();
    expect(computeFlip({ low: 100, high: null, isExempt: false, buyLimit: 1, volumePer4h: 1 }, cfg)).toBeNull();
    expect(computeFlip({ low: null, high: null, isExempt: false, buyLimit: null, volumePer4h: null }, cfg)).toBeNull();
  });

  it('skips tax for exempt items', () => {
    const flip = computeFlip(
      { low: 980, high: 1100, isExempt: true, buyLimit: 100, volumePer4h: 5000 },
      cfg,
    );
    expect(flip!.tax).toBe(0);
    expect(flip!.marginPerItem).toBe(1099 - 981);
  });

  it('respects the offer-offset toggle', () => {
    const noOffset = computeFlip(
      { low: 980, high: 1100, isExempt: false, buyLimit: null, volumePer4h: null },
      { captureRate: 0.1, offerOffset: 0 },
    );
    expect(noOffset!.buyAt).toBe(980);
    expect(noOffset!.sellAt).toBe(1100);
  });

  it('clamps offers to at least 1 gp for bottom-priced items', () => {
    const flip = computeFlip(
      { low: 1, high: 2, isExempt: false, buyLimit: null, volumePer4h: null },
      cfg,
    );
    expect(flip!.buyAt).toBe(2);
    expect(flip!.sellAt).toBe(1); // 2 - 1 = 1, still >= 1
  });

  it('uses volume alone when the buy limit is unknown', () => {
    const flip = computeFlip(
      { low: 100, high: 200, isExempt: false, buyLimit: null, volumePer4h: 400 },
      cfg,
    );
    expect(flip!.feasibleQtyPer4h).toBe(40);
  });

  it('uses the buy limit alone when volume is unknown', () => {
    const flip = computeFlip(
      { low: 100, high: 200, isExempt: false, buyLimit: 70, volumePer4h: null },
      cfg,
    );
    expect(flip!.feasibleQtyPer4h).toBe(70);
  });

  it('leaves throughput null when neither volume nor limit is known', () => {
    const flip = computeFlip(
      { low: 100, high: 200, isExempt: false, buyLimit: null, volumePer4h: null },
      cfg,
    );
    expect(flip!.feasibleQtyPer4h).toBeNull();
    expect(flip!.profitPer4h).toBeNull();
    expect(flip!.gpPerHour).toBeNull();
  });

  it('can produce a negative margin when tax eats the spread', () => {
    // Buy at 1001, sell at 1019, tax 20 -> margin -2
    const flip = computeFlip(
      { low: 1000, high: 1020, isExempt: false, buyLimit: 10, volumePer4h: 100 },
      cfg,
    );
    expect(flip!.marginPerItem).toBe(1019 - 1001 - 20);
    expect(flip!.marginPerItem).toBeLessThan(0);
  });
});

describe('computeFlipFromPrices', () => {
  it('computes tax, margin, roi and throughput from explicit prices', () => {
    // sell 1099 tax = 21; buy 981
    const flip = computeFlipFromPrices(
      { buy: 981, sell: 1099, isExempt: false, buyLimit: 100, volumePer4h: 5000 },
      0.1,
    );
    expect(flip).not.toBeNull();
    expect(flip!.buyAt).toBe(981);
    expect(flip!.sellAt).toBe(1099);
    expect(flip!.tax).toBe(21);
    expect(flip!.marginPerItem).toBe(1099 - 981 - 21);
    expect(flip!.roi).toBeCloseTo(97 / 981);
    expect(flip!.feasibleQtyPer4h).toBe(100);
    expect(flip!.profitPer4h).toBe(97 * 100);
  });

  it('agrees with computeFlip when fed that flip’s own buy/sell', () => {
    const live = computeFlip(
      { low: 980, high: 1100, isExempt: false, buyLimit: 100, volumePer4h: 5000 },
      cfg,
    )!;
    const whatIf = computeFlipFromPrices(
      {
        buy: live.buyAt,
        sell: live.sellAt,
        isExempt: false,
        buyLimit: 100,
        volumePer4h: 5000,
      },
      cfg.captureRate,
    )!;
    expect(whatIf).toEqual(live);
  });

  it('floors fractional prices and rejects sub-1 gp offers', () => {
    const flip = computeFlipFromPrices(
      { buy: 100.9, sell: 200.9, isExempt: true, buyLimit: null, volumePer4h: null },
      0.1,
    );
    expect(flip!.buyAt).toBe(100);
    expect(flip!.sellAt).toBe(200);
    expect(flip!.tax).toBe(0); // exempt
    expect(flip!.marginPerItem).toBe(100);
    expect(
      computeFlipFromPrices(
        { buy: 0, sell: 200, isExempt: false, buyLimit: null, volumePer4h: null },
        0.1,
      ),
    ).toBeNull();
  });

  it('reflects a hypothetical: a higher sell price lifts ROI', () => {
    const base = computeFlipFromPrices(
      { buy: 1000, sell: 1100, isExempt: false, buyLimit: 10, volumePer4h: null },
      0.1,
    )!;
    const higher = computeFlipFromPrices(
      { buy: 1000, sell: 1200, isExempt: false, buyLimit: 10, volumePer4h: null },
      0.1,
    )!;
    expect(higher.roi).toBeGreaterThan(base.roi);
  });
});
