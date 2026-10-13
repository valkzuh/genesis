import type { Civ, GovernmentId, OriginType, World } from '../types/simulation';
import { colorDistance } from '../utils/color';
import { adjectiveFor, getLanguage } from '../utils/names';
import { ERAS, PERSONALITY_IDS } from './constants';
import { createCity, createCiv } from './civs';
import { logEvent } from './events';
import { relocateCapital, setOwner } from './territory';
import { capitalTile, ensureRelation, participant, removeRelationsOf } from './world';
import { sampleStatistics } from './stats';

/**
 * Ends a civilisation. Its history, statistics and events are preserved in
 * `world.civs` for the archive; only its live presence is removed.
 */
export function destroyCiv(world: World, civ: Civ, fate: string, text?: string, importance = 4, tile = -1): void {
  if (!civ.alive) return;
  // Snapshot final statistics before zeroing.
  sampleStatistics(world, true);
  const N = world.map.size;
  if (civ.tiles > 0) {
    for (let t = 0; t < N; t++) if (world.owner[t] === civ.id) setOwner(world, t, -1);
  }
  for (const city of world.cities) {
    if (city.owner === civ.id) {
      city.owner = -1;
      city.ruined = true;
      city.ruinedYear = world.year;
      world.cache.cityVersion++;
    }
  }
  civ.alive = false;
  civ.extinctYear = world.year;
  civ.fate = fate;
  civ.population = 0;
  civ.tiles = 0;
  civ.cityCount = 0;
  civ.army = 0;
  civ.armyPower = 0;
  civ.effects = [];
  civ.plague = 0;
  for (const war of world.cache.activeWars) {
    const p = participant(war, civ.id);
    if (p) p.left = world.year;
  }
  removeRelationsOf(world, civ.id);
  if (text) logEvent(world, 'collapse', [civ.id], text, importance, tile);
}

/**
 * Guarantees that a living civilisation has a valid capital: relocates it to
 * the largest city, founds an emergency capital, or destroys a civ with no land.
 */
export function ensureCapital(world: World, civ: Civ): void {
  if (!civ.alive) return;
  const cap = world.cities[civ.capital];
  if (cap && !cap.ruined && cap.owner === civ.id && world.owner[cap.tile] === civ.id) return;
  if (civ.tiles <= 0) {
    destroyCiv(world, civ, 'Vanished', `The ${civ.name} has vanished from the world.`, 3);
    return;
  }
  if (relocateCapital(world, civ)) {
    const city = world.cities[civ.capital]!;
    logEvent(world, 'city', [civ.id], `The ${civ.name} moves its capital to ${city.name}.`, 2, city.tile);
    return;
  }
  // No cities left: raise a new seat of government on the most populous tile.
  let best = -1;
  let bestPop = -1;
  const N = world.map.size;
  for (let t = 0; t < N; t++) {
    if (world.owner[t] !== civ.id) continue;
    if (world.pop[t]! > bestPop) {
      bestPop = world.pop[t]!;
      best = t;
    }
  }
  if (best < 0) {
    destroyCiv(world, civ, 'Vanished', `The ${civ.name} has vanished from the world.`, 3);
    return;
  }
  const existing = world.cityAt[best]!;
  if (existing >= 0) {
    const city = world.cities[existing]!;
    city.ruined = false;
    city.ruinedYear = null;
    city.owner = civ.id;
    civ.capital = city.id;
    world.cache.cityVersion++;
  } else {
    const city = createCity(world, civ, best);
    civ.capital = city.id;
    civ.cityCount++;
  }
  logEvent(world, 'city', [civ.id], `The ${civ.name} establishes a new capital at ${world.cities[civ.capital]!.name}.`, 2, best);
}

function dominantCulture(world: World, tiles: readonly number[], fallback: number): number {
  const weight = new Map<number, number>();
  for (const t of tiles) {
    const c = world.culture[t]!;
    if (c < 0) continue;
    weight.set(c, (weight.get(c) ?? 0) + world.pop[t]! + 1);
  }
  let best = fallback;
  let bestW = -1;
  for (const [c, w] of Array.from(weight.entries()).sort((a, b) => a[0] - b[0])) {
    if (w > bestW) {
      bestW = w;
      best = c;
    }
  }
  return best;
}

function baseNameInUse(world: World, base: string): boolean {
  return world.civs.some((c) => c.alive && c.baseName === base);
}

function governmentFor(kind: OriginType, parent: Civ | null, era: number, roll: number): GovernmentId {
  if (kind === 'civil_war' && parent) {
    switch (parent.government) {
      case 'kingdom':
      case 'empire':
      case 'theocracy':
        return era >= 1 ? 'republic' : 'kingdom';
      case 'republic':
      case 'federation':
      case 'merchant':
        return era >= 3 ? 'dictatorship' : era >= 1 ? 'empire' : 'kingdom';
      case 'dictatorship':
        return 'republic';
      default:
        return 'kingdom';
    }
  }
  if (era >= 5) return roll < 0.6 ? 'republic' : roll < 0.8 ? 'federation' : 'dictatorship';
  if (era >= 3) return roll < 0.45 ? 'republic' : roll < 0.85 ? 'kingdom' : 'theocracy';
  if (era >= 1) return roll < 0.7 ? 'kingdom' : roll < 0.85 ? 'theocracy' : 'republic';
  return roll < 0.6 ? 'tribal' : 'kingdom';
}

const DIRECTIONS = ['East', 'West', 'South', 'North'] as const;

export interface BreakawayOptions {
  kind: OriginType;
  capitalTile?: number;
  /** Share of the parent's army that defects (0..1 of the region's share). */
  armyShare?: number;
  /** Prefer a directional name such as "North Solara" (civil wars). */
  directional?: boolean;
}

