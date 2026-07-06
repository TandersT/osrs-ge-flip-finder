import type { AnaloguePatch, UpcomingEvidence } from '@osrs-flip/shared';

/**
 * Lexical tagging + analogue matching for Patch Impact. The vocabulary is
 * content signals ONLY — deliberately no sentiment terms (buff/nerf):
 * direction always comes from measured history of analogous patches, never
 * from parsing an announcement's wording (see the design spec).
 */
export const TAG_VOCABULARY: readonly string[] = [
  // skills (incl. Sailing)
  'attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft',
  'construction', 'hitpoints', 'agility', 'herblore', 'thieving', 'crafting',
  'fletching', 'slayer', 'hunter', 'mining', 'smithing', 'fishing', 'cooking',
  'firemaking', 'woodcutting', 'farming', 'sailing',
  // content signals
  'boss', 'raid', 'quest', 'minigame', 'wilderness', 'pvp', 'pvm',
  'drop table', 'reward', 'tradeable', 'cosmetic', 'holiday', 'leagues',
  'deadman', 'poll', 'combat', 'achievement diary',
];

/** Tags = vocabulary terms in the title, or appearing >= 2 times in the body. */
export function extractTags(title: string, wikitext: string): string[] {
  const tags: string[] = [];
  const t = title.toLowerCase();
  const body = wikitext.toLowerCase();
  for (const term of TAG_VOCABULARY) {
    const pattern = `\\b${term.replace(/ /g, '\\s+')}\\b`;
    if (new RegExp(pattern).test(t)) {
      tags.push(term);
      continue;
    }
    const hits = body.match(new RegExp(pattern, 'g'));
    if (hits !== null && hits.length >= 2) tags.push(term);
  }
  return tags;
}

/** Jaccard similarity of two tag sets (0 when either is empty). */
export function tagSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const inter = a.filter((tag) => setB.has(tag)).length;
  return inter / new Set([...a, ...b]).size;
}

/** Analogues need at least this much tag overlap to count as "similar". */
const MIN_SIMILARITY = 0.25;
const MAX_ANALOGUES = 5;

/** Top analogues among past patches: highest tag similarity, newest breaking ties. */
export function pickAnalogues(
  featureTags: string[],
  patches: { pageid: number; title: string; date: string; tags: string[] }[],
): AnaloguePatch[] {
  return patches
    .map((p) => ({
      pageid: p.pageid,
      title: p.title,
      date: p.date,
      similarity: tagSimilarity(featureTags, p.tags),
    }))
    .filter((p) => p.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity || b.date.localeCompare(a.date))
    .slice(0, MAX_ANALOGUES);
}

/** Linear-interpolated quantile of an ascending-sorted array. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Distribution of 7d moves; null under 5 samples (too few to summarise honestly). */
export function aggregateEvidence(changes: number[]): UpcomingEvidence | null {
  if (changes.length < 5) return null;
  const sorted = [...changes].sort((a, b) => a - b);
  return {
    median7: quantile(sorted, 0.5),
    iqrLow7: quantile(sorted, 0.25),
    iqrHigh7: quantile(sorted, 0.75),
    pctPositive: changes.filter((c) => c > 0).length / changes.length,
    sampleSize: changes.length,
  };
}
