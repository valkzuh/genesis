import type { Civ, War, WarCause, WarOutcome, WarParticipant, WarSide, World } from '../types/simulation';
import { neighborTable } from '../world/grid';
import { clamp } from '../utils/math';
import { ordinalWord } from '../utils/names';
import { GOVERNMENTS, SIM } from './constants';
import { adminRange } from './economy';
import { logEvent } from './events';
import { destroyCiv, ensureCapital } from './lifecycle';
import { setOwner } from './territory';
import {
  alliesOf,
  capitalTile,
  ensureRelation,
  getRelation,
  pairKey,
  participant,
  sideMembers,
  sideOf,
  tileDistance,
  warBetween,
  warsOf,
} from './world';

const CAUSE_PHRASE: Record<WarCause, string> = {
  border: 'over disputed borderlands',
  expansion: 'seeking room to grow',
  resources: 'to seize vital resources',
  rivalry: 'to settle a bitter rivalry',
  conquest: 'in a war of conquest',
  reconquest: 'to reclaim lands lost to it',
  independence: 'to secure its independence',
  civil_war: 'for control of the realm',
  divine: 'compelled by divine will',
};

export const CAUSE_LABEL: Record<WarCause, string> = {
  border: 'Border dispute',
  expansion: 'Expansion',
  resources: 'Resource scarcity',
  rivalry: 'Rivalry',
  conquest: 'Conquest',
  reconquest: 'Reconquest',
  independence: 'Independence',
  civil_war: 'Civil war',
  divine: 'Divine intervention',
};

function warName(world: World, attacker: Civ, defender: Civ, cause: WarCause): string {
  if (cause === 'independence') return `${attacker.adjective} War of Independence`;
  if (cause === 'civil_war') {
    const prior = world.wars.filter((w) => w.cause === 'civil_war' && w.leadDefender === defender.id).length;
    return `${prior > 0 ? ordinalWord(prior + 1) + ' ' : ''}${defender.adjective} Civil War`;
  }
  const rel = getRelation(world, attacker.id, defender.id);
  const count = rel ? rel.warCount : 0;
  const base = `${attacker.adjective}–${defender.adjective} War`;
  return count > 0 ? `${ordinalWord(count + 1)} ${base}` : base;
}

function addParticipant(war: War, civ: number, side: WarSide, year: number): void {
  war.participants.push({ civ, side, joined: year, left: null, losses: 0, tilesGained: 0, tilesLost: 0, citiesTaken: 0 });
}

function isMajor(world: World, civ: Civ): boolean {
  let total = 0;
  for (const c of world.civs) if (c.alive) total += c.population;
  return civ.tiles >= 60 || civ.population > total * 0.08;
}

/**
 * Starts a war, calling allies to arms. Allies that refuse a defensive call
 * break the alliance and earn a lasting grievance.
 */
export function declareWar(
  world: World,
  attacker: Civ,
  defender: Civ,
  cause: WarCause,
  opts: { divine?: boolean; callAllies?: boolean; quiet?: boolean } = {},
): War | null {
  if (!attacker.alive || !defender.alive || attacker.id === defender.id) return null;
  if (warBetween(world, attacker.id, defender.id)) return null;
  const rel = ensureRelation(world, attacker.id, defender.id);
  rel.contact = true;
  if (rel.alliance) {
    rel.alliance = false;
    rel.grievance += 40;
    logEvent(world, 'alliance', [attacker.id, defender.id], `The ${attacker.name} betrays its alliance with the ${defender.name}.`, 4);
  }
  if (rel.trade) rel.trade = false;
  const war: War = {
    id: world.wars.length,
    name: warName(world, attacker, defender, cause),
    cause,
    startYear: world.year,
    endYear: null,
    leadAttacker: attacker.id,
    leadDefender: defender.id,
    participants: [],
    score: 0,
    battles: 0,
    outcome: null,
    summary: null,
    divine: opts.divine ?? false,
  };
  rel.warCount++;
  rel.opinion = Math.min(rel.opinion, -40);
  addParticipant(war, attacker.id, 'attacker', world.year);
  addParticipant(war, defender.id, 'defender', world.year);
  world.wars.push(war);
  world.cache.activeWars.push(war);
  attacker.warCooldownUntil = world.year + 20;

  if (!opts.quiet) {
    const phrase = cause === 'resources' && attacker.needs.iron > attacker.needs.food ? 'to seize iron and ore' : cause === 'resources' ? 'to seize fertile farmland' : CAUSE_PHRASE[cause];
    const text =
      cause === 'independence'
        ? `The ${attacker.name} rises in revolt against the ${defender.name} ${phrase}.`
        : `The ${attacker.name} declares war on the ${defender.name} ${phrase}.`;
    const major = isMajor(world, attacker) || isMajor(world, defender);
    logEvent(world, 'war', [attacker.id, defender.id], text, major || opts.divine ? 4 : 3, capitalTile(world, defender), war.id);
  }

  if (opts.callAllies !== false && cause !== 'civil_war') callAllies(world, war, attacker, defender);
  return war;
}

