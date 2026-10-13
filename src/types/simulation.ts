import type { Rng } from '../utils/rng';
import type { NameRegistry } from '../utils/names';
import type { WorldMap } from './world';

export type GovernmentId =
  | 'tribal'
  | 'kingdom'
  | 'empire'
  | 'republic'
  | 'merchant'
  | 'theocracy'
  | 'dictatorship'
  | 'federation';

export type PersonalityId =
  | 'expansionist'
  | 'militaristic'
  | 'mercantile'
  | 'diplomatic'
  | 'isolationist'
  | 'technocratic'
  | 'traditionalist';

export type LeaderTraitId =
  | 'ambitious'
  | 'cautious'
  | 'wise'
  | 'charismatic'
  | 'cruel'
  | 'greedy'
  | 'incompetent'
  | 'warlord'
  | 'pious'
  | 'reformer';

/** Strategic inclinations, each 0..1. Derived from personality, then nudged by events. */
export interface Traits {
  aggression: number;
  expansion: number;
  commerce: number;
  diplomacy: number;
  isolation: number;
  science: number;
  tradition: number;
}

export interface Leader {
  name: string;
  title: string;
  regnal: number;
  trait: LeaderTraitId;
  birthYear: number;
  since: number;
  female: boolean;
}

export type OriginType = 'genesis' | 'secession' | 'civil_war' | 'restoration' | 'collapse' | 'divine' | 'revolt';

export interface CivOrigin {
  type: OriginType;
  parent: number | null;
  restoredFrom: number | null;
}

export type EffectKind = 'boom' | 'golden_age' | 'divine_favor' | 'turmoil' | 'scientific_revolution';

export interface Effect {
  kind: EffectKind;
  until: number;
  magnitude: number;
  divine: boolean;
}

export interface CivCounters {
  warsWon: number;
  warsLost: number;
  warsDrawn: number;
  citiesFounded: number;
  citiesCaptured: number;
  citiesLost: number;
  tilesConquered: number;
  revolutions: number;
  peakPopulation: number;
  peakPopulationYear: number;
  peakTiles: number;
  peakTilesYear: number;
  famines: number;
  plagues: number;
}

/** A sampled point of a civilisation's statistics, used for charts. */
export interface CivSample {
  y: number;
  pop: number;
  tiles: number;
  wealth: number;
  army: number;
  tech: number;
  stab: number;
  output: number;
}

export interface Budget {
  military: number;
  research: number;
  development: number;
}

export interface Civ {
  id: number;
  name: string;
  baseName: string;
  adjective: string;
  cultureId: number;
  color: number;
  government: GovernmentId;
  personality: PersonalityId;
  traits: Traits;
  /** City id of the capital (-1 only for dead civilisations). */
  capital: number;
  foundedYear: number;
  extinctYear: number | null;
  /** Free-text reason recorded when a civilisation ends. */
  fate: string | null;
  alive: boolean;
  origin: CivOrigin;

  // Aggregates refreshed every tick.
  population: number;
  tiles: number;
  cityCount: number;
  output: number;
  revenue: number;
  foodBalance: number;
  armyPower: number;
  researchRate: number;

  // Stockpiles.
  food: number;
  timber: number;
  stone: number;
  iron: number;
  wealth: number;

  army: number;
  techPoints: number;
  era: number;

  stability: number;
  happiness: number;
  legitimacy: number;
  unrest: number;
  warExhaustion: number;

  budget: Budget;
  expansionPoints: number;
  developmentPoints: number;
  /** 0..1 pressure from lacking room to grow; feeds into war motives. */
  landHunger: number;
  /** 0..1 shortages of food, iron, timber and stone (refreshed every tick). */
  needs: { food: number; iron: number; timber: number; stone: number; land: number };

  leader: Leader;
  /** How many rulers have borne each name (for regnal numbers). */
  rulerNames: Record<string, number>;
  effects: Effect[];
  famineYears: number;
  crisisYears: number;
  plague: number;
  plagueImmunityUntil: number;
  /** Year of the last government change; used to rate-limit upheaval. */
  lastUpheaval: number;
  /** Year after which the civilisation may declare offensive wars again. */
  warCooldownUntil: number;

  counters: CivCounters;
  history: CivSample[];
}

export interface Culture {
  id: number;
  name: string;
  languageId: string;
  /** Civilisation that first carried this culture. */
  originCiv: number;
}

export interface City {
  id: number;
  name: string;
  tile: number;
  owner: number;
  founder: number;
  cultureId: number;
  founded: number;
  population: number;
  ruined: boolean;
  ruinedYear: number | null;
  captures: number;
}

