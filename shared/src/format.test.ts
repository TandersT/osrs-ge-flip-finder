import { describe, expect, it } from 'vitest';
import { formatAge, formatGpCompact, formatGpFull, gpTier, iconUrl } from './format.js';

describe('formatGpCompact', () => {
  it('shows full digits below 100k', () => {
    expect(formatGpCompact(12_345)).toBe('12,345');
    expect(formatGpCompact(99_999)).toBe('99,999');
    expect(formatGpCompact(0)).toBe('0');
  });

  it('uses k between 100k and 1m', () => {
    expect(formatGpCompact(350_000)).toBe('350k');
    expect(formatGpCompact(100_000)).toBe('100k');
  });

  it('uses m with one decimal between 1m and 10m', () => {
    expect(formatGpCompact(1_200_000)).toBe('1.2m');
    expect(formatGpCompact(9_900_000)).toBe('9.9m');
    expect(formatGpCompact(2_000_000)).toBe('2m');
  });

  it('uses whole m from 10m, b from 1b', () => {
    expect(formatGpCompact(12_000_000)).toBe('12m');
    expect(formatGpCompact(150_000_000)).toBe('150m');
    expect(formatGpCompact(1_200_000_000)).toBe('1.2b');
  });

  it('keeps the sign on negatives', () => {
    expect(formatGpCompact(-350_000)).toBe('-350k');
    expect(formatGpCompact(-42)).toBe('-42');
  });
});

describe('formatGpFull', () => {
  it('formats with separators and unit', () => {
    expect(formatGpFull(12_345)).toBe('12,345 gp');
    expect(formatGpFull(-500)).toBe('-500 gp');
  });
});

describe('gpTier', () => {
  it('is yellow below 100k, white to 10m, green from 10m', () => {
    expect(gpTier(99_999)).toBe('yellow');
    expect(gpTier(100_000)).toBe('white');
    expect(gpTier(9_999_999)).toBe('white');
    expect(gpTier(10_000_000)).toBe('green');
  });
});

describe('iconUrl', () => {
  it('replaces spaces with underscores', () => {
    expect(iconUrl('Abyssal whip.png')).toBe(
      'https://oldschool.runescape.wiki/images/Abyssal_whip.png',
    );
  });
  it('handles missing icons', () => {
    expect(iconUrl(null)).toBeNull();
  });
});

describe('formatAge', () => {
  const nowMs = 1_700_000_000_000;
  it('formats seconds/minutes/hours', () => {
    expect(formatAge(1_700_000_000 - 30, nowMs)).toBe('30s');
    expect(formatAge(1_700_000_000 - 300, nowMs)).toBe('5m');
    expect(formatAge(1_700_000_000 - 7_200, nowMs)).toBe('2h');
    expect(formatAge(null, nowMs)).toBe('—');
  });
});
