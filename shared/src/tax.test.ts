import { describe, expect, it } from 'vitest';
import { geTax, geTaxForQuantity, isTaxExempt } from './tax.js';
import { GE_TAX_EXEMPT_ITEMS } from './taxExemptions.js';

describe('geTax', () => {
  it('charges nothing below 50 gp (2% rounds down to 0)', () => {
    expect(geTax(false, 49)).toBe(0);
    expect(geTax(false, 1)).toBe(0);
    expect(geTax(false, 0)).toBe(0);
  });

  it('charges 1 gp at exactly 50 gp', () => {
    expect(geTax(false, 50)).toBe(1);
  });

  it('rounds down per item', () => {
    expect(geTax(false, 99)).toBe(1); // 1.98 -> 1
    expect(geTax(false, 100)).toBe(2);
    expect(geTax(false, 149)).toBe(2); // 2.98 -> 2
  });

  it('matches the wiki worked examples (2% flat)', () => {
    // https://oldschool.runescape.wiki/w/Grand_Exchange#Tax
    expect(geTax(false, 1_000)).toBe(20);
    expect(geTax(false, 100_000)).toBe(2_000);
    expect(geTax(false, 10_000_000)).toBe(200_000);
  });

  it('is exempt for exempt items at any price', () => {
    expect(geTax(true, 49)).toBe(0);
    expect(geTax(true, 1_000_000)).toBe(0);
    expect(geTax(true, 300_000_000)).toBe(0);
  });

  it('caps at exactly 5m from a 250m sale price', () => {
    expect(geTax(false, 250_000_000)).toBe(5_000_000);
    expect(geTax(false, 249_999_999)).toBe(4_999_999);
  });

  it('stays capped above 250m (effective rate < 2%)', () => {
    expect(geTax(false, 250_000_001)).toBe(5_000_000);
    expect(geTax(false, 300_000_000)).toBe(5_000_000);
    expect(geTax(false, 2_147_483_647)).toBe(5_000_000);
  });

  it('applies per item, not per offer', () => {
    // 100 items at 99 gp: per-offer 2% of 9,900 would be 198; per-item it is 1 gp x 100.
    expect(geTaxForQuantity(false, 99, 100)).toBe(100);
    expect(geTaxForQuantity(false, 49, 1_000)).toBe(0);
    expect(geTaxForQuantity(true, 1_000_000, 5)).toBe(0);
  });

  it('avoids float error on awkward prices', () => {
    // 0.02 * 4_512_349 = 90246.98000000001 in floats; integer division must give 90246
    expect(geTax(false, 4_512_349)).toBe(90_246);
  });
});

describe('exemption list', () => {
  it('contains the Old School bond and known necessities', () => {
    const names = GE_TAX_EXEMPT_ITEMS.map((i) => i.name);
    expect(names).toContain('Old school bond');
    expect(names).toContain('Chisel');
    expect(names).toContain('Hammer');
    expect(names).toContain('Spade');
  });

  it('resolves the ~45 wiki pages to item ids', () => {
    // 45 wiki pages; dose/charge variants expand the id list slightly
    expect(GE_TAX_EXEMPT_ITEMS.length).toBeGreaterThanOrEqual(45);
    expect(GE_TAX_EXEMPT_ITEMS.length).toBeLessThanOrEqual(60);
  });

  it('isTaxExempt matches the list', () => {
    expect(isTaxExempt(13190)).toBe(true); // Old school bond
    expect(isTaxExempt(4151)).toBe(false); // Abyssal whip
  });
});
