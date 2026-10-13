import type { Civ, EffectKind, World } from '../types/simulation';
import { Resource } from '../types/world';
import { clamp, clamp01 } from '../utils/math';
import { eraInfo, GOVERNMENTS, LEADER_TRAITS, SIM } from './constants';
import { capitalTile, enemiesOf, tradePartnersOf, warsOf } from './world';
import { logEvent } from './events';

// Scratch buffers reused between ticks (sized on demand).
let F_PROD = new Float64Array(0);
let F_CONS = new Float64Array(0);
let OUTPUT = new Float64Array(0);
let TIMBER = new Float64Array(0);
let STONE = new Float64Array(0);
let IRON = new Float64Array(0);
let HORSES = new Float64Array(0);
let RURAL_CAP = new Float64Array(0);
let FAMINE_RATE = new Float64Array(0);
let GROWTH_MOD = new Float64Array(0);
let TILE_CAP = new Float32Array(0);
// Per-civ constants hoisted out of the tile loops.
let C_FOOD = new Float64Array(0);
let C_RURAL = new Float64Array(0);
let C_RANGE = new Float64Array(0);

function ensureScratch(civCount: number, tiles: number): void {
  if (F_PROD.length < civCount) {
    const n = Math.max(civCount, F_PROD.length * 2, 64);
    F_PROD = new Float64Array(n);
    F_CONS = new Float64Array(n);
    OUTPUT = new Float64Array(n);
    TIMBER = new Float64Array(n);
    STONE = new Float64Array(n);
    IRON = new Float64Array(n);
    HORSES = new Float64Array(n);
    RURAL_CAP = new Float64Array(n);
    FAMINE_RATE = new Float64Array(n);
    GROWTH_MOD = new Float64Array(n);
    C_FOOD = new Float64Array(n);
    C_RURAL = new Float64Array(n);
    C_RANGE = new Float64Array(n);
  }
  if (TILE_CAP.length !== tiles) TILE_CAP = new Float32Array(tiles);
}

export function effectMagnitude(civ: Civ, kind: EffectKind): number {
  let m = 0;
  for (const e of civ.effects) if (e.kind === kind) m += e.magnitude;
  return m;
}

/** Administrative reach (in tiles) of a civilisation's capital. */
export function adminRange(civ: Civ): number {
  return 14 * eraInfo(civ.era).admin * GOVERNMENTS[civ.government].admin;
}

function controlAt(dc: number, dk: number, range: number): number {
  let c = dc === 255 ? 0.4 : 1 / (1 + Math.max(0, dc - 2) * 0.09);
  if (dk !== 255) c *= 1 / (1 + Math.max(0, dk - range) * 0.015);
  else c *= 0.8;
  return c < 0.2 ? 0.2 : c > 1 ? 1 : c;
}

/** Administrative control of a tile (0.2..1), falling off with distance from cities and the capital. */
export function tileControl(world: World, civ: Civ, tile: number): number {
  return controlAt(world.cache.distCity[tile]!, world.cache.distCapital[tile]!, adminRange(civ));
}

/** Fills per-civ food multipliers used by the tile loops. */
function hoistCivConstants(world: World): void {
  for (const civ of world.civs) {
    const era = eraInfo(civ.era);
    C_FOOD[civ.id] = SIM.foodPerYield * era.food;
    C_RURAL[civ.id] = era.ruralShare;
    C_RANGE[civ.id] = adminRange(civ);
  }
}

/** Food capacity of a tile in thousand person-years, after damage. */
export function landFood(world: World, tile: number, era: number): number {
  const e = eraInfo(era);
  return world.map.yFood[tile]! * SIM.foodPerYield * e.food * (1 - world.blight[tile]!) * (1 - 0.6 * world.devastation[tile]!);
}

