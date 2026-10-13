import { describe, expect, it } from 'vitest';
import { generateMap } from '../world/generate';
import { isWaterBiome } from '../world/biomes';
import { Biome } from '../types/world';
import { createWorld } from '../simulation/genesis';
import { checkInvariants } from '../simulation/invariants';

describe('world generation', () => {
  it('is deterministic for the same seed', () => {
    const a = generateMap('determinism', { width: 160, height: 100, landFraction: 0.4 });
    const b = generateMap('determinism', { width: 160, height: 100, landFraction: 0.4 });
    expect(Array.from(a.elevation)).toEqual(Array.from(b.elevation));
    expect(Array.from(a.biome)).toEqual(Array.from(b.biome));
    expect(Array.from(a.resource)).toEqual(Array.from(b.resource));
  });

  it('differs between seeds', () => {
    const a = generateMap('first', { width: 160, height: 100, landFraction: 0.4 });
    const b = generateMap('second', { width: 160, height: 100, landFraction: 0.4 });
    let diff = 0;
    for (let i = 0; i < a.size; i++) if (a.biome[i] !== b.biome[i]) diff++;
    expect(diff).toBeGreaterThan(a.size * 0.2);
  });

  it('has a sensible mix of land, water, relief and rivers', () => {
    for (const seed of ['geo-a', 'geo-b', 'geo-c']) {
      const map = generateMap(seed, { width: 160, height: 100, landFraction: 0.4 });
      const landFraction = map.landTiles / map.size;
      expect(landFraction).toBeGreaterThan(0.3);
      expect(landFraction).toBeLessThan(0.5);
      const counts = new Map<number, number>();
      let rivers = 0;
      let resources = 0;
      for (let i = 0; i < map.size; i++) {
        counts.set(map.biome[i]!, (counts.get(map.biome[i]!) ?? 0) + 1);
        if (map.river[i]) rivers++;
        if (map.resource[i]) resources++;
        if (isWaterBiome(map.biome[i]!)) {
          expect(map.landmass[i]).toBe(-1);
          expect(map.river[i]).toBe(0);
        }
      }
      expect(counts.get(Biome.Mountains) ?? 0).toBeGreaterThan(50);
      expect(counts.get(Biome.Hills) ?? 0).toBeGreaterThan(200);
      expect(counts.get(Biome.Grassland) ?? 0).toBeGreaterThan(200);
      expect(rivers).toBeGreaterThan(150);
      expect(resources).toBeGreaterThan(300);
      // The map frame is always water.
      for (let x = 0; x < map.width; x++) expect(isWaterBiome(map.biome[x]!)).toBe(true);
    }
  });

  it('places 8–14 uniquely named civilisations on valid land', () => {
    for (const seed of ['civs-1', 'civs-2', 'civs-3']) {
      const world = createWorld(seed);
      expect(world.civs.length).toBeGreaterThanOrEqual(8);
      expect(world.civs.length).toBeLessThanOrEqual(14);
      const names = new Set(world.civs.map((c) => c.name));
      expect(names.size).toBe(world.civs.length);
      const colors = new Set(world.civs.map((c) => c.color));
      expect(colors.size).toBe(world.civs.length);
      for (const civ of world.civs) {
        const capital = world.cities[civ.capital]!;
        expect(isWaterBiome(world.map.biome[capital.tile]!)).toBe(false);
        expect(world.owner[capital.tile]).toBe(civ.id);
        expect(civ.tiles).toBeGreaterThan(3);
        expect(civ.population).toBeGreaterThan(0);
      }
      expect(checkInvariants(world)).toEqual([]);
    }
  });
});
