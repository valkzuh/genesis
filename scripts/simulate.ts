/**
 * Headless GENESIS: runs a world without any browser and prints its
 * chronicle. Useful for balancing, for exploring seeds, and as proof that
 * the simulation engine is independent of the interface.
 *
 *   npm run simulate -- --seed amber-falcon-42 --years 1000
 */
import { createWorld } from '../src/simulation/genesis';
import { stepYear } from '../src/simulation/engine';
import { checkInvariants } from '../src/simulation/invariants';
import { worldStats } from '../src/simulation/queries';
import { ERAS } from '../src/simulation/constants';
import { formatPopulation } from '../src/utils/format';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const seed = arg('seed', 'genesis');
const years = Math.max(1, Number(arg('years', '1000')));
const minImportance = Number(arg('importance', '4'));

const started = performance.now();
const world = createWorld(seed);
console.log(`\nGENESIS — the World of ${world.name} (seed "${seed}")`);
console.log(`${world.civs.length} peoples rise at the dawn of history.\n`);

let lastEvent = 0;
for (let i = 0; i < years; i++) {
  stepYear(world);
  for (; lastEvent < world.events.length; lastEvent++) {
    const e = world.events[lastEvent]!;
    if (e.importance >= minImportance) console.log(`${String(e.year).padStart(5)}  ${e.text}`);
  }
  // Events may be pruned when the log is full; keep the cursor valid.
  if (lastEvent > world.events.length) lastEvent = world.events.length;
}
const elapsed = (performance.now() - started) / 1000;
const stats = worldStats(world);
const problems = checkInvariants(world);

console.log(`\n— Year ${world.year} —`);
console.log(`${stats.living} nations live (${stats.total - stats.living} have fallen), ${formatPopulation(stats.population)} people, ${world.wars.length} wars fought.`);
for (const civ of world.civs.filter((c) => c.alive).sort((a, b) => b.population - a.population)) {
  console.log(`  ${civ.name.padEnd(34)} ${ERAS[civ.era]!.name.padEnd(12)} ${formatPopulation(civ.population).padStart(8)}  ${String(civ.tiles).padStart(4)} provinces`);
}
console.log(`\nSimulated ${years} years in ${elapsed.toFixed(1)}s · invariants: ${problems.length === 0 ? 'all hold' : problems.join('; ')}`);
process.exit(problems.length === 0 ? 0 : 1);
