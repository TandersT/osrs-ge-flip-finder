import { describe, expect, it } from 'vitest';
import { ITEM_CATEGORIES } from './categories.js';

describe('curated item categories', () => {
  it('group ids are unique', () => {
    const ids = ITEM_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every group has at least 2 members (a pair needs two legs)', () => {
    for (const c of ITEM_CATEGORIES) {
      expect(c.members.length, c.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('no item appears twice (within or across groups)', () => {
    const all = ITEM_CATEGORIES.flatMap((c) => c.members.map((m) => m.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });
});
