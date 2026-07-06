/**
 * Shared Recharts colors — the one place chart hex values live (see docs/design.md §1:
 * charts can't read Tailwind classes, so these literals mirror or derive from the tokens).
 */
export const CHART = {
  /** Primary data line: a dimmed `gold` that reads as a line, not an accent. CVD-validated. */
  line: '#c98500',
  /** Secondary comparison line (insta-sell / low side). */
  lineAlt: '#3987e5',
  /** Volume bars: desaturated parchment. */
  volume: '#6d675a',
  /** Grid + axis lines = the `panel-border` token. */
  grid: '#3d362a',
  /** Axis tick text: parchment dimmed for small chart type. */
  axisText: '#a89f8c',
  /** Hover cursor wash over bars. */
  cursor: '#ffffff10',
} as const;
