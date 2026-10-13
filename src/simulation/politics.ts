import type { Civ, GovernmentId, World } from '../types/simulation';
import { neighbors4 } from '../world/generate';
import { clamp, clamp01 } from '../utils/math';
import { eraInfo, GOVERNMENTS, LEADER_TRAITS, SIM } from './constants';
import { createLeader, leaderDisplayName, renameCiv } from './civs';
import { adminCapacity, effectMagnitude, tileControl } from './economy';
import { logEvent } from './events';
import { citiesOf, destroyCiv, spawnBreakaway } from './lifecycle';
import { components, setOwner } from './territory';
import { declareWar } from './war';
import { capitalTile, enemiesOf, tileDistance } from './world';

const NB: number[] = [];

const GOV_NOUN: Record<GovernmentId, string> = {
  tribal: 'tribal council',
  kingdom: 'monarchy',
  empire: 'imperial throne',
  republic: 'republic',
  merchant: 'merchant oligarchy',
  theocracy: 'theocracy',
  dictatorship: 'dictatorship',
  federation: 'federal government',
};

/** Yearly political step for every living civilisation. */
export function updatePolitics(world: World): void {
  const foreign = computeForeignShareAndAssimilate(world);
  const living = world.civs.filter((c) => c.alive);
  for (const civ of living) {
    if (!civ.alive) continue;
    expireEffects(world, civ);
    updateLeader(world, civ);
    updateMood(world, civ, foreign[civ.id] ?? 0);
  }
  // Upheavals are resolved after moods so they see this year's state.
  for (const civ of living) {
    if (!civ.alive) continue;
    if (handleCollapse(world, civ)) continue;
    if (handleCrisis(world, civ, foreign[civ.id] ?? 0)) continue;
    considerReform(world, civ);
  }
}

function computeForeignShareAndAssimilate(world: World): Float64Array {
  const n = world.civs.length;
  const foreignPop = new Float64Array(n);
  const totalPop = new Float64Array(n);
  const N = world.map.size;
  const rng = world.rng;
  for (let t = 0; t < N; t++) {
    const o = world.owner[t]!;
    if (o < 0) continue;
    const civ = world.civs[o]!;
    const p = world.pop[t]!;
    totalPop[o] = totalPop[o]! + p;
    const c = world.culture[t]!;
    if (c === civ.cultureId) continue;
    foreignPop[o] = foreignPop[o]! + p;
    const near = world.cache.distCity[t]! <= 2 ? 2 : 1;
    if (rng.chance(SIM.assimilationRate * (0.4 + civ.stability / 100) * near)) world.culture[t] = civ.cultureId;
  }
  const share = new Float64Array(n);
  for (let i = 0; i < n; i++) share[i] = totalPop[i]! > 0 ? foreignPop[i]! / totalPop[i]! : 0;
  return share;
}

function expireEffects(world: World, civ: Civ): void {
  if (civ.effects.length > 0) civ.effects = civ.effects.filter((e) => e.until >= world.year);
  if (civ.plague > 0) {
    civ.plague = Math.max(0, civ.plague - 0.18);
    if (civ.plague === 0) {
      civ.plagueImmunityUntil = world.year + 60 + world.rng.intRange(0, 40);
      logEvent(world, 'plague', [civ.id], `The plague in the ${civ.name} finally subsides.`, 2, capitalTile(world, civ));
    }
  }
  if (enemiesOf(world, civ.id).length === 0) civ.warExhaustion = Math.max(0, civ.warExhaustion * 0.9 - 1);
}

