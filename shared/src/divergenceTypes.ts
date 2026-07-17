/** Payload types for /api/divergence — see the Divergence design spec. */

export interface PairSignal {
  peerId: number;
  peerName: string;
  /** Current spread z-score from the laggard's perspective (always negative). */
  z: number;
  /** Weekly log-return Pearson r that qualified the pair. */
  weeklyR: number;
  /**
   * Past divergence episodes of this pair (|z| >= 2 entered, |z| <= 0.5 closed)
   * over the trailing year; the currently-open episode is excluded.
   */
  episodes: { count: number; closedWithin30d: number; medianDays: number | null };
  /** Present only on the deal's worst pair; both legs normalized to window start. */
  series90?: { t: number; item: number; peer: number }[];
}

export interface DivergenceDeal {
  itemId: number;
  name: string;
  icon: string | null;
  groupId: string;
  groupLabel: string;
  /** Eligible pairs where this item is currently the flagged laggard. */
  laggingPairs: number;
  /** All eligible pairs this item participates in. */
  eligiblePairs: number;
  /** 30-day fractional change: this item vs the median of its eligible peers. */
  headline: { item30d: number | null; peersMedian30d: number | null };
  /** Flagged pairs where this item is the laggard, worst (most negative z) first. */
  pairs: PairSignal[];
  /** Competitive offer prices + post-tax margin from the live snapshot. */
  buy: number | null;
  sell: number | null;
  margin: number | null;
  /** Recent game update linking this item or a flagged peer — may not reconverge. */
  patch?: { title: string; url: string; date: string };
}

export interface DivergenceGroupMember {
  itemId: number | null;
  name: string;
  icon: string | null;
  /** Participates in at least one eligible pair. */
  eligible: boolean;
  /** Mean weekly-return correlation across this member's computed pairs. */
  avgR: number | null;
  /** Name didn't resolve in the mapping, or its timeseries fetch failed. */
  missing: boolean;
}

export interface DivergenceGroup {
  id: string;
  label: string;
  eligiblePairs: number;
  members: DivergenceGroupMember[];
}

export interface DivergenceResponse {
  /** Unix seconds of the last completed build; null while the first build runs. */
  builtAt: number | null;
  building?: { total: number; done: number };
  deals: DivergenceDeal[];
  groups: DivergenceGroup[];
  coverage: { itemsRequested: number; itemsWithSeries: number };
}
