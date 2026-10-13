import type { Civ, World } from '../types/simulation';
import { ERAS, MAX_ERA } from './constants';
import { logEvent } from './events';
import { capitalTile } from './world';

const ERA_PHRASES: readonly string[] = [
  '',
  'masters writing, law and iron-working, entering the Classical era',
  'enters the Medieval era as castles, guilds and great cathedrals spread',
  'experiences a Renaissance of art, banking, printing and gunpowder',
  'discovers industrial technology — the age of steam and factories begins',
  'enters the Modern era of electricity, mass production and flight',
  'enters the Information age as computers and global networks transform society',
  'reaches the Future era of fusion power and synthetic biology',
];

/** True if no other civilisation (living or dead) reached `era` before. */
function isWorldFirst(world: World, civ: Civ, era: number): boolean {
  for (const other of world.civs) if (other.id !== civ.id && other.era >= era) return false;
  return true;
}

/** Advances civilisations through the eras as research accumulates. */
export function updateTechnology(world: World): void {
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    while (civ.era < MAX_ERA && civ.techPoints >= ERAS[civ.era + 1]!.cost) {
      civ.era++;
      const first = isWorldFirst(world, civ, civ.era);
      const text = first
        ? `The ${civ.name} ${ERA_PHRASES[civ.era]} — the first nation in the world to do so.`
        : `The ${civ.name} ${ERA_PHRASES[civ.era]}.`;
      logEvent(world, 'technology', [civ.id], text, first ? 4 : civ.era >= 4 ? 3 : 2, capitalTile(world, civ));
      // A new era steadies the realm and renews ambitions.
      civ.legitimacy = Math.min(100, civ.legitimacy + 5);
    }
  }
}

/** Fraction of the way from the current era to the next (0..1). */
export function eraProgress(civ: Civ): number {
  if (civ.era >= MAX_ERA) return 1;
  const lo = ERAS[civ.era]!.cost;
  const hi = ERAS[civ.era + 1]!.cost;
  return Math.max(0, Math.min(1, (civ.techPoints - lo) / (hi - lo)));
}
