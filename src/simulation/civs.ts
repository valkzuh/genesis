import type {
  City,
  Civ,
  CivOrigin,
  Culture,
  GovernmentId,
  Leader,
  LeaderTraitId,
  PersonalityId,
  Traits,
  World,
} from '../types/simulation';
import { adjectiveFor, getLanguage, LANGUAGES, personName } from '../utils/names';
import { colorDistance, hsl, NATION_PALETTE } from '../utils/color';
import { hashString, type Rng } from '../utils/rng';
import { clamp01 } from '../utils/math';
import { GOVERNMENTS, LEADER_TRAIT_IDS, PERSONALITIES, PERSONALITY_IDS, SIM } from './constants';
import { setOwner } from './territory';
import { tileDistance } from './world';

export function createCulture(world: World, languageId: string, originCiv: number, name?: string): Culture {
  const lang = getLanguage(languageId);
  const culture: Culture = {
    id: world.cultures.length,
    name: name ?? lang.label,
    languageId,
    originCiv,
  };
  world.cultures.push(culture);
  return culture;
}

/** Formats a civilisation's full name for its government type. */
export function formatCivName(government: GovernmentId, baseName: string, adjective: string): string {
  const formats = GOVERNMENTS[government].formats;
  const template = formats[hashString(baseName + government) % formats.length]!;
  return template.replace('{base}', baseName).replace('{adj}', adjective);
}

export function renameCiv(civ: Civ): void {
  civ.name = formatCivName(civ.government, civ.baseName, civ.adjective);
}

export function jitterTraits(base: Traits, rng: Rng, amount = 0.15): Traits {
  const j = (v: number) => clamp01(v + rng.range(-amount, amount));
  return {
    aggression: j(base.aggression),
    expansion: j(base.expansion),
    commerce: j(base.commerce),
    diplomacy: j(base.diplomacy),
    isolation: j(base.isolation),
    science: j(base.science),
    tradition: j(base.tradition),
  };
}

export function pickLeaderTrait(rng: Rng): LeaderTraitId {
  return (
    rng.weighted(LEADER_TRAIT_IDS, (t) => (t === 'incompetent' ? 0.5 : t === 'warlord' || t === 'reformer' ? 0.8 : 1)) ?? 'cautious'
  );
}

export function createLeader(world: World, civ: Civ, rng: Rng, minAge = 22, maxAge = 50): Leader {
  const gov = GOVERNMENTS[civ.government];
  const culture = world.cultures[civ.cultureId];
  const lang = getLanguage(culture?.languageId ?? LANGUAGES[0]!.id);
  const female = rng.chance(0.42);
  let name = personName(lang, rng);
  let regnal = 0;
  if (gov.succession === 'hereditary' || gov.succession === 'council') {
    // Dynasties like to reuse names.
    const used = Object.keys(civ.rulerNames);
    if (used.length > 0 && rng.chance(0.35)) name = rng.pick(used.sort());
    regnal = (civ.rulerNames[name] ?? 0) + 1;
    civ.rulerNames[name] = regnal;
    if (gov.succession === 'council') regnal = 0;
  }
  return {
    name,
    title: gov.titles[female ? 1 : 0],
    regnal,
    trait: pickLeaderTrait(rng),
    birthYear: world.year - rng.intRange(minAge, maxAge),
    since: world.year,
    female,
  };
}

export function leaderDisplayName(leader: Leader): string {
  const regnal = leader.regnal > 1 ? ` ${toRoman(leader.regnal)}` : leader.regnal === 1 ? ' I' : '';
  return `${leader.title} ${leader.name}${regnal}`;
}

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = n;
  if (v >= 40) return String(n);
  for (const [value, sym] of map) {
    while (v >= value) {
      out += sym;
      v -= value;
    }
  }
  return out;
}

/** Picks a national colour that stands out from nearby living civilisations. */
export function pickColor(world: World, nearTile: number, rng: Rng, avoid: number[] = []): number {
  const others: { color: number; weight: number }[] = [];
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const cap = world.cities[civ.capital];
    const d = cap ? tileDistance(world, cap.tile, nearTile) : 999;
    others.push({ color: civ.color, weight: d < 45 ? 1 : 0.45 });
  }
  for (const c of avoid) others.push({ color: c, weight: 1.2 });
  let best = NATION_PALETTE[0]!;
  let bestScore = -Infinity;
  for (const candidate of NATION_PALETTE) {
    let score = Infinity;
    for (const o of others) score = Math.min(score, colorDistance(candidate, o.color) / o.weight);
    if (others.length === 0) score = rng.next();
    score += rng.range(0, 25);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (bestScore < 90) {
    // Palette exhausted nearby: synthesise a fresh muted hue.
    best = hsl(rng.range(0, 360), rng.range(0.35, 0.55), rng.range(0.4, 0.55));
  }
  return best;
}

