import type { World } from '../types/simulation';
import { Biome, Resource } from '../types/world';
import { RESOURCES } from '../world/biomes';
import { darken, mix, NATION_PALETTE, toRGB } from '../utils/color';
import { alliesOf, getRelation, pairKey, tradePartnersOf } from '../simulation/world';
import type { PixelGrid } from './terrainPainter';

export type MapMode = 'political' | 'geographic' | 'population' | 'resources' | 'diplomacy';

export const MAP_MODES: { id: MapMode; label: string; key: string; description: string }[] = [
  { id: 'political', label: 'Political', key: '1', description: 'Nations, borders and wars' },
  { id: 'geographic', label: 'Terrain', key: '2', description: 'Relief, biomes and rivers' },
  { id: 'population', label: 'Population', key: '3', description: 'Where people live' },
  { id: 'resources', label: 'Resources', key: '4', description: 'Strategic and luxury deposits' },
  { id: 'diplomacy', label: 'Relations', key: '5', description: 'Alliances, rivalries and wars' },
];

/** Diplomatic categories used by the diplomacy map mode and its legend. */
export const DIPLO_COLORS = {
  self: 0xe2c06a,
  war: 0xd4553f,
  ally: 0x5fb37a,
  trade: 0x4aa3a8,
  rival: 0xe08a3c,
  friendly: 0x9bc98a,
  hostile: 0xc26a6a,
  neutral: 0x9aa0a8,
  unknown: 0x3a3f4a,
} as const;

/** Sequential palette for population density (dark violet → warm yellow). */
export const DENSITY_STOPS = [0x23163d, 0x4a1a63, 0x8c2a6b, 0xd24e4e, 0xf58f3b, 0xfcd25b, 0xfff4c4];

export function densityColor(v: number): number {
  const x = Math.max(0, Math.min(0.9999, v)) * (DENSITY_STOPS.length - 1);
  const i = Math.floor(x);
  return mix(DENSITY_STOPS[i]!, DENSITY_STOPS[i + 1]!, x - i);
}

const WAR_BORDER = 0xe0533b;
const GOLD = 0xf0d78c;

