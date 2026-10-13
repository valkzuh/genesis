import type { Civ, World } from '../types/simulation';
import { Resource } from '../types/world';
import { neighbors4 } from '../world/generate';
import { neighborTable } from '../world/grid';
import { isWaterBiome } from '../world/biomes';
import { clamp01 } from '../utils/math';
import { eraInfo, SIM } from './constants';
import { createCity } from './civs';
import { logEvent } from './events';
import { ownedNeighbors, setOwner } from './territory';
import { tileDistance, capitalTile } from './world';
import { baseRuralCapacity } from './economy';

const NB: number[] = [];

interface Frontier {
  land: number[][];
}

/** Unowned land tiles adjacent to each civilisation's territory. */
function buildFrontier(world: World): Frontier {
  const { map } = world;
  const N = map.size;
  const nbt = neighborTable(map.width, map.height);
  const land: number[][] = world.civs.map(() => []);
  const owner = world.owner;
  for (let t = 0; t < N; t++) {
    if (owner[t] !== -1 || isWaterBiome(map.biome[t]!)) continue;
    const base = t * 4;
    let a = -1;
    let b = -1;
    let c = -1;
    for (let k = 0; k < 4; k++) {
      const n = nbt[base + k]!;
      if (n < 0) continue;
      const o = owner[n]!;
      if (o < 0 || o === a || o === b || o === c) continue;
      land[o]!.push(t);
      if (a < 0) a = o;
      else if (b < 0) b = o;
      else c = o;
    }
  }
  return { land };
}

let SEA_STAMP = new Int32Array(0);
let SEA_DIST = new Uint16Array(0);
let SEA_QUEUE = new Int32Array(0);
let stamp = 0;

/**
 * Coastal tiles of unclaimed land reachable across at most `range` water
 * tiles from the civilisation's own coast (breadth-first over the sea).
 */
function overseasTargets(world: World, civ: Civ, range: number, limit = 3500): number[] {
  const { map } = world;
  const N = map.size;
  if (SEA_STAMP.length !== N) {
    SEA_STAMP = new Int32Array(N);
    SEA_DIST = new Uint16Array(N);
    SEA_QUEUE = new Int32Array(N);
    stamp = 0;
  }
  stamp++;
  const nbt = neighborTable(map.width, map.height);
  const biome = map.biome;
  const tiles = world.cache.civTiles[civ.id] ?? [];
  let tail = 0;
  for (const t of tiles) {
    if (world.owner[t] !== civ.id || !map.coastal[t]) continue;
    for (let k = 0; k < 4; k++) {
      const n = nbt[t * 4 + k]!;
      if (n >= 0 && isWaterBiome(biome[n]!) && SEA_STAMP[n] !== stamp) {
        SEA_STAMP[n] = stamp;
        SEA_DIST[n] = 1;
        SEA_QUEUE[tail++] = n;
      }
    }
  }
  const found: number[] = [];
  for (let head = 0; head < tail && head < limit; head++) {
    const c = SEA_QUEUE[head]!;
    const d = SEA_DIST[c]!;
    for (let k = 0; k < 4; k++) {
      const n = nbt[c * 4 + k]!;
      if (n < 0 || SEA_STAMP[n] === stamp) continue;
      if (isWaterBiome(biome[n]!)) {
        if (d < range) {
          SEA_STAMP[n] = stamp;
          SEA_DIST[n] = d + 1;
          SEA_QUEUE[tail++] = n;
        }
      } else {
        SEA_STAMP[n] = stamp;
        if (world.owner[n] === -1) found.push(n);
      }
    }
  }
  return found.sort((a, b) => a - b);
}

function candidateScore(world: World, civ: Civ, t: number, overseas: boolean): number {
  const { map } = world;
  let s = map.appeal[t]!;
  s += map.yFood[t]! * civ.needs.food * 0.3;
  if (map.resource[t] === Resource.Iron) s += 0.15 + civ.needs.iron * 0.3;
  if (map.resource[t] !== Resource.None) s += 0.08 + civ.traits.commerce * 0.08;
  s += map.yTimber[t]! * civ.needs.timber * 0.05 + map.yStone[t]! * civ.needs.stone * 0.05;
  if (map.river[t]) s += 0.1;
  if (map.coastal[t]) s += 0.04 + civ.traits.commerce * 0.05;
  s -= (map.moveCost[t]! - 1) * 0.08;
  if (!overseas) s += ownedNeighbors(world, t, civ.id) * 0.14;
  else s -= 0.15;
  return s;
}

function claimCost(world: World, civ: Civ, t: number, overseas: boolean): number {
  const cap = capitalTile(world, civ);
  const d = cap >= 0 ? tileDistance(world, cap, t) : 20;
  const timberPenalty = civ.timber < 1 ? 1.4 : 1;
  return (
    (SIM.baseClaimCost * Math.pow(world.map.moveCost[t]!, 0.75) * (1 + d / 40) * (overseas ? 2.2 : 1) * timberPenalty) /
    (1 + civ.era * 0.12)
  );
}