/** Rural carrying capacity of a tile (people) for a given era, ignoring damage. */
export function baseRuralCapacity(world: World, tile: number, era: number): number {
  const e = eraInfo(era);
  return world.map.yFood[tile]! * SIM.foodPerYield * 1000 * e.food * e.ruralShare;
}

/** Tiles a civilisation can govern before overextension erodes stability. */
export function adminCapacity(civ: Civ): number {
  return (SIM.adminBase + SIM.adminPerCity * Math.min(civ.cityCount, 40)) * GOVERNMENTS[civ.government].admin * Math.sqrt(eraInfo(civ.era).admin);
}

/** Decides how a civilisation splits its revenue this year. */
export function computeBudget(world: World, civ: Civ): void {
  const base = civ.budget;
  const p = civ.traits;
  let military = 0.12 + p.aggression * 0.22 + p.isolation * 0.05;
  let research = 0.08 + p.science * 0.2;
  let development = 0.16 + p.expansion * 0.2 + p.commerce * 0.05;
  const wars = warsOf(world, civ.id);
  if (wars.length > 0) {
    military += 0.18;
    // Losing a war means total mobilisation.
    for (const w of wars) {
      const attacking = w.participants.find((q) => q.civ === civ.id)?.side === 'attacker';
      const score = attacking ? w.score : -w.score;
      if (score < -20) military += 0.08;
    }
    development *= 0.7;
  }
  if (civ.needs.food > 0.5) {
    development += 0.06;
    research -= 0.03;
  }
  if (civ.landHunger > 0.5) military += 0.04 * p.aggression;
  // Smooth toward the new allocation so budgets do not jump around.
  base.military = base.military + (military - base.military) * 0.3;
  base.research = base.research + (research - base.research) * 0.3;
  base.development = base.development + (development - base.development) * 0.3;
  const total = base.military + base.research + base.development;
  if (total > 0.9) {
    base.military *= 0.9 / total;
    base.research *= 0.9 / total;
    base.development *= 0.9 / total;
  }
  base.military = clamp(base.military, 0.04, 0.75);
  base.research = clamp(base.research, 0.02, 0.6);
  base.development = clamp(base.development, 0.03, 0.6);
}

/**
 * Yearly economic step: production, food, stockpiles, budgets, armies,
 * research and development. Aggregated in a single pass over the tiles.
 */
