import type { Budget, GovernmentId, LeaderTraitId, PersonalityId, Traits } from '../types/simulation';

// ---------------------------------------------------------------------------
// Technological eras
// ---------------------------------------------------------------------------

export interface EraInfo {
  index: number;
  name: string;
  /** Cumulative research points required to enter the era. */
  cost: number;
  /** Agricultural productivity multiplier (land food capacity). */
  food: number;
  /** Share of a tile's food capacity that rural population settles to. */
  ruralShare: number;
  /** Urban capacity multiplier for cities. */
  urban: number;
  /** Economic productivity multiplier. */
  production: number;
  /** Military effectiveness multiplier. */
  military: number;
  /** Administrative capacity multiplier. */
  admin: number;
  /** Maximum overseas reach in water tiles (0 = no seafaring). */
  naval: number;
  /** Upkeep per 1000 soldiers, in wealth. */
  upkeep: number;
  /** Plague lethality multiplier (medicine). */
  medicine: number;
  color: string;
  blurb: string;
}

export const ERAS: readonly EraInfo[] = [
  { index: 0, name: 'Ancient', cost: 0, food: 1.0, ruralShare: 0.82, urban: 1.0, production: 1.0, military: 1.0, admin: 1.0, naval: 2, upkeep: 0.9, medicine: 1.0, color: '#a68a64', blurb: 'Bronze, irrigation and the first cities.' },
  { index: 1, name: 'Classical', cost: 400, food: 1.25, ruralShare: 0.78, urban: 1.5, production: 1.3, military: 1.35, admin: 1.25, naval: 4, upkeep: 1.15, medicine: 0.95, color: '#b9975b', blurb: 'Philosophy, law, iron legions and roads.' },
  { index: 2, name: 'Medieval', cost: 1300, food: 1.55, ruralShare: 0.74, urban: 2.0, production: 1.7, military: 1.8, admin: 1.5, naval: 7, upkeep: 1.45, medicine: 0.9, color: '#8f9b6a', blurb: 'Castles, guilds and long-distance trade.' },
  { index: 3, name: 'Renaissance', cost: 3200, food: 2.0, ruralShare: 0.68, urban: 3.0, production: 2.4, military: 2.5, admin: 1.9, naval: 14, upkeep: 1.9, medicine: 0.8, color: '#6c9a8b', blurb: 'Printing, banking, gunpowder and sail.' },
  { index: 4, name: 'Industrial', cost: 8000, food: 3.2, ruralShare: 0.55, urban: 4.5, production: 4.2, military: 4.0, admin: 2.6, naval: 30, upkeep: 2.8, medicine: 0.55, color: '#6f86a6', blurb: 'Steam, factories and railways.' },
  { index: 5, name: 'Modern', cost: 18000, food: 5.0, ruralShare: 0.42, urban: 6.5, production: 7.0, military: 6.0, admin: 3.4, naval: 60, upkeep: 4.0, medicine: 0.3, color: '#7d74a8', blurb: 'Electricity, mass production and mechanised war.' },
  { index: 6, name: 'Information', cost: 36000, food: 6.5, ruralShare: 0.34, urban: 8.0, production: 10.5, military: 8.5, admin: 4.2, naval: 120, upkeep: 5.2, medicine: 0.18, color: '#a06c9a', blurb: 'Computers, global networks and automation.' },
  { index: 7, name: 'Future', cost: 65000, food: 8.0, ruralShare: 0.28, urban: 9.5, production: 15.0, military: 11.0, admin: 5.0, naval: 200, upkeep: 6.5, medicine: 0.1, color: '#c9a45c', blurb: 'Fusion, synthetic biology and orbital industry.' },
];

export const MAX_ERA = ERAS.length - 1;

export function eraInfo(era: number): EraInfo {
  return ERAS[Math.max(0, Math.min(MAX_ERA, era))]!;
}

// ---------------------------------------------------------------------------
// Governments
// ---------------------------------------------------------------------------

export type Succession = 'hereditary' | 'elective' | 'council' | 'strongman';

