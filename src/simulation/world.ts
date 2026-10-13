import type { Civ, Relation, War, WarParticipant, WarSide, World } from '../types/simulation';

/** Order-independent key for a pair of civilisation ids. */
export const pairKey = (a: number, b: number): number => (a < b ? a * 65536 + b : b * 65536 + a);

export function getRelation(world: World, a: number, b: number): Relation | undefined {
  return world.cache.relIndex.get(pairKey(a, b));
}

/** Returns the relation between two civilisations, creating it on first contact. */
export function ensureRelation(world: World, a: number, b: number): Relation {
  const key = pairKey(a, b);
  let rel = world.cache.relIndex.get(key);
  if (!rel) {
    rel = {
      a: Math.min(a, b),
      b: Math.max(a, b),
      opinion: 0,
      alliance: false,
      allianceSince: 0,
      allianceName: null,
      trade: false,
      tradeSince: 0,
      rivalry: false,
      truceUntil: 0,
      lastWarEnd: -9999,
      warCount: 0,
      grievance: 0,
      contact: false,
      border: 0,
    };
    world.relations.push(rel);
    world.cache.relIndex.set(key, rel);
  }
  return rel;
}

export function rebuildRelationIndex(world: World): void {
  world.cache.relIndex = new Map();
  for (const rel of world.relations) world.cache.relIndex.set(pairKey(rel.a, rel.b), rel);
}

/** Drops every relation involving a civilisation (used when it dies). */
export function removeRelationsOf(world: World, civId: number): void {
  world.relations = world.relations.filter((r) => r.a !== civId && r.b !== civId);
  rebuildRelationIndex(world);
}

export function otherOf(rel: Relation, civId: number): number {
  return rel.a === civId ? rel.b : rel.a;
}

export function livingCivs(world: World): Civ[] {
  const out: Civ[] = [];
  for (const c of world.civs) if (c.alive) out.push(c);
  return out;
}

export function activeWars(world: World): War[] {
  return world.cache.activeWars;
}

export function rebuildActiveWars(world: World): void {
  world.cache.activeWars = world.wars.filter((w) => w.endYear === null);
}

export function participant(war: War, civId: number): WarParticipant | undefined {
  return war.participants.find((p) => p.civ === civId && p.left === null);
}

export function sideOf(war: War, civId: number): WarSide | null {
  return participant(war, civId)?.side ?? null;
}

export function sideMembers(war: War, side: WarSide): number[] {
  const out: number[] = [];
  for (const p of war.participants) if (p.side === side && p.left === null) out.push(p.civ);
  return out;
}

/** Active war in which `a` and `b` are on opposing sides, if any. */
export function warBetween(world: World, a: number, b: number): War | undefined {
  for (const w of world.cache.activeWars) {
    const sa = sideOf(w, a);
    const sb = sideOf(w, b);
    if (sa && sb && sa !== sb) return w;
  }
  return undefined;
}

export function warsOf(world: World, civId: number): War[] {
  return world.cache.activeWars.filter((w) => participant(w, civId) !== undefined);
}

export function enemiesOf(world: World, civId: number): number[] {
  const out = new Set<number>();
  for (const w of world.cache.activeWars) {
    const side = sideOf(w, civId);
    if (!side) continue;
    for (const p of w.participants) if (p.left === null && p.side !== side) out.add(p.civ);
  }
  return Array.from(out).sort((x, y) => x - y);
}

export function alliesOf(world: World, civId: number): number[] {
  const out: number[] = [];
  for (const rel of world.relations) {
    if (!rel.alliance) continue;
    if (rel.a === civId) out.push(rel.b);
    else if (rel.b === civId) out.push(rel.a);
  }
  return out.sort((x, y) => x - y);
}

export function tradePartnersOf(world: World, civId: number): number[] {
  const out: number[] = [];
  for (const rel of world.relations) {
    if (!rel.trade) continue;
    if (rel.a === civId) out.push(rel.b);
    else if (rel.b === civId) out.push(rel.a);
  }
  return out.sort((x, y) => x - y);
}

export function civAge(world: World, civ: Civ): number {
  return (civ.extinctYear ?? world.year) - civ.foundedYear;
}

export function tileX(world: World, tile: number): number {
  return tile % world.map.width;
}

export function tileY(world: World, tile: number): number {
  return (tile / world.map.width) | 0;
}

export function tileDistance(world: World, a: number, b: number): number {
  const w = world.map.width;
  const dx = (a % w) - (b % w);
  const dy = ((a / w) | 0) - ((b / w) | 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function capitalTile(world: World, civ: Civ): number {
  const city = world.cities[civ.capital];
  return city ? city.tile : -1;
}