/**
 * Creates a new civilisation from part of an existing one (or from abandoned
 * land when `parent` is null). Handles naming, restorations of fallen
 * nations, army and treasury splits, and the initial relation.
 */
export function spawnBreakaway(world: World, parent: Civ | null, tiles: number[], opts: BreakawayOptions): Civ | null {
  const rng = world.rng;
  if (tiles.length === 0) return null;
  const fallbackCulture = parent ? parent.cultureId : world.culture[tiles[0]!]! >= 0 ? world.culture[tiles[0]!]! : 0;
  const cultureId = dominantCulture(world, tiles, fallbackCulture);
  const culture = world.cultures[cultureId]!;

  // Capital: the most populous intact city in the region, else the most populous tile.
  let capital = opts.capitalTile ?? -1;
  if (capital < 0) {
    let bestPop = -1;
    for (const t of tiles) {
      const cid = world.cityAt[t]!;
      if (cid >= 0 && !world.cities[cid]!.ruined && world.pop[t]! > bestPop) {
        bestPop = world.pop[t]!;
        capital = t;
      }
    }
    if (capital < 0) {
      for (const t of tiles) {
        if (world.pop[t]! > bestPop) {
          bestPop = world.pop[t]!;
          capital = t;
        }
      }
    }
  }

  const era = parent ? parent.era : Math.max(0, Math.round(averageEra(world) - 0.5));
  // Restoration of a fallen nation of this culture.
  const ancestor = world.civs[culture.originCiv];
  let restoredFrom: number | null = null;
  let baseName: string | undefined;
  let color: number | undefined;
  let government = governmentFor(opts.kind, parent, era, rng.next());
  if (ancestor && !ancestor.alive && ancestor.id !== parent?.id && !baseNameInUse(world, ancestor.baseName) && opts.kind !== 'civil_war') {
    restoredFrom = ancestor.id;
    baseName = ancestor.baseName;
    if (world.civs.every((c) => !c.alive || colorDistance(c.color, ancestor.color) > 70)) color = ancestor.color;
    if (era >= 1 && ancestor.government !== 'tribal') government = ancestor.government;
  } else if (opts.directional && parent) {
    const pc = capitalTile(world, parent);
    if (pc >= 0) {
      const W = world.map.width;
      const dx = (capital % W) - (pc % W);
      const dy = ((capital / W) | 0) - ((pc / W) | 0);
      const dir = Math.abs(dx) > Math.abs(dy) ? DIRECTIONS[dx > 0 ? 0 : 1] : DIRECTIONS[dy > 0 ? 2 : 3];
      const candidate = `${dir} ${parent.baseName}`;
      if (!world.names.has(candidate) && candidate.length <= 18) baseName = candidate;
    }
  }
  if (government === 'tribal' && era >= 2) government = 'kingdom';

  const personality = parent && rng.chance(0.5) ? parent.personality : rng.pick(PERSONALITY_IDS);
  let regionPop = 0;
  for (const t of tiles) regionPop += world.pop[t]!;
  const parentPop = parent ? Math.max(1, parent.population) : 1;
  // Garrisons are spread across the land, so a region's share of the army
  // reflects both its people and its extent.
  const share = Math.min(1, Math.max(regionPop / parentPop, parent ? (tiles.length / Math.max(1, parent.tiles)) * 0.6 : 0));

  const civ = createCiv(world, {
    tiles,
    capitalTile: capital,
    cultureId,
    origin: { type: restoredFrom !== null ? 'restoration' : opts.kind, parent: parent?.id ?? null, restoredFrom },
    government,
    personality,
    ...(baseName ? { baseName } : {}),
    era,
    techPoints: parent ? Math.max(ERAS[era]!.cost, parent.techPoints * 0.97) : ERAS[era]!.cost,
    ...(color !== undefined ? { color } : {}),
    stability: 55,
  });
  if (!civ) return null;
  if (baseName && opts.directional) civ.adjective = adjectiveFor(baseName, getLanguage(culture.languageId));

  if (parent) {
    const armyShare = opts.armyShare ?? 0.5;
    const defectors = Math.min(parent.army * 0.6, parent.army * share * armyShare);
    parent.army -= defectors;
    civ.army = defectors + regionPop * (opts.kind === 'collapse' ? 0.02 : 0.035);
    if (opts.kind === 'secession' || opts.kind === 'civil_war' || opts.kind === 'divine') {
      // Revolutionary fervour: new states fight hard for their survival.
      civ.effects.push({ kind: 'fervor', until: world.year + 15, magnitude: 0.5, divine: opts.kind === 'divine' });
      civ.stability = 62;
    }
    for (const key of ['food', 'wealth', 'iron', 'timber', 'stone'] as const) {
      const moved = parent[key] * share;
      parent[key] -= moved;
      civ[key] = moved;
    }
    const rel = ensureRelation(world, civ.id, parent.id);
    rel.contact = true;
    rel.opinion = opts.kind === 'collapse' ? -10 : -55;
    rel.grievance = opts.kind === 'collapse' ? 0 : 30;
  } else {
    civ.army = regionPop * 0.03;
    civ.food = (regionPop / 1000) * 0.5;
  }
  civ.legitimacy = 50;
  civ.population = regionPop;
  civ.warCooldownUntil = world.year + 12;
  return civ;
}

function averageEra(world: World): number {
  let sum = 0;
  let n = 0;
  for (const c of world.civs) {
    if (!c.alive) continue;
    sum += c.era;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/** Cities owned by a civilisation, most populous first. */
export function citiesOf(world: World, civId: number): number[] {
  return world.cities
    .filter((c) => c.owner === civId && !c.ruined)
    .sort((a, b) => world.pop[b.tile]! - world.pop[a.tile]! || a.id - b.id)
    .map((c) => c.id);
}
