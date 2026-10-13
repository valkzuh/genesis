import type { World } from '../types/simulation';
import { isWaterBiome } from '../world/biomes';
import { pairKey } from './world';

/**
 * Verifies the structural invariants of a world. Returns a list of human
 * readable violations (empty when the world is consistent).
 */
export function checkInvariants(world: World): string[] {
  const errors: string[] = [];
  const err = (msg: string) => {
    if (errors.length < 50) errors.push(msg);
  };
  const { map } = world;
  const N = map.size;
  const civs = world.civs;

  const arrays: [string, ArrayLike<number>][] = [
    ['owner', world.owner],
    ['pop', world.pop],
    ['culture', world.culture],
    ['devastation', world.devastation],
    ['blight', world.blight],
    ['cityAt', world.cityAt],
  ];
  for (const [name, arr] of arrays) if (arr.length !== N) err(`${name} has length ${arr.length}, expected ${N}`);

  // Tile ownership and population.
  const tileCounts = new Int32Array(civs.length);
  const popTotals = new Float64Array(civs.length);
  for (let t = 0; t < N; t++) {
    const o = world.owner[t]!;
    const p = world.pop[t]!;
    if (!Number.isFinite(p) || p < 0) err(`tile ${t} has invalid population ${p}`);
    if (o === -1) {
      if (p !== 0) err(`unowned tile ${t} has population ${p}`);
      continue;
    }
    if (o < -1 || o >= civs.length) {
      err(`tile ${t} owned by unknown civ ${o}`);
      continue;
    }
    if (!civs[o]!.alive) err(`tile ${t} owned by dead civ ${o}`);
    if (isWaterBiome(map.biome[t]!)) err(`water tile ${t} is owned by civ ${o}`);
    tileCounts[o] = tileCounts[o]! + 1;
    popTotals[o] = popTotals[o]! + p;
  }

  for (const civ of civs) {
    const numeric: [string, number][] = [
      ['population', civ.population],
      ['food', civ.food],
      ['wealth', civ.wealth],
      ['army', civ.army],
      ['techPoints', civ.techPoints],
      ['stability', civ.stability],
      ['happiness', civ.happiness],
      ['iron', civ.iron],
      ['timber', civ.timber],
      ['stone', civ.stone],
    ];
    for (const [k, v] of numeric) if (!Number.isFinite(v)) err(`civ ${civ.id} has non-finite ${k}`);
    if (civ.population < 0) err(`civ ${civ.id} has negative population`);
    if (civ.army < 0) err(`civ ${civ.id} has negative army`);
    if (civ.stability < 0 || civ.stability > 100) err(`civ ${civ.id} stability out of range: ${civ.stability}`);
    if (civ.alive) {
      if (civ.tiles !== tileCounts[civ.id]) err(`civ ${civ.id} tile count ${civ.tiles} != actual ${tileCounts[civ.id]}`);
      if (civ.tiles <= 0) err(`living civ ${civ.id} owns no tiles`);
      const cap = world.cities[civ.capital];
      if (!cap) err(`living civ ${civ.id} has no capital`);
      else {
        if (cap.owner !== civ.id) err(`civ ${civ.id} capital ${cap.id} is owned by ${cap.owner}`);
        if (cap.ruined) err(`civ ${civ.id} capital ${cap.id} is ruined`);
        if (world.owner[cap.tile] !== civ.id) err(`civ ${civ.id} capital tile ${cap.tile} not owned by it`);
      }
      const diff = Math.abs(civ.population - popTotals[civ.id]!);
      if (diff > Math.max(1, popTotals[civ.id]! * 1e-6)) err(`civ ${civ.id} population ${civ.population} != tile sum ${popTotals[civ.id]}`);
      if (civ.extinctYear !== null) err(`living civ ${civ.id} has an extinction year`);
    } else {
      if (tileCounts[civ.id]! > 0) err(`dead civ ${civ.id} still owns ${tileCounts[civ.id]} tiles`);
      if (civ.extinctYear === null) err(`dead civ ${civ.id} has no extinction year`);
    }
  }

  // Cities.
  for (const city of world.cities) {
    if (world.cityAt[city.tile] !== city.id) err(`cityAt mismatch for city ${city.id}`);
    if (city.ruined) {
      if (city.owner !== -1) err(`ruined city ${city.id} has owner ${city.owner}`);
      continue;
    }
    if (city.owner < 0 || !civs[city.owner]?.alive) err(`city ${city.id} owned by invalid civ ${city.owner}`);
    else if (world.owner[city.tile] !== city.owner) err(`city ${city.id} tile owned by ${world.owner[city.tile]} not ${city.owner}`);
  }

  // Relations.
  const seen = new Set<number>();
  for (const rel of world.relations) {
    if (rel.a >= rel.b) err(`relation ${rel.a}-${rel.b} not ordered`);
    if (!civs[rel.a]?.alive || !civs[rel.b]?.alive) err(`relation ${rel.a}-${rel.b} references a dead or missing civ`);
    const key = pairKey(rel.a, rel.b);
    if (seen.has(key)) err(`duplicate relation ${rel.a}-${rel.b}`);
    seen.add(key);
    if (!Number.isFinite(rel.opinion) || rel.opinion < -100 || rel.opinion > 100) err(`relation ${rel.a}-${rel.b} opinion out of range`);
  }

  // Wars.
  const active = world.wars.filter((w) => w.endYear === null);
  if (active.length !== world.cache.activeWars.length) err(`active war cache out of sync`);
  for (const war of active) {
    const sides = { attacker: 0, defender: 0 };
    const members = new Set<number>();
    for (const p of war.participants) {
      if (p.left !== null) continue;
      if (!civs[p.civ]?.alive) err(`war ${war.id} has dead participant ${p.civ}`);
      if (members.has(p.civ)) err(`civ ${p.civ} appears twice in war ${war.id}`);
      members.add(p.civ);
      sides[p.side]++;
    }
    if (sides.attacker === 0 || sides.defender === 0) err(`war ${war.id} lacks an active side`);
  }
  return errors;
}