function callAllies(world: World, war: War, attacker: Civ, defender: Civ): void {
  const rng = world.rng;
  // Defensive calls are obligations.
  for (const allyId of alliesOf(world, defender.id)) {
    if (allyId === attacker.id) continue;
    const ally = world.civs[allyId]!;
    if (!ally.alive || sideOf(war, allyId)) continue;
    const relAtt = getRelation(world, allyId, attacker.id);
    if (relAtt?.alliance) continue; // allied to both: stays neutral
    const relDef = getRelation(world, allyId, defender.id)!;
    const busy = warsOf(world, allyId).length;
    const willing = relDef.opinion > 10 && busy < 2 && ally.warExhaustion < 60;
    if (willing && rng.chance(0.8 + ally.traits.diplomacy * 0.2)) {
      addParticipant(war, allyId, 'defender', world.year);
      const r = ensureRelation(world, allyId, attacker.id);
      r.contact = true;
      r.opinion = Math.min(r.opinion, -30);
      r.trade = false;
      logEvent(world, 'war', [allyId, defender.id, attacker.id], `The ${ally.name} honours its alliance and joins the war against the ${attacker.name}.`, 2, -1, war.id);
    } else {
      relDef.alliance = false;
      relDef.grievance += 35;
      relDef.opinion -= 30;
      logEvent(world, 'alliance', [allyId, defender.id], `The ${ally.name} abandons its ally the ${defender.name} in its hour of need.`, 3);
    }
  }
  // Offensive calls are opportunistic.
  for (const allyId of alliesOf(world, attacker.id)) {
    if (allyId === defender.id) continue;
    const ally = world.civs[allyId]!;
    if (!ally.alive || sideOf(war, allyId)) continue;
    const relAtt = getRelation(world, allyId, attacker.id)!;
    const relDef = getRelation(world, allyId, defender.id);
    if (relDef?.alliance) continue;
    const hostile = !relDef || relDef.opinion < 0 || relDef.rivalry;
    if (relAtt.opinion > 45 && hostile && ally.traits.aggression > 0.3 && warsOf(world, allyId).length === 0 && rng.chance(0.5)) {
      addParticipant(war, allyId, 'attacker', world.year);
      const r = ensureRelation(world, allyId, defender.id);
      r.contact = true;
      r.opinion = Math.min(r.opinion, -30);
      r.trade = false;
      logEvent(world, 'war', [allyId, attacker.id, defender.id], `The ${ally.name} joins its ally the ${attacker.name} in the war on the ${defender.name}.`, 2, -1, war.id);
    }
  }
}

interface Front {
  war: War;
  a: number; // attacker-side civ
  d: number; // defender-side civ
  weight: number;
  naval: boolean;
}

