import type { Civ, Relation, WarCause, World } from '../types/simulation';
import { clamp } from '../utils/math';
import { GOVERNMENTS, LEADER_TRAITS } from './constants';
import { logEvent } from './events';
import { declareWar } from './war';
import {
  alliesOf,
  capitalTile,
  enemiesOf,
  ensureRelation,
  getRelation,
  otherOf,
  pairKey,
  tileDistance,
  warBetween,
  warsOf,
} from './world';

/** Tiles of one civ's culture held by another: key pairKey(holder, claimant) → count, directional via map. */
export interface IrredentaMap {
  get(holder: number, claimant: number): number;
}

export function computeIrredenta(world: World): IrredentaMap {
  const cultureCivs = new Map<number, number[]>();
  for (const civ of world.civs) {
    if (!civ.alive) continue;
    const list = cultureCivs.get(civ.cultureId);
    if (list) list.push(civ.id);
    else cultureCivs.set(civ.cultureId, [civ.id]);
  }
  const counts = new Map<number, number>();
  const N = world.map.size;
  for (let t = 0; t < N; t++) {
    const o = world.owner[t]!;
    if (o < 0) continue;
    const c = world.culture[t]!;
    if (c < 0 || c === world.civs[o]!.cultureId) continue;
    const claimants = cultureCivs.get(c);
    if (!claimants) continue;
    for (const claimant of claimants) {
      const key = o * 65536 + claimant;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return { get: (holder, claimant) => counts.get(holder * 65536 + claimant) ?? 0 };
}

function coastalCounts(world: World): Int32Array {
  const out = new Int32Array(world.civs.length);
  const N = world.map.size;
  for (let t = 0; t < N; t++) {
    const o = world.owner[t]!;
    if (o >= 0 && world.map.coastal[t]) out[o] = out[o]! + 1;
  }
  return out;
}

const contactRange = (era: number): number => 18 + era * 14;

/** Rough reach check for overseas wars (no land border). */
function canReach(world: World, a: Civ, b: Civ, rel: Relation, coastal: Int32Array): boolean {
  if (rel.border > 0) return true;
  if (a.era < 2 || coastal[a.id]! === 0 || coastal[b.id]! === 0) return false;
  const ca = capitalTile(world, a);
  const cb = capitalTile(world, b);
  if (ca < 0 || cb < 0) return false;
  return tileDistance(world, ca, cb) <= 22 + a.era * 9;
}

function opinionTarget(world: World, rel: Relation, a: Civ, b: Civ, irr: IrredentaMap, enemies: number[][], rivals: number[][]): number {
  let t = 5;
  if (a.government === b.government) t += 12;
  const autocratic = (g: string) => g === 'dictatorship' || g === 'empire';
  const democratic = (g: string) => g === 'republic' || g === 'federation' || g === 'merchant';
  if ((autocratic(a.government) && democratic(b.government)) || (autocratic(b.government) && democratic(a.government))) t -= 10;
  t += (a.traits.diplomacy + b.traits.diplomacy) * 10;
  t -= (a.traits.aggression + b.traits.aggression) * 6;
  t -= (a.traits.isolation + b.traits.isolation) * 4;
  t += (LEADER_TRAITS[a.leader.trait].diplomacy + LEADER_TRAITS[b.leader.trait].diplomacy) * 25;
  if (a.cultureId === b.cultureId) t += 10;
  if (rel.trade) t += 12 + Math.min(10, (world.year - rel.tradeSince) / 10);
  if (rel.alliance) t += 20 + Math.min(10, (world.year - rel.allianceSince) / 10);
  if (rel.rivalry) t -= 35;
  if (warBetween(world, a.id, b.id)) t -= 70;
  const sinceWar = world.year - rel.lastWarEnd;
  if (sinceWar < 60) t -= (60 - sinceWar) * 0.45;
  else if (rel.warCount === 0 || sinceWar > 120) t += 5;
  t -= rel.grievance * 0.6;
  if (rel.border > 0) t -= Math.min(15, rel.border * 0.25) * (0.5 + (a.traits.expansion + b.traits.expansion) / 2);
  else t += 5;
  // Irredentism: holding the other's people breeds lasting resentment.
  const held = irr.get(a.id, b.id) + irr.get(b.id, a.id);
  t -= Math.min(30, held * 0.6);
  // The enemy of my enemy is my friend.
  const ea = enemies[a.id] ?? [];
  const eb = enemies[b.id] ?? [];
  let common = 0;
  for (const e of ea) if (eb.includes(e)) common++;
  t += Math.min(30, common * 15);
  const ra = rivals[a.id] ?? [];
  const rb = rivals[b.id] ?? [];
  for (const r of ra) if (rb.includes(r)) t += 10;
  return clamp(t, -100, 100);
}

/**
 * Yearly diplomacy: contact, opinions, trade, alliances, rivalries and the
 * decision to go to war.
 */
export function updateDiplomacy(world: World): void {
  const living = world.civs.filter((c) => c.alive);
  const irr = computeIrredenta(world);
  const coastal = coastalCounts(world);
  const rng = world.rng;
  const enemies: number[][] = world.civs.map(() => []);
  const rivals: number[][] = world.civs.map(() => []);
  for (const c of living) enemies[c.id] = enemiesOf(world, c.id);
  for (const r of world.relations) {
    if (!r.rivalry) continue;
    rivals[r.a]!.push(r.b);
    rivals[r.b]!.push(r.a);
  }

  // --- Contact, borders and opinions --------------------------------------
  for (let i = 0; i < living.length; i++) {
    const a = living[i]!;
    for (let j = i + 1; j < living.length; j++) {
      const b = living[j]!;
      const key = pairKey(a.id, b.id);
      const border = world.cache.borders.get(key) ?? 0;
      let rel = getRelation(world, a.id, b.id);
      if (!rel) {
        const ca = capitalTile(world, a);
        const cb = capitalTile(world, b);
        const near = ca >= 0 && cb >= 0 && tileDistance(world, ca, cb) <= contactRange(Math.max(a.era, b.era));
        if (border === 0 && !near) continue;
        rel = ensureRelation(world, a.id, b.id);
        rel.contact = true;
        rel.opinion = clamp((a.traits.diplomacy + b.traits.diplomacy) * 10 - (a.traits.isolation + b.traits.isolation) * 8 + rng.range(-15, 15), -40, 40);
        if (a.population > 50_000 && b.population > 50_000) {
          logEvent(world, 'diplomacy', [a.id, b.id], `The ${a.name} and the ${b.name} make first contact.`, 1, cb);
        }
      }
      rel.border = border;
      const target = opinionTarget(world, rel, a, b, irr, enemies, rivals);
      rel.opinion = clamp(rel.opinion + (target - rel.opinion) * 0.08 + rng.normal(0, 1.2), -100, 100);
      rel.grievance = Math.max(0, rel.grievance * 0.985 - 0.05);
    }
  }

  // --- Treaties ---------------------------------------------------------------
  for (const rel of world.relations) {
    const a = world.civs[rel.a]!;
    const b = world.civs[rel.b]!;
    if (!a.alive || !b.alive) continue;
    const atWar = warBetween(world, a.id, b.id) !== undefined;
    updateTrade(world, rel, a, b, atWar);
    updateAlliance(world, rel, a, b, atWar);
    updateRivalry(world, rel, a, b);
  }

  // --- War declarations ---------------------------------------------------------
  for (const civ of living) {
    if (!civ.alive) continue;
    considerWar(world, civ, irr, coastal);
  }
}

function updateTrade(world: World, rel: Relation, a: Civ, b: Civ, atWar: boolean): void {
  const rng = world.rng;
  if (rel.trade) {
    if (atWar || rel.opinion < -15) {
      rel.trade = false;
      logEvent(world, 'trade', [a.id, b.id], `Trade between the ${a.name} and the ${b.name} collapses.`, 1);
    }
    return;
  }
  if (atWar || rel.opinion < 8) return;
  const isolation = Math.max(a.traits.isolation, b.traits.isolation);
  if (isolation > 0.8 && rel.opinion < 45) return;
  const p = 0.035 * (a.traits.commerce + b.traits.commerce) * (1 - isolation * 0.6);
  if (rng.chance(p)) {
    rel.trade = true;
    rel.tradeSince = world.year;
    logEvent(world, 'trade', [a.id, b.id], `The ${a.name} and the ${b.name} open trade relations.`, 1);
  }
}

function sharedThreat(world: World, a: Civ, b: Civ): boolean {
  // A common rival, enemy, or a neighbouring power that dwarfs both of them.
  for (const rel of world.relations) {
    const third = rel.a === a.id ? rel.b : rel.b === a.id ? rel.a : -1;
    if (third < 0 || third === b.id) continue;
    const other = world.civs[third]!;
    if (!other.alive) continue;
    const relB = getRelation(world, b.id, third);
    if (!relB) continue;
    const hostileA = rel.rivalry || rel.opinion < -30 || warBetween(world, a.id, third) !== undefined;
    const hostileB = relB.rivalry || relB.opinion < -30 || warBetween(world, b.id, third) !== undefined;
    if (hostileA && hostileB) return true;
    if (rel.border > 0 && relB.border > 0 && other.armyPower > (a.armyPower + b.armyPower) * 0.9) return true;
  }
  return false;
}

const PACT_TYPES = ['Alliance', 'League', 'Pact', 'Concord', 'Entente', 'Compact'] as const;

/** Name for a new alliance bloc, derived from where its founders lie on the map. */
function allianceBlocName(world: World, a: Civ, b: Civ): string {
  const ca = capitalTile(world, a);
  const cb = capitalTile(world, b);
  const W = world.map.width;
  const H = world.map.height;
  const mx = ((ca % W) + (cb % W)) / 2 - W / 2;
  const my = (((ca / W) | 0) + ((cb / W) | 0)) / 2 - H / 2;
  const dir =
    Math.abs(mx) / W < 0.12 && Math.abs(my) / H < 0.12
      ? 'Central'
      : Math.abs(mx) / W > Math.abs(my) / H
        ? mx > 0
          ? 'Eastern'
          : 'Western'
        : my > 0
          ? 'Southern'
          : 'Northern';
  const used = new Set(world.relations.filter((r) => r.alliance && r.allianceName).map((r) => r.allianceName!));
  const type = PACT_TYPES[world.rng.int(PACT_TYPES.length)]!;
  const options = [`${dir} ${type}`, `${a.adjective}–${b.adjective} ${type}`, `${dir} ${PACT_TYPES[(PACT_TYPES.indexOf(type) + 1) % PACT_TYPES.length]}`];
  for (const name of options) if (!used.has(name)) return name;
  return `${a.adjective}–${b.adjective} ${type} of ${world.year}`;
}

/** The bloc name a civilisation's existing alliances carry, if any. */
function blocOf(world: World, civId: number): string | null {
  for (const r of world.relations) if (r.alliance && r.allianceName && (r.a === civId || r.b === civId)) return r.allianceName;
  return null;
}

function updateAlliance(world: World, rel: Relation, a: Civ, b: Civ, atWar: boolean): void {
  const rng = world.rng;
  if (rel.alliance) {
    if (atWar) {
      rel.alliance = false;
      return;
    }
    if (rel.opinion < 5 && rng.chance(0.25)) {
      rel.alliance = false;
      rel.grievance += 8;
      const bloc = rel.allianceName ? ` and leaves the ${rel.allianceName}` : '';
      logEvent(world, 'alliance', [a.id, b.id], `The ${a.name} breaks with the ${b.name}${bloc} amid mistrust.`, 3);
    }
    return;
  }
  if (atWar || rel.opinion < 35) return;
  if (Math.max(a.traits.isolation, b.traits.isolation) > 0.85) return;
  if (alliesOf(world, a.id).length >= 3 || alliesOf(world, b.id).length >= 3) return;
  // Never ally with someone fighting your own allies.
  for (const ally of alliesOf(world, a.id)) if (warBetween(world, ally, b.id)) return;
  for (const ally of alliesOf(world, b.id)) if (warBetween(world, ally, a.id)) return;
  const threat = sharedThreat(world, a, b);
  if (!threat && rel.opinion < 60) return;
  const govA = GOVERNMENTS[a.government];
  const govB = GOVERNMENTS[b.government];
  const p = (threat ? 0.06 : 0.015) * (0.4 + a.traits.diplomacy + b.traits.diplomacy + govA.diplomacy + govB.diplomacy);
  if (!rng.chance(p)) return;
  rel.alliance = true;
  rel.allianceSince = world.year;
  const blocA = blocOf(world, a.id);
  const blocB = blocOf(world, b.id);
  let text: string;
  if (blocB && !blocA) {
    rel.allianceName = blocB;
    text = `The ${a.name} joins the ${blocB} alongside the ${b.name}.`;
  } else if (blocA && !blocB) {
    rel.allianceName = blocA;
    text = `The ${b.name} joins the ${blocA} alongside the ${a.name}.`;
  } else if (blocA && blocB && blocA === blocB) {
    rel.allianceName = blocA;
    text = `The ${a.name} and the ${b.name} strengthen the ${blocA} with a direct pact.`;
  } else if (blocA && blocB) {
    // Two blocs merge under the older name.
    rel.allianceName = blocA;
    for (const r of world.relations) if (r.allianceName === blocB) r.allianceName = blocA;
    text = `The ${a.name} and the ${b.name} unite the ${blocA} and the ${blocB}.`;
  } else {
    rel.allianceName = allianceBlocName(world, a, b);
    text = `The ${rel.allianceName} is formed by the ${a.name} and the ${b.name}${threat ? ' against a common threat' : ''}.`;
  }
  logEvent(world, 'alliance', [a.id, b.id], text, 3, capitalTile(world, a));
}

function updateRivalry(world: World, rel: Relation, a: Civ, b: Civ): void {
  const rng = world.rng;
  if (rel.rivalry) {
    if (rel.opinion > -5 && rng.chance(0.2)) {
      rel.rivalry = false;
      logEvent(world, 'rivalry', [a.id, b.id], `The rivalry between the ${a.name} and the ${b.name} cools.`, 1);
    }
    return;
  }
  if (rel.opinion > -35) return;
  const ratio = (a.armyPower + 1) / (b.armyPower + 1);
  if (ratio < 0.33 || ratio > 3) return;
  if (rel.border === 0 && rel.warCount === 0) return;
  if (rng.chance(0.08)) {
    rel.rivalry = true;
    logEvent(world, 'rivalry', [a.id, b.id], `The ${a.name} and the ${b.name} become bitter rivals.`, 2);
  }
}

/** Military strength a civilisation can expect to field, counting likely allies. */
export function coalitionPower(world: World, civ: Civ, defensive: boolean): number {
  let p = civ.armyPower;
  for (const ally of alliesOf(world, civ.id)) {
    const other = world.civs[ally]!;
    if (other.alive) p += other.armyPower * (defensive ? 0.65 : 0.35);
  }
  return p;
}

function considerWar(world: World, civ: Civ, irr: IrredentaMap, coastal: Int32Array): void {
  const rng = world.rng;
  if (world.year < civ.warCooldownUntil) return;
  const gov = GOVERNMENTS[civ.government];
  const lt = LEADER_TRAITS[civ.leader.trait];
  const aggressive = civ.traits.aggression + gov.aggression + lt.aggression;
  if (civ.warExhaustion > 30 + aggressive * 20) return;
  if (civ.stability < 20 && aggressive < 0.7) return;
  const wars = warsOf(world, civ.id).length;
  if (wars >= (aggressive > 0.8 ? 2 : 1)) return;

  let best: { target: Civ; desire: number; cause: WarCause } | null = null;
  const myPower = coalitionPower(world, civ, false);
  for (const rel of world.relations) {
    if (rel.a !== civ.id && rel.b !== civ.id) continue;
    const other = world.civs[otherOf(rel, civ.id)]!;
    if (!other.alive || rel.alliance || rel.truceUntil > world.year) continue;
    if (warBetween(world, civ.id, other.id)) continue;
    if (!canReach(world, civ, other, rel, coastal)) continue;
    const theirPower = coalitionPower(world, other, true);
    const ratio = myPower / Math.max(1, theirPower);
    const desperate = civ.landHunger > 0.7 && civ.needs.food > 0.5;
    if (ratio < (desperate ? 0.95 : 1.15)) continue;

    const motives: [WarCause, number][] = [
      ['border', rel.border > 0 ? 0.15 + Math.min(0.25, rel.border * 0.01) : 0],
      ['expansion', civ.landHunger * (0.25 + civ.traits.expansion * 0.45)],
      ['resources', civ.needs.food * 0.45 + civ.needs.iron * 0.2],
      ['rivalry', rel.rivalry ? 0.32 : 0],
      ['conquest', Math.max(0, -rel.opinion) / 100 * 0.5 + (ratio > 2 ? Math.min(0.3, (ratio - 2) * 0.1) : 0) + (rel.border > 0 ? civ.traits.aggression * 0.18 : 0)],
      ['reconquest', Math.min(0.45, irr.get(other.id, civ.id) * 0.02)],
    ];
    let motive = 0;
    let cause: WarCause = 'conquest';
    let top = -1;
    for (const [c, v] of motives) {
      motive += v;
      if (v > top) {
        top = v;
        cause = c;
      }
    }
    let desire = motive * (0.35 + aggressive * 0.85);
    if (rel.opinion > 30) desire -= 0.3;
    if (rel.trade) desire -= 0.12;
    desire -= civ.traits.isolation * 0.25;
    desire -= civ.warExhaustion / 100;
    desire -= wars * 0.2;
    if (civ.stability < 35 && aggressive > 0.6) desire += 0.08; // a war to distract the masses
    if (!best || desire > best.desire) best = { target: other, desire, cause };
  }
  if (!best || best.desire < 0.36) return;
  const p = Math.min(0.1, (best.desire - 0.36) * 0.22);
  if (rng.chance(p)) declareWar(world, civ, best.target, best.cause);
}
