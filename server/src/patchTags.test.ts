import { describe, expect, it } from 'vitest';
import { aggregateEvidence, extractTags, pickAnalogues, tagSimilarity } from './patchTags.js';

describe('extractTags', () => {
  it('tags a term found in the title even once', () => {
    expect(extractTags('New Slayer Boss!', 'body without keywords')).toEqual(
      expect.arrayContaining(['slayer', 'boss']),
    );
  });

  it('requires two body occurrences when the title lacks the term', () => {
    expect(extractTags('Weekly update', 'the raid was fun')).not.toContain('raid');
    expect(extractTags('Weekly update', 'the raid begins. A raid party forms.')).toContain('raid');
  });

  it('matches whole words only — no "boss" inside "embossed"', () => {
    expect(extractTags('Embossed leather', 'embossed and embossed again')).not.toContain('boss');
  });

  it('matches multi-word terms across whitespace', () => {
    expect(extractTags('Drop Table Changes', '')).toContain('drop table');
  });
});

describe('tagSimilarity', () => {
  it('is Jaccard: identical 1, disjoint 0, half-overlap computed', () => {
    expect(tagSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(tagSimilarity(['a'], ['b'])).toBe(0);
    expect(tagSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('is 0 when either set is empty', () => {
    expect(tagSimilarity([], ['a'])).toBe(0);
    expect(tagSimilarity(['a'], [])).toBe(0);
  });
});

describe('pickAnalogues', () => {
  const patch = (pageid: number, date: string, tags: string[]) => ({
    pageid,
    title: `P${pageid}`,
    date,
    tags,
  });

  it('returns the most similar patches above the floor, capped at 5, newest breaking ties', () => {
    const patches = [
      patch(1, '2024-01-01', ['slayer', 'boss']),
      patch(2, '2025-01-01', ['slayer', 'boss']),
      patch(3, '2023-01-01', ['cooking']),
      patch(4, '2023-06-01', ['slayer', 'boss', 'reward']),
      patch(5, '2022-01-01', ['slayer']),
      patch(6, '2021-01-01', ['slayer', 'boss']),
      patch(7, '2020-01-01', ['slayer', 'boss']),
    ];
    const picked = pickAnalogues(['slayer', 'boss'], patches);
    expect(picked).toHaveLength(5);
    expect(picked[0]!.pageid).toBe(2); // similarity 1, newest first
    expect(picked.map((p) => p.pageid)).not.toContain(3); // disjoint -> below floor
    expect(picked[0]!.similarity).toBe(1);
  });
});

describe('aggregateEvidence', () => {
  it('summarises median, IQR and positive share', () => {
    const e = aggregateEvidence([-0.1, -0.05, 0, 0.05, 0.1])!;
    expect(e.median7).toBeCloseTo(0, 5);
    expect(e.iqrLow7).toBeCloseTo(-0.05, 5);
    expect(e.iqrHigh7).toBeCloseTo(0.05, 5);
    expect(e.pctPositive).toBeCloseTo(2 / 5, 5);
    expect(e.sampleSize).toBe(5);
  });

  it('refuses to summarise under 5 samples', () => {
    expect(aggregateEvidence([0.1, 0.2, 0.3, 0.4])).toBeNull();
  });
});