function updateMood(world: World, civ: Civ, foreignShare: number): void {
  const gov = GOVERNMENTS[civ.government];
  const lt = LEADER_TRAITS[civ.leader.trait];
  const era = eraInfo(civ.era);
  const atWar = enemiesOf(world, civ.id).length > 0;
  const favor = effectMagnitude(civ, 'divine_favor');
  const turmoil = effectMagnitude(civ, 'turmoil');
  const golden = effectMagnitude(civ, 'golden_age');
  const boom = effectMagnitude(civ, 'boom');

  // Happiness: living conditions.
  let h = 52 + gov.happiness + lt.happiness;
  if (civ.famineYears > 0) h -= 22 + Math.min(10, civ.famineYears * 2);
  else if (civ.needs.food > 0.6) h -= 8;
  else h += 4;
  const perCapita = civ.output / Math.max(1, civ.population / 1000) / era.production;
  h += clamp((perCapita - 0.75) * 30, -12, 12);
  h -= civ.budget.military * 22;
  if (atWar) h -= 6;
  h -= civ.warExhaustion * 0.15;
  if (civ.plague > 0) h -= 12;
  h -= foreignShare * 14;
  h += boom * 20 + golden * 25 + favor * 30 - turmoil * 20;
  civ.happiness = clamp(civ.happiness + (h - civ.happiness) * 0.25, 0, 100);

  // Stability: the political order.
  const over = civ.tiles / Math.max(1, adminCapacity(civ));
  let s = gov.baseStability + lt.stability + civ.traits.tradition * 8;
  s += (civ.happiness - 50) * 0.45;
  s += (civ.legitimacy - 50) * 0.2;
  if (over > 1) s -= Math.min(38, (over - 1) * 24);
  s -= civ.warExhaustion * 0.22;
  if (civ.famineYears > 0) s -= Math.min(25, 10 + civ.famineYears * 2.5);
  if (civ.plague > 0) s -= 6;
  s -= foreignShare * 22;
  if (civ.wealth < 1 && civ.revenue > 0) s -= 6;
  // Old regimes ossify: dynasties and strongmen lose their grip over time.
  const regimeAge = world.year - civ.lastUpheaval;
  s -= gov.succession === 'hereditary' || gov.succession === 'strongman' ? Math.min(16, regimeAge / 25) : Math.min(7, regimeAge / 60);
  s += golden * 20 + favor * 40 + boom * 10 - turmoil * 70;
  civ.stability = clamp(civ.stability + (s - civ.stability) * 0.12 + world.rng.normal(0, 1.2), 0, 100);
  civ.legitimacy = clamp(civ.legitimacy + (70 - civ.legitimacy) * 0.04, 0, 100);

  let agitation = 0;
  if (civ.stability < 40) agitation += (40 - civ.stability) * 0.1;
  if (civ.happiness < 32) agitation += (32 - civ.happiness) * 0.1;
  if (agitation > 0) civ.unrest = clamp(civ.unrest + agitation, 0, 100);
  else civ.unrest = Math.max(0, civ.unrest * 0.9 - 0.5);
  if (civ.stability < 12) civ.crisisYears++;
  else civ.crisisYears = Math.max(0, civ.crisisYears - 1);
}

// ---------------------------------------------------------------------------
// Leaders
// ---------------------------------------------------------------------------

function updateLeader(world: World, civ: Civ): void {
  const rng = world.rng;
  const gov = GOVERNMENTS[civ.government];
  const age = world.year - civ.leader.birthYear;
  const reign = world.year - civ.leader.since;
  const deathChance = 0.004 + Math.max(0, age - 45) ** 2 * 0.00011;
  const old = civ.leader;
  if (rng.chance(deathChance)) {
    civ.leader = createLeader(world, civ, rng, gov.succession === 'hereditary' ? 16 : 35, gov.succession === 'hereditary' ? 40 : 60);
    const big = civ.population > 2_000_000 || civ.tiles > 120;
    logEvent(
      world,
      'leader',
      [civ.id],
      `${leaderDisplayName(old)} of the ${civ.name} dies after ${reign} ${reign === 1 ? 'year' : 'years'} in power; ${leaderDisplayName(civ.leader)} succeeds.`,
      big ? 2 : 1,
      capitalTile(world, civ),
    );
    if (gov.succession === 'hereditary' && civ.stability < 40 && rng.chance(0.3)) {
      civ.unrest = clamp(civ.unrest + 30, 0, 100);
      civ.legitimacy = Math.max(0, civ.legitimacy - 25);
      logEvent(world, 'revolution', [civ.id], `A succession crisis grips the ${civ.name} as rival claimants contest the throne.`, 3, capitalTile(world, civ));
    } else if (gov.succession === 'strongman') {
      civ.unrest = clamp(civ.unrest + 20, 0, 100);
      civ.legitimacy = Math.max(0, civ.legitimacy - 15);
    }
    return;
  }
  if (gov.succession === 'elective' && gov.term > 0 && reign >= gov.term) {
    if (civ.happiness > 60 && rng.chance(0.35)) {
      civ.leader.since = world.year; // re-elected
      return;
    }
    civ.leader = createLeader(world, civ, rng, 35, 62);
    logEvent(world, 'leader', [civ.id], `${leaderDisplayName(civ.leader)} is elected to lead the ${civ.name}.`, 1, capitalTile(world, civ));
  }
}