/** Yearly resolution of every active war: battles, captures, exhaustion and peace. */
export function updateWars(world: World): void {
  if (world.cache.activeWars.length === 0) return;
  const rng = world.rng;
  const civs = world.civs;
  // Build fronts.
  const fronts: Front[] = [];
  const frontWeight = new Float64Array(civs.length);
  for (const war of world.cache.activeWars) {
    const attackers = sideMembers(war, 'attacker').filter((c) => civs[c]!.alive);
    const defenders = sideMembers(war, 'defender').filter((c) => civs[c]!.alive);
    for (const a of attackers) {
      for (const d of defenders) {
        const border = world.cache.borders.get(pairKey(a, d)) ?? 0;
        let weight = border;
        let naval = false;
        if (border === 0) {
          const ca = civs[a]!;
          const cd = civs[d]!;
          const reach = Math.max(ca.era, cd.era) >= 2;
          const capA = capitalTile(world, ca);
          const capD = capitalTile(world, cd);
          if (reach && capA >= 0 && capD >= 0 && tileDistance(world, capA, capD) <= 25 + Math.max(ca.era, cd.era) * 10) {
            weight = 3;
            naval = true;
          }
        }
        if (weight <= 0) continue;
        fronts.push({ war, a, d, weight, naval });
        frontWeight[a] = frontWeight[a]! + weight;
        frontWeight[d] = frontWeight[d]! + weight;
      }
    }
  }

  const losses = new Float64Array(civs.length);
  const tilesLost = new Float64Array(civs.length);
  const armyBefore = new Float64Array(civs.length);
  for (const c of civs) armyBefore[c.id] = c.army;

  for (const f of fronts) {
    const A = civs[f.a]!;
    const D = civs[f.d]!;
    if (!A.alive || !D.alive) continue;
    const shareA = f.weight / Math.max(1e-6, frontWeight[f.a]!);
    const shareD = f.weight / Math.max(1e-6, frontWeight[f.d]!);
    const engagedA = A.army * shareA;
    const engagedD = D.army * shareD;
    const front = frontInfo(world, f.d, f.a);
    const powA = A.armyPower * shareA * (f.naval ? 0.6 : 1) * supplyFactor(world, A, front, f.naval) * rng.range(0.75, 1.25);
    const powD = D.armyPower * shareD * front.defense * supplyFactor(world, D, front, false) * rng.range(0.75, 1.25);
    const ratio = powA / Math.max(1e-6, powA + powD);
    const intensity = 0.045 + 0.012 * Math.min(A.era, D.era);
    const lossA = Math.min(engagedA * 0.5, engagedA * intensity * (1 - ratio) * 2 * rng.range(0.7, 1.3));
    const lossD = Math.min(engagedD * 0.5, engagedD * intensity * ratio * 2 * rng.range(0.7, 1.3));
    A.army = Math.max(0, A.army - lossA);
    D.army = Math.max(0, D.army - lossD);
    losses[f.a] = losses[f.a]! + lossA;
    losses[f.d] = losses[f.d]! + lossD;
    const pa = participant(f.war, f.a);
    const pd = participant(f.war, f.d);
    if (pa) pa.losses += lossA;
    if (pd) pd.losses += lossD;
    f.war.battles++;
    f.war.score += (ratio - 0.5) * 7;

    // Territorial consequences.
    const frontSize = f.naval ? 3 : f.weight;
    if (ratio > 0.56) {
      const n = Math.min(f.naval ? 1 : 6, Math.floor((ratio - 0.5) * 9 * Math.min(1, frontSize / 8) + rng.next()));
      const taken = captureTiles(world, f.war, A, D, n, ratio, f.naval);
      tilesLost[f.d] = tilesLost[f.d]! + taken;
      f.war.score += taken * 1.2;
    } else if (ratio < 0.44) {
      const n = Math.min(f.naval ? 1 : 6, Math.floor((0.5 - ratio) * 9 * Math.min(1, frontSize / 8) + rng.next()));
      const taken = captureTiles(world, f.war, D, A, n, 1 - ratio, f.naval);
      tilesLost[f.a] = tilesLost[f.a]! + taken;
      f.war.score -= taken * 1.2;
    }
  }

  // Soldiers who die are lost from the population; spread the losses across the nation.
  applyPopulationLosses(world, losses);

  // Exhaustion, eliminations and peace.
  for (const war of [...world.cache.activeWars]) {
    war.score = clamp(war.score, -100, 100);
    for (const p of war.participants) {
      if (p.left !== null) continue;
      const civ = civs[p.civ]!;
      if (!civ.alive) {
        p.left = world.year;
        continue;
      }
      const base = p.side === 'defender' ? 1.1 : 1.6;
      const lossRatio = losses[p.civ]! / Math.max(1, armyBefore[p.civ]!);
      const adverse = p.side === 'attacker' ? -war.score : war.score;
      civ.warExhaustion = clamp(civ.warExhaustion + base + lossRatio * 14 + tilesLost[p.civ]! * 0.5 + Math.max(0, adverse) * 0.02, 0, 100);
    }
    checkEliminations(world, war);
    if (war.endYear !== null) continue;
    considerPeace(world, war);
  }
}

