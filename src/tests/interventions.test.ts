import { describe, expect, it } from 'vitest';
import { createWorld } from '../simulation/genesis';
import { advance } from '../simulation/engine';
import { executeCommand } from '../simulation/commands';
import { checkInvariants } from '../simulation/invariants';
import { warBetween } from '../simulation/world';
import { isWaterBiome } from '../world/biomes';
import type { World } from '../types/simulation';

function grownWorld(seed: string, years = 120): World {
  const world = createWorld(seed);
  advance(world, years);
  return world;
}

const living = (w: World) => w.civs.filter((c) => c.alive);
const capitalTileOf = (w: World, id: number) => w.cities[w.civs[id]!.capital]!.tile;

describe('god mode interventions', () => {
  it('spawns a new civilisation on unclaimed land', () => {
    const world = createWorld('spawn-empty');
    const before = world.civs.length;
    let target = -1;
    for (let t = 0; t < world.map.size; t++) {
      if (world.owner[t] === -1 && !isWaterBiome(world.map.biome[t]!) && world.map.appeal[t]! > 0.4) {
        target = t;
        break;
      }
    }
    const result = executeCommand(world, { type: 'spawn_civ', tile: target });
    expect(result.ok).toBe(true);
    expect(world.civs.length).toBe(before + 1);
    const civ = world.civs[world.civs.length - 1]!;
    expect(civ.alive).toBe(true);
    expect(world.owner[target]).toBe(civ.id);
    expect(world.events.some((e) => e.type === 'divine' && e.civs.includes(civ.id))).toBe(true);
    expect(checkInvariants(world)).toEqual([]);
    advance(world, 20);
    expect(checkInvariants(world)).toEqual([]);
  });

  it('carves a rebel nation out of an existing one', () => {
    const world = grownWorld('spawn-owned');
    const victim = living(world).sort((a, b) => b.tiles - a.tiles)[0]!;
    const capital = capitalTileOf(world, victim.id);
    const tile = world.cache.civTiles[victim.id]!.find((t) => t !== capital && world.cityAt[t] === -1)!;
    const result = executeCommand(world, { type: 'spawn_civ', tile });
    expect(result.ok).toBe(true);
    const rebel = world.civs[world.civs.length - 1]!;
    expect(world.owner[tile]).toBe(rebel.id);
    expect(warBetween(world, rebel.id, victim.id)).toBeDefined();
    expect(checkInvariants(world)).toEqual([]);
  });

  it('grants resources and booms economies', () => {
    const world = grownWorld('grant');
    const civ = living(world)[0]!;
    const wealth = civ.wealth;
    const iron = civ.iron;
    expect(executeCommand(world, { type: 'grant_resources', civ: civ.id }).ok).toBe(true);
    expect(civ.wealth).toBeGreaterThan(wealth);
    expect(civ.iron).toBeGreaterThan(iron);
    const output = civ.output;
    expect(executeCommand(world, { type: 'economic_boom', civ: civ.id }).ok).toBe(true);
    advance(world, 1);
    expect(civ.effects.some((e) => e.kind === 'boom')).toBe(true);
    expect(civ.output).toBeGreaterThan(output);
  });

  it('famine blights the land and empties granaries', () => {
    const world = grownWorld('famine');
    const civ = living(world)[0]!;
    const tile = capitalTileOf(world, civ.id);
    const food = civ.food;
    expect(executeCommand(world, { type: 'famine', tile }).ok).toBe(true);
    expect(world.blight[tile]).toBeGreaterThan(0.8);
    expect(civ.food).toBeLessThan(food);
    const balance = civ.foodBalance;
    advance(world, 1);
    expect(civ.foodBalance).toBeLessThan(balance);
  });

  it('plague kills people over the following years', () => {
    const world = grownWorld('plague');
    const civ = living(world).sort((a, b) => b.population - a.population)[0]!;
    // Compare against an identical world without the plague.
    const control = grownWorld('plague');
    expect(executeCommand(world, { type: 'plague', tile: capitalTileOf(world, civ.id) }).ok).toBe(true);
    expect(civ.plague).toBeGreaterThan(0.9);
    advance(world, 3);
    advance(control, 3);
    expect(civ.population).toBeLessThan(control.civs[civ.id]!.population);
  });

  it('earthquakes and floods kill and devastate', () => {
    const world = grownWorld('quake');
    const civ = living(world)[0]!;
    const tile = capitalTileOf(world, civ.id);
    const pop = world.pop[tile]!;
    expect(executeCommand(world, { type: 'earthquake', tile }).ok).toBe(true);
    expect(world.pop[tile]!).toBeLessThan(pop);
    expect(world.devastation[tile]!).toBeGreaterThan(0.5);
    expect(executeCommand(world, { type: 'flood', tile }).ok).toBe(true);
    expect(checkInvariants(world)).toEqual([]);
  });

  it('forces war and peace', () => {
    const world = grownWorld('war-peace');
    const [a, b] = living(world);
    expect(executeCommand(world, { type: 'force_war', attacker: a!.id, defender: b!.id }).ok).toBe(true);
    const war = warBetween(world, a!.id, b!.id)!;
    expect(war).toBeDefined();
    expect(war.divine).toBe(true);
    expect(executeCommand(world, { type: 'force_war', attacker: a!.id, defender: b!.id }).ok).toBe(false);
    advance(world, 2);
    if (war.endYear === null) {
      expect(executeCommand(world, { type: 'force_peace', war: war.id }).ok).toBe(true);
    }
    expect(war.endYear).not.toBeNull();
    expect(warBetween(world, a!.id, b!.id)).toBeUndefined();
    expect(checkInvariants(world)).toEqual([]);
  });

  it('boosts technology, destabilises and blesses', () => {
    const world = grownWorld('tech');
    const civ = living(world)[0]!;
    const era = civ.era;
    const points = civ.techPoints;
    expect(executeCommand(world, { type: 'tech_boost', civ: civ.id }).ok).toBe(true);
    expect(civ.techPoints).toBeGreaterThan(points);
    executeCommand(world, { type: 'tech_boost', civ: civ.id });
    advance(world, 1);
    expect(civ.era).toBeGreaterThan(era);

    const other = living(world)[1]!;
    const stability = other.stability;
    expect(executeCommand(world, { type: 'destabilize', civ: other.id }).ok).toBe(true);
    expect(other.stability).toBeLessThan(stability);
    expect(other.unrest).toBeGreaterThan(40);
    expect(executeCommand(world, { type: 'bless', civ: other.id }).ok).toBe(true);
    expect(other.effects.some((e) => e.kind === 'divine_favor')).toBe(true);
  });

  it('rejects invalid targets without recording them', () => {
    const world = createWorld('invalid');
    const logged = world.commandLog.length;
    expect(executeCommand(world, { type: 'spawn_civ', tile: 0 }).ok).toBe(false);
    expect(executeCommand(world, { type: 'grant_resources', civ: 999 }).ok).toBe(false);
    expect(executeCommand(world, { type: 'force_peace', war: 12345 }).ok).toBe(false);
    expect(world.commandLog.length).toBe(logged);
  });

  it('logs every divine intervention in history', () => {
    const world = grownWorld('logging');
    const civ = living(world)[0]!;
    const before = world.events.filter((e) => e.type === 'divine').length;
    executeCommand(world, { type: 'grant_resources', civ: civ.id });
    executeCommand(world, { type: 'bless', civ: civ.id });
    expect(world.events.filter((e) => e.type === 'divine').length).toBe(before + 2);
  });
});
