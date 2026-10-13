import type { Civ, Command, CommandRecord, World } from '../types/simulation';
import { isWaterBiome } from '../world/biomes';
import { LANGUAGES } from '../utils/names';
import { formatPopulation } from '../utils/format';
import { ERAS, MAX_ERA } from './constants';
import { createCulture } from './civs';
import { applyBlight, applyQuake, startPlague } from './disasters';
import { baseRuralCapacity } from './economy';
import { logEvent } from './events';
import { spawnBreakaway } from './lifecycle';
import { rebuildTerritory, regionAround, tilesInRadius } from './territory';
import { declareWar, endWar } from './war';
import { capitalTile, warBetween } from './world';

export interface CommandResult {
  ok: boolean;
  message: string;
}

const fail = (message: string): CommandResult => ({ ok: false, message });

function livingCiv(world: World, id: number): Civ | null {
  const civ = world.civs[id];
  return civ && civ.alive ? civ : null;
}

/** Radius (in tiles) of each map-targeted divine power, for previews. */
export const COMMAND_RADIUS: Partial<Record<Command['type'], number>> = {
  spawn_civ: 3,
  famine: 5,
  plague: 0,
  earthquake: 4,
  flood: 5,
};

/**
 * Applies a divine intervention immediately (between simulation ticks) and
 * records it in the command log so replays reproduce it exactly.
 */
export function executeCommand(world: World, command: Command, record = true): CommandResult {
  const result = apply(world, command);
  if (result.ok && record) world.commandLog.push({ year: world.year, command: structuredCloneCommand(command) });
  if (result.ok) rebuildTerritory(world);
  return result;
}

function structuredCloneCommand(command: Command): Command {
  return JSON.parse(JSON.stringify(command)) as Command;
}