/** Terrain and fortification multiplier for a defender on a front. */
interface FrontInfo {
  /** Terrain and fortification multiplier for the defender. */
  defense: number;
  /** Centroid of the front line (tile coordinates), or -1 if unknown. */
  x: number;
  y: number;
}

/** Terrain, fortification and location of the line where two nations meet. */
function frontInfo(world: World, defender: number, attacker: number): FrontInfo {
  const { map } = world;
  const W = map.width;
  const nbt = neighborTable(W, map.height);
  let sum = 0;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (const t of world.cache.civTiles[defender] ?? []) {
    if (world.owner[t] !== defender) continue;
    let touches = false;
    for (let k = 0; k < 4; k++) {
      const x = nbt[t * 4 + k]!;
      if (x >= 0 && world.owner[x] === attacker) touches = true;
    }
    if (!touches) continue;
    sum += map.defense[t]! * (map.river[t] ? 1.08 : 1) * (world.cityAt[t]! >= 0 ? 1.15 : 1);
    sx += t % W;
    sy += (t / W) | 0;
    n++;
    if (n > 60) break;
  }
  if (n === 0) return { defense: 1.1 * 1.08, x: -1, y: -1 };
  return { defense: 1.08 * (sum / n), x: sx / n, y: sy / n };
}

/**
 * Supply: armies fighting far beyond their administrative reach are hungry,
 * slow and thinly spread. 1 at home, falling toward 0.4 at great distances.
 */
function supplyFactor(world: World, civ: Civ, front: FrontInfo, naval: boolean): number {
  if (front.x < 0) return 0.85;
  const cap = world.cities[civ.capital];
  if (!cap) return 0.6;
  const W = world.map.width;
  const d = Math.hypot((cap.tile % W) - front.x, ((cap.tile / W) | 0) - front.y);
  const reach = adminRange(civ) * (naval ? 0.8 : 1.15);
  const f = 1 / (1 + (Math.max(0, d - reach) / Math.max(1, reach)) * 0.9);
  return Math.max(0.4, f);
}