// ---------------------------------------------------------------------------
// Government change
// ---------------------------------------------------------------------------

function applyGovernment(world: World, civ: Civ, gov: GovernmentId, upheaval: boolean): string {
  const oldName = civ.name;
  civ.government = gov;
  renameCiv(civ);
  civ.leader = createLeader(world, civ, world.rng, 30, 55);
  if (upheaval) {
    civ.legitimacy = 40;
    civ.stability = Math.max(civ.stability, 42);
    civ.unrest = 10;
    civ.counters.revolutions++;
  } else {
    civ.legitimacy = Math.min(100, civ.legitimacy + 10);
  }
  civ.lastUpheaval = world.year;
  civ.crisisYears = 0;
  // Regimes colour national priorities.
  const t = civ.traits;
  if (gov === 'dictatorship' || gov === 'empire') t.aggression = clamp01(t.aggression + 0.12);
  if (gov === 'republic' || gov === 'federation') {
    t.diplomacy = clamp01(t.diplomacy + 0.08);
    t.science = clamp01(t.science + 0.06);
  }
  if (gov === 'merchant') t.commerce = clamp01(t.commerce + 0.15);
  if (gov === 'theocracy') t.tradition = clamp01(t.tradition + 0.12);
  return oldName;
}

function revolutionTarget(world: World, civ: Civ): GovernmentId {
  const era = civ.era;
  const c: [GovernmentId, number][] = [];
  switch (civ.government) {
    case 'tribal':
      c.push(['kingdom', 3], ['theocracy', 1]);
      break;
    case 'kingdom':
      c.push(['republic', era >= 2 ? 3 : era >= 1 ? 1 : 0], ['theocracy', 1], ['dictatorship', era >= 3 ? 2 : 0], ['empire', civ.tiles >= 80 && era >= 1 ? 1.5 : 0], ['kingdom', 1]);
      break;
    case 'empire':
      c.push(['republic', era >= 2 ? 2 : 0.5], ['dictatorship', era >= 3 ? 2 : 0], ['kingdom', 1.5], ['empire', 1]);
      break;
    case 'republic':
      c.push(['dictatorship', era >= 3 ? 3 : 0], ['empire', era < 3 && civ.tiles >= 60 ? 2 : 0], ['kingdom', era < 2 ? 2 : 0.3], ['republic', 1], ['federation', era >= 5 ? 1 : 0]);
      break;
    case 'merchant':
      c.push(['republic', 2], ['kingdom', 1], ['dictatorship', era >= 3 ? 1 : 0]);
      break;
    case 'theocracy':
      c.push(['kingdom', 2], ['republic', era >= 3 ? 2 : 0], ['dictatorship', era >= 3 ? 1 : 0]);
      break;
    case 'dictatorship':
      c.push(['republic', 3], ['federation', era >= 5 ? 1.5 : 0], ['dictatorship', 1]);
      break;
    case 'federation':
      c.push(['republic', 2], ['dictatorship', 1.5]);
      break;
  }
  const pick = world.rng.weighted(c, ([g, w]) => (era >= GOVERNMENTS[g].minEra ? w : 0));
  return pick ? pick[0] : 'kingdom';
}