export interface Relation {
  a: number;
  b: number;
  /** -100 (hatred) .. 100 (devotion). */
  opinion: number;
  alliance: boolean;
  allianceSince: number;
  /** Name of the alliance bloc this pact belongs to (e.g. "Eastern Pact"). */
  allianceName: string | null;
  trade: boolean;
  tradeSince: number;
  rivalry: boolean;
  truceUntil: number;
  lastWarEnd: number;
  warCount: number;
  /** Lasting memory of betrayals and atrocities. Decays slowly. */
  grievance: number;
  contact: boolean;
  /** Shared border length in tile edges (recomputed every tick). */
  border: number;
}

export type WarCause =
  | 'conquest'
  | 'border'
  | 'resources'
  | 'rivalry'
  | 'reconquest'
  | 'independence'
  | 'civil_war'
  | 'divine'
  | 'expansion';

export type WarOutcome = 'attacker_victory' | 'defender_victory' | 'stalemate' | 'annexation' | 'rebels_crushed' | 'independence';

export type WarSide = 'attacker' | 'defender';

export interface WarParticipant {
  civ: number;
  side: WarSide;
  joined: number;
  left: number | null;
  losses: number;
  tilesGained: number;
  tilesLost: number;
  citiesTaken: number;
}

export interface War {
  id: number;
  name: string;
  cause: WarCause;
  startYear: number;
  endYear: number | null;
  leadAttacker: number;
  leadDefender: number;
  participants: WarParticipant[];
  /** -100..100 from the attacker's point of view. */
  score: number;
  battles: number;
  outcome: WarOutcome | null;
  summary: string | null;
  divine: boolean;
}

export type EventType =
  | 'founding'
  | 'city'
  | 'war'
  | 'battle'
  | 'peace'
  | 'conquest'
  | 'alliance'
  | 'diplomacy'
  | 'trade'
  | 'rivalry'
  | 'famine'
  | 'plague'
  | 'disaster'
  | 'technology'
  | 'revolution'
  | 'reform'
  | 'secession'
  | 'civil_war'
  | 'collapse'
  | 'leader'
  | 'divine'
  | 'golden_age'
  | 'exploration';

export interface HistoryEvent {
  id: number;
  year: number;
  type: EventType;
  civs: number[];
  text: string;
  /** 1 (minor) .. 5 (world-shaking). */
  importance: number;
  /** Tile the event is located at, or -1. */
  tile: number;
  war: number | null;
}

export interface GlobalSample {
  y: number;
  pop: number;
  civs: number;
  wars: number;
  ownedTiles: number;
  avgEra: number;
  maxEra: number;
}

export type Command =
  | { type: 'spawn_civ'; tile: number }
  | { type: 'grant_resources'; civ: number }
  | { type: 'economic_boom'; civ: number }
  | { type: 'famine'; tile: number }
  | { type: 'plague'; tile: number }
  | { type: 'earthquake'; tile: number }
  | { type: 'flood'; tile: number }
  | { type: 'force_war'; attacker: number; defender: number }
  | { type: 'force_peace'; war: number }
  | { type: 'tech_boost'; civ: number }
  | { type: 'destabilize'; civ: number }
  | { type: 'bless'; civ: number };

export type CommandType = Command['type'];

export interface CommandRecord {
  year: number;
  command: Command;
}

/** Per-world settings that alter simulation pacing. Saved with the world. */
export interface WorldSettings {
  width: number;
  height: number;
  civCount: number;
  landFraction: number;
  disasterRate: number;
}

/**
 * Transient, derived data rebuilt from the authoritative state. Nothing in
 * here is saved; every value can be recomputed at the start of a tick, so a
 * loaded world behaves exactly like one that was never saved.
 */
export interface WorldCache {
  relIndex: Map<number, Relation>;
  /** Shared border edges between civilisations, keyed by pairKey. */
  borders: Map<number, number>;
  /** Tiles owned by each civilisation id (rebuilt every tick). */
  civTiles: number[][];
  /** Steps through own territory to the nearest own city (255 = unreachable). */
  distCity: Uint8Array;
  /** Steps through own territory to the capital (255 = unreachable). */
  distCapital: Uint8Array;
  /** Wars that have not ended (maintained alongside `world.wars`). */
  activeWars: War[];
  /** Changes whenever tile ownership changes; consumed by the renderer. */
  territoryVersion: number;
  /** Changes whenever cities are founded, captured, renamed or ruined. */
  cityVersion: number;
}

export interface World {
  saveVersion: number;
  seed: string;
  name: string;
  year: number;
  startYear: number;
  settings: WorldSettings;
  map: WorldMap;

  owner: Int16Array;
  pop: Float32Array;
  culture: Int16Array;
  devastation: Float32Array;
  blight: Float32Array;
  cityAt: Int32Array;

  civs: Civ[];
  cultures: Culture[];
  cities: City[];
  relations: Relation[];
  wars: War[];
  events: HistoryEvent[];
  eventSeq: number;
  history: GlobalSample[];
  commandLog: CommandRecord[];

  rng: Rng;
  names: NameRegistry;
  cache: WorldCache;
}