/** Moves up to `n` frontline tiles from `loser` to `winner`. Returns tiles taken. */
function captureTiles(world: World, war: War, winner: Civ, loser: Civ, n: number, strength: number, naval: boolean): number {
  if (n <= 0 || !winner.alive || !loser.alive) return 0;
  const { map } = world;
  const nbt = neighborTable(map.width, map.height);
  const candidates: { t: number; s: number }[] = [];
  for (const t of world.cache.civTiles[loser.id] ?? []) {
    if (world.owner[t] !== loser.id) continue;
    let adjacency = 0;
    if (naval) {
      if (!map.coastal[t]) continue;
      adjacency = 1;
    } else {
      for (let k = 0; k < 4; k++) {
        const x = nbt[t * 4 + k]!;
        if (x >= 0 && world.owner[x] === winner.id) adjacency++;
      }
      if (adjacency === 0) continue;
    }
    const cityId = world.cityAt[t]!;
    const isCity = cityId >= 0 && !world.cities[cityId]!.ruined;
    if (isCity) {
      // Sieges need a decisive advantage or an encircled city.
      const capital = loser.capital === cityId;
      const needed = capital ? 0.66 : 0.6;
      if (strength < needed && adjacency < 3) continue;
    }
    const s = adjacency * 1.0 + Math.min(1, world.pop[t]! / 8000) * 0.4 + map.appeal[t]! * 0.4 - (map.defense[t]! - 1) * 1.2 + (isCity ? 0.6 : 0);
    candidates.push({ t, s });
  }
  if (candidates.length === 0) return 0;
  candidates.sort((a, b) => b.s - a.s || a.t - b.t);
  let taken = 0;
  const pw = participant(war, winner.id);
  const pl = participant(war, loser.id);
  const rng = world.rng;
  let attempts = 0;
  for (const { t } of candidates) {
    if (taken >= n || attempts >= n * 2) break;
    if (world.owner[t] !== loser.id) continue;
    // A people defending its own homeland resists foreign conquest.
    const homeland = world.culture[t] === loser.cultureId && world.culture[t] !== winner.cultureId;
    attempts++;
    if (homeland && rng.chance(0.35)) continue;
    const cityId = world.cityAt[t]!;
    const wasCapital = cityId >= 0 && loser.capital === cityId;
    setOwner(world, t, winner.id);
    world.devastation[t] = Math.max(world.devastation[t]!, 0.35);
    world.pop[t] = world.pop[t]! * 0.9;
    taken++;
    winner.counters.tilesConquered++;
    if (pw) pw.tilesGained++;
    if (pl) pl.tilesLost++;
    if (cityId >= 0 && !world.cities[cityId]!.ruined) {
      const city = world.cities[cityId]!;
      winner.counters.citiesCaptured++;
      loser.counters.citiesLost++;
      if (pw) pw.citiesTaken++;
      const sign = sideOf(war, winner.id) === 'attacker' ? 1 : -1;
      war.score += sign * (wasCapital ? 22 : 7);
      if (wasCapital) {
        loser.stability = Math.max(0, loser.stability - 15);
        loser.legitimacy = Math.max(0, loser.legitimacy - 20);
        // Only the fall of a nation's historic seat (or of a still-great power's capital) is world news.
        const historic = (city.founder === loser.id && city.founded === loser.foundedYear) || (loser.tiles > 25 && world.pop[t]! > loser.population * 0.15);
        if (historic) {
          logEvent(world, 'conquest', [winner.id, loser.id], `${city.name}, capital of the ${loser.name}, falls to the ${winner.name}.`, 4, t, war.id);
        } else {
          logEvent(world, 'conquest', [winner.id, loser.id], `The ${winner.name} captures ${city.name}, the last seat of the ${loser.name}.`, 3, t, war.id);
        }
        const newCap = world.cities[loser.capital];
        if (newCap && newCap.owner === loser.id && !newCap.ruined) {
          logEvent(world, 'city', [loser.id], `The ${loser.name} moves its capital to ${newCap.name}.`, 2, newCap.tile);
        } else if (loser.tiles > 0) {
          // Without a city, raise an emergency seat; a nation with no land is handled when the war resolves.
          ensureCapital(world, loser);
        }
      } else {
        loser.stability = Math.max(0, loser.stability - 3);
        logEvent(world, 'conquest', [winner.id, loser.id], `The ${winner.name} captures ${city.name} from the ${loser.name}.`, 3, t, war.id);
      }
    }
    if (!loser.alive) break;
  }
  return taken;
}

function applyPopulationLosses(world: World, losses: Float64Array): void {
  let any = false;
  const factor = new Float64Array(world.civs.length).fill(1);
  for (const civ of world.civs) {
    const l = losses[civ.id]!;
    if (l > 0 && civ.alive && civ.population > 0) {
      factor[civ.id] = Math.max(0.5, 1 - l / civ.population);
      any = true;
    }
  }
  if (!any) return;
  const N = world.map.size;
  for (let t = 0; t < N; t++) {
    const o = world.owner[t]!;
    if (o >= 0 && factor[o]! < 1) world.pop[t] = Math.max(25, world.pop[t]! * factor[o]!);
  }
}

function checkEliminations(world: World, war: War): void {
  for (const p of war.participants) {
    if (p.left !== null) continue;
    const civ = world.civs[p.civ]!;
    if (civ.alive && civ.tiles > 0) continue;
    if (civ.alive) {
      // Find who dealt the final blow: the opposing participant with most gains.
      const enemies = war.participants.filter((q) => q.side !== p.side && q.left === null);
      enemies.sort((x, y) => y.tilesGained - x.tilesGained || x.civ - y.civ);
      const victor = enemies[0] ? world.civs[enemies[0].civ]! : null;
      const age = world.year - civ.foundedYear;
      const text = victor
        ? `The ${civ.name} has been conquered by the ${victor.name} after ${age} years.`
        : `The ${civ.name} has been destroyed after ${age} years.`;
      destroyCiv(world, civ, victor ? `Conquered by the ${victor.name}` : 'Destroyed in war', text, age > 300 || civ.counters.peakTiles > 80 ? 5 : 4);
    }
    p.left = world.year;
  }
  const attackers = sideMembers(war, 'attacker').filter((c) => world.civs[c]!.alive);
  const defenders = sideMembers(war, 'defender').filter((c) => world.civs[c]!.alive);
  if (attackers.length === 0 || defenders.length === 0) {
    const outcome: WarOutcome = attackers.length === 0 ? 'defender_victory' : 'annexation';
    endWar(world, war, outcome);
  } else {
    // Keep the lead roles pointing at living participants.
    if (!world.civs[war.leadAttacker]!.alive) war.leadAttacker = attackers[0]!;
    if (!world.civs[war.leadDefender]!.alive) war.leadDefender = defenders[0]!;
  }
}

