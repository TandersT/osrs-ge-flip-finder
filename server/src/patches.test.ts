import { describe, expect, it } from 'vitest';
import type { PatchSummary } from '@osrs-flip/shared';
import { applyOverrides } from './patches.js';

function summary(pageid: number, date: string): PatchSummary {
  return {
    pageid,
    title: `Patch ${pageid}`,
    date,
    wikiUrl: `https://oldschool.runescape.wiki/w/Update:Patch_${pageid}`,
    impact: 0.1,
    topWinner: null,
    topLoser: null,
  };
}

describe('applyOverrides', () => {
  const list = [summary(3, '2026-03-01'), summary(2, '2026-02-01'), summary(1, '2026-01-01')];

  it('is identity for the shipped-empty overlay', () => {
    expect(applyOverrides(list, { hidePatches: [], pinPatches: [], upcomingNotes: {} })).toEqual(list);
  });

  it('hides listed pageids', () => {
    const out = applyOverrides(list, { hidePatches: [2], pinPatches: [], upcomingNotes: {} });
    expect(out.map((s) => s.pageid)).toEqual([3, 1]);
  });

  it('floats pins to the top in pin order, keeping the rest in date order', () => {
    const out = applyOverrides(list, { hidePatches: [], pinPatches: [1, 2], upcomingNotes: {} });
    expect(out.map((s) => s.pageid)).toEqual([1, 2, 3]);
  });
});
