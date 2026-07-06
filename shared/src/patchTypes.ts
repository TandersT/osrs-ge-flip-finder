/**
 * Patch Impact API types (/api/patches*). Winners/losers are always COMPUTED
 * from price history around update dates — never hand-typed. See
 * docs/superpowers/specs/2026-07-06-patch-impact-design.md.
 */

/** One game update in the /api/patches list. */
export interface PatchSummary {
  pageid: number;
  /** Display title, wiki "Update:" prefix stripped. */
  title: string;
  /** Publication date (ISO yyyy-mm-dd) from the page's {{Update|date=…}} template. */
  date: string;
  /** Link to the update post on the OSRS wiki. */
  wikiUrl: string;
  /**
   * Share (0..1) of screened items whose post-patch move was unusual for that
   * item (|z| >= 2). Null when the patch is too recent to measure.
   */
  impact: number | null;
  /** change is the fractional move over the patch's rank window (see PatchDetail.windowDays). */
  topWinner: { id: number; name: string; change: number } | null;
  topLoser: { id: number; name: string; change: number } | null;
}

export interface PatchesResponse {
  status: 'building' | 'ready';
  /** Build progress 0..1 (1 when ready). */
  progress: number;
  /** Unix seconds of the last completed build; null while the first build runs. */
  builtAt: number | null;
  /** Non-fatal build gaps, e.g. "3 of 400 items unavailable from the price archive". */
  warnings: string[];
  /** Newest first (curation overlay pins may float entries above that). */
  patches: PatchSummary[];
}

/** One item row in a patch's winners/losers tables. All changes are fractions (0.05 = +5%). */
export interface PatchItemRow {
  id: number;
  name: string;
  icon: string | null;
  /** Price change from the patch-eve baseline over +1/+7/+30 days. */
  change1: number | null;
  change7: number | null;
  change30: number | null;
  /** Change over the 7 days BEFORE the patch (anticipation run-up). */
  runup7: number | null;
  /**
   * Rank-window change normalised by the item's own pre-patch daily volatility.
   * |z| >= 2 is flagged "unusual" in the UI.
   */
  zScore: number | null;
  /** Avg daily volume 7d after vs 28d before, as a fraction; null before Sept 2018. */
  volumeDelta7: number | null;
  /** Item is wiki-linked in the update's notes. */
  mentioned: boolean;
}

export interface PatchDetail extends PatchSummary {
  /** priceOnly = patch predates the archive's volume data (Sept 2018). */
  dataQuality: 'full' | 'priceOnly';
  /** Lexical content tags (skills + content keywords), no sentiment. */
  tags: string[];
  /** Items screened for this patch (usable price data around its date). */
  universeSize: number;
  /** 7 normally; 1 for patches younger than a week (ranked on the 1d move). */
  windowDays: 1 | 7;
  winners: PatchItemRow[];
  losers: PatchItemRow[];
}

/** One past patch reaction of an upcoming-feature item. */
export interface MentionReaction {
  pageid: number;
  title: string;
  date: string;
  change7: number | null;
}

export interface UpcomingItem {
  id: number;
  name: string;
  icon: string | null;
  /** Current mid price from the live snapshot. */
  price: number | null;
  /** 7d reactions after past updates that mentioned this item, newest first (max 6). */
  history: MentionReaction[];
}

export interface AnaloguePatch {
  pageid: number;
  title: string;
  date: string;
  /** Tag-set Jaccard similarity 0..1. */
  similarity: number;
}

/** Distribution of mentioned-item 7d moves across the analogue patches. */
export interface UpcomingEvidence {
  median7: number;
  iqrLow7: number;
  iqrHigh7: number;
  /** Share of moves that were positive, 0..1. */
  pctPositive: number;
  sampleSize: number;
}

export interface UpcomingFeature {
  /** Wiki section anchor on the "Upcoming updates" page. */
  anchor: string;
  title: string;
  tags: string[];
  /** Mentioned items that are in the screened universe. Never empty (features without priced mentions are omitted). */
  items: UpcomingItem[];
  analogues: AnaloguePatch[];
  /** Null when fewer than 5 sample moves exist across the analogues. */
  evidence: UpcomingEvidence | null;
  /** Optional hand-written note from the curation overlay. */
  note: string | null;
}

export interface UpcomingResponse {
  status: 'building' | 'ready';
  builtAt: number | null;
  features: UpcomingFeature[];
}