function sideExhaustion(world: World, war: War, side: WarSide): number {
  let max = 0;
  for (const c of sideMembers(war, side)) max = Math.max(max, world.civs[c]!.warExhaustion);
  const lead = world.civs[side === 'attacker' ? war.leadAttacker : war.leadDefender]!;
  return Math.max(lead.warExhaustion, max * 0.8);
}

function considerPeace(world: World, war: War): void {
  const rng = world.rng;
  const duration = world.year - war.startYear;
  const lead = world.civs[war.leadAttacker]!;
  const def = world.civs[war.leadDefender]!;
  const exA = sideExhaustion(world, war, 'attacker');
  const exD = sideExhaustion(world, war, 'defender');
  const rebellion = war.cause === 'independence' || war.cause === 'civil_war';
  const tolA = 55 + lead.traits.aggression * 25 + GOVERNMENTS[lead.government].aggression * 60;
  // A realm fighting its own rebels tires sooner than one defending its homeland.
  const tolD = rebellion ? 48 + def.traits.tradition * 10 : 72 + def.traits.tradition * 10;
  const hasFront = (world.cache.borders.get(pairKey(war.leadAttacker, war.leadDefender)) ?? 0) > 0;
  let chance = 0;
  if (exA > tolA) chance += 0.35;
  if (exD > tolD) chance += 0.35;
  if (Math.abs(war.score) >= 70) chance += 0.3;
  if (!hasFront && duration > 4) chance += 0.08;
  chance += Math.max(0, duration - 15) * 0.01;
  if (duration >= SIM.maxWarYears) chance = 1;
  if (duration < 2) chance = 0;
  // Independence wars end when the rebels are crushed or the parent gives up.
  if (rng.chance(chance)) endWar(world, war);
}

/**
 * Concludes a war. The victor may annex additional border provinces and
 * collect reparations; all belligerents sign a truce.
 */
