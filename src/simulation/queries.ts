import type { City, Civ, HistoryEvent, Relation, War, World } from '../types/simulation';
import { BIOMES, RESOURCES } from '../world/biomes';
import { ERAS, eraInfo, GOVERNMENTS, PERSONALITIES } from './constants';
import { adminCapacity, tileControl } from './economy';
import { getRelation, participant, warBetween } from './world';
import { warCasualties } from './war';

/** Read-only views over a world for the interface. Nothing here mutates state. */

export interface WorldStats {
  year: number;
  living: number;
  total: number;
  population: number;
  wars: number;
  avgEra: number;
  maxEra: number;
  ownedTiles: number;
  cities: number;
  largest: Civ | null;
  mostPopulous: Civ | null;
  wealthiest: Civ | null;
  mostAdvanced: Civ | null;
  strongest: Civ | null;
}

export function worldStats(world: World): WorldStats {
  let population = 0;
  let living = 0;
  let eraSum = 0;
  let maxEra = 0;
  let owned = 0;
  let cities = 0;
  let largest: Civ | null = null;
  let mostPopulous: Civ | null = null;
  let wealthiest: Civ | null = null;
  let mostAdvanced: Civ | null = null;
  let strongest: Civ | null = null;
  for (const c of world.civs) {
    if (!c.alive) continue;
    living++;
    population += c.population;
    eraSum += c.era;
    maxEra = Math.max(maxEra, c.era);
    owned += c.tiles;
    cities += c.cityCount;
    if (!largest || c.tiles > largest.tiles) largest = c;
    if (!mostPopulous || c.population > mostPopulous.population) mostPopulous = c;
    if (!wealthiest || c.wealth > wealthiest.wealth) wealthiest = c;
    if (!mostAdvanced || c.techPoints > mostAdvanced.techPoints) mostAdvanced = c;
    if (!strongest || c.armyPower > strongest.armyPower) strongest = c;
  }
  return {
    year: world.year,
    living,
    total: world.civs.length,
    population,
    wars: world.cache.activeWars.length,
    avgEra: living > 0 ? eraSum / living : 0,
    maxEra,
    ownedTiles: owned,
    cities,
    largest,
    mostPopulous,
    wealthiest,
    mostAdvanced,
    strongest,
  };
}

export type RankMetric = 'population' | 'territory' | 'wealth' | 'technology' | 'military' | 'stability' | 'output';

export const RANK_METRICS: { id: RankMetric; label: string }[] = [
  { id: 'population', label: 'Population' },
  { id: 'territory', label: 'Territory' },
  { id: 'output', label: 'Economy' },
  { id: 'wealth', label: 'Treasury' },
  { id: 'technology', label: 'Technology' },
  { id: 'military', label: 'Military' },
  { id: 'stability', label: 'Stability' },
];

export function metricValue(civ: Civ, metric: RankMetric): number {
  switch (metric) {
    case 'population':
      return civ.population;
    case 'territory':
      return civ.tiles;
    case 'wealth':
      return civ.wealth;
    case 'technology':
      return civ.techPoints;
    case 'military':
      return civ.armyPower;
    case 'stability':
      return civ.stability;
    case 'output':
      return civ.output;
  }
}

export function rankCivs(world: World, metric: RankMetric): Civ[] {
  return world.civs.filter((c) => c.alive).sort((a, b) => metricValue(b, metric) - metricValue(a, metric) || a.id - b.id);
}

export function eraName(era: number): string {
  return eraInfo(era).name;
}

export function governmentName(civ: Civ): string {
  return GOVERNMENTS[civ.government].name;
}

export function personalityName(civ: Civ): string {
  return PERSONALITIES[civ.personality].name;
}

export function civEvents(world: World, civId: number): HistoryEvent[] {
  return world.events.filter((e) => e.civs.includes(civId));
}

export function citiesOfCiv(world: World, civId: number): City[] {
  return world.cities
    .filter((c) => c.owner === civId && !c.ruined)
    .sort((a, b) => world.pop[b.tile]! - world.pop[a.tile]! || a.id - b.id);
}