export function updateEconomy(world: World): void {
  const civs = world.civs;
  const n = civs.length;
  const { map } = world;
  const N = map.size;
  ensureScratch(n, N);
  F_PROD.fill(0, 0, n);
  F_CONS.fill(0, 0, n);
  OUTPUT.fill(0, 0, n);
  TIMBER.fill(0, 0, n);
  STONE.fill(0, 0, n);
  IRON.fill(0, 0, n);
  HORSES.fill(0, 0, n);
  RURAL_CAP.fill(0, 0, n);
  const owner = world.owner;
  const pop = world.pop;
  const blight = world.blight;
  const devastation = world.devastation;
  const distCity = world.cache.distCity;
  const distCapital = world.cache.distCapital;
  const yFood = map.yFood;
  hoistCivConstants(world);
  for (let t = 0; t < N; t++) {
    const o = owner[t]!;
    if (o < 0) continue;
    const p = pop[t]!;
    const dev = devastation[t]!;
    const lf = yFood[t]! * C_FOOD[o]! * (1 - blight[t]!) * (1 - 0.6 * dev);
    const rural = C_RURAL[o]!;
    F_PROD[o] = F_PROD[o]! + Math.min((p / 1000) * (1.25 / rural), lf);
    F_CONS[o] = F_CONS[o]! + p / 1000;
    RURAL_CAP[o] = RURAL_CAP[o]! + lf * 1000 * rural;
    const cityId = world.cityAt[t]!;
    const isCity = cityId >= 0 && !world.cities[cityId]!.ruined;
    const control = controlAt(distCity[t]!, distCapital[t]!, C_RANGE[o]!);
    OUTPUT[o] =
      OUTPUT[o]! +
      (p / 1000) * (SIM.outputPerThousand + map.yTrade[t]! * SIM.tradeProductivity) * (isCity ? SIM.urbanProductivity : 1) * control * (1 - dev);
    const workforce = p / (p + 1500);
    TIMBER[o] = TIMBER[o]! + map.yTimber[t]! * workforce * 0.6;
    STONE[o] = STONE[o]! + map.yStone[t]! * workforce * 0.6;
    IRON[o] = IRON[o]! + map.yIron[t]! * workforce * 0.6;
    if (map.resource[t] === Resource.Horses) HORSES[o] = HORSES[o]! + 1;
  }

  for (const civ of civs) {
    if (!civ.alive) continue;
    const id = civ.id;
    const era = eraInfo(civ.era);
    const gov = GOVERNMENTS[civ.government];
    const lt = LEADER_TRAITS[civ.leader.trait];
    const stab = civ.stability / 100;
    const boom = effectMagnitude(civ, 'boom') + effectMagnitude(civ, 'golden_age') * 0.5;
    const partners = tradePartnersOf(world, id);
    const atWar = enemiesOf(world, id).length > 0;

    // --- Output, trade and revenue -------------------------------------
    let tradeIncome = 0;
    const ownBase = OUTPUT[id]! * era.production;
    for (const pid of partners) {
      const other = civs[pid]!;
      tradeIncome += 0.035 * Math.sqrt(Math.max(0, ownBase) * Math.max(0, other.output)) * gov.trade * (0.6 + civ.traits.commerce * 0.6);
    }
    const output = ownBase * (1 + lt.economy + boom) * (0.65 + 0.35 * stab) * gov.trade ** 0.5 + tradeIncome;
    civ.output = output;
    const revenue = output * gov.tax * (0.7 + 0.3 * stab);
    civ.revenue = revenue;

    // --- Food --------------------------------------------------------------
    const consumption = F_CONS[id]!;
    const production = F_PROD[id]! * (1 + boom * 0.3);
    const balance = production - consumption;
    civ.foodBalance = balance;
    civ.food += balance;
    const reserveCap = consumption * SIM.foodReserveYears + 2;
    FAMINE_RATE[id] = 0;
    if (civ.food > reserveCap) {
      const surplus = civ.food - reserveCap;
      civ.wealth += surplus * 0.08 * (0.5 + civ.traits.commerce);
      civ.food = reserveCap;
    }
    if (civ.food < 0) {
      // Import grain if the treasury and trade links allow it. Imports are
      // limited: the world's markets cannot feed a nation that outgrew its land.
      const deficit = -civ.food;
      const canImport = partners.length > 0 || civ.era >= 2;
      if (canImport && civ.wealth > 0) {
        const price = SIM.foodImportPrice * (partners.length > 0 ? 1 : 1.5) * Math.sqrt(era.production);
        const limit = consumption * Math.min(0.2, 0.05 + partners.length * 0.03);
        const bought = Math.min(deficit, limit, civ.wealth / price);
        civ.wealth -= bought * price;
        civ.food += bought;
      }
    }
    if (civ.food < 0) {
      const shortfall = -civ.food / Math.max(1e-6, consumption);
      FAMINE_RATE[id] = Math.min(0.25, shortfall * SIM.famineMortality);
      civ.food = 0;
      civ.famineYears++;
      if (civ.famineYears === 2 && FAMINE_RATE[id]! > 0.006) {
        civ.counters.famines++;
        const severe = FAMINE_RATE[id]! > 0.05;
        logEvent(
          world,
          'famine',
          [id],
          severe ? `A devastating famine strikes the ${civ.name}.` : `Famine grips the ${civ.name} as granaries run dry.`,
          severe ? 4 : 3,
          capitalTile(world, civ),
        );
      }
    } else {
      civ.famineYears = 0;
    }
    civ.needs.food = clamp01((1 - civ.food / reserveCap) * (balance < 0 ? 1 : 0.35) + (civ.famineYears > 0 ? 0.5 : 0));

    // --- Raw materials --------------------------------------------------------
    const ironUse = (civ.army / 1000) * 0.22 * Math.sqrt(era.military);
    const timberUse = civ.cityCount * 0.25 + civ.tiles * 0.01;
    const stoneUse = civ.cityCount * 0.2;
    civ.iron += IRON[id]! - ironUse;
    civ.timber += TIMBER[id]! - timberUse;
    civ.stone += STONE[id]! - stoneUse;
    civ.needs.iron = civ.iron < 0 ? clamp01(-civ.iron / Math.max(1, ironUse * 3) + 0.5) : clamp01(1 - civ.iron / Math.max(1, ironUse * 10));
    civ.needs.timber = civ.timber < 0 ? 1 : clamp01(1 - civ.timber / 30);
    civ.needs.stone = civ.stone < 0 ? 1 : clamp01(1 - civ.stone / 30);
    civ.iron = Math.max(0, civ.iron);
    civ.timber = Math.max(0, civ.timber);
    civ.stone = Math.max(0, civ.stone);
    // Surplus raw materials are sold off (mercantile states profit most).
    for (const key of ['iron', 'timber', 'stone'] as const) {
      const cap = 60 + (key === 'iron' ? IRON[id]! : key === 'timber' ? TIMBER[id]! : STONE[id]!) * 25;
      if (civ[key] > cap) {
        civ.wealth += (civ[key] - cap) * 0.05 * (0.4 + civ.traits.commerce);
        civ[key] = cap;
      }
    }

    // --- Budget ---------------------------------------------------------------
    computeBudget(world, civ);
    const milSpend = revenue * civ.budget.military;
    const resSpend = revenue * civ.budget.research;
    const devSpend = revenue * civ.budget.development;
    const savings = revenue - milSpend - resSpend - devSpend;

    // --- Army -----------------------------------------------------------------
    const upkeep = era.upkeep;
    const supportable = (milSpend / upkeep) * 1000;
    const manpower = civ.population * gov.mobilization * (atWar ? 1.7 : 1) * (0.6 + civ.traits.aggression * 0.6);
    let target = Math.min(supportable, manpower);
    if (atWar && civ.wealth > 0) {
      // War chests fund extra levies.
      target = Math.min(manpower, target + ((civ.wealth * 0.15) / upkeep) * 1000);
    }
    if (civ.army < target) civ.army += Math.min(target - civ.army, Math.max(civ.population * 0.004, target * 0.18));
    else civ.army -= (civ.army - target) * 0.25;
    const armyCost = (civ.army / 1000) * upkeep;
    civ.wealth += savings + milSpend - armyCost;
    if (civ.wealth < 0) {
      // Unpaid soldiers desert.
      civ.army *= 0.9;
      civ.wealth *= 0.5;
    }
    civ.army = Math.max(0, civ.army);

    // --- Research ---------------------------------------------------------------
    const sciEffects = effectMagnitude(civ, 'golden_age') * 0.4 + effectMagnitude(civ, 'scientific_revolution');
    const diffusion = researchDiffusion(world, civ, partners);
    // Research grows sub-linearly with population and spending so that no
    // nation can snowball through the eras; investment share still matters.
    const rp =
      (Math.pow(civ.population / 1000, 0.55) * (0.06 + civ.budget.research * SIM.researchFromPopulation) +
        Math.sqrt(Math.max(0, resSpend)) * SIM.researchFromSpending) *
      gov.research *
      (1 + lt.research + sciEffects) *
      (0.6 + civ.traits.science * 0.6) *
      (0.5 + 0.5 * stab) *
      (atWar ? 0.85 : 1) *
      diffusion;
    civ.researchRate = Math.max(0, rp);
    civ.techPoints += civ.researchRate;

    // --- Development -------------------------------------------------------------
    const pressure = clamp01((civ.population / Math.max(1, RURAL_CAP[id]!) - 0.55) * 2.2);
    civ.needs.land = pressure;
    const devRoot = Math.sqrt(Math.max(0, devSpend));
    civ.expansionPoints +=
      devRoot * SIM.expansionFromSpending * (0.5 + civ.traits.expansion + LEADER_TRAITS[civ.leader.trait].expansion) + pressure * 0.5;
    civ.developmentPoints += devRoot * SIM.developmentFromSpending + 0.1;
    civ.expansionPoints = Math.min(civ.expansionPoints, 25 + civ.tiles * 0.08);
    civ.developmentPoints = Math.min(civ.developmentPoints, 120 + civ.cityCount * 10);

    // Treasury overflow is spent on palaces, patronage and public works.
    const treasuryCap = revenue * 12 + 150;
    if (civ.wealth > treasuryCap) civ.wealth = treasuryCap + (civ.wealth - treasuryCap) * 0.5;

    // --- Military power ------------------------------------------------------------
    const ironFactor = 1 - civ.needs.iron * 0.35;
    const horseBonus = civ.era <= 3 ? 1 + Math.min(0.15, HORSES[id]! * 0.025) : 1;
    civ.armyPower =
      civ.army *
      era.military *
      gov.military *
      (1 + lt.military) *
      ironFactor *
      horseBonus *
      (0.55 + 0.45 * stab) *
      (1 - Math.min(0.5, civ.warExhaustion * 0.004)) *
      (1 + effectMagnitude(civ, 'fervor'));

    // --- Population growth modifier ---------------------------------------------------
    let g = (0.5 + 0.5 * stab) * (0.8 + (0.4 * civ.happiness) / 100);
    if (civ.famineYears > 0) g = 0;
    else if (civ.food < reserveCap * 0.25) g *= 0.6;
    if (atWar) g *= 0.85;
    if (civ.plague > 0) g *= 0.4;
    GROWTH_MOD[id] = g;
  }
}

