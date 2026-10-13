import type { GovernmentId, PersonalityId, World, WorldSettings } from '../types/simulation';
import { Biome } from '../types/world';
import { generateMap } from '../world/generate';
import { isWaterBiome } from '../world/biomes';
import { Rng } from '../utils/rng';
import { LANGUAGES, NameRegistry, worldName } from '../utils/names';
import { createCiv, createCulture } from './civs';
import { regionAround, rebuildTerritory } from './territory';
import { PERSONALITY_IDS } from './constants';
import { baseRuralCapacity } from './economy';
import { logEvent } from './events';
import { sampleStatistics } from './stats';
import { recountPopulation } from './territory';

export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: WorldSettings = {
  width: 160,
  height: 100,
  civCount: 0,
  landFraction: 0.4,
  disasterRate: 1,
};

export function emptyCache(size: number): World['cache'] {
  return {
    relIndex: new Map(),
    borders: new Map(),
    civTiles: [],
    activeWars: [],
    distCity: new Uint8Array(size).fill(255),
    distCapital: new Uint8Array(size).fill(255),
    territoryVersion: 1,
    cityVersion: 1,
  };
}

/**
 * Builds a brand-new world: terrain plus 8–14 civilisations placed in
 * geographically plausible, well-separated cradles.
 */
export function createWorld(seed: string, partial: Partial<WorldSettings> = {}): World {
  const settings: WorldSettings = { ...DEFAULT_SETTINGS, ...partial };
  const map = generateMap(seed, { width: settings.width, height: settings.height, landFraction: settings.landFraction });
  const rng = new Rng(`${seed}::history`);
  const N = map.size;
  const world: World = {
    saveVersion: SAVE_VERSION,
    seed,
    name: worldName(new Rng(`${seed}::name`)),
    year: 1,
    startYear: 1,
    settings,
    map,
    owner: new Int16Array(N).fill(-1),
    pop: new Float32Array(N),
    culture: new Int16Array(N).fill(-1),
    devastation: new Float32Array(N),
    blight: new Float32Array(N),
    cityAt: new Int32Array(N).fill(-1),
    civs: [],
    cultures: [],
    cities: [],
    relations: [],
    wars: [],
    events: [],
    eventSeq: 1,
    history: [],
    commandLog: [],
    rng,
    names: new NameRegistry(map.landmasses.map((l) => l.name)),
    cache: emptyCache(N),
  };

  const targetCount =
    settings.civCount > 0 ? settings.civCount : Math.max(8, Math.min(14, Math.round(map.landTiles / 560 + rng.range(-1, 1.5))));
  const sites = chooseCradles(world, targetCount);

  // Assign personalities so that every type appears before any repeats.
  const personalities: PersonalityId[] = [];
  while (personalities.length < sites.length) personalities.push(...rng.shuffle([...PERSONALITY_IDS]));
  const languages = rng.shuffle(LANGUAGES.map((l) => l.id));

  sites.forEach((site, index) => {
    const culture = createCulture(world, languages[index % languages.length]!, world.civs.length);
    const government: GovernmentId = rng.chance(0.5) ? 'tribal' : rng.chance(0.7) ? 'kingdom' : 'theocracy';
    const tiles = regionAround(
      world,
      site,
      rng.intRange(2, 3),
      (t) => !isWaterBiome(map.biome[t]!) && world.owner[t] === -1 && map.landmass[t] === map.landmass[site],
      22,
    );
    // Seed population before ownership so the civ starts with real people.
    for (const t of tiles) world.pop[t] = baseRuralCapacity(world, t, 0) * rng.range(0.35, 0.55);
    world.pop[site] = world.pop[site]! + 2500 + rng.range(0, 2000);
    const civ = createCiv(world, {
      tiles,
      capitalTile: site,
      cultureId: culture.id,
      origin: { type: 'genesis', parent: null, restoredFrom: null },
      government,
      personality: personalities[index]!,
      techPoints: rng.range(0, 90),
      stability: rng.range(58, 72),
    });
    if (!civ) return;
    culture.name = civ.adjective;
    civ.wealth = rng.range(20, 60);
    civ.warCooldownUntil = world.year + rng.intRange(15, 40);
    const capitalName = world.cities[civ.capital]!.name;
    logEvent(world, 'founding', [civ.id], `The ${civ.name} is founded, with its seat at ${capitalName}.`, 3, site);
  });

  rebuildTerritory(world);
  recountPopulation(world);
  sampleStatistics(world, true);
  return world;
}

/** Chooses well-separated, fertile starting tiles across the landmasses. */
function chooseCradles(world: World, count: number): number[] {
  const { map, rng } = world;
  const W = map.width;
  const candidates: { tile: number; score: number }[] = [];
  for (let t = 0; t < map.size; t++) {
    const b = map.biome[t]!;
    if (isWaterBiome(b) || b === Biome.Mountains || b === Biome.Peaks || b === Biome.Ice || b === Biome.Desert || b === Biome.Tundra) continue;
    const lm = map.landmasses[map.landmass[t]!];
    if (!lm || lm.size < 30) continue;
    const x = t % W;
    const y = (t / W) | 0;
    if (x < 3 || y < 3 || x > W - 4 || y > map.height - 4) continue;
    const score = map.appeal[t]! + (map.river[t] ? 0.18 : 0) + (map.coastal[t] ? 0.08 : 0) + rng.range(0, 0.35);
    candidates.push({ tile: t, score });
  }
  candidates.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const chosen: number[] = [];
  let minDist = Math.max(10, Math.sqrt(map.landTiles / count) * 0.8);
  while (chosen.length < count && minDist >= 4) {
    for (const c of candidates) {
      if (chosen.length >= count) break;
      const cx = c.tile % W;
      const cy = (c.tile / W) | 0;
      let ok = true;
      for (const o of chosen) {
        const dx = (o % W) - cx;
        const dy = ((o / W) | 0) - cy;
        if (dx * dx + dy * dy < minDist * minDist) {
          ok = false;
          break;
        }
      }
      if (ok) chosen.push(c.tile);
    }
    minDist *= 0.85;
  }
  return chosen;
}
