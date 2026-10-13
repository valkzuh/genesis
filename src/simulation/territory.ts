import type { Civ, World } from '../types/simulation';
import { neighbors4 } from '../world/generate';
import { neighborTable } from '../world/grid';
import { isWaterBiome } from '../world/biomes';
import { pairKey } from './world';

const NB: number[] = [];

/**
 * Transfers a tile to a new owner (or -1 to abandon it), keeping tile counts,
 * city ownership and capitals consistent. This is the only function that
 * writes to `world.owner`.
 */
export function setOwner(world: World, tile: number, newOwner: number): void {
  const old = world.owner[tile]!;
  if (old === newOwner) return;
  if (newOwner >= 0 && isWaterBiome(world.map.biome[tile]!)) return;
  world.owner[tile] = newOwner;
  if (old >= 0) world.civs[old]!.tiles--;
  if (newOwner >= 0) {
    const civ = world.civs[newOwner]!;
    civ.tiles++;
    if (world.culture[tile]! < 0) world.culture[tile] = civ.cultureId;
  } else {
    world.pop[tile] = 0;
  }
  world.cache.territoryVersion++;

  const cityId = world.cityAt[tile]!;
  if (cityId >= 0) {
    const city = world.cities[cityId]!;
    if (newOwner >= 0) {
      if (city.ruined) {
        // Reclaiming ruins happens through expansion; a captured ruin stays a ruin.
        city.owner = -1;
      } else {
        city.owner = newOwner;
        if (old >= 0) city.captures++;
        const civ = world.civs[newOwner]!;
        if (civ.capital < 0 || !world.cities[civ.capital] || world.cities[civ.capital]!.owner !== newOwner) civ.capital = cityId;
      }
    } else {
      city.owner = -1;
      city.ruined = true;
      city.ruinedYear = world.year;
      city.population = 0;
    }
    world.cache.cityVersion++;
    if (old >= 0) {
      const oldCiv = world.civs[old]!;
      if (oldCiv.capital === cityId) relocateCapital(world, oldCiv);
    }
  }
}

/** Moves a civilisation's capital to its most populous remaining city. */
export function relocateCapital(world: World, civ: Civ): boolean {
  let best = -1;
  let bestPop = -1;
  for (const city of world.cities) {
    if (city.owner !== civ.id || city.ruined) continue;
    const p = world.pop[city.tile]!;
    if (p > bestPop) {
      bestPop = p;
      best = city.id;
    }
  }
  civ.capital = best;
  world.cache.cityVersion++;
  return best >= 0;
}

/**
 * Recomputes all derived territory data in one pass: per-civ tile lists,
 * exact tile counts and populations, city counts, shared borders, and
 * distance-to-city / distance-to-capital fields.
 */
export function rebuildTerritory(world: World): void {
  const { width: W, size: N } = world.map;
  const owner = world.owner;
  const pop = world.pop;
  const cache = world.cache;
  const civTiles: number[][] = [];
  const popTotals = new Float64Array(world.civs.length);
  for (let c = 0; c < world.civs.length; c++) civTiles.push([]);
  const borders = new Map<number, number>();
  for (let t = 0; t < N; t++) {
    const o = owner[t]!;
    if (o < 0) continue;
    civTiles[o]!.push(t);
    popTotals[o] = popTotals[o]! + pop[t]!;
    if ((t + 1) % W !== 0) {
      const r = owner[t + 1]!;
      if (r >= 0 && r !== o) {
        const k = pairKey(o, r);
        borders.set(k, (borders.get(k) ?? 0) + 1);
      }
    }
    if (t + W < N) {
      const d = owner[t + W]!;
      if (d >= 0 && d !== o) {
        const k = pairKey(o, d);
        borders.set(k, (borders.get(k) ?? 0) + 1);
      }
    }
  }
  for (const civ of world.civs) {
    civ.tiles = civTiles[civ.id]!.length;
    civ.cityCount = 0;
    if (civ.alive) civ.population = popTotals[civ.id]!;
  }
  for (const city of world.cities) {
    if (!city.ruined && city.owner >= 0) world.civs[city.owner]!.cityCount++;
  }
  cache.civTiles = civTiles;
  cache.borders = borders;

  // Multi-source BFS through own territory.
  const distCity = cache.distCity.length === N ? cache.distCity : new Uint8Array(N);
  const distCapital = cache.distCapital.length === N ? cache.distCapital : new Uint8Array(N);
  distCity.fill(255);
  distCapital.fill(255);
  const queue = scratchQueue(N);
  let tail = 0;
  for (const city of world.cities) {
    if (city.ruined || city.owner < 0 || owner[city.tile] !== city.owner) continue;
    distCity[city.tile] = 0;
    queue[tail++] = city.tile;
  }
  bfsWithinOwner(world, distCity, queue, tail);

  tail = 0;
  for (const civ of world.civs) {
    if (!civ.alive || civ.capital < 0) continue;
    const city = world.cities[civ.capital];
    if (!city || owner[city.tile] !== civ.id) continue;
    distCapital[city.tile] = 0;
    queue[tail++] = city.tile;
  }
  bfsWithinOwner(world, distCapital, queue, tail);
  cache.distCity = distCity;
  cache.distCapital = distCapital;
}

