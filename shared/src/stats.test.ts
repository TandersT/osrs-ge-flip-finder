import { describe, expect, it } from 'vitest';
import { mean, normalisedSlope, pctChange, stdDev, volatility, zScore } from './stats.js';

describe('stats helpers', () => {
  it('mean and stdDev handle empty/short input', () => {
    expect(mean([])).toBeNull();
    expect(stdDev([5])).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('zScore measures distance from the mean', () => {
    const series = [10, 10, 10, 10, 20];
    const z = zScore(20, series);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(1);
    expect(zScore(5, [5, 5, 5])).toBeNull(); // zero variance
  });

  it('pctChange is fractional and guards divide-by-zero', () => {
    expect(pctChange(100, 125)).toBe(0.25);
    expect(pctChange(0, 10)).toBeNull();
  });

  it('normalisedSlope detects up- and downtrends', () => {
    expect(normalisedSlope([1, 2, 3, 4])!).toBeGreaterThan(0);
    expect(normalisedSlope([4, 3, 2, 1])!).toBeLessThan(0);
    expect(Math.abs(normalisedSlope([5, 5, 5, 5])!)).toBeLessThan(1e-9);
    expect(normalisedSlope([1])).toBeNull();
  });

  it('volatility is stdDev over mean', () => {
    expect(volatility([10, 10, 10])).toBe(0);
    expect(volatility([])).toBeNull();
  });
});
