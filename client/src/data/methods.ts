/**
 * Curated processing / AFK money-making methods: buy the inputs on the GE,
 * apply a skill, sell the outputs. Profit is computed live from prices;
 * `actionsPerHour` are ESTIMATES taken from the wiki's money-making guides
 * (real rates vary with attention, banking and world hops).
 */
export interface SkillReq {
  /** Hiscores skill name, e.g. "Herblore". */
  skill: string;
  level: number;
}

export interface MethodDef {
  id: string;
  name: string;
  /** Grouping shown in the table. */
  category: 'Herblore' | 'Cooking' | 'Fletching' | 'Crafting' | 'Smithing' | 'Magic' | 'No skill';
  members: boolean;
  /** How much attention it demands. */
  intensity: 'low' | 'medium' | 'high';
  /** True when the whole loop is doable standing at the GE (inventory only). */
  atGE: boolean;
  requirements: SkillReq[];
  /** GE item names + quantity consumed per action. */
  inputs: { name: string; qty: number }[];
  /** GE item names + quantity produced per action. */
  outputs: { name: string; qty: number }[];
  /** Extra gp consumed per action (tanner fee, sawmill fee, BF coffer…). */
  coinsPerAction?: number;
  actionsPerHour: number;
  notes?: string;
}

const herb = (herbName: string, level: number): MethodDef => ({
  id: `clean-${herbName.toLowerCase().replaceAll(' ', '-')}`,
  name: `Clean grimy ${herbName}`,
  category: 'Herblore',
  members: true,
  intensity: 'high',
  atGE: true,
  requirements: [{ skill: 'Herblore', level }],
  inputs: [{ name: `Grimy ${herbName}`, qty: 1 }],
  outputs: [{ name: herbName.charAt(0).toUpperCase() + herbName.slice(1), qty: 1 }],
  actionsPerHour: 2_300,
});

const poison = (ammo: string): MethodDef => ({
  id: `poison-${ammo.toLowerCase().replaceAll(' ', '-')}`,
  name: `Poison ${ammo.toLowerCase()}s (p++)`,
  category: 'No skill',
  members: true,
  intensity: 'high',
  atGE: true,
  requirements: [],
  inputs: [
    { name: ammo, qty: 5 },
    { name: 'Weapon poison(++)', qty: 1 },
  ],
  outputs: [{ name: `${ammo}(p++)`, qty: 5 }],
  actionsPerHour: 4_800,
  notes: 'One vial poisons 5 ammo per click; pure GE bankstanding.',
});