function revolution(world: World, civ: Civ): void {
  const from = civ.government;
  const to = revolutionTarget(world, civ);
  const oldLeader = leaderDisplayName(civ.leader);
  const oldName = applyGovernment(world, civ, to, true);
  const leader = leaderDisplayName(civ.leader);
  let text: string;
  if (to === from) {
    text =
      to === 'kingdom' || to === 'empire'
        ? `A palace coup topples ${oldLeader} of the ${civ.name}; ${leader} seizes the throne and founds a new dynasty.`
        : to === 'dictatorship'
          ? `${oldLeader} is overthrown in a coup; ${leader} takes power in the ${civ.name}.`
          : `Riots sweep the ${civ.name}; the old order falls and ${leader} takes charge under a new constitution.`;
  } else if (to === 'republic' || to === 'federation') {
    text = `A revolution overthrows the ${GOV_NOUN[from]} of ${civ.baseName}. The ${civ.name} is proclaimed.`;
  } else if (to === 'dictatorship') {
    text = `A military coup topples the ${oldName}; ${leader} rules the new ${civ.name}.`;
  } else if (to === 'empire') {
    text = `${leader} seizes absolute power, transforming the ${oldName} into the ${civ.name}.`;
  } else if (to === 'theocracy') {
    text = `Zealots seize power in the ${oldName}, founding the ${civ.name}.`;
  } else if (from === 'tribal') {
    text = `${leader} unites the warring clans of the ${oldName} and is crowned, founding the ${civ.name}.`;
  } else {
    text = `The ${GOV_NOUN[from]} of ${civ.baseName} falls; ${leader} takes the crown of the ${civ.name}.`;
  }
  logEvent(world, 'revolution', [civ.id], text, 4, capitalTile(world, civ));
}

function considerReform(world: World, civ: Civ): void {
  const rng = world.rng;
  if (world.year - civ.lastUpheaval < 30 || civ.stability < 55) return;
  const lt = civ.leader.trait;
  if (!rng.chance(lt === 'reformer' ? 0.05 : 0.02)) return;
  const t = civ.traits;
  const era = civ.era;
  let target: GovernmentId | null = null;
  switch (civ.government) {
    case 'tribal':
      if (era >= 1 || civ.tiles >= 40) target = t.tradition > 0.75 && rng.chance(0.3) ? 'theocracy' : 'kingdom';
      break;
    case 'kingdom':
      if (era >= 5 && civ.tiles >= 150) target = 'federation';
      else if (era >= 1 && civ.tiles >= 120 && (t.aggression > 0.5 || civ.counters.tilesConquered > 40)) target = 'empire';
      else if (era >= 3 && (t.commerce + t.science) / 2 > 0.55 && t.tradition < 0.6) target = 'republic';
      else if (era >= 2 && t.commerce > 0.75) target = 'merchant';
      break;
    case 'empire':
      if (era >= 5 && civ.tiles >= 150) target = 'federation';
      else if (era >= 4 && t.science > 0.5 && t.tradition < 0.6) target = 'republic';
      break;
    case 'theocracy':
      if (era >= 4) target = 'republic';
      else if (era >= 2 && t.tradition < 0.6) target = 'kingdom';
      break;
    case 'republic':
      if (era >= 5 && civ.tiles >= 150) target = 'federation';
      break;
    case 'merchant':
      if (era >= 4) target = 'republic';
      break;
    case 'dictatorship':
      if (civ.stability > 60 && world.year - civ.lastUpheaval > 40) target = 'republic';
      break;
    default:
      break;
  }
  if (!target || target === civ.government || era < GOVERNMENTS[target].minEra) return;
  const from = civ.government;
  const oldName = applyGovernment(world, civ, target, false);
  const text =
    from === 'tribal'
      ? `The clans of the ${oldName} unite under a single ruler: the ${civ.name} is born.`
      : target === 'empire'
        ? `Swollen by conquest, the ${oldName} proclaims itself the ${civ.name}.`
        : target === 'federation'
          ? `The ${oldName} reorganises its provinces into the ${civ.name}.`
          : target === 'merchant'
            ? `The great trading houses take control of the ${oldName}, now the ${civ.name}.`
            : `Peaceful reforms transform the ${oldName} into the ${civ.name}.`;
  logEvent(world, 'reform', [civ.id], text, 3, capitalTile(world, civ));
}

// ---------------------------------------------------------------------------
// Crises: secession, civil war, revolution, collapse
// ---------------------------------------------------------------------------

function livingCount(world: World): number {
  let n = 0;
  for (const c of world.civs) if (c.alive) n++;
  return n;
}

