/** Static item metadata from the wiki /mapping endpoint. */
export interface ItemMapping {
  id: number;
  name: string;
  examine?: string;
  members: boolean;
  /** GE buy limit per 4h; missing for some items. */
  limit?: number;
  value?: number;
  highalch?: number;
  lowalch?: number;
  /** Icon filename, e.g. "Abyssal whip.png" (spaces, not underscores). */
  icon?: string;
}

/** One item's entry in the wiki /latest endpoint. Thinly traded items have nulls. */
export interface LatestPrice {
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
}

/** One item's entry in the wiki /5m or /1h endpoints. */
export interface WindowPrice {
  avgHighPrice: number | null;
  highPriceVolume: number;
  avgLowPrice: number | null;
  lowPriceVolume: number;
}

/** One point from the wiki /timeseries endpoint. */
export interface TimeseriesPoint {
  timestamp: number;
  avgHighPrice: number | null;
  avgLowPrice: number | null;
  highPriceVolume: number;
  lowPriceVolume: number;
}

export type Timestep = '5m' | '1h' | '6h' | '24h';

/** Merged per-item snapshot served by our backend (/api/items). */
export interface ItemSnapshot {
  id: number;
  name: string;
  icon: string | null;
  members: boolean;
  limit: number | null;
  value: number | null;
  highalch: number | null;
  /** Latest insta-buy price (what you can sell at). */
  high: number | null;
  highTime: number | null;
  /** Latest insta-sell price (what you can buy at). */
  low: number | null;
  lowTime: number | null;
  /** 1h window averages + volumes. */
  avgHighPrice1h: number | null;
  avgLowPrice1h: number | null;
  volume1h: number;
  /** Daily units traded (wiki /volumes). */
  dailyVolume: number | null;
  /** Exempt from GE tax. */
  taxExempt: boolean;
}

/** Envelope for /api/items: data plus cache/staleness metadata. */
export interface ItemsResponse {
  items: ItemSnapshot[];
  /** Unix seconds when the /latest payload was fetched from the wiki. */
  fetchedAt: number;
  /** True when upstream is failing and this is the last known-good payload. */
  upstreamStale: boolean;
}

/** Runtime config the server shares with the client (/api/config). */
export interface AppConfig {
  captureRate: number;
  offerOffset: number;
  clientRefreshSeconds: number;
  staleAfterSeconds: number;
}

/** One screened item in the long-term opportunities view. */
export interface LongtermRow {
  id: number;
  name: string;
  icon: string | null;
  members: boolean;
  limit: number | null;
  dailyVolume: number | null;
  /** Current mid price (avg of latest high/low). */
  price: number | null;
  change7d: number | null;
  change30d: number | null;
  change90d: number | null;
  /** Std deviations the current price sits from its 90-day mean. */
  zScore90: number | null;
  /** Coefficient of variation of the last 30 daily mids. */
  volatility30: number | null;
  /** Normalised slope of the last 30 daily volumes (fraction/day; >0 = rising). */
  volumeTrend30: number | null;
  /** Liquid item trading >= 1 std dev below its 90-day mean. */
  isDip: boolean;
  /** Sustained price uptrend with rising volume. */
  isMomentum: boolean;
}

export interface LongtermResponse {
  status: 'building' | 'ready';
  /** Build progress 0..1 (1 when ready). */
  progress: number;
  /** Unix seconds of the last completed build; null while the first build runs. */
  builtAt: number | null;
  rows: LongtermRow[];
}

/** Knobs for flip math. */
export interface FlipConfig {
  /** Fraction of 4h market volume one player can realistically capture. */
  captureRate: number;
  /** Competitive offsets: buy at low+offset, sell at high-offset. */
  offerOffset: number;
}

/** Result of computing one flip. Null-able fields depend on volume/limit availability. */
export interface FlipResult {
  buyAt: number;
  sellAt: number;
  /** GE tax per item at sellAt. */
  tax: number;
  marginPerItem: number;
  /** marginPerItem / buyAt. */
  roi: number;
  /** min(buyLimit, floor(volumePer4h * captureRate)); null when neither is known. */
  feasibleQtyPer4h: number | null;
  profitPer4h: number | null;
  gpPerHour: number | null;
}
