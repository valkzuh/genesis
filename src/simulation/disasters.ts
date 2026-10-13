import type { Civ, World } from '../types/simulation';
import { Biome } from '../types/world';
import { isWaterBiome } from '../world/biomes';
import { effectMagnitude } from './economy';
import { logEvent } from './events';
import { tilesInRadius } from './territory';
import { capitalTile, enemiesOf, getRelation, tileDistance } from './world';
import { formatPopulation } from '../utils/format';

/** Picks an owned land tile using a few random samples, preferring the highest `score`. */
function sampleOwnedTile(world: World, samples: number, score: (t: number) => number): number {
  const rng = world.rng;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < samples; i++) {
    const t = rng.int(world.map.size);
    if (world.owner[t]! < 0) continue;
    const s = score(t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

function civsInArea(world: World, tiles: number[]): Civ[] {
  const ids = new Set<number>();
  for (const t of tiles) if (world.owner[t]! >= 0) ids.add(world.owner[t]!);
  return Array.from(ids)
    .sort((a, b) => a - b)
    .map((id) => world.civs[id]!);
}

/** Applies a drought / blight to an area. Returns affected civilisations. */
export function applyBlight(world: World, center: number, radius: number, intensity: number): Civ[] {
  const area = tilesInRadius(world, center, radius);
  for (const t of area) {
    if (isWaterBiome(world.map.biome[t]!)) continue;
    const d = tileDistance(world, center, t) / Math.max(1, radius);
    world.blight[t] = Math.max(world.blight[t]!, intensity * (1 - d * 0.6));
  }
  return civsInArea(world, area);
}

/** Earthquake-style destruction. Returns approximate deaths. */
export function applyQuake(world: World, center: number, radius: number, intensity: number): { deaths: number; civs: Civ[] } {
  const area = tilesInRadius(world, center, radius);
  let deaths = 0;
  for (const t of area) {
    if (isWaterBiome(world.map.biome[t]!) || world.owner[t]! < 0) continue;
    const d = tileDistance(world, center, t) / Math.max(1, radius);
    const f = intensity * (1 - d * 0.7);
    const isCity = world.cityAt[t]! >= 0;
    const kill = world.pop[t]! * f * (isCity ? 0.32 : 0.16);
    world.pop[t] = Math.max(25, world.pop[t]! - kill);
    deaths += kill;
    world.devastation[t] = Math.min(1, Math.max(world.devastation[t]!, f * 0.8));
  }
  const civs = civsInArea(world, area);
  for (const c of civs) {
    c.stability = Math.max(0, c.stability - 6 * intensity);
    c.wealth *= 1 - 0.1 * intensity;
  }
  return { deaths, civs };
}

export function startPlague(civ: Civ, severity: number): void {
  civ.plague = Math.max(civ.plague, severity);
  civ.counters.plagues++;
}

/** Natural disasters, epidemics, golden ages and recovery. */
export function updateDisasters(world: World): void {
  const rng = world.rng;
  const rate = world.settings.disasterRate;
  const N = world.map.size;

  // Land slowly heals.
  for (let t = 0; t < N; t++) {
    const dv = world.devastation[t]!;
    if (dv > 0) world.devastation[t] = dv < 0.01 ? 0 : dv * 0.86;
    const bl = world.blight[t]!;
    if (bl > 0) world.blight[t] = bl < 0.01 ? 0 : bl * 0.72;
  }

  // Droughts strike arid, farmed land.
  if (rng.chance(0.07 * rate)) {
    const t = sampleOwnedTile(world, 40, (x) => 1 - world.map.moisture[x]! + rng.range(0, 0.3));
    if (t >= 0) {
      const civs = applyBlight(world, t, rng.intRange(4, 8), rng.range(0.5, 0.8));
      for (const c of civs) {
        if (c.tiles < 5) continue;
        logEvent(world, 'disaster', [c.id], `A severe drought withers the harvests of the ${c.name}.`, 2, t);
      }
    }
  }

  // Earthquakes in rugged country.
  if (rng.chance(0.02 * rate)) {
    const t = sampleOwnedTile(world, 60, (x) => {
      const b = world.map.biome[x]!;
      return (b === Biome.Mountains || b === Biome.Hills ? 1 : 0) + world.pop[x]! / 20000 + rng.range(0, 0.4);
    });
    if (t >= 0) {
      const { deaths, civs } = applyQuake(world, t, rng.intRange(2, 4), rng.range(0.5, 0.9));
      const victim = civs[0];
      if (victim && deaths > 500) {
        const cityId = world.cityAt[t]!;
        const where = cityId >= 0 ? world.cities[cityId]!.name : `the lands of the ${victim.name}`;
        logEvent(world, 'disaster', civs.map((c) => c.id), `A great earthquake strikes ${where}, killing some ${formatPopulation(deaths)}.`, deaths > 50_000 ? 4 : 3, t);
      }
    }
  }

  // Plague outbreaks favour dense, well-connected nations.
  if (rng.chance(0.011 * rate)) {
    const eligible = world.civs.filter((c) => c.alive && c.plague === 0 && c.plagueImmunityUntil < world.year && c.population > 20_000);
    const victim = rng.weighted(eligible, (c) => {
      let links = 1;
      for (const r of world.relations) if ((r.a === c.id || r.b === c.id) && (r.trade || r.border > 0)) links++;
      return Math.sqrt(c.population) * links * (1 + c.cityCount * 0.1);
    });
    if (victim) {
      startPlague(victim, rng.range(0.55, 1));
      const capital = world.cities[victim.capital];
      logEvent(world, 'plague', [victim.id], `Plague! A deadly pestilence breaks out in ${capital ? capital.name : 'the lands'} of the ${victim.name}.`, 4, capitalTile(world, victim));
    }
  }

  // Epidemics travel along trade routes and borders.
  const infected = world.civs.filter((c) => c.alive && c.plague > 0.15);
  for (const civ of infected) {
    for (const rel of world.relations) {
      if (rel.a !== civ.id && rel.b !== civ.id) continue;
      if (!rel.trade && rel.border === 0) continue;
      const other = world.civs[rel.a === civ.id ? rel.b : rel.a]!;
      if (!other.alive || other.plague > 0 || other.plagueImmunityUntil >= world.year) continue;
      const p = civ.plague * (rel.trade ? 0.22 : 0.12) * (rel.border > 0 ? 1.2 : 1);
      if (rng.chance(p)) {
        startPlague(other, civ.plague * rng.range(0.6, 0.9));
        logEvent(world, 'plague', [other.id, civ.id], `The plague spreads from the ${civ.name} to the ${other.name}.`, 3, capitalTile(world, other));
      }
    }
  }

  // Golden ages: stable, prosperous, peaceful nations flourish.
  for (const civ of world.civs) {
    if (!civ.alive || effectMagnitude(civ, 'golden_age') > 0) continue;
    if (civ.stability < 72 || civ.happiness < 62 || enemiesOf(world, civ.id).length > 0 || civ.wealth < civ.revenue * 3) continue;
    const great = civ.leader.trait === 'wise' || civ.leader.trait === 'charismatic' ? 2 : 1;
    if (rng.chance(0.006 * great)) {
      civ.effects.push({ kind: 'golden_age', until: world.year + rng.intRange(30, 50), magnitude: 0.4, divine: false });
      logEvent(world, 'golden_age', [civ.id], `A golden age dawns in the ${civ.name}: arts, learning and commerce flourish.`, 3, capitalTile(world, civ));
    }
  }
}

/** True if two civilisations currently trade (used for plague spread display). */
export function linked(world: World, a: number, b: number): boolean {
  const rel = getRelation(world, a, b);
  return !!rel && (rel.trade || rel.border > 0);
}