export interface RelationView {
  other: Civ;
  rel: Relation;
  atWar: boolean;
}

export function relationsOf(world: World, civId: number): RelationView[] {
  const out: RelationView[] = [];
  for (const rel of world.relations) {
    if (rel.a !== civId && rel.b !== civId) continue;
    const other = world.civs[rel.a === civId ? rel.b : rel.a]!;
    if (!other.alive) continue;
    out.push({ other, rel, atWar: warBetween(world, civId, other.id) !== undefined });
  }
  return out.sort((x, y) => y.rel.opinion - x.rel.opinion);
}

export function warsOfCiv(world: World, civId: number): War[] {
  return world.wars
    .filter((w) => w.participants.some((p) => p.civ === civId))
    .sort((a, b) => (a.endYear === null ? -1 : 0) - (b.endYear === null ? -1 : 0) || b.startYear - a.startYear);
}

export interface WarSummary {
  war: War;
  attackers: Civ[];
  defenders: Civ[];
  duration: number;
  casualties: { attacker: number; defender: number };
  tilesTaken: { attacker: number; defender: number };
}

export function summarizeWar(world: World, war: War): WarSummary {
  const attackers: Civ[] = [];
  const defenders: Civ[] = [];
  const tiles = { attacker: 0, defender: 0 };
  for (const p of war.participants) {
    const civ = world.civs[p.civ]!;
    if (p.side === 'attacker') {
      if (!attackers.includes(civ)) attackers.push(civ);
      tiles.attacker += p.tilesGained;
    } else {
      if (!defenders.includes(civ)) defenders.push(civ);
      tiles.defender += p.tilesGained;
    }
  }
  return {
    war,
    attackers,
    defenders,
    duration: (war.endYear ?? world.year) - war.startYear,
    casualties: warCasualties(war),
    tilesTaken: tiles,
  };
}

export interface Accomplishment {
  year: number;
  text: string;
  kind: 'founding' | 'era' | 'war' | 'conquest' | 'golden' | 'record' | 'city' | 'reform';
}

/** Notable achievements derived from real history records. */
export function accomplishments(world: World, civ: Civ): Accomplishment[] {
  const out: Accomplishment[] = [];
  out.push({ year: civ.foundedYear, text: originText(world, civ), kind: 'founding' });
  for (const e of world.events) {
    if (!e.civs.includes(civ.id) || e.civs[0] !== civ.id) continue;
    if (e.type === 'technology') {
      const m = /(Classical|Medieval|Renaissance|Industrial|Modern|Information|Future)/.exec(e.text);
      const first = e.text.includes('first nation');
      out.push({ year: e.year, text: `${first ? 'First in the world to reach' : 'Reached'} the ${m ? m[1] : 'next'} era`, kind: 'era' });
    } else if (e.type === 'golden_age') {
      out.push({ year: e.year, text: 'Began a golden age', kind: 'golden' });
    } else if (e.type === 'reform') {
      out.push({ year: e.year, text: e.text, kind: 'reform' });
    }
  }
  for (const war of world.wars) {
    if (war.endYear === null || !war.outcome) continue;
    const p = war.participants.find((q) => q.civ === civ.id);
    if (!p) continue;
    const won =
      (p.side === 'attacker' && (war.outcome === 'attacker_victory' || war.outcome === 'annexation' || war.outcome === 'independence')) ||
      (p.side === 'defender' && (war.outcome === 'defender_victory' || war.outcome === 'rebels_crushed'));
    if (!won) continue;
    const enemy = world.civs[p.side === 'attacker' ? war.leadDefender : war.leadAttacker];
    if (war.outcome === 'annexation') out.push({ year: war.endYear, text: `Conquered the ${enemy?.name ?? 'enemy'}`, kind: 'conquest' });
    else out.push({ year: war.endYear, text: `Victorious in the ${war.name}`, kind: 'war' });
  }
  if (civ.counters.peakTiles > 0) {
    out.push({ year: civ.counters.peakTilesYear, text: `Greatest extent: ${civ.counters.peakTiles} provinces`, kind: 'record' });
  }
  if (civ.counters.peakPopulation > 0) {
    out.push({ year: civ.counters.peakPopulationYear, text: `Peak population: ${Math.round(civ.counters.peakPopulation).toLocaleString('en-US')}`, kind: 'record' });
  }
  return out.sort((a, b) => a.year - b.year);
}

