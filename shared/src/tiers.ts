/**
 * Subscription tiers. The split philosophy: free stays genuinely useful for
 * casual flipping (and never paywalls safety features like risk flags);
 * premium sells SCALE and LONG-HORIZON analytics for serious flippers.
 *
 * Entitlements are data, not code paths, so the future payment service can
 * hand the client a tier and everything else follows (see docs/payments-plan.md).
 */
export type Tier = 'free' | 'premium';

export interface Entitlements {
  /** Max starred items; null = unlimited. */
  watchlistMax: number | null;
  /** Max flip-log entries (open + closed); null = unlimited. */
  fliplogMax: number | null;
  /** CSV export of the flip log. */
  csvExport: boolean;
  /** CSV import / restore into the flip log. */
  csvImport: boolean;
  /** Days of 24h price history on charts; null = full (~1 year). */
  historyDays: number | null;
  /** Rows of the long-term screener visible; null = all. */
  longtermRows: number | null;
  /** Max armed price alerts; null = unlimited. */
  alertsMax: number | null;
  /** Margin-history + hourly-activity charts on item pages. */
  advancedCharts: boolean;
  /** Rows visible in the high-alch screener; null = all. */
  alchRows: number | null;
  /** Rows visible in the decanting screener; null = all. */
  decantRows: number | null;
  /** Rows visible in the set-combining screener; null = all. */
  setRows: number | null;
  /** Rows visible in the AFK-methods screener; null = all. */
  methodRows: number | null;
  /** Budget portfolio allocator on the starter page. */
  allocator: boolean;
  /** Per-item and monthly analytics on the flip log. */
  logAnalytics: boolean;
  /** Max saved filter presets; null = unlimited. */
  savedFiltersMax: number | null;
}

export const ENTITLEMENTS: Record<Tier, Entitlements> = {
  free: {
    watchlistMax: 5,
    fliplogMax: 25,
    csvExport: false,
    csvImport: false,
    historyDays: 90,
    longtermRows: 5,
    alertsMax: 1,
    advancedCharts: false,
    alchRows: 5,
    decantRows: 5,
    setRows: 5,
    methodRows: 5,
    allocator: false,
    logAnalytics: false,
    savedFiltersMax: 1,
  },
  premium: {
    watchlistMax: null,
    fliplogMax: null,
    csvExport: true,
    csvImport: true,
    historyDays: null,
    longtermRows: null,
    alertsMax: null,
    advancedCharts: true,
    alchRows: null,
    decantRows: null,
    setRows: null,
    methodRows: null,
    allocator: true,
    logAnalytics: true,
    savedFiltersMax: null,
  },
};

export function getEntitlements(tier: Tier): Entitlements {
  return ENTITLEMENTS[tier];
}

/** True when `count` has reached a (nullable) limit. */
export function atLimit(count: number, limit: number | null): boolean {
  return limit !== null && count >= limit;
}

/** Placeholder pricing shown on the premium page until payments go live. */
export const PRICING = {
  currency: 'USD',
  monthly: 3.99,
  yearly: 29.99,
} as const;

/**
 * Local unlock used until the payment service exists (docs/payments-plan.md).
 * Intentionally NOT a secret — it gates nothing of value server-side.
 */
export const DEV_UNLOCK_CODE = 'GEFF-DEV-2026';