let QUEUE: Int32Array = new Int32Array(0);
function scratchQueue(n: number): Int32Array {
  if (QUEUE.length < n) QUEUE = new Int32Array(n);
  return QUEUE;
}

function bfsWithinOwner(world: World, dist: Uint8Array, queue: Int32Array, tail: number): void {
  const owner = world.owner;
  const nbt = neighborTable(world.map.width, world.map.height);
  let head = 0;
  while (head < tail) {
    const c = queue[head++]!;
    const d = dist[c]!;
    if (d >= 254) continue;
    const o = owner[c]!;
    const base = c * 4;
    for (let k = 0; k < 4; k++) {
      const n = nbt[base + k]!;
      if (n >= 0 && owner[n] === o && dist[n]! > d + 1) {
        dist[n] = d + 1;
        queue[tail++] = n;
      }
    }
  }
}

/** Connected components (4-neighbourhood) of a tile set, largest first. */
export function components(world: World, tiles: readonly number[]): number[][] {
  const { width: W, height: H } = world.map;
  const inSet = new Set(tiles);
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of tiles) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const c = stack.pop()!;
      comp.push(c);
      neighbors4(c, W, H, NB);
      for (const n of NB) {
        if (inSet.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    comp.sort((a, b) => a - b);
    out.push(comp);
  }
  out.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
  return out;
}

/**
 * Breadth-first region around `start` up to `radius` steps, restricted to
 * tiles accepted by `accept`. Returned in BFS order (closest first).
 */
export function regionAround(world: World, start: number, radius: number, accept: (tile: number) => boolean, limit = 10_000): number[] {
  const { width: W, height: H } = world.map;
  if (!accept(start)) return [];
  const dist = new Map<number, number>([[start, 0]]);
  const out = [start];
  for (let i = 0; i < out.length && out.length < limit; i++) {
    const c = out[i]!;
    const d = dist.get(c)!;
    if (d >= radius) continue;
    neighbors4(c, W, H, NB);
    for (const n of NB) {
      if (dist.has(n) || !accept(n)) continue;
      dist.set(n, d + 1);
      out.push(n);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Tiles within a Euclidean radius (no connectivity requirement). */
export function tilesInRadius(world: World, center: number, radius: number): number[] {
  const { width: W, height: H } = world.map;
  const cx = center % W;
  const cy = (center / W) | 0;
  const r = Math.ceil(radius);
  const out: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) out.push(y * W + x);
    }
  }
  return out;
}

/** Recounts a civilisation's population from its tiles. */
export function recountPopulation(world: World): void {
  const totals = new Float64Array(world.civs.length);
  const N = world.map.size;
  for (let t = 0; t < N; t++) {
    const o = world.owner[t]!;
    if (o >= 0) totals[o] = totals[o]! + world.pop[t]!;
  }
  for (const civ of world.civs) civ.population = totals[civ.id]!;
}

/** Number of 4-neighbours of `tile` owned by `civId`. */
export function ownedNeighbors(world: World, tile: number, civId: number): number {
  const nbt = neighborTable(world.map.width, world.map.height);
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const x = nbt[tile * 4 + k]!;
    if (x >= 0 && world.owner[x] === civId) n++;
  }
  return n;
}