function apply(world: World, cmd: Command): CommandResult {
  const rng = world.rng;
  switch (cmd.type) {
    case 'spawn_civ': {
      const { map } = world;
      if (cmd.tile < 0 || cmd.tile >= map.size || isWaterBiome(map.biome[cmd.tile]!)) return fail('Choose a land tile.');
      const owner = world.owner[cmd.tile]!;
      const parent = owner >= 0 ? world.civs[owner]! : null;
      if (parent && world.cities[parent.capital]?.tile === cmd.tile) return fail('Cannot raise a nation on a capital.');
      const lm = map.landmass[cmd.tile];
      let region: number[];
      if (parent) {
        const capT = capitalTile(world, parent);
        region = regionAround(world, cmd.tile, 2, (t) => world.owner[t] === owner && t !== capT && map.landmass[t] === lm, 14);
        if (region.length >= parent.tiles) region = region.slice(0, Math.max(1, parent.tiles - 1));
      } else {
        region = regionAround(world, cmd.tile, 3, (t) => world.owner[t] === -1 && !isWaterBiome(map.biome[t]!) && map.landmass[t] === lm, 20);
      }
      if (region.length === 0) return fail('No room for a new nation here.');
      const culture = createCulture(world, rng.pick(LANGUAGES).id, world.civs.length);
      for (const t of region) {
        world.culture[t] = culture.id;
        if (world.owner[t] === -1) world.pop[t] = Math.max(world.pop[t]!, baseRuralCapacity(world, t, 0) * 0.45);
      }
      world.pop[cmd.tile] = world.pop[cmd.tile]! + 3000;
      const civ = spawnBreakaway(world, parent, region, { kind: 'divine', capitalTile: cmd.tile, armyShare: 0.2 });
      if (!civ) return fail('The world cannot hold more nations.');
      culture.name = civ.adjective;
      civ.army += 1500;
      civ.wealth += 80;
      const capital = world.cities[civ.capital];
      logEvent(world, 'divine', [civ.id], `By divine will, the ${civ.name} springs into being at ${capital?.name ?? 'a new land'}.`, 4, cmd.tile);
      if (parent) declareWar(world, civ, parent, 'independence', { divine: true });
      return { ok: true, message: `The ${civ.name} has been created.` };
    }
    case 'grant_resources': {
      const civ = livingCiv(world, cmd.civ);
      if (!civ) return fail('That nation no longer exists.');
      civ.food += (civ.population / 1000) * 1.5;
      civ.wealth += civ.revenue * 8 + 120;
      civ.iron += 80;
      civ.timber += 80;
      civ.stone += 80;
      civ.stability = Math.min(100, civ.stability + 5);
      logEvent(world, 'divine', [civ.id], `Divine bounty: grain, gold and ore rain down upon the ${civ.name}.`, 2, capitalTile(world, civ));
      return { ok: true, message: `Resources granted to the ${civ.name}.` };
    }
    case 'economic_boom': {
      const civ = livingCiv(world, cmd.civ);
      if (!civ) return fail('That nation no longer exists.');
      civ.effects.push({ kind: 'boom', until: world.year + 25, magnitude: 0.5, divine: true });
      logEvent(world, 'divine', [civ.id], `A divinely inspired economic boom sweeps the ${civ.name}.`, 3, capitalTile(world, civ));
      return { ok: true, message: `An economic boom begins in the ${civ.name}.` };
    }
    case 'famine': {
      if (cmd.tile < 0 || cmd.tile >= world.map.size) return fail('Invalid location.');
      const civs = applyBlight(world, cmd.tile, COMMAND_RADIUS.famine!, 0.92);
      for (const c of civs) {
        c.food *= 0.3;
        logEvent(world, 'divine', [c.id], `The heavens withhold their rain: blight and famine fall upon the ${c.name}.`, 3, cmd.tile);
      }
      if (civs.length === 0) logEvent(world, 'divine', [], `A divine blight withers an empty land.`, 1, cmd.tile);
      return { ok: true, message: civs.length > 0 ? `Famine strikes ${civs.length} nation(s).` : 'A blight falls on empty land.' };
    }
    case 'plague': {
      const owner = cmd.tile >= 0 && cmd.tile < world.map.size ? world.owner[cmd.tile]! : -1;
      const civ = owner >= 0 ? livingCiv(world, owner) : null;
      if (!civ) return fail('Plague needs a populated land.');
      startPlague(civ, 1);
      logEvent(world, 'divine', [civ.id], `A divine pestilence erupts among the people of the ${civ.name}.`, 4, cmd.tile);
      return { ok: true, message: `Plague unleashed on the ${civ.name}.` };
    }
    case 'earthquake': {
      if (cmd.tile < 0 || cmd.tile >= world.map.size) return fail('Invalid location.');
      const { deaths, civs } = applyQuake(world, cmd.tile, COMMAND_RADIUS.earthquake!, 1);
      for (const c of civs) c.stability = Math.max(0, c.stability - 6);
      const cityId = world.cityAt[cmd.tile]!;
      const where = cityId >= 0 ? world.cities[cityId]!.name : civs[0] ? `the lands of the ${civs[0].name}` : 'an empty land';
      logEvent(world, 'divine', civs.map((c) => c.id), `The earth splits open beneath ${where}; some ${formatPopulation(deaths)} perish.`, civs.length > 0 ? 4 : 1, cmd.tile);
      return { ok: true, message: `Earthquake: ${formatPopulation(deaths)} dead.` };
    }
    case 'flood': {
      if (cmd.tile < 0 || cmd.tile >= world.map.size) return fail('Invalid location.');
      const { map } = world;
      const area = tilesInRadius(world, cmd.tile, COMMAND_RADIUS.flood!);
      let deaths = 0;
      const hit = new Set<number>();
      for (const t of area) {
        if (isWaterBiome(map.biome[t]!)) continue;
        const low = map.river[t]! > 0 || map.coastal[t] === 1 || map.elevation[t]! < map.seaLevel + 0.06;
        if (!low) continue;
        world.blight[t] = Math.max(world.blight[t]!, 0.6);
        world.devastation[t] = Math.max(world.devastation[t]!, 0.35);
        if (world.owner[t]! >= 0) {
          const kill = world.pop[t]! * 0.08;
          world.pop[t] = Math.max(25, world.pop[t]! - kill);
          deaths += kill;
          hit.add(world.owner[t]!);
        }
      }
      const ids = Array.from(hit).sort((a, b) => a - b);
      logEvent(world, 'divine', ids, ids.length > 0 ? `Great floods drown the lowlands of the ${ids.map((i) => world.civs[i]!.name).join(' and the ')}.` : 'Floods sweep an empty land.', ids.length > 0 ? 3 : 1, cmd.tile);
      return { ok: true, message: `Flood: ${formatPopulation(deaths)} dead.` };
    }
    case 'force_war': {
      const a = livingCiv(world, cmd.attacker);
      const d = livingCiv(world, cmd.defender);
      if (!a || !d) return fail('Both nations must exist.');
      if (a.id === d.id) return fail('A nation cannot war with itself.');
      if (warBetween(world, a.id, d.id)) return fail('They are already at war.');
      const war = declareWar(world, a, d, 'divine', { divine: true });
      if (!war) return fail('War could not be declared.');
      return { ok: true, message: `${war.name} begins.` };
    }
    case 'force_peace': {
      const war = world.wars[cmd.war];
      if (!war || war.endYear !== null) return fail('That war is already over.');
      endWar(world, war, 'stalemate', true);
      logEvent(world, 'divine', war.participants.map((p) => p.civ), `A divine voice commands peace, and the ${war.name} ends.`, 3);
      return { ok: true, message: `${war.name} has ended.` };
    }
    case 'tech_boost': {
      const civ = livingCiv(world, cmd.civ);
      if (!civ) return fail('That nation no longer exists.');
      if (civ.era < MAX_ERA) {
        const span = ERAS[civ.era + 1]!.cost - ERAS[civ.era]!.cost;
        civ.techPoints += span * 0.6;
      } else {
        civ.techPoints += 5000;
      }
      civ.effects.push({ kind: 'scientific_revolution', until: world.year + 20, magnitude: 0.5, divine: true });
      logEvent(world, 'divine', [civ.id], `Divine inspiration sparks a scientific revolution in the ${civ.name}.`, 3, capitalTile(world, civ));
      return { ok: true, message: `Knowledge flows into the ${civ.name}.` };
    }
    case 'destabilize': {
      const civ = livingCiv(world, cmd.civ);
      if (!civ) return fail('That nation no longer exists.');
      civ.stability = Math.max(0, civ.stability - 40);
      civ.legitimacy = Math.max(0, civ.legitimacy - 35);
      civ.unrest = Math.min(100, civ.unrest + 45);
      civ.lastUpheaval = Math.min(civ.lastUpheaval, world.year - 10);
      civ.effects.push({ kind: 'turmoil', until: world.year + 12, magnitude: 0.5, divine: true });
      logEvent(world, 'divine', [civ.id], `Omens and dark prophecies throw the ${civ.name} into turmoil.`, 3, capitalTile(world, civ));
      return { ok: true, message: `The ${civ.name} is destabilised.` };
    }
    case 'bless': {
      const civ = livingCiv(world, cmd.civ);
      if (!civ) return fail('That nation no longer exists.');
      civ.effects.push({ kind: 'divine_favor', until: world.year + 30, magnitude: 0.4, divine: true });
      civ.stability = Math.min(100, civ.stability + 15);
      civ.plague = 0;
      logEvent(world, 'divine', [civ.id], `The ${civ.name} is blessed with divine favour; its people rejoice.`, 3, capitalTile(world, civ));
      return { ok: true, message: `The ${civ.name} is blessed.` };
    }
    default:
      return fail('Unknown command.');
  }
}

/** Applies every recorded command scheduled for the current year (used by replays). */
export function applyScheduledCommands(world: World, records: readonly CommandRecord[]): void {
  for (const r of records) if (r.year === world.year) executeCommand(world, r.command);
}