/** Packs a colour into little-endian RGBA for Uint32 pixel writes. */
function pack(color: number, alpha: number): number {
  const [r, g, b] = toRGB(color);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export interface OverlayView {
  mode: MapMode;
  selectedCiv: number | null;
}

/**
 * Paints the per-pixel overlay for the current map mode: translucent fills
 * per tile plus two-pixel borders where the border key changes.
 */
export class OverlayPainter {
  readonly image: ImageData;
  private readonly buf: Uint32Array;
  private readonly fill: Uint32Array;
  private readonly borderColor: Uint32Array;
  private readonly key: Int32Array;
  private readonly owner: Int32Array;

  constructor(private readonly grid: PixelGrid, tiles: number) {
    this.image = new ImageData(grid.pw, grid.ph);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.fill = new Uint32Array(tiles);
    this.borderColor = new Uint32Array(tiles);
    this.key = new Int32Array(tiles);
    this.owner = new Int32Array(tiles);
  }

  paint(world: World, view: OverlayView): void {
    this.computeTiles(world, view);
    const { pixTile, boundary, pw, ph } = this.grid;
    const buf = this.buf;
    const fill = this.fill;
    const P = pw * ph;
    for (let p = 0; p < P; p++) buf[p] = fill[pixTile[p]!]!;
    const key = this.key;
    const border = this.borderColor;
    const owner = this.owner;
    const warPairs = new Set<number>();
    for (const war of world.cache.activeWars) {
      for (const a of war.participants) {
        if (a.left !== null) continue;
        for (const b of war.participants) {
          if (b.left === null && a.side !== b.side) warPairs.add(pairKey(a.civ, b.civ));
        }
      }
    }
    const sel = view.selectedCiv;
    const markBorder = (p: number, self: number, other: number) => {
      const ks = key[self]!;
      const ko = key[other]!;
      if (ks === ko || ks === -3 || ko === -3) return;
      const os = owner[self]!;
      const oo = owner[other]!;
      let colorS = border[self]!;
      let colorO = border[other]!;
      if (os >= 0 && oo >= 0 && warPairs.has(pairKey(os, oo))) {
        colorS = pack(WAR_BORDER, 1);
        colorO = colorS;
      }
      if (sel !== null) {
        if (os === sel) colorS = pack(GOLD, 1);
        if (oo === sel) colorO = pack(GOLD, 1);
      }
      if (ks >= 0) buf[p] = colorS;
      return colorO;
    };
    for (let i = 0; i < boundary.length; i++) {
      const p = boundary[i]!;
      const t = pixTile[p]!;
      const x = p % pw;
      if (x < pw - 1) {
        const r = pixTile[p + 1]!;
        if (r !== t) {
          const co = markBorder(p, t, r);
          if (co !== undefined && key[r]! >= 0) buf[p + 1] = co;
        }
      }
      if (p + pw < P) {
        const d = pixTile[p + pw]!;
        if (d !== t) {
          const co = markBorder(p, t, d);
          if (co !== undefined && key[d]! >= 0) buf[p + pw] = co;
        }
      }
    }
  }

  private computeTiles(world: World, view: OverlayView): void {
    const { map } = world;
    const N = map.size;
    const fill = this.fill;
    const border = this.borderColor;
    const key = this.key;
    const owner = this.owner;
    const sel = view.selectedCiv !== null && world.civs[view.selectedCiv]?.alive ? view.selectedCiv : null;
    const transparent = 0;

    // Per-civ colours for the current mode.
    const civFill = new Uint32Array(world.civs.length);
    const civBorder = new Uint32Array(world.civs.length);
    for (const civ of world.civs) {
      if (!civ.alive) continue;
      let color = civ.color;
      let alpha = sel === null ? 0.46 : civ.id === sel ? 0.62 : 0.34;
      let edge = pack(darken(civ.color, 0.38), 0.92);
      switch (view.mode) {
        case 'geographic':
          alpha = 0;
          edge = pack(0x1e1914, 0.5);
          break;
        case 'population':
        case 'resources':
          alpha = 0;
          edge = pack(0xffffff, 0.28);
          break;
        case 'diplomacy': {
          const c = diplomacyColor(world, sel, civ.id);
          color = c.color;
          alpha = c.alpha;
          edge = pack(darken(color, 0.45), 0.85);
          break;
        }
        default:
          break;
      }
      civFill[civ.id] = alpha > 0 ? pack(color, alpha) : transparent;
      civBorder[civ.id] = edge;
    }

    let maxPop = 1;
    if (view.mode === 'population') {
      for (let t = 0; t < N; t++) if (world.pop[t]! > maxPop) maxPop = world.pop[t]!;
    }
    const logMin = Math.log10(150);
    const logMax = Math.log10(Math.max(1000, maxPop));

    for (let t = 0; t < N; t++) {
      const b = map.biome[t]!;
      const o = world.owner[t]!;
      owner[t] = o;
      if (b <= Biome.Lake) {
        key[t] = -3;
        fill[t] = transparent;
        border[t] = transparent;
        continue;
      }
      key[t] = o;
      if (o >= 0) {
        fill[t] = civFill[o]!;
        border[t] = civBorder[o]!;
      } else {
        fill[t] = transparent;
        border[t] = transparent;
      }
      if (view.mode === 'population') {
        if (o >= 0) {
          const v = (Math.log10(world.pop[t]! + 1) - logMin) / (logMax - logMin);
          fill[t] = pack(densityColor(v), 0.8);
        } else {
          fill[t] = pack(0x0a0a12, 0.35);
        }
      } else if (view.mode === 'resources') {
        const r = map.resource[t]!;
        if (r !== Resource.None) fill[t] = pack(RESOURCES[r]!.color, 0.92);
        else fill[t] = pack(0x0c0d12, o >= 0 ? 0.42 : 0.5);
      }
    }
  }
}

/** Colour of `other` from the point of view of the selected civilisation. */
function diplomacyColor(world: World, sel: number | null, other: number): { color: number; alpha: number } {
  if (sel === null) {
    // Without a selection, colour alliance blocs.
    const bloc = blocIndex(world, other);
    if (bloc < 0) return { color: DIPLO_COLORS.neutral, alpha: 0.22 };
    return { color: NATION_PALETTE[(bloc * 7 + 3) % NATION_PALETTE.length]!, alpha: 0.55 };
  }
  if (other === sel) return { color: DIPLO_COLORS.self, alpha: 0.62 };
  for (const war of world.cache.activeWars) {
    const a = war.participants.find((p) => p.civ === sel && p.left === null);
    const b = war.participants.find((p) => p.civ === other && p.left === null);
    if (a && b && a.side !== b.side) return { color: DIPLO_COLORS.war, alpha: 0.6 };
  }
  const rel = getRelation(world, sel, other);
  if (!rel) return { color: DIPLO_COLORS.unknown, alpha: 0.45 };
  if (rel.alliance) return { color: DIPLO_COLORS.ally, alpha: 0.58 };
  if (rel.rivalry) return { color: DIPLO_COLORS.rival, alpha: 0.58 };
  if (rel.trade) return { color: DIPLO_COLORS.trade, alpha: 0.5 };
  if (rel.opinion > 25) return { color: DIPLO_COLORS.friendly, alpha: 0.45 };
  if (rel.opinion < -25) return { color: DIPLO_COLORS.hostile, alpha: 0.45 };
  return { color: DIPLO_COLORS.neutral, alpha: 0.35 };
}

/** Index of the alliance bloc (connected component of alliances) a civ belongs to, or -1. */
export function blocIndex(world: World, civId: number): number {
  const blocs = allianceBlocs(world);
  return blocs.findIndex((b) => b.members.includes(civId));
}

export interface AllianceBloc {
  name: string;
  members: number[];
}

/** Connected components of the alliance graph, each with its bloc name. */
export function allianceBlocs(world: World): AllianceBloc[] {
  const seen = new Set<number>();
  const blocs: AllianceBloc[] = [];
  for (const civ of world.civs) {
    if (!civ.alive || seen.has(civ.id) || alliesOf(world, civ.id).length === 0) continue;
    const members: number[] = [];
    const stack = [civ.id];
    seen.add(civ.id);
    while (stack.length > 0) {
      const c = stack.pop()!;
      members.push(c);
      for (const a of alliesOf(world, c)) {
        if (!seen.has(a)) {
          seen.add(a);
          stack.push(a);
        }
      }
    }
    members.sort((a, b) => a - b);
    let name = 'Alliance';
    const counts = new Map<string, number>();
    for (const rel of world.relations) {
      if (rel.alliance && rel.allianceName && members.includes(rel.a)) counts.set(rel.allianceName, (counts.get(rel.allianceName) ?? 0) + 1);
    }
    let best = 0;
    for (const [n, c] of counts) {
      if (c > best) {
        best = c;
        name = n;
      }
    }
    blocs.push({ name, members });
  }
  return blocs;
}

/** Small helper for legends. */
export function tradeLinks(world: World, civId: number): number[] {
  return tradePartnersOf(world, civId);
}
