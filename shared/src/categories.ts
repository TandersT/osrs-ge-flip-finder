/**
 * Curated item categories for the Divergence screener. Members are EXACT GE
 * item names (the methods.ts convention), resolved against the live mapping
 * at build time — an unresolved name shows up as `missing` in the groups
 * panel, never silently. Semantic grouping is only a candidate prior: pairs
 * must additionally prove historical co-movement before they may signal.
 * Data only — tune groups freely without touching code.
 */
export interface ItemCategory {
  id: string;
  label: string;
  members: string[];
}

export const ITEM_CATEGORIES: ItemCategory[] = [
  {
    id: 'food-high-heal',
    label: 'High-heal food',
    members: ['Shark', 'Sea turtle', 'Manta ray', 'Anglerfish', 'Dark crab', 'Monkfish', 'Cooked karambwan'],
  },
  {
    id: 'raw-fish',
    label: 'Raw fish',
    members: ['Raw shark', 'Raw sea turtle', 'Raw manta ray', 'Raw anglerfish', 'Raw dark crab', 'Raw monkfish', 'Raw karambwan'],
  },
  {
    id: 'logs',
    label: 'Logs',
    members: ['Oak logs', 'Willow logs', 'Maple logs', 'Yew logs', 'Magic logs', 'Redwood logs'],
  },
  {
    id: 'planks',
    label: 'Planks',
    members: ['Plank', 'Oak plank', 'Teak plank', 'Mahogany plank'],
  },
  {
    id: 'ores',
    label: 'Ores',
    members: ['Iron ore', 'Coal', 'Mithril ore', 'Adamantite ore', 'Runite ore'],
  },
  {
    id: 'bars',
    label: 'Metal bars',
    members: ['Iron bar', 'Steel bar', 'Mithril bar', 'Adamantite bar', 'Runite bar'],
  },
  {
    id: 'runes-elemental',
    label: 'Elemental runes',
    members: ['Air rune', 'Water rune', 'Earth rune', 'Fire rune'],
  },
  {
    id: 'runes-catalytic',
    label: 'Catalytic runes',
    members: ['Nature rune', 'Law rune', 'Death rune', 'Blood rune', 'Chaos rune', 'Cosmic rune', 'Astral rune', 'Wrath rune'],
  },
  {
    id: 'herbs-clean',
    label: 'Clean herbs',
    members: ['Ranarr weed', 'Toadflax', 'Irit leaf', 'Avantoe', 'Kwuarm', 'Snapdragon', 'Cadantine', 'Lantadyme', 'Dwarf weed', 'Torstol'],
  },
  {
    id: 'potions-restore',
    label: 'Restore potions',
    members: ['Prayer potion(4)', 'Super restore(4)', 'Saradomin brew(4)'],
  },
  {
    id: 'dragonhide',
    label: 'Dragonhide',
    members: ['Green dragonhide', 'Blue dragonhide', 'Red dragonhide', 'Black dragonhide'],
  },
  {
    id: 'bones-high',
    label: 'High-tier bones',
    members: ['Dragon bones', 'Superior dragon bones', 'Wyvern bones', 'Lava dragon bones'],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    members: ['Adamant arrow', 'Rune arrow', 'Amethyst arrow', 'Dragon arrow'],
  },
  {
    id: 'chinchompas',
    label: 'Chinchompas',
    members: ['Chinchompa', 'Red chinchompa', 'Black chinchompa'],
  },
  {
    id: 'gems-uncut',
    label: 'Uncut gems',
    members: ['Uncut sapphire', 'Uncut emerald', 'Uncut ruby', 'Uncut diamond', 'Uncut dragonstone'],
  },
];