export function createCity(world: World, civ: Civ, tile: number, name?: string): City {
  const cultureId = world.culture[tile]! >= 0 ? world.culture[tile]! : civ.cultureId;
  const lang = getLanguage(world.cultures[cultureId]?.languageId ?? LANGUAGES[0]!.id);
  const city: City = {
    id: world.cities.length,
    name: name ?? world.names.cityName(lang, world.rng),
    tile,
    owner: civ.id,
    founder: civ.id,
    cultureId,
    founded: world.year,
    population: world.pop[tile]!,
    ruined: false,
    ruinedYear: null,
    captures: 0,
  };
  world.cities.push(city);
  world.cityAt[tile] = city.id;
  civ.counters.citiesFounded++;
  world.cache.cityVersion++;
  return city;
}

export interface NewCivOptions {
  tiles: number[];
  capitalTile: number;
  cultureId: number;
  origin: CivOrigin;
  government?: GovernmentId;
  personality?: PersonalityId;
  baseName?: string;
  era?: number;
  techPoints?: number;
  color?: number;
  stability?: number;
}

export function newCounters(): Civ['counters'] {
  return {
    warsWon: 0,
    warsLost: 0,
    warsDrawn: 0,
    citiesFounded: 0,
    citiesCaptured: 0,
    citiesLost: 0,
    tilesConquered: 0,
    revolutions: 0,
    peakPopulation: 0,
    peakPopulationYear: 0,
    peakTiles: 0,
    peakTilesYear: 0,
    famines: 0,
    plagues: 0,
  };
}

/**
 * Creates a civilisation that owns `tiles`. Used at world genesis, for
 * rebels, successor states and divine spawns. Returns null if the world has
 * reached its hard cap on civilisations.
 */
export function createCiv(world: World, opts: NewCivOptions): Civ | null {
  if (world.civs.length >= SIM.maxTotalCivs) return null;
  const rng = world.rng;
  const id = world.civs.length;
  const culture = world.cultures[opts.cultureId] ?? world.cultures[0]!;
  const lang = getLanguage(culture.languageId);
  let baseName = opts.baseName;
  if (!baseName) baseName = world.names.placeName(lang, rng);
  else world.names.add(baseName);
  const adjective = adjectiveFor(baseName, lang);
  const government = opts.government ?? 'tribal';
  const personality = opts.personality ?? rng.pick(PERSONALITY_IDS);
  const pinfo = PERSONALITIES[personality];
  const civ: Civ = {
    id,
    name: formatCivName(government, baseName, adjective),
    baseName,
    adjective,
    cultureId: culture.id,
    color: opts.color ?? pickColor(world, opts.capitalTile, rng),
    government,
    personality,
    traits: jitterTraits(pinfo.traits, rng),
    capital: -1,
    foundedYear: world.year,
    extinctYear: null,
    fate: null,
    alive: true,
    origin: opts.origin,
    population: 0,
    tiles: 0,
    cityCount: 0,
    output: 0,
    revenue: 0,
    foodBalance: 0,
    armyPower: 0,
    researchRate: 0,
    food: 0,
    timber: 20,
    stone: 20,
    iron: 10,
    wealth: 30,
    army: 0,
    techPoints: opts.techPoints ?? 0,
    era: opts.era ?? 0,
    stability: opts.stability ?? 62,
    happiness: 55,
    legitimacy: opts.origin.type === 'genesis' ? 70 : 45,
    unrest: 0,
    warExhaustion: 0,
    budget: { ...pinfo.budget },
    expansionPoints: 0,
    developmentPoints: 0,
    landHunger: 0,
    needs: { food: 0, iron: 0, timber: 0, stone: 0, land: 0 },
    leader: { name: '', title: '', regnal: 0, trait: 'cautious', birthYear: world.year - 30, since: world.year, female: false },
    rulerNames: {},
    effects: [],
    famineYears: 0,
    crisisYears: 0,
    plague: 0,
    plagueImmunityUntil: 0,
    lastUpheaval: world.year,
    warCooldownUntil: world.year + 10,
    counters: newCounters(),
    history: [],
  };
  world.civs.push(civ);
  world.cache.civTiles.push([]);
  civ.leader = createLeader(world, civ, rng);

  for (const t of opts.tiles) setOwner(world, t, id);
  if (world.owner[opts.capitalTile] !== id) setOwner(world, opts.capitalTile, id);

  const existing = world.cityAt[opts.capitalTile]!;
  if (existing >= 0) {
    const city = world.cities[existing]!;
    if (city.ruined) {
      city.ruined = false;
      city.ruinedYear = null;
      city.owner = id;
      world.cache.cityVersion++;
    }
    civ.capital = city.id;
  } else {
    civ.capital = createCity(world, civ, opts.capitalTile).id;
  }
  let pop = 0;
  let cities = 0;
  for (const t of opts.tiles) pop += world.pop[t]!;
  for (const city of world.cities) if (city.owner === id && !city.ruined) cities++;
  civ.population = pop;
  civ.cityCount = cities;
  civ.food = (pop / 1000) * 0.8;
  civ.counters.peakPopulation = pop;
  civ.counters.peakPopulationYear = world.year;
  civ.counters.peakTiles = civ.tiles;
  civ.counters.peakTilesYear = world.year;
  return civ;
}