export const METHODS: MethodDef[] = [
  // --- No skill: poisoning ammunition (GE bankstand) ---
  poison('Dragon arrow'),
  poison('Dragon dart'),
  poison('Amethyst arrow'),
  poison('Dragon knife'),
  // --- Herblore: cleaning ---
  herb('ranarr weed', 25),
  herb('toadflax', 30),
  herb('irit leaf', 40),
  herb('avantoe', 48),
  herb('kwuarm', 54),
  herb('snapdragon', 59),
  herb('cadantine', 65),
  herb('dwarf weed', 70),
  herb('torstol', 75),
  // --- Herblore: potions (low intensity) ---
  {
    id: 'unf-ranarr',
    atGE: true,
    name: 'Make ranarr potions (unf)',
    category: 'Herblore',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Herblore', level: 30 }],
    inputs: [
      { name: 'Ranarr weed', qty: 1 },
      { name: 'Vial of water', qty: 1 },
    ],
    outputs: [{ name: 'Ranarr potion (unf)', qty: 1 }],
    actionsPerHour: 2_000,
  },
  {
    id: 'prayer-potion',
    atGE: true,
    name: 'Mix prayer potions',
    category: 'Herblore',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Herblore', level: 38 }],
    inputs: [
      { name: 'Ranarr potion (unf)', qty: 1 },
      { name: 'Snape grass', qty: 1 },
    ],
    outputs: [{ name: 'Prayer potion(3)', qty: 1 }],
    actionsPerHour: 2_400,
  },
  {
    id: 'super-restore',
    atGE: true,
    name: 'Mix super restores',
    category: 'Herblore',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Herblore', level: 63 }],
    inputs: [
      { name: 'Snapdragon potion (unf)', qty: 1 },
      { name: "Red spiders' eggs", qty: 1 },
    ],
    outputs: [{ name: 'Super restore(3)', qty: 1 }],
    actionsPerHour: 2_400,
  },
  {
    id: 'saradomin-brew',
    atGE: true,
    name: 'Mix saradomin brews',
    category: 'Herblore',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Herblore', level: 81 }],
    inputs: [
      { name: 'Toadflax potion (unf)', qty: 1 },
      { name: 'Crushed nest', qty: 1 },
    ],
    outputs: [{ name: 'Saradomin brew(3)', qty: 1 }],
    actionsPerHour: 2_400,
  },
  // --- Cooking ---
  {
    id: 'cook-karambwan',
    atGE: false,
    name: 'Cook karambwan',
    category: 'Cooking',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Cooking', level: 30 }],
    inputs: [{ name: 'Raw karambwan', qty: 1 }],
    outputs: [{ name: 'Cooked karambwan', qty: 1 }],
    actionsPerHour: 1_300,
    notes: 'Burn rate falls with level; 99 + gauntlets for near-zero burns.',
  },
  {
    id: 'cook-shark',
    atGE: false,
    name: 'Cook sharks',
    category: 'Cooking',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Cooking', level: 80 }],
    inputs: [{ name: 'Raw shark', qty: 1 }],
    outputs: [{ name: 'Shark', qty: 1 }],
    actionsPerHour: 1_300,
    notes: 'Assumes ~no burns (94+ with gauntlets, 99 otherwise).',
  },
  {
    id: 'cook-anglerfish',
    atGE: false,
    name: 'Cook anglerfish',
    category: 'Cooking',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Cooking', level: 84 }],
    inputs: [{ name: 'Raw anglerfish', qty: 1 }],
    outputs: [{ name: 'Anglerfish', qty: 1 }],
    actionsPerHour: 1_300,
    notes: 'Assumes ~no burns (98+ with gauntlets).',
  },
  // --- Fletching ---
  {
    id: 'headless-arrows',
    atGE: true,
    name: 'Make headless arrows',
    category: 'Fletching',
    members: true,
    intensity: 'low',
    requirements: [{ skill: 'Fletching', level: 1 }],
    inputs: [
      { name: 'Arrow shaft', qty: 1 },
      { name: 'Feather', qty: 1 },
    ],
    outputs: [{ name: 'Headless arrow', qty: 1 }],
    actionsPerHour: 10_000,
    notes: 'Very AFK — batches of 10 with long timers.',
  },
  {
    id: 'string-yew',
    atGE: true,
    name: 'String yew longbows',
    category: 'Fletching',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Fletching', level: 70 }],
    inputs: [
      { name: 'Yew longbow (u)', qty: 1 },
      { name: 'Bow string', qty: 1 },
    ],
    outputs: [{ name: 'Yew longbow', qty: 1 }],
    actionsPerHour: 2_200,
  },
  {
    id: 'string-magic',
    atGE: true,
    name: 'String magic longbows',
    category: 'Fletching',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Fletching', level: 85 }],
    inputs: [
      { name: 'Magic longbow (u)', qty: 1 },
      { name: 'Bow string', qty: 1 },
    ],
    outputs: [{ name: 'Magic longbow', qty: 1 }],
    actionsPerHour: 2_200,
  },
  // --- Crafting ---
  {
    id: 'cut-dragonstone',
    atGE: true,
    name: 'Cut dragonstones',
    category: 'Crafting',
    members: true,
    intensity: 'high',
    requirements: [{ skill: 'Crafting', level: 55 }],
    inputs: [{ name: 'Uncut dragonstone', qty: 1 }],
    outputs: [{ name: 'Dragonstone', qty: 1 }],
    actionsPerHour: 2_700,
  },
  {
    id: 'air-battlestaff',
    atGE: true,
    name: 'Make air battlestaves',
    category: 'Crafting',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Crafting', level: 66 }],
    inputs: [
      { name: 'Battlestaff', qty: 1 },
      { name: 'Air orb', qty: 1 },
    ],
    outputs: [{ name: 'Air battlestaff', qty: 1 }],
    actionsPerHour: 2_500,
  },
  {
    id: 'earth-battlestaff',
    atGE: true,
    name: 'Make earth battlestaves',
    category: 'Crafting',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Crafting', level: 58 }],
    inputs: [
      { name: 'Battlestaff', qty: 1 },
      { name: 'Earth orb', qty: 1 },
    ],
    outputs: [{ name: 'Earth battlestaff', qty: 1 }],
    actionsPerHour: 2_500,
  },
  {
    id: 'light-orbs',
    atGE: true,
    name: 'Blow empty light orbs',
    category: 'Crafting',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Crafting', level: 87 }],
    inputs: [{ name: 'Molten glass', qty: 1 }],
    outputs: [{ name: 'Empty light orb', qty: 1 }],
    actionsPerHour: 1_300,
  },
  // --- No-skill processing ---
  {
    id: 'tan-blue-dhide',
    atGE: false,
    name: 'Tan blue dragonhide',
    category: 'No skill',
    members: true,
    intensity: 'low',
    requirements: [],
    inputs: [{ name: 'Blue dragonhide', qty: 1 }],
    outputs: [{ name: 'Blue dragon leather', qty: 1 }],
    coinsPerAction: 20,
    actionsPerHour: 4_700,
    notes: 'Al Kharid tanner, 20 gp/hide.',
  },
  {
    id: 'tan-black-dhide',
    atGE: false,
    name: 'Tan black dragonhide',
    category: 'No skill',
    members: true,
    intensity: 'low',
    requirements: [],
    inputs: [{ name: 'Black dragonhide', qty: 1 }],
    outputs: [{ name: 'Black dragon leather', qty: 1 }],
    coinsPerAction: 20,
    actionsPerHour: 4_700,
    notes: 'Al Kharid tanner, 20 gp/hide.',
  },
  {
    id: 'sawmill-mahogany',
    atGE: false,
    name: 'Make mahogany planks (sawmill)',
    category: 'No skill',
    members: true,
    intensity: 'medium',
    requirements: [],
    inputs: [{ name: 'Mahogany logs', qty: 1 }],
    outputs: [{ name: 'Mahogany plank', qty: 1 }],
    coinsPerAction: 1_500,
    actionsPerHour: 1_800,
    notes: 'Sawmill fee 1,500 gp/plank.',
  },
  // --- Smithing ---
  {
    id: 'bf-runite',
    atGE: false,
    name: 'Smelt runite bars (Blast Furnace)',
    category: 'Smithing',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Smithing', level: 85 }],
    inputs: [
      { name: 'Runite ore', qty: 1 },
      { name: 'Coal', qty: 4 },
    ],
    outputs: [{ name: 'Runite bar', qty: 1 }],
    coinsPerAction: 100,
    actionsPerHour: 700,
    notes: 'BF halves coal (4 instead of 8); ~72k/h coffer fee included.',
  },
  // --- Magic ---
  {
    id: 'superglass',
    atGE: true,
    name: 'Cast Superglass Make',
    category: 'Magic',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Magic', level: 78 }],
    inputs: [
      { name: 'Giant seaweed', qty: 3 },
      { name: 'Bucket of sand', qty: 18 },
      { name: 'Astral rune', qty: 2 },
      { name: 'Air rune', qty: 10 },
      { name: 'Fire rune', qty: 6 },
    ],
    outputs: [{ name: 'Molten glass', qty: 23 }],
    actionsPerHour: 300,
    notes: 'Lunar spellbook; ~1.3 glass per bucket of sand.',
  },
  {
    id: 'charge-fire-orbs',
    atGE: false,
    name: 'Charge fire orbs',
    category: 'Magic',
    members: true,
    intensity: 'medium',
    requirements: [{ skill: 'Magic', level: 63 }],
    inputs: [
      { name: 'Unpowered orb', qty: 1 },
      { name: 'Fire rune', qty: 30 },
      { name: 'Cosmic rune', qty: 3 },
    ],
    outputs: [{ name: 'Fire orb', qty: 1 }],
    actionsPerHour: 330,
    notes: 'Includes the run to the Fire Obelisk (Taverley Dungeon).',
  },
];