function handleCrisis(world: World, civ: Civ, foreignShare: number): boolean {
  const rng = world.rng;
  if (world.year - civ.lastUpheaval < 10 || civ.unrest < 35) return false;
  if (!rng.chance(Math.min(0.45, civ.unrest / 280))) return false;
  const room = livingCount(world) < SIM.maxLivingCivs;
  const region = room ? findSecessionRegion(world, civ) : null;
  const canCivilWar = room && civ.tiles >= 30 && civ.cityCount >= 3;
  const options: [string, number][] = [
    ['revolution', 1 + (civ.legitimacy < 30 ? 0.8 : 0)],
    ['secession', region ? 1 + foreignShare * 4 : 0],
    ['civil_war', canCivilWar ? 0.6 + (civ.tiles > 150 ? 0.6 : 0) : 0],
  ];
  const choice = rng.weighted(options, (o) => o[1]);
  if (!choice) return false;
  let done = false;
  if (choice[0] === 'secession' && region) done = secede(world, civ, region);
  else if (choice[0] === 'civil_war') done = startCivilWar(world, civ);
  if (!done) {
    revolution(world, civ);
    done = true;
  }
  civ.lastUpheaval = world.year;
  civ.unrest *= 0.35;
  return done;
}

/** Largest restless region: foreign-culture or poorly controlled provinces away from the capital. */
function findSecessionRegion(world: World, civ: Civ): number[] | null {
  const capTile = capitalTile(world, civ);
  const tiles = world.cache.civTiles[civ.id] ?? [];
  const byCulture = new Map<number, number[]>();
  for (const t of tiles) {
    if (world.owner[t] !== civ.id || t === capTile) continue;
    const c = world.culture[t]!;
    const foreign = c >= 0 && c !== civ.cultureId;
    const remote = tileControl(world, civ, t) < 0.45 && world.cache.distCapital[t]! > 12;
    if (!foreign && !remote) continue;
    const key = foreign ? c : -1 - civ.cultureId;
    const list = byCulture.get(key);
    if (list) list.push(t);
    else byCulture.set(key, [t]);
  }
  let best: number[] | null = null;
  for (const key of Array.from(byCulture.keys()).sort((a, b) => a - b)) {
    for (const comp of components(world, byCulture.get(key)!)) {
      if (comp.length >= 5 && (!best || comp.length > best.length)) best = comp;
    }
  }
  if (!best) return null;
  // Never let a secession take most of the country.
  if (best.length > civ.tiles * 0.6) best = best.slice(0, Math.floor(civ.tiles * 0.6));
  return best;
}

function secede(world: World, parent: Civ, region: number[]): boolean {
  const rebel = spawnBreakaway(world, parent, region, { kind: 'secession', armyShare: 0.55 });
  if (!rebel) return false;
  const restored = rebel.origin.type === 'restoration';
  const regionName = world.cities[rebel.capital]?.name ?? rebel.baseName;
  const text = restored
    ? `The ${rebel.name} rises again, breaking free of the ${parent.name} at ${regionName}.`
    : `${regionName} and its hinterland break away from the ${parent.name}, proclaiming the ${rebel.name}.`;
  logEvent(world, 'secession', [rebel.id, parent.id], text, 4, capitalTile(world, rebel));
  parent.stability = Math.min(100, parent.stability + 8);
  parent.legitimacy = Math.max(0, parent.legitimacy - 10);
  const willFight = parent.armyPower > rebel.armyPower * 0.8 && parent.warExhaustion < 50 && parent.traits.isolation < 0.85;
  if (willFight) {
    declareWar(world, rebel, parent, 'independence');
  } else {
    logEvent(world, 'secession', [rebel.id, parent.id], `Too weak to resist, the ${parent.name} lets the ${rebel.name} go in peace.`, 2);
  }
  return true;
}

