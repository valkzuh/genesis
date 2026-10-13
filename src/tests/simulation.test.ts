import { describe, expect, it } from 'vitest';
import { createWorld } from '../simulation/genesis';
import { advance, stepYear } from '../simulation/engine';
import { checkInvariants } from '../simulation/invariants';
import { SIM } from '../simulation/constants';

describe('simulation smoke test', () => {
  it('advances a generated world 1,000 years while keeping every invariant', () => {
    const world = createWorld('smoke-test-1000');
    const startCivs = world.civs.length;
    let startPop = 0;
    for (const c of world.civs) startPop += c.population;
    for (let y = 0; y < 1000; y++) {
      stepYear(world);
      if (world.year % 50 === 0) {
        const problems = checkInvariants(world);
        expect(problems, `year ${world.year}`).toEqual([]);
      }
    }
    expect(world.year).toBe(1001);
    expect(checkInvariants(world)).toEqual([]);

    const living = world.civs.filter((c) => c.alive);
    let pop = 0;
    for (const c of living) pop += c.population;
    // The world fills up, develops and fights.
    expect(living.length).toBeGreaterThan(2);
    expect(pop).toBeGreaterThan(startPop * 5);
    expect(world.wars.length).toBeGreaterThan(5);
    expect(world.civs.length).toBeGreaterThanOrEqual(startCivs);
    expect(Math.max(...living.map((c) => c.era))).toBeGreaterThanOrEqual(3);
    // Nations develop at different speeds.
    const eras = new Set(living.map((c) => c.era));
    expect(eras.size + (living.length < 4 ? 1 : 0)).toBeGreaterThanOrEqual(2);
    // Bounded memory.
    expect(world.events.length).toBeLessThanOrEqual(SIM.maxEvents);
    for (const c of world.civs) expect(c.history.length).toBeLessThanOrEqual(SIM.maxCivSamples + 1);
    // History is grounded in real records.
    for (const e of world.events) {
      expect(e.year).toBeGreaterThanOrEqual(1);
      expect(e.year).toBeLessThanOrEqual(world.year);
      for (const id of e.civs) expect(world.civs[id]).toBeDefined();
    }
    for (const war of world.wars) {
      if (war.endYear !== null) {
        expect(war.outcome).not.toBeNull();
        expect(war.endYear).toBeGreaterThanOrEqual(war.startYear);
      }
    }
  });

  it('keeps invariants across several seeds over 400 years', () => {
    for (const seed of ['inv-a', 'inv-b', 'inv-c']) {
      const world = createWorld(seed);
      for (let i = 0; i < 4; i++) {
        advance(world, 100);
        expect(checkInvariants(world), `${seed} year ${world.year}`).toEqual([]);
      }
    }
  });

  it('records the fall of civilisations in the archive', () => {
    const world = createWorld('archive-check');
    advance(world, 900);
    const dead = world.civs.filter((c) => !c.alive);
    for (const civ of dead) {
      expect(civ.extinctYear).not.toBeNull();
      expect(civ.fate).toBeTruthy();
      expect(civ.history.length).toBeGreaterThan(0);
      expect(civ.tiles).toBe(0);
    }
  });
});
