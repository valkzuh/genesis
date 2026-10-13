import type { CivSample, GlobalSample, World } from '../types/simulation';
import { SIM } from './constants';
import { activeWars } from './world';

/** Halves the resolution of the older half of a series once it grows too long. */
export function downsample<T>(series: T[], max: number): T[] {
  if (series.length <= max) return series;
  const half = Math.floor(series.length / 2);
  const out: T[] = [];
  for (let i = 0; i < half; i++) if (i % 2 === 0) out.push(series[i]!);
  for (let i = half; i < series.length; i++) out.push(series[i]!);
  return out;
}

export function sampleStatistics(world: World, force = false): void {
  if (!force && world.year % SIM.sampleInterval !== 0) return;
  let pop = 0;
  let civs = 0;
  let owned = 0;
  let eraSum = 0;
  let maxEra = 0;
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    civs++;
    pop += civ.population;
    owned += civ.tiles;
    eraSum += civ.era;
    maxEra = Math.max(maxEra, civ.era);
    const sample: CivSample = {
      y: world.year,
      pop: Math.round(civ.population),
      tiles: civ.tiles,
      wealth: Math.round(civ.wealth),
      army: Math.round(civ.army),
      tech: Math.round(civ.techPoints),
      stab: Math.round(civ.stability),
      output: Math.round(civ.output * 10) / 10,
    };
    const last = civ.history[civ.history.length - 1];
    if (last && last.y === world.year) civ.history[civ.history.length - 1] = sample;
    else civ.history.push(sample);
    civ.history = downsample(civ.history, SIM.maxCivSamples);
  }
  const g: GlobalSample = {
    y: world.year,
    pop: Math.round(pop),
    civs,
    wars: activeWars(world).length,
    ownedTiles: owned,
    avgEra: civs > 0 ? Math.round((eraSum / civs) * 100) / 100 : 0,
    maxEra,
  };
  const last = world.history[world.history.length - 1];
  if (last && last.y === world.year) world.history[world.history.length - 1] = g;
  else world.history.push(g);
  world.history = downsample(world.history, SIM.maxCivSamples * 2);
}

/** Updates peak counters; cheap enough to run every tick. */
export function updatePeaks(world: World): void {
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    if (civ.population > civ.counters.peakPopulation) {
      civ.counters.peakPopulation = civ.population;
      civ.counters.peakPopulationYear = world.year;
    }
    if (civ.tiles > civ.counters.peakTiles) {
      civ.counters.peakTiles = civ.tiles;
      civ.counters.peakTilesYear = world.year;
    }
  }
}
