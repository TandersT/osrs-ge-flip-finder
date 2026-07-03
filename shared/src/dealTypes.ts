/**
 * The Deal payload served by /api/deals. Deliberately does NOT contain the
 * score's factor breakdown — the formula is computed server-side only.
 */
export interface Deal {
  kind: 'flip' | 'method';
  /** "flip-<itemId>" or the method id. */
  id: string;
  name: string;
  icon: string | null;
  /** Client route to open. */
  link: string;
  /** The GEFF Deal Score, 1-100. */
  score: number;
  gpPerHour: number;
  /** Capital in motion per hour of working the deal. */
  capital: number;
  volume1h: number;
  /** Short display line, e.g. "flip · margin 77 gp". */
  detail: string;
  /** Qualitative hints about what holds the score back (the shareable bits). */
  hints: string[];
  /** Methods only: doable standing at the GE. */
  atGE?: boolean;
  /** Methods only: skill requirements, so the client can filter by character. */
  requirements?: { skill: string; level: number }[];
}

export interface DealsResponse {
  deals: Deal[];
  /** Unix seconds when scored. */
  scoredAt: number;
}
