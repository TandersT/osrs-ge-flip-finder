/** Small statistics helpers for the long-term screener. All ignore no values. */

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** How many standard deviations `value` sits from the mean of `values`. */
export function zScore(value: number, values: number[]): number | null {
  const m = mean(values);
  const sd = stdDev(values);
  if (m === null || sd === null || sd === 0) return null;
  return (value - m) / sd;
}

/** Fractional change from `from` to `to` (0.25 == +25%). */
export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / from;
}

/**
 * Least-squares slope of values over their indices, normalised by the mean
 * so it reads as fractional change per step. Positive => uptrend.
 */
export function normalisedSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const m = mean(values);
  if (m === null || m === 0) return null;
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * ((values[i] as number) - m);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return null;
  return num / den / m;
}

/** Coefficient of variation (stdDev / mean) — unitless volatility measure. */
export function volatility(values: number[]): number | null {
  const m = mean(values);
  const sd = stdDev(values);
  if (m === null || sd === null || m === 0) return null;
  return sd / Math.abs(m);
}