/** Research bonus from contact with more advanced trading partners and neighbours. */
function researchDiffusion(world: World, civ: Civ, partners: number[]): number {
  let bonus = 0;
  for (const pid of partners) {
    const other = world.civs[pid]!;
    if (other.era > civ.era) bonus += 0.1 * (other.era - civ.era);
  }
  for (const rel of world.relations) {
    if (rel.border <= 0 || (rel.a !== civ.id && rel.b !== civ.id)) continue;
    const other = world.civs[rel.a === civ.id ? rel.b : rel.a]!;
    if (other.era > civ.era) bonus += 0.05 * (other.era - civ.era);
  }
  return 1 + Math.min(0.5, bonus);
}

/**
 * Yearly demographic step: urban capacity, migration toward opportunity,
 * logistic growth, famine and plague mortality.
 */
export function updatePopulation(world: World): void {
  const { map } = world;
  const N = map.size;
  const W = map.width;
  const H = map.height;
  const owner = world.owner;
  const pop = world.pop;
  const civs = world.civs;
  ensureScratch(civs.length, N);

  // Rural capacities.
  hoistCivConstants(world);
  const yFood = map.yFood;
  const blight = world.blight;
  const devastation = world.devastation;
  for (let t = 0; t < N; t++) {
    const o = owner[t]!;
    if (o < 0) {
      TILE_CAP[t] = 0;
      continue;
    }
    const lf = yFood[t]! * C_FOOD[o]! * (1 - blight[t]!) * (1 - 0.6 * devastation[t]!);
    TILE_CAP[t] = Math.max(60, lf * 1000 * C_RURAL[o]!);
  }
  // Urban capacity: cities draw on the countryside around them.
  for (const city of world.cities) {
    if (city.ruined || city.owner < 0) continue;
    const civ = civs[city.owner]!;
    const cx = city.tile % W;
    const cy = (city.tile / W) | 0;
    let catchment = 0;
    for (let y = Math.max(0, cy - 2); y <= Math.min(H - 1, cy + 2); y++) {
      for (let x = Math.max(0, cx - 2); x <= Math.min(W - 1, cx + 2); x++) {
        const t = y * W + x;
        if (t !== city.tile && owner[t] === city.owner) catchment += pop[t]!;
      }
    }
    const era = eraInfo(civ.era);
    const isCapital = civ.capital === city.id;
    const urban =
      (SIM.baseUrbanCapacity + SIM.urbanCatchment * catchment) *
      era.urban *
      (isCapital ? SIM.capitalUrbanBonus : 1) *
      (1 + map.yTrade[city.tile]! * 0.2) *
      (0.6 + (0.4 * civ.stability) / 100) *
      (1 - world.devastation[city.tile]!);
    TILE_CAP[city.tile] = TILE_CAP[city.tile]! + urban;
  }

  // Migration: people move from crowded tiles to emptier neighbours of the same nation.
  const rate = SIM.migrationRate;
  for (let t = 0; t < N; t++) {
    const o = owner[t]!;
    if (o < 0) continue;
    const capT = TILE_CAP[t]!;
    const x = t % W;
    if (x < W - 1 && owner[t + 1] === o) migrate(t, t + 1, capT, TILE_CAP[t + 1]!, pop, rate);
    if (t + W < N && owner[t + W] === o) migrate(t, t + W, capT, TILE_CAP[t + W]!, pop, rate);
  }

  // Growth and mortality.
  for (let t = 0; t < N; t++) {
    const o = owner[t]!;
    if (o < 0) continue;
    const civ = civs[o]!;
    const cap = TILE_CAP[t]!;
    let p = pop[t]!;
    const cityId = world.cityAt[t]!;
    const isCity = cityId >= 0 && !world.cities[cityId]!.ruined;
    const g = GROWTH_MOD[o]!;
    // Cities only grow while the nation produces a food surplus to feed them.
    const starvingCity = isCity && civ.foodBalance < 0;
    if (p < cap && !starvingCity) p += p * (isCity ? SIM.urbanGrowth : SIM.ruralGrowth) * (1 - p / cap) * g;
    else if (p > cap) p -= (p - cap) * 0.08;
    else if (starvingCity) p -= p * 0.01;
    const famine = FAMINE_RATE[o]!;
    const plague = civ.plague > 0 ? civ.plague * 0.05 * eraInfo(civ.era).medicine : 0;
    p -= p * (famine * (isCity ? 1.3 : 1) + plague * (isCity ? 1.4 : 1));
    pop[t] = Math.max(25, Number.isFinite(p) ? p : 25);
  }

  // Refresh aggregates.
  const totals = new Float64Array(civs.length);
  for (let t = 0; t < N; t++) {
    const o = owner[t]!;
    if (o >= 0) totals[o] = totals[o]! + pop[t]!;
  }
  for (const civ of civs) {
    if (!civ.alive) continue;
    civ.population = totals[civ.id]!;
  }
  for (const city of world.cities) city.population = city.ruined ? 0 : pop[city.tile]!;
}

function migrate(a: number, b: number, capA: number, capB: number, pop: Float32Array, rate: number): void {
  const pa = pop[a]!;
  const pb = pop[b]!;
  const ra = pa / capA;
  const rb = pb / capB;
  if (Math.abs(ra - rb) < 0.02) return;
  const flow = (ra - rb) * Math.min(capA, capB) * rate * 0.5;
  if (flow > 0) {
    const f = Math.min(flow, pa * 0.2);
    pop[a] = pa - f;
    pop[b] = pb + f;
  } else {
    const f = Math.min(-flow, pb * 0.2);
    pop[b] = pb - f;
    pop[a] = pa + f;
  }
}

/** Famine mortality computed this tick (for UI and events). */
export function famineRate(civId: number): number {
  return FAMINE_RATE[civId] ?? 0;
}