function startCivilWar(world: World, civ: Civ): boolean {
  const capTile = capitalTile(world, civ);
  if (capTile < 0) return false;
  let seat = -1;
  let best = -1;
  for (const cid of citiesOf(world, civ.id)) {
    const city = world.cities[cid]!;
    if (cid === civ.capital) continue;
    const d = tileDistance(world, city.tile, capTile);
    if (d < 6) continue;
    const score = world.pop[city.tile]! * Math.sqrt(d);
    if (score > best) {
      best = score;
      seat = city.tile;
    }
  }
  if (seat < 0) return false;
  // Partition the realm between the capital and the rebel seat.
  const { width: W, height: H, size: N } = world.map;
  const label = new Int8Array(N).fill(-1);
  const queue: number[] = [capTile, seat];
  label[capTile] = 0;
  label[seat] = 1;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    neighbors4(c, W, H, NB);
    for (const n of NB) {
      if (label[n] !== -1 || world.owner[n] !== civ.id) continue;
      label[n] = label[c]!;
      queue.push(n);
    }
  }
  const rebelTiles: number[] = [];
  for (const t of queue) if (label[t] === 1) rebelTiles.push(t);
  if (rebelTiles.length < 6 || rebelTiles.length > civ.tiles * 0.65) return false;
  const oldName = civ.name;
  const rebel = spawnBreakaway(world, civ, rebelTiles, { kind: 'civil_war', capitalTile: seat, armyShare: 0.9, directional: true });
  if (!rebel) return false;
  const seatName = world.cities[world.cityAt[seat]!]?.name ?? rebel.baseName;
  logEvent(world, 'civil_war', [civ.id, rebel.id], `Civil war erupts in the ${oldName}! Rebels at ${seatName} proclaim the ${rebel.name}.`, 4, seat);
  declareWar(world, rebel, civ, 'civil_war', { quiet: true, callAllies: false });
  civ.stability = Math.min(100, civ.stability + 6);
  return true;
}

/** Long, deep crises end in collapse into successor states. */
function handleCollapse(world: World, civ: Civ): boolean {
  if (civ.crisisYears < 10) return false;
  civ.crisisYears = 0;
  const cities = citiesOf(world, civ.id);
  const room = livingCount(world) < SIM.maxLivingCivs - 1;
  if (cities.length < 2 || civ.tiles < 12 || !room) {
    revolution(world, civ);
    return true;
  }
  // Successor seats: large cities far from each other.
  const seats: number[] = [];
  for (const cid of cities) {
    const tile = world.cities[cid]!.tile;
    if (seats.every((s) => tileDistance(world, s, tile) >= 8)) seats.push(tile);
    if (seats.length >= Math.min(5, Math.max(2, Math.floor(cities.length / 2)))) break;
  }
  if (seats.length < 2) {
    revolution(world, civ);
    return true;
  }
  const { width: W, height: H, size: N } = world.map;
  const label = new Int16Array(N).fill(-1);
  const dist = new Int16Array(N).fill(-1);
  const queue: number[] = [];
  seats.forEach((s, i) => {
    label[s] = i;
    dist[s] = 0;
    queue.push(s);
  });
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    if (dist[c]! >= 14) continue;
    neighbors4(c, W, H, NB);
    for (const n of NB) {
      if (label[n] !== -1 || world.owner[n] !== civ.id) continue;
      label[n] = label[c]!;
      dist[n] = dist[c]! + 1;
      queue.push(n);
    }
  }
  const parts: number[][] = seats.map(() => []);
  for (const t of queue) parts[label[t]!]!.push(t);
  const age = world.year - civ.foundedYear;
  const name = civ.name;
  // Remote, ungoverned land is abandoned.
  for (let t = 0; t < N; t++) if (world.owner[t] === civ.id && label[t] === -1) setOwner(world, t, -1);
  const successors = [];
  for (let i = 0; i < parts.length; i++) {
    const tiles = parts[i]!;
    if (tiles.length < 3) {
      for (const t of tiles) setOwner(world, t, -1);
      continue;
    }
    // Detach from the dying state before creating the successor.
    const succ = spawnBreakaway(world, civ, tiles, { kind: 'collapse', capitalTile: seats[i]!, armyShare: 1 });
    if (succ) successors.push(succ);
  }
  destroyCiv(world, civ, `Collapsed after ${age} years`, `The ${name} collapses after ${age} years of history.`, 5, seats[0]!);
  for (const s of successors) {
    const text =
      s.origin.type === 'restoration'
        ? `From the ruins of the ${name}, the ${s.name} is restored.`
        : `A new civilization emerges from the ruins of the ${name}: the ${s.name}.`;
    logEvent(world, 'founding', [s.id, civ.id], text, 4, capitalTile(world, s));
  }
  return true;
}