export function endWar(world: World, war: War, forced?: WarOutcome, divine = false): void {
  if (war.endYear !== null) return;
  const civs = world.civs;
  const lead = civs[war.leadAttacker]!;
  const def = civs[war.leadDefender]!;
  const rebellion = war.cause === 'independence' || war.cause === 'civil_war';
  let outcome: WarOutcome;
  if (forced) outcome = forced;
  else if (rebellion) outcome = war.score <= -45 ? 'rebels_crushed' : 'independence';
  else if (war.score >= 25) outcome = 'attacker_victory';
  else if (war.score <= -25) outcome = 'defender_victory';
  else outcome = 'stalemate';

  const duration = world.year - war.startYear;
  let summary = '';
  let importance = 3;
  const totalLosses = war.participants.reduce((s, p) => s + p.losses, 0);
  const totalTiles = war.participants.reduce((s, p) => s + p.tilesGained, 0);
  if (totalLosses > 200_000 || totalTiles > 25) importance = 4;

  if (outcome === 'rebels_crushed' && lead.alive && def.alive) {
    // The loyalists take back everything.
    for (let t = 0; t < world.map.size; t++) if (world.owner[t] === lead.id) setOwner(world, t, def.id);
    def.army += lead.army * 0.5;
    summary = `The ${war.name} ends: the ${def.name} crushes the ${lead.name} and restores its authority.`;
    destroyCiv(world, lead, `Crushed by the ${def.name}`);
    importance = 4;
  } else if (outcome === 'independence') {
    summary =
      war.cause === 'civil_war'
        ? `The ${war.name} ends without a victor; the ${lead.name} and the ${def.name} go their separate ways.`
        : `The ${lead.name} wins its independence from the ${def.name}.`;
    importance = 4;
  } else if (outcome === 'attacker_victory' || outcome === 'defender_victory') {
    const winner = outcome === 'attacker_victory' ? lead : def;
    const loser = outcome === 'attacker_victory' ? def : lead;
    let ceded = 0;
    if (winner.alive && loser.alive && !divine) {
      const n = Math.min(12, Math.round(Math.abs(war.score) / 12));
      ceded = captureTiles(world, war, winner, loser, n, 0.62, false);
      const reparations = Math.max(0, loser.wealth * 0.3);
      loser.wealth -= reparations;
      winner.wealth += reparations;
    }
    summary =
      outcome === 'attacker_victory'
        ? `The ${war.name} ends in victory for the ${winner.name}${ceded > 0 ? `; the ${loser.name} cedes ${ceded} more ${ceded === 1 ? 'province' : 'provinces'}` : ''}.`
        : `The ${war.name} ends: the ${winner.name} repels the ${loser.name}${ceded > 0 ? ` and annexes ${ceded} border ${ceded === 1 ? 'province' : 'provinces'}` : ''}.`;
  } else if (outcome === 'annexation') {
    summary = `The ${war.name} ends with the total conquest of the ${def.name}.`;
    importance = 4;
  } else {
    summary = divine
      ? `By divine decree, the ${war.name} ends after ${duration} ${duration === 1 ? 'year' : 'years'}.`
      : `The ${war.name} ends in a stalemate after ${duration} ${duration === 1 ? 'year' : 'years'}.`;
  }

  war.endYear = world.year;
  war.outcome = outcome;
  war.summary = summary;
  for (const p of war.participants) if (p.left === null) p.left = world.year;
  world.cache.activeWars = world.cache.activeWars.filter((w) => w !== war);

  // Treaties, memories and records.
  const attackers = war.participants.filter((p) => p.side === 'attacker').map((p) => p.civ);
  const defenders = war.participants.filter((p) => p.side === 'defender').map((p) => p.civ);
  for (const a of attackers) {
    for (const d of defenders) {
      const ca = civs[a]!;
      const cd = civs[d]!;
      if (!ca.alive || !cd.alive) continue;
      const rel = ensureRelation(world, a, d);
      rel.truceUntil = world.year + SIM.truceYears;
      rel.lastWarEnd = world.year;
      if (outcome === 'attacker_victory') rel.grievance += 15;
      if (outcome === 'defender_victory') rel.grievance += 5;
    }
  }
  const record = (ids: number[], result: 'won' | 'lost' | 'drawn') => {
    for (const id of ids) {
      const c = civs[id]!;
      if (result === 'won') c.counters.warsWon++;
      else if (result === 'lost') c.counters.warsLost++;
      else c.counters.warsDrawn++;
      c.warCooldownUntil = Math.max(c.warCooldownUntil, world.year + 12 + Math.round((1 - c.traits.aggression) * 15));
    }
  };
  if (outcome === 'attacker_victory' || outcome === 'annexation' || outcome === 'independence') {
    record(attackers, outcome === 'independence' && war.cause === 'civil_war' ? 'drawn' : 'won');
    record(defenders, outcome === 'independence' && war.cause === 'civil_war' ? 'drawn' : 'lost');
  } else if (outcome === 'defender_victory' || outcome === 'rebels_crushed') {
    record(attackers, 'lost');
    record(defenders, 'won');
  } else {
    record(attackers, 'drawn');
    record(defenders, 'drawn');
  }
  const involved = war.participants.map((p) => p.civ);
  logEvent(world, 'peace', involved, summary, importance, capitalTile(world, def.alive ? def : lead), war.id);
}

/** Casualties per side for display. */
export function warCasualties(war: War): { attacker: number; defender: number } {
  let attacker = 0;
  let defender = 0;
  for (const p of war.participants as WarParticipant[]) {
    if (p.side === 'attacker') attacker += p.losses;
    else defender += p.losses;
  }
  return { attacker, defender };
}
