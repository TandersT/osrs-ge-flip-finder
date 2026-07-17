import { describe, expect, it } from 'vitest';
import {
  extractLinkTargets,
  matchMentions,
  parseUpdateTemplate,
  parseWikiDate,
  splitUpcomingSections,
  wikiPageUrl,
} from './updateParse.js';

describe('parseWikiDate', () => {
  it('parses the wiki update-date format to ISO', () => {
    expect(parseWikiDate('29 March 2004')).toBe('2004-03-29');
    expect(parseWikiDate('30 June 2026')).toBe('2026-06-30');
    expect(parseWikiDate('1 January 2020')).toBe('2020-01-01');
  });

  it('rejects garbage', () => {
    expect(parseWikiDate('Marchtember 5th')).toBeNull();
    expect(parseWikiDate('2020-01-01')).toBeNull();
    expect(parseWikiDate('45 March 2004')).toBeNull();
  });
});

describe('parseUpdateTemplate', () => {
  it('extracts date and category from a real modern header', () => {
    const wikitext =
      '{{Update|date=30 June 2026|url=https://secure.runescape.com/m=news/x?oldschool=1|category=game}}\n[[File:X.jpg|right]]\nBody';
    expect(parseUpdateTemplate(wikitext)).toEqual({ date: '2026-06-30', category: 'game' });
  });

  it('extracts from a historical header', () => {
    const wikitext = '{{Update|date=29 March 2004|category=game|time=historical}}\n\nBody text';
    expect(parseUpdateTemplate(wikitext)).toEqual({ date: '2004-03-29', category: 'game' });
  });

  it('handles website-category posts and missing templates', () => {
    expect(parseUpdateTemplate('{{Update|date=1 May 2020|category=website}}x').category).toBe(
      'website',
    );
    expect(parseUpdateTemplate('No template here')).toEqual({ date: null, category: null });
  });
});

describe('extractLinkTargets', () => {
  it('collects link targets, stripping display text and anchors, skipping non-articles', () => {
    const wikitext =
      'The [[Dragon claws]] and [[Abyssal whip|the whip]] drop from [[Slayer#Rewards]]. ' +
      '[[File:Pic.png]] [[Category:Updates]] and [[Dragon claws]] again.';
    expect(extractLinkTargets(wikitext).sort()).toEqual(['Abyssal whip', 'Dragon claws', 'Slayer']);
  });
});

describe('matchMentions', () => {
  it('maps targets to item ids case-insensitively, dropping non-items', () => {
    const nameToId = new Map([
      ['dragon claws', 13652],
      ['abyssal whip', 4151],
    ]);
    expect(
      matchMentions(['Dragon claws', 'Abyssal whip', 'Slayer'], nameToId).sort((a, b) => a - b),
    ).toEqual([4151, 13652]);
  });
});

describe('splitUpcomingSections', () => {
  const page = [
    'Intro prose.',
    '==Confirmed updates==',
    'Grouping prose.',
    '===Varlamore Part 3===',
    'Brings [[Dragon claws]] changes.',
    '====Sub-detail====',
    'More on the same feature.',
    '===Sailing Rewards===',
    'New [[Abyssal whip]] recolour.',
    '==Other==',
    'Trailing section prose.',
  ].join('\n');

  it('yields one entry per level-3 section, keeping level-4 bodies, stopping at level-2', () => {
    const sections = splitUpcomingSections(page);
    expect(sections.map((s) => s.title)).toEqual(['Varlamore Part 3', 'Sailing Rewards']);
    expect(sections[0]!.anchor).toBe('Varlamore_Part_3');
    expect(sections[0]!.wikitext).toContain('Sub-detail');
    expect(sections[1]!.wikitext).toContain('Abyssal whip');
    expect(sections[1]!.wikitext).not.toContain('Trailing section');
  });

  it('strips wiki markup from section titles', () => {
    const sections = splitUpcomingSections('===[[Sailing]] rework===\nBody');
    expect(sections[0]!.title).toBe('Sailing rework');
  });
});

describe('wikiPageUrl', () => {
  it('wikiPageUrl underscores and escapes the raw title', () => {
    expect(wikiPageUrl('Update:The Blood Moon Rises')).toBe(
      'https://oldschool.runescape.wiki/w/Update%3AThe_Blood_Moon_Rises',
    );
  });
});
