import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, EMPTY_FLAGS } from './rows';
import { DEFAULT_SORTING, filtersFromParams, paramsFromState } from './urlState';

describe('flag filters in the URL', () => {
  it('round-trips tri-state flags, omitting "any"', () => {
    const filters = {
      ...EMPTY_FILTERS,
      flags: { ...EMPTY_FLAGS, exempt: 'only' as const, stale: 'hide' as const },
    };
    const params = paramsFromState(filters, DEFAULT_SORTING);
    expect(params.get('exempt')).toBe('only');
    expect(params.get('stale')).toBe('hide');
    expect(params.get('thin')).toBeNull();
    expect(filtersFromParams(params)).toEqual(filters);
  });

  it('parses legacy pre-tri-state params from old bookmarks', () => {
    const legacy = new URLSearchParams('exempt=1&nostale=1&norisk=1');
    expect(filtersFromParams(legacy).flags).toEqual({
      ...EMPTY_FLAGS,
      exempt: 'only',
      stale: 'hide',
      thin: 'hide',
      unstable: 'hide',
    });
  });

  it('ignores junk flag values', () => {
    expect(filtersFromParams(new URLSearchParams('hot=yes&rising=2')).flags).toEqual(EMPTY_FLAGS);
  });
});

describe('Min vol/1h default in the URL', () => {
  it('defaults to 5 when absent and omits the default from the URL', () => {
    expect(filtersFromParams(new URLSearchParams('')).minVolume1h).toBe(5);
    const params = paramsFromState(EMPTY_FILTERS, DEFAULT_SORTING);
    expect(params.get('mv')).toBeNull();
  });

  it('round-trips an explicit value and an explicit "off"', () => {
    const withValue = paramsFromState({ ...EMPTY_FILTERS, minVolume1h: 250 }, DEFAULT_SORTING);
    expect(withValue.get('mv')).toBe('250');
    expect(filtersFromParams(withValue).minVolume1h).toBe(250);

    const off = paramsFromState({ ...EMPTY_FILTERS, minVolume1h: null }, DEFAULT_SORTING);
    expect(off.get('mv')).toBe('off');
    expect(filtersFromParams(off).minVolume1h).toBeNull();
  });
});
