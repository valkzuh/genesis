import type { World } from '../types/simulation';
import { components } from '../simulation/territory';
import type { PixelGrid } from './terrainPainter';

export interface CivLabel {
  civ: number;
  text: string;
  x: number;
  y: number;
  angle: number;
  /** Preferred font size in map pixels (from territory area). */
  size: number;
  /** Longest the label may be, in map pixels (territory extent along its axis). */
  maxWidth: number;
  /** Territory size in tiles, used to prioritise labels. */
  weight: number;
}

/**
 * Places each nation's name over the heart of its largest contiguous
 * territory, rotated along the territory's main axis like a printed atlas.
 */
export function computeCivLabels(world: World, grid: PixelGrid): CivLabel[] {
  const { width: W, height: H } = world.map;
  const out: CivLabel[] = [];
  for (const civ of world.civs) {
    if (!civ.alive || civ.tiles < 3) continue;
    const tiles = (world.cache.civTiles[civ.id] ?? []).filter((t) => world.owner[t] === civ.id);
    if (tiles.length < 3) continue;
    const comp = components(world, tiles)[0]!;
    if (comp.length < 3) continue;
    const inComp = new Set(comp);
    // Distance from the territory's edge (multi-source BFS inward).
    const dist = new Map<number, number>();
    const queue: number[] = [];
    for (const t of comp) {
      const x = t % W;
      const y = (t / W) | 0;
      const edge =
        x === 0 || y === 0 || x === W - 1 || y === H - 1 || !inComp.has(t - 1) || !inComp.has(t + 1) || !inComp.has(t - W) || !inComp.has(t + W);
      if (edge) {
        dist.set(t, 0);
        queue.push(t);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i]!;
      const d = dist.get(c)!;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (inComp.has(n) && !dist.has(n)) {
          dist.set(n, d + 1);
          queue.push(n);
        }
      }
    }
    // Principal axis.
    let mx = 0;
    let my = 0;
    for (const t of comp) {
      mx += grid.centerX[t]!;
      my += grid.centerY[t]!;
    }
    mx /= comp.length;
    my /= comp.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const t of comp) {
      const dx = grid.centerX[t]! - mx;
      const dy = grid.centerY[t]! - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const max = 0.42;
    angle = Math.max(-max, Math.min(max, angle));
    if (comp.length < 10) angle = 0;
    const lambda = (sxx + syy) / 2 + Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const axisLength = 4 * Math.sqrt(lambda / comp.length);

    // Pole of inaccessibility, nudged toward the centroid on ties.
    let best = comp[0]!;
    let bestScore = -Infinity;
    for (const t of comp) {
      const d = dist.get(t) ?? 0;
      const off = Math.hypot(grid.centerX[t]! - mx, grid.centerY[t]! - my) / grid.S;
      const score = d * 3 - off * 0.35;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    const x = grid.centerX[best]! * 0.65 + mx * 0.35;
    const y = grid.centerY[best]! * 0.65 + my * 0.35;
    const text = civ.name.toUpperCase();
    const size = Math.max(8, Math.min(40, Math.sqrt(comp.length) * grid.S * 0.42));
    const maxWidth = Math.max(axisLength * 0.95, grid.S * 4);
    out.push({ civ: civ.id, text, x, y, angle, size, maxWidth, weight: comp.length });
  }
  return out;
}