export interface GovernmentInfo {
  id: GovernmentId;
  name: string;
  formats: readonly string[];
  titles: readonly [string, string];
  baseStability: number;
  admin: number;
  tax: number;
  research: number;
  military: number;
  mobilization: number;
  aggression: number;
  diplomacy: number;
  happiness: number;
  trade: number;
  succession: Succession;
  term: number;
  minEra: number;
  description: string;
}

export const GOVERNMENTS: Record<GovernmentId, GovernmentInfo> = {
  tribal: {
    id: 'tribal',
    name: 'Tribal Confederation',
    formats: ['{adj} Tribes', '{base} Confederacy', 'Tribes of {base}'],
    titles: ['High Chief', 'High Chieftess'],
    baseStability: 56,
    admin: 0.75,
    tax: 0.22,
    research: 0.8,
    military: 1.0,
    mobilization: 0.06,
    aggression: 0.05,
    diplomacy: 0,
    happiness: 3,
    trade: 0.85,
    succession: 'council',
    term: 0,
    minEra: 0,
    description: 'Loose bonds of clans. Expands readily but struggles to govern large lands.',
  },
  kingdom: {
    id: 'kingdom',
    name: 'Monarchy',
    formats: ['Kingdom of {base}'],
    titles: ['King', 'Queen'],
    baseStability: 60,
    admin: 1.0,
    tax: 0.3,
    research: 1.0,
    military: 1.0,
    mobilization: 0.045,
    aggression: 0,
    diplomacy: 0,
    happiness: 0,
    trade: 1.0,
    succession: 'hereditary',
    term: 0,
    minEra: 0,
    description: 'A crowned dynasty. Balanced, but vulnerable to succession crises.',
  },
  empire: {
    id: 'empire',
    name: 'Empire',
    formats: ['{base} Empire', '{adj} Empire'],
    titles: ['Emperor', 'Empress'],
    baseStability: 55,
    admin: 1.45,
    tax: 0.34,
    research: 0.95,
    military: 1.15,
    mobilization: 0.055,
    aggression: 0.12,
    diplomacy: -0.05,
    happiness: -4,
    trade: 1.0,
    succession: 'hereditary',
    term: 0,
    minEra: 1,
    description: 'A sprawling imperial state built on conquest and administration.',
  },
  republic: {
    id: 'republic',
    name: 'Republic',
    formats: ['Republic of {base}', '{adj} Republic'],
    titles: ['Consul', 'Consul'],
    baseStability: 60,
    admin: 1.15,
    tax: 0.32,
    research: 1.2,
    military: 0.95,
    mobilization: 0.03,
    aggression: -0.12,
    diplomacy: 0.1,
    happiness: 6,
    trade: 1.15,
    succession: 'elective',
    term: 6,
    minEra: 1,
    description: 'Elected leadership. Innovative and prosperous, reluctant to wage war.',
  },
  merchant: {
    id: 'merchant',
    name: 'Merchant Republic',
    formats: ['Serene Republic of {base}', '{base} League', '{adj} Trade League'],
    titles: ['Doge', 'Dogaressa'],
    baseStability: 58,
    admin: 1.0,
    tax: 0.36,
    research: 1.1,
    military: 0.9,
    mobilization: 0.025,
    aggression: -0.08,
    diplomacy: 0.12,
    happiness: 4,
    trade: 1.4,
    succession: 'elective',
    term: 10,
    minEra: 2,
    description: 'Ruled by trading houses. Rich and outward-looking.',
  },
  theocracy: {
    id: 'theocracy',
    name: 'Theocracy',
    formats: ['Holy {base}', 'Theocracy of {base}', 'Sacred Realm of {base}'],
    titles: ['High Priest', 'High Priestess'],
    baseStability: 66,
    admin: 0.95,
    tax: 0.3,
    research: 0.8,
    military: 1.05,
    mobilization: 0.045,
    aggression: 0.05,
    diplomacy: -0.05,
    happiness: 2,
    trade: 0.9,
    succession: 'council',
    term: 0,
    minEra: 0,
    description: 'Clerical rule. Stable and devout, but slow to innovate.',
  },
  dictatorship: {
    id: 'dictatorship',
    name: 'Dictatorship',
    formats: ['{adj} State', 'Dominion of {base}', '{adj} Directorate'],
    titles: ['Protector', 'Protector'],
    baseStability: 50,
    admin: 1.2,
    tax: 0.38,
    research: 0.95,
    military: 1.2,
    mobilization: 0.065,
    aggression: 0.18,
    diplomacy: -0.1,
    happiness: -8,
    trade: 0.9,
    succession: 'strongman',
    term: 0,
    minEra: 3,
    description: 'Autocratic rule backed by the army. Aggressive and brittle.',
  },
  federation: {
    id: 'federation',
    name: 'Federation',
    formats: ['Federation of {base}', 'United {base}', '{adj} Union'],
    titles: ['Chancellor', 'Chancellor'],
    baseStability: 66,
    admin: 1.65,
    tax: 0.34,
    research: 1.25,
    military: 1.0,
    mobilization: 0.03,
    aggression: -0.1,
    diplomacy: 0.12,
    happiness: 6,
    trade: 1.2,
    succession: 'elective',
    term: 5,
    minEra: 5,
    description: 'A modern union of self-governing regions. Resilient at great size.',
  },
};

