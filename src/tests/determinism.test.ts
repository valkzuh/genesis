import { describe, expect, it } from 'vitest';
import { createWorld } from '../simulation/genesis';
import { advance } from '../simulation/engine';
import { executeCommand } from '../simulation/commands';
import { worldFingerprint, createSaveFile, loadSaveFile } from '../simulation/serialize';
import type { CommandRecord, World } from '../types/simulation';

/** Applies a scripted series of divine interventions while running. */
function runScripted(seed: string, years: number): World {
  const world = createWorld(seed);
  const capitalOf = (id: number) => world.cities[world.civs[id]!.capital]!.tile;
  for (let y = 0; y < years; y++) {
    switch (world.year) {
      case 40:
        executeCommand(world, { type: 'economic_boom', civ: 0 });
        executeCommand(world, { type: 'plague', tile: capitalOf(1) });
        break;
      case 90:
        executeCommand(world, { type: 'force_war', attacker: 2, defender: 3 });
        executeCommand(world, { type: 'famine', tile: capitalOf(4) });
        break;
      case 150:
        executeCommand(world, { type: 'earthquake', tile: capitalOf(5) });
        executeCommand(world, { type: 'tech_boost', civ: 6 });
        break;
      case 180: {
        const war = world.wars.find((w) => w.endYear === null);
        if (war) executeCommand(world, { type: 'force_peace', war: war.id });
        executeCommand(world, { type: 'destabilize', civ: 0 });
        break;
      }
      default:
        break;
    }
    advance(world, 1);
  }
  return world;
}

describe('deterministic replay', () => {
  it('reproduces identical worlds from the same seed and commands', () => {
    const a = runScripted('replay-seed', 260);
    const b = runScripted('replay-seed', 260);
    expect(a.commandLog.length).toBeGreaterThanOrEqual(6);
    expect(worldFingerprint(a)).toBe(worldFingerprint(b));
  });

  it('replays a recorded command log exactly', () => {
    const live = runScripted('replay-log', 240);
    const log: CommandRecord[] = live.commandLog.map((r) => JSON.parse(JSON.stringify(r)) as CommandRecord);
    const replay = createWorld('replay-log');
    advance(replay, 240, log);
    expect(worldFingerprint(replay)).toBe(worldFingerprint(live));
  });

  it('diverges when the intervention sequence differs', () => {
    const a = runScripted('replay-diverge', 200);
    const b = createWorld('replay-diverge');
    advance(b, 200);
    expect(worldFingerprint(a)).not.toBe(worldFingerprint(b));
  });

  it('continues identically after a save and load', () => {
    const continuous = createWorld('save-continuity');
    advance(continuous, 400);

    const first = createWorld('save-continuity');
    advance(first, 200);
    const json = JSON.stringify(createSaveFile(first, 'test'));
    const restored = loadSaveFile(json);
    expect(restored.year).toBe(first.year);
    expect(worldFingerprint(restored)).toBe(worldFingerprint(first));
    advance(restored, 200);
    expect(worldFingerprint(restored)).toBe(worldFingerprint(continuous));
  });
});
