import type { CommandRecord, World } from '../types/simulation';
import { applyScheduledCommands } from './commands';
import { updateDiplomacy } from './diplomacy';
import { updateDisasters } from './disasters';
import { updateEconomy, updatePopulation } from './economy';
import { updateExpansion } from './expansion';
import { ensureCapital } from './lifecycle';
import { updatePolitics } from './politics';
import { sampleStatistics, updatePeaks } from './stats';
import { rebuildTerritory } from './territory';
import { updateTechnology } from './technology';
import { updateWars } from './war';

/**
 * Advances the world by exactly one year. The order of systems is fixed and
 * every random draw comes from `world.rng`, so a world (or a save of it)
 * always evolves identically.
 */
export function stepYear(world: World): void {
  // Derived caches are always current here: they are rebuilt at the end of
  // every year, after every divine command, and whenever a world is loaded.
  world.year += 1;
  updateEconomy(world);
  updatePopulation(world);
  updateTechnology(world);
  updateDiplomacy(world);
  updateWars(world);
  updateExpansion(world);
  updatePolitics(world);
  updateDisasters(world);
  finalizeYear(world);
}

/** End-of-year bookkeeping that keeps derived data and invariants consistent. */
function finalizeYear(world: World): void {
  // Relocate lost capitals; civilisations left without land are removed.
  for (const civ of world.civs) if (civ.alive) ensureCapital(world, civ);
  rebuildTerritory(world);
  for (const city of world.cities) city.population = city.ruined ? 0 : world.pop[city.tile]!;
  updatePeaks(world);
  sampleStatistics(world);
}

/** Runs `years` ticks, applying any scheduled commands at the matching years. */
export function advance(world: World, years: number, schedule?: readonly CommandRecord[]): void {
  for (let i = 0; i < years; i++) {
    if (schedule) applyScheduledCommands(world, schedule);
    stepYear(world);
  }
}