export const GOVERNMENT_IDS = Object.keys(GOVERNMENTS) as GovernmentId[];

// ---------------------------------------------------------------------------
// Personalities
// ---------------------------------------------------------------------------

export interface PersonalityInfo {
  id: PersonalityId;
  name: string;
  description: string;
  traits: Traits;
  budget: Budget;
}

export const PERSONALITIES: Record<PersonalityId, PersonalityInfo> = {
  expansionist: {
    id: 'expansionist',
    name: 'Expansionist',
    description: 'Driven to claim new land, by settlement or by the sword.',
    traits: { aggression: 0.55, expansion: 1.0, commerce: 0.4, diplomacy: 0.3, isolation: 0.1, science: 0.4, tradition: 0.4 },
    budget: { military: 0.24, research: 0.12, development: 0.42 },
  },
  militaristic: {
    id: 'militaristic',
    name: 'Militaristic',
    description: 'Glorifies war and maintains large armies.',
    traits: { aggression: 1.0, expansion: 0.6, commerce: 0.25, diplomacy: 0.2, isolation: 0.2, science: 0.3, tradition: 0.5 },
    budget: { military: 0.42, research: 0.1, development: 0.24 },
  },
  mercantile: {
    id: 'mercantile',
    name: 'Mercantile',
    description: 'Prizes trade, resources and wealth above conquest.',
    traits: { aggression: 0.25, expansion: 0.45, commerce: 1.0, diplomacy: 0.6, isolation: 0.0, science: 0.55, tradition: 0.3 },
    budget: { military: 0.17, research: 0.17, development: 0.32 },
  },
  diplomatic: {
    id: 'diplomatic',
    name: 'Diplomatic',
    description: 'Seeks alliances and peaceful influence.',
    traits: { aggression: 0.15, expansion: 0.4, commerce: 0.6, diplomacy: 1.0, isolation: 0.0, science: 0.5, tradition: 0.4 },
    budget: { military: 0.18, research: 0.18, development: 0.3 },
  },
  isolationist: {
    id: 'isolationist',
    name: 'Isolationist',
    description: 'Keeps to itself, avoids entanglements and unnecessary wars.',
    traits: { aggression: 0.1, expansion: 0.3, commerce: 0.2, diplomacy: 0.1, isolation: 1.0, science: 0.45, tradition: 0.7 },
    budget: { military: 0.25, research: 0.18, development: 0.27 },
  },
  technocratic: {
    id: 'technocratic',
    name: 'Technocratic',
    description: 'Invests heavily in learning and innovation.',
    traits: { aggression: 0.25, expansion: 0.4, commerce: 0.6, diplomacy: 0.5, isolation: 0.2, science: 1.0, tradition: 0.15 },
    budget: { military: 0.17, research: 0.32, development: 0.26 },
  },
  traditionalist: {
    id: 'traditionalist',
    name: 'Traditionalist',
    description: 'Values stability and custom; resists change.',
    traits: { aggression: 0.4, expansion: 0.4, commerce: 0.4, diplomacy: 0.4, isolation: 0.5, science: 0.25, tradition: 1.0 },
    budget: { military: 0.26, research: 0.1, development: 0.3 },
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

// ---------------------------------------------------------------------------
// Leader traits
// ---------------------------------------------------------------------------

export interface LeaderTraitInfo {
  id: LeaderTraitId;
  name: string;
  description: string;
  stability: number;
  happiness: number;
  research: number;
  military: number;
  economy: number;
  aggression: number;
  diplomacy: number;
  expansion: number;
}

const LT = (
  id: LeaderTraitId,
  name: string,
  description: string,
  e: Partial<Omit<LeaderTraitInfo, 'id' | 'name' | 'description'>>,
): LeaderTraitInfo => ({
  id,
  name,
  description,
  stability: 0,
  happiness: 0,
  research: 0,
  military: 0,
  economy: 0,
  aggression: 0,
  diplomacy: 0,
  expansion: 0,
  ...e,
});

export const LEADER_TRAITS: Record<LeaderTraitId, LeaderTraitInfo> = {
  ambitious: LT('ambitious', 'Ambitious', 'Hungry for glory and land.', { aggression: 0.15, expansion: 0.15, stability: -1 }),
  cautious: LT('cautious', 'Cautious', 'Avoids risky ventures.', { aggression: -0.15, stability: 3 }),
  wise: LT('wise', 'Wise', 'A patron of scholars and sound policy.', { research: 0.15, stability: 4 }),
  charismatic: LT('charismatic', 'Charismatic', 'Beloved by the people and admired abroad.', { stability: 6, happiness: 4, diplomacy: 0.15 }),
  cruel: LT('cruel', 'Cruel', 'Rules through fear.', { stability: -3, happiness: -8, military: 0.1, aggression: 0.1 }),
  greedy: LT('greedy', 'Greedy', 'Fills the treasury at the expense of the people.', { economy: 0.1, happiness: -5 }),
  incompetent: LT('incompetent', 'Incompetent', 'Out of their depth.', { stability: -8, economy: -0.1, research: -0.1, military: -0.1 }),
  warlord: LT('warlord', 'Warlord', 'A brilliant and bloodthirsty commander.', { military: 0.2, aggression: 0.18 }),
  pious: LT('pious', 'Pious', 'Devout and traditional.', { stability: 5, research: -0.08 }),
  reformer: LT('reformer', 'Reformer', 'Pushes modernisation and new institutions.', { research: 0.1, stability: -2, economy: 0.05 }),
};

export const LEADER_TRAIT_IDS = Object.keys(LEADER_TRAITS) as LeaderTraitId[];

// ---------------------------------------------------------------------------
// Simulation tuning
// ---------------------------------------------------------------------------

export const SIM = {
  /** Thousand person-years of food per unit of tile food yield. */
  foodPerYield: 10,
  ruralGrowth: 0.028,
  urbanGrowth: 0.045,
  baseUrbanCapacity: 3500,
  urbanCatchment: 0.08,
  capitalUrbanBonus: 1.8,
  migrationRate: 0.05,
  famineMortality: 0.55,
  foodReserveYears: 1.1,
  foodImportPrice: 1.6,
  outputPerThousand: 0.6,
  tradeProductivity: 0.55,
  urbanProductivity: 1.6,
  researchFromSpending: 0.3,
  researchFromPopulation: 0.8,
  expansionFromSpending: 0.9,
  developmentFromSpending: 0.45,
  baseClaimCost: 2.0,
  cityFoundingCost: 24,
  minCitySpacing: 5,
  adminBase: 110,
  adminPerCity: 5,
  assimilationRate: 0.006,
  maxLivingCivs: 32,
  maxTotalCivs: 4000,
  maxEvents: 6000,
  maxCivSamples: 260,
  sampleInterval: 5,
  maxWarYears: 45,
  truceYears: 20,
} as const;