/** Peaceful colonisation of unclaimed land, then city founding. */
export function updateExpansion(world: World): void {
  const frontier = buildFrontier(world);
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    let candidates = frontier.land[civ.id]!;
    let overseas = false;
    const era = eraInfo(civ.era);
    const wantsOverseas =
      candidates.length < 3 && civ.expansionPoints > 6 && (world.year + civ.id) % 4 === 0;
    if (wantsOverseas) {
      const sea = overseasTargets(world, civ, era.naval);
      if (sea.length > 0) {
        candidates = sea;
        overseas = true;
      }
    }
    // Land hunger builds when a crowded nation has nowhere left to settle.
    const crowding = clamp01(civ.needs.land + (civ.foodBalance < 0 ? 0.3 : 0));
    if (candidates.length === 0) civ.landHunger = civ.landHunger + (crowding - civ.landHunger) * 0.08;
    else civ.landHunger = Math.max(0, civ.landHunger - 0.06);
    if (candidates.length === 0) continue;

    const maxClaims = 1 + Math.floor(civ.era / 2) + (civ.personality === 'expansionist' ? 1 : 0) + (overseas ? 0 : 1);
    const scores = candidates.map((t) => candidateScore(world, civ, t, overseas));
    for (let claims = 0; claims < maxClaims; claims++) {
      // Partial selection: pick the best remaining candidate.
      let bi = -1;
      for (let i = 0; i < candidates.length; i++) {
        if (scores[i]! === -Infinity || world.owner[candidates[i]!] !== -1) continue;
        if (bi < 0 || scores[i]! > scores[bi]! || (scores[i] === scores[bi] && candidates[i]! < candidates[bi]!)) bi = i;
      }
      if (bi < 0) break;
      const t = candidates[bi]!;
      const cost = claimCost(world, civ, t, overseas);
      if (civ.expansionPoints < cost) break;
      civ.expansionPoints -= cost;
      scores[bi] = -Infinity;
      claimTile(world, civ, t, overseas);
    }
  }
  foundCities(world);
}

function claimTile(world: World, civ: Civ, t: number, overseas: boolean): void {
  const { map } = world;
  // Settlers come from the most populous neighbouring tile (or the capital).
  let source = -1;
  let best = 0;
  neighbors4(t, map.width, map.height, NB);
  for (const n of NB) {
    if (world.owner[n] === civ.id && world.pop[n]! > best) {
      best = world.pop[n]!;
      source = n;
    }
  }
  if (source < 0) source = capitalTile(world, civ);
  setOwner(world, t, civ.id);
  const cap = baseRuralCapacity(world, t, civ.era);
  const settlers = source >= 0 ? Math.min(world.pop[source]! * 0.08, Math.max(40, cap * 0.12)) : 40;
  if (source >= 0) world.pop[source] = Math.max(25, world.pop[source]! - settlers);
  world.pop[t] = Math.max(25, settlers);
  if (overseas && world.map.landmass[t] !== world.map.landmass[capitalTile(world, civ)] && civ.tiles < 400) {
    // First landing on a new landmass is worth recording.
    const lm = world.map.landmasses[world.map.landmass[t]!];
    const already = world.cache.civTiles[civ.id]?.some((x) => world.map.landmass[x] === world.map.landmass[t]);
    if (lm && !already && lm.size >= 12) {
      logEvent(world, 'exploration', [civ.id], `Explorers of the ${civ.name} land on the shores of ${lm.name} and claim it.`, 2, t);
    }
  }
  const cityId = world.cityAt[t]!;
  if (cityId >= 0 && world.cities[cityId]!.ruined) restoreRuin(world, civ, cityId);
}

function restoreRuin(world: World, civ: Civ, cityId: number): void {
  const city = world.cities[cityId]!;
  city.ruined = false;
  city.ruinedYear = null;
  city.owner = civ.id;
  world.pop[city.tile] = Math.max(world.pop[city.tile]!, 600);
  world.cache.cityVersion++;
  if (civ.capital < 0) civ.capital = city.id;
  logEvent(world, 'city', [civ.id], `Settlers of the ${civ.name} rebuild the ruins of ${city.name}.`, 2, city.tile);
}

function foundCities(world: World): void {
  const { map } = world;
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const cost = SIM.cityFoundingCost * (1 + civ.cityCount * 0.22);
    if (civ.developmentPoints < cost) continue;
    // Prefer rebuilding ruins inside our borders.
    let ruin = -1;
    for (const city of world.cities) {
      if (city.ruined && world.owner[city.tile] === civ.id) {
        ruin = city.id;
        break;
      }
    }
    if (ruin >= 0) {
      civ.developmentPoints -= cost * 0.5;
      restoreRuin(world, civ, ruin);
      continue;
    }
    if (civ.timber < 4 || civ.stone < 3) continue;
    let bestTile = -1;
    let bestScore = -Infinity;
    for (const t of world.cache.civTiles[civ.id] ?? []) {
      if (world.owner[t] !== civ.id || world.cityAt[t]! >= 0) continue;
      const d = world.cache.distCity[t]!;
      if (d < SIM.minCitySpacing) continue;
      const score =
        map.appeal[t]! +
        (map.coastal[t] ? 0.15 : 0) +
        (map.river[t] ? 0.2 : 0) +
        Math.min(0.3, world.pop[t]! / 20000) +
        Math.min(d, 10) * 0.025;
      if (score > bestScore) {
        bestScore = score;
        bestTile = t;
      }
    }
    if (bestTile < 0) continue;
    civ.developmentPoints -= cost;
    civ.timber -= 4;
    civ.stone -= 3;
    const city = createCity(world, civ, bestTile);
    civ.cityCount++;
    // Settlers move in from the capital.
    const cap = capitalTile(world, civ);
    if (cap >= 0 && world.pop[cap]! > 2000) {
      const movers = Math.min(world.pop[cap]! * 0.05, 800);
      world.pop[cap] = world.pop[cap]! - movers;
      world.pop[bestTile] = world.pop[bestTile]! + movers;
    }
    const notable = civ.cityCount === 5 || civ.cityCount === 10 || civ.cityCount === 25;
    logEvent(
      world,
      'city',
      [civ.id],
      notable
        ? `The ${civ.name} founds ${city.name}, its ${civ.cityCount}th city.`
        : `The ${civ.name} founds the settlement of ${city.name}.`,
      notable ? 2 : 1,
      bestTile,
    );
  }
}
