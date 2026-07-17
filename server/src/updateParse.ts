/**
 * Pure parsing of OSRS-wiki wikitext. IO lives in updates.ts; keeping this
 * pure lets the tag vocabulary and parsers evolve against disk-cached
 * wikitext without refetching anything.
 */

/** Parsed head of an Update: page's {{Update|...}} template. */
export interface UpdateTemplate {
  /** ISO yyyy-mm-dd, null when missing/unparseable. */
  date: string | null;
  /** The template's category= field (game, website, support, ...). */
  category: string | null;
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Parse "29 March 2004" (the wiki's update-date format) to ISO. */
export function parseWikiDate(raw: string): string | null {
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Extract date + category from the {{Update|...}} template heading every update page. */
export function parseUpdateTemplate(wikitext: string): UpdateTemplate {
  const m = /\{\{Update\b([^}]*)\}\}/i.exec(wikitext);
  if (!m) return { date: null, category: null };
  const params = new Map<string, string>();
  for (const part of m[1]!.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  const rawDate = params.get('date');
  return {
    date: rawDate ? parseWikiDate(rawDate) : null,
    category: params.get('category')?.toLowerCase() ?? null,
  };
}

/**
 * All [[link]] targets in the wikitext — pipe display text and #anchors
 * stripped, File:/Category:/etc pages skipped. Links only, no free-text
 * scanning: editors link items religiously in update posts, and links
 * avoid false positives on common words.
 */
export function extractLinkTargets(wikitext: string): string[] {
  const out = new Set<string>();
  for (const m of wikitext.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const target = m[1]!.trim();
    if (!target || /^(file|image|category|update|user|template|special|media|w|wp):/i.test(target))
      continue;
    out.add(target);
  }
  return [...out];
}

/** Map link targets to GE item ids (case-insensitive exact name match), deduped. */
export function matchMentions(targets: string[], nameToId: Map<string, number>): number[] {
  const ids = new Set<number>();
  for (const t of targets) {
    const id = nameToId.get(t.toLowerCase());
    if (id !== undefined) ids.add(id);
  }
  return [...ids];
}

/** Public wiki URL for a raw page title (spaces become underscores). */
export function wikiPageUrl(rawTitle: string): string {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(rawTitle.replace(/ /g, '_'))}`;
}

export interface UpcomingSection {
  /** MediaWiki-style anchor (spaces -> underscores) for deep links. */
  anchor: string;
  title: string;
  wikitext: string;
}

/**
 * Split the "Upcoming updates" page into one entry per ===feature=== section.
 * Level-3 headings are the per-feature grain on that page; level-2 headings
 * are groupings and terminate the previous feature's body.
 */
export function splitUpcomingSections(wikitext: string): UpcomingSection[] {
  const sections: UpcomingSection[] = [];
  const headings = [...wikitext.matchAll(/^===([^=].*?)===\s*$/gm)];
  for (let i = 0; i < headings.length; i++) {
    const m = headings[i]!;
    const title = m[1]!
      .replace(/\[\[|\]\]/g, '')
      .replace(/\{\{[^}]*\}\}/g, '')
      .trim();
    const start = m.index! + m[0].length;
    const end = i + 1 < headings.length ? headings[i + 1]!.index! : wikitext.length;
    // stop at the next level-2 heading so grouping prose doesn't bleed in
    const body = wikitext.slice(start, end).split(/^==[^=].*?==\s*$/m)[0]!;
    sections.push({ anchor: title.replace(/\s+/g, '_'), title, wikitext: body });
  }
  return sections;
}