export function originText(world: World, civ: Civ): string {
  const parent = civ.origin.parent !== null ? world.civs[civ.origin.parent] : null;
  switch (civ.origin.type) {
    case 'genesis':
      return 'Founded in the dawn of history';
    case 'restoration': {
      const old = civ.origin.restoredFrom !== null ? world.civs[civ.origin.restoredFrom] : null;
      return `Restored the fallen ${old?.name ?? 'kingdom'}${parent ? `, breaking from the ${parent.name}` : ''}`;
    }
    case 'secession':
      return `Seceded from the ${parent?.name ?? 'old realm'}`;
    case 'civil_war':
      return `Rose in civil war against the ${parent?.name ?? 'old regime'}`;
    case 'collapse':
      return `Emerged from the collapse of the ${parent?.name ?? 'old empire'}`;
    case 'divine':
      return 'Created by divine intervention';
    case 'revolt':
      return `Born of revolt against the ${parent?.name ?? 'old realm'}`;
  }
}

export interface TileInfo {
  tile: number;
  x: number;
  y: number;
  biome: string;
  biomeDescription: string;
  elevation: number;
  temperature: number;
  moisture: number;
  river: number;
  resource: string | null;
  resourceDescription: string | null;
  owner: Civ | null;
  population: number;
  culture: string | null;
  city: City | null;
  food: number;
  trade: number;
  control: number | null;
  devastation: number;
  blight: number;
  landmass: string | null;
  coastal: boolean;
}

export function tileInfo(world: World, tile: number): TileInfo {
  const { map } = world;
  const b = BIOMES[map.biome[tile]!]!;
  const ownerId = world.owner[tile]!;
  const owner = ownerId >= 0 ? world.civs[ownerId]! : null;
  const cityId = world.cityAt[tile]!;
  const res = map.resource[tile]!;
  const cultureId = world.culture[tile]!;
  const lm = map.landmass[tile]!;
  return {
    tile,
    x: tile % map.width,
    y: (tile / map.width) | 0,
    biome: b.name,
    biomeDescription: b.description,
    elevation: map.elevation[tile]!,
    temperature: map.temperature[tile]!,
    moisture: map.moisture[tile]!,
    river: map.river[tile]!,
    resource: res ? RESOURCES[res]!.name : null,
    resourceDescription: res ? RESOURCES[res]!.description : null,
    owner,
    population: world.pop[tile]!,
    culture: cultureId >= 0 ? (world.cultures[cultureId]?.name ?? null) : null,
    city: cityId >= 0 ? world.cities[cityId]! : null,
    food: map.yFood[tile]!,
    trade: map.yTrade[tile]!,
    control: owner ? tileControl(world, owner, tile) : null,
    devastation: world.devastation[tile]!,
    blight: world.blight[tile]!,
    landmass: lm >= 0 ? (map.landmasses[lm]?.name ?? null) : null,
    coastal: map.coastal[tile] === 1,
  };
}

/** Opinion and treaty status between two civilisations, if they know each other. */
export function relationBetween(world: World, a: number, b: number): Relation | undefined {
  return getRelation(world, a, b);
}

export function overextension(civ: Civ): number {
  return civ.tiles / Math.max(1, adminCapacity(civ));
}

export function nextEraCost(civ: Civ): number | null {
  return civ.era < ERAS.length - 1 ? ERAS[civ.era + 1]!.cost : null;
}

export function isParticipant(war: War, civId: number): boolean {
  return participant(war, civId) !== undefined;
}
