import { Biome, type WorldMap } from '../types/world';
import { Rng } from '../utils/rng';
import { SimplexNoise } from '../utils/noise';

/**
 * CPU terrain painting. The map is rendered at `S` pixels per tile. Pixels
 * are assigned to tiles through a smooth domain warp, which turns the square
 * grid into organic, hand-drawn looking coastlines and borders while keeping
 * a single authoritative pixel → tile lookup for drawing *and* picking.
 */

export interface PixelGrid {
  S: number;
  pw: number;
  ph: number;
  /** Tile index for every pixel. */
  pixTile: Int32Array;
  /** Pixels whose right or lower neighbour belongs to a different tile. */
  boundary: Int32Array;
  /** Approximate pixel position of each tile's visual centre. */
  centerX: Float32Array;
  centerY: Float32Array;
}

const WARP_STEP = 4;

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Builds the pixel → tile mapping. Coastlines follow a smoothed, noise-
 * perturbed iso-line of the land mask (no tile staircases); inland, pixels
 * belong to the nearest jittered tile centre in warped space, which turns
 * square tiles into irregular, natural-looking cells.
 */
export function buildPixelGrid(map: WorldMap, seed: string, S = 8): PixelGrid {
  const { width: W, height: H } = map;
  const N = W * H;
  const pw = W * S;
  const ph = H * S;
  const noise = new SimplexNoise(new Rng(`${seed}::warp`));
  // Jittered tile centres (tile units).
  const jx = new Float32Array(N);
  const jy = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    const h = hash2(t % W, (t / W) | 0);
    jx[t] = (t % W) + 0.5 + (((h & 1023) / 1023) - 0.5) * 0.62;
    jy[t] = ((t / W) | 0) + 0.5 + ((((h >>> 10) & 1023) / 1023) - 0.5) * 0.62;
  }
  const landT = new Uint8Array(N);
  for (let t = 0; t < N; t++) landT[t] = map.biome[t]! > Biome.Lake ? 1 : 0;
  // Warp offsets and coast noise on a coarse grid, bilinearly interpolated.
  const gw = Math.ceil(pw / WARP_STEP) + 2;
  const gh = Math.ceil(ph / WARP_STEP) + 2;
  const gx = new Float32Array(gw * gh);
  const gy = new Float32Array(gw * gh);
  const gn = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const u = (i * WARP_STEP) / S;
      const v = (j * WARP_STEP) / S;
      gx[j * gw + i] = 0.3 * noise.noise2D(u * 0.3, v * 0.3) + 0.12 * noise.noise2D(u * 1.1 + 7.3, v * 1.1 - 3.1);
      gy[j * gw + i] = 0.3 * noise.noise2D(u * 0.3 + 31.7, v * 0.3 - 12.9) + 0.12 * noise.noise2D(u * 1.1 - 17.1, v * 1.1 + 9.7);
      gn[j * gw + i] = 0.6 * noise.noise2D(u * 0.9 - 51.3, v * 0.9 + 22.4) + 0.4 * noise.noise2D(u * 2.3 + 3.3, v * 2.3 + 81.1);
    }
  }
  const pixTile = new Int32Array(pw * ph);
  const sumX = new Float64Array(N);
  const sumY = new Float64Array(N);
  const count = new Int32Array(N);
  for (let py = 0; py < ph; py++) {
    const fy = py / WARP_STEP;
    const j0 = Math.floor(fy);
    const ty = fy - j0;
    for (let px = 0; px < pw; px++) {
      const fx = px / WARP_STEP;
      const i0 = Math.floor(fx);
      const tx = fx - i0;
      const a = j0 * gw + i0;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const u = (px + 0.5) / S + gx[a]! * w00 + gx[a + 1]! * w10 + gx[a + gw]! * w01 + gx[a + gw + 1]! * w11;
      const v = (py + 0.5) / S + gy[a]! * w00 + gy[a + 1]! * w10 + gy[a + gw]! * w01 + gy[a + gw + 1]! * w11;
      const cn = gn[a]! * w00 + gn[a + 1]! * w10 + gn[a + gw]! * w01 + gn[a + gw + 1]! * w11;
      // Smooth land field from the four surrounding tile centres.
      let bx = Math.floor(u - 0.5);
      let by = Math.floor(v - 0.5);
      const fu = u - 0.5 - bx;
      const fv = v - 0.5 - by;
      if (bx < 0) bx = 0;
      else if (bx > W - 2) bx = W - 2;
      if (by < 0) by = 0;
      else if (by > H - 2) by = H - 2;
      const t00 = by * W + bx;
      const L =
        (landT[t00]! * (1 - fu) + landT[t00 + 1]! * fu) * (1 - fv) + (landT[t00 + W]! * (1 - fu) + landT[t00 + W + 1]! * fu) * fv + cn * 0.16;
      const wantLand = L > 0.5 ? 1 : 0;
      // Nearest jittered centre of the matching class within the 3x3 block.
      const cx = Math.floor(u);
      const cy = Math.floor(v);
      let best = -1;
      let bestD = Infinity;
      let any = -1;
      let anyD = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx;
          if (xx < 0 || xx >= W) continue;
          const t = yy * W + xx;
          const ddx = jx[t]! - u;
          const ddy = jy[t]! - v;
          const d = ddx * ddx + ddy * ddy;
          if (d < anyD) {
            anyD = d;
            any = t;
          }
          if (landT[t] === wantLand && d < bestD) {
            bestD = d;
            best = t;
          }
        }
      }
      const t = best >= 0 ? best : any >= 0 ? any : Math.min(N - 1, Math.max(0, cy * W + cx));
      pixTile[py * pw + px] = t;
      sumX[t] = sumX[t]! + px;
      sumY[t] = sumY[t]! + py;
      count[t] = count[t]! + 1;
    }
  }
  const centerX = new Float32Array(N);
  const centerY = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    if (count[t]! > 0) {
      centerX[t] = sumX[t]! / count[t]!;
      centerY[t] = sumY[t]! / count[t]!;
    } else {
      centerX[t] = jx[t]! * S;
      centerY[t] = jy[t]! * S;
    }
  }
  const boundaryList: number[] = [];
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const p = py * pw + px;
      const t = pixTile[p]!;
      if ((px < pw - 1 && pixTile[p + 1] !== t) || (py < ph - 1 && pixTile[p + pw] !== t)) boundaryList.push(p);
    }
  }
  return { S, pw, ph, pixTile, boundary: Int32Array.from(boundaryList), centerX, centerY };
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

type RGB = [number, number, number];
const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Cartographic land palette; slightly richer than the UI biome swatches. */
const LAND: Record<number, RGB> = {
  [Biome.Ice]: hex(0xe9edf0),
  [Biome.Tundra]: hex(0xa8a48a),
  [Biome.Taiga]: hex(0x4f6a4e),
  [Biome.Steppe]: hex(0xb7ad7a),
  [Biome.Grassland]: hex(0x93a85e),
  [Biome.TemperateForest]: hex(0x5c7e45),
  [Biome.Shrubland]: hex(0xa79d66),
  [Biome.Desert]: hex(0xdcc690),
  [Biome.Savanna]: hex(0xbdab5f),
  [Biome.TropicalForest]: hex(0x3d6b38),
  [Biome.Marsh]: hex(0x687b5a),
  [Biome.Hills]: hex(0x9a8e62),
  [Biome.Mountains]: hex(0x8a7e70),
  [Biome.Peaks]: hex(0x9c958b),
};

const DEEP: RGB = hex(0x142638);
const SHALLOW: RGB = hex(0x2f5d7c);
const COAST: RGB = hex(0x4b84a3);
const LAKE: RGB = hex(0x3f7898);
const SEA_ICE: RGB = hex(0xc9d6de);

const FORESTS = new Set<number>([Biome.Taiga, Biome.TemperateForest, Biome.TropicalForest]);

export interface TerrainImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** Per-pixel land mask (1 = land). */
  land: Uint8Array;
}

/**
 * Paints the static terrain: biome colours with smooth climatic tinting,
 * hillshaded relief, coastal shallows and contours, forest stippling and
 * polar sea ice. Pure (no DOM), so it can run anywhere.
 */
export function paintTerrain(map: WorldMap, grid: PixelGrid, seed: string): TerrainImage {
  const { width: W, height: H } = map;
  const { pw, ph, S, pixTile } = grid;
  const P = pw * ph;
  const noise = new SimplexNoise(new Rng(`${seed}::relief`));
  const land = new Uint8Array(P);
  const isLake = new Uint8Array(P);
  for (let p = 0; p < P; p++) {
    const b = map.biome[pixTile[p]!]!;
    land[p] = b > Biome.Lake ? 1 : 0;
    isLake[p] = b === Biome.Lake ? 1 : 0;
  }

  // --- Smooth elevation field (bilinear between tile centres + detail). -----
  const elev = new Float32Array(P);
  const relief = new Float32Array(W * H);
  for (let t = 0; t < W * H; t++) {
    const b = map.biome[t]!;
    relief[t] = b === Biome.Peaks ? 1.4 : b === Biome.Mountains ? 1 : b === Biome.Hills ? 0.4 : 0.06;
  }
  // Relief strength interpolated between tile centres so ranges have soft feet.
  const reliefField = (px: number, py: number): number => {
    const u = (px + 0.5) / S - 0.5;
    const v = (py + 0.5) / S - 0.5;
    let x0 = Math.floor(u);
    let y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= W) x1 = W - 1;
    if (y1 >= H) y1 = H - 1;
    return (relief[y0 * W + x0]! * (1 - fx) + relief[y0 * W + x1]! * fx) * (1 - fy) + (relief[y1 * W + x0]! * (1 - fx) + relief[y1 * W + x1]! * fx) * fy;
  };
  for (let py = 0; py < ph; py++) {
    const v = (py + 0.5) / S - 0.5;
    let y0 = Math.floor(v);
    const fy = v - y0;
    let y1 = y0 + 1;
    if (y0 < 0) y0 = 0;
    if (y1 >= H) y1 = H - 1;
    for (let px = 0; px < pw; px++) {
      const u = (px + 0.5) / S - 0.5;
      let x0 = Math.floor(u);
      const fx = u - x0;
      let x1 = x0 + 1;
      if (x0 < 0) x0 = 0;
      if (x1 >= W) x1 = W - 1;
      const e00 = map.elevation[y0 * W + x0]!;
      const e10 = map.elevation[y0 * W + x1]!;
      const e01 = map.elevation[y1 * W + x0]!;
      const e11 = map.elevation[y1 * W + x1]!;
      let e = (e00 * (1 - fx) + e10 * fx) * (1 - fy) + (e01 * (1 - fx) + e11 * fx) * fy;
      const p = py * pw + px;
      if (land[p]) {
        const r = reliefField(px, py);
        const nx = px / S;
        const ny = py / S;
        e += noise.fbm(nx * 0.7, ny * 0.7, 4) * 0.014;
        if (r > 0.05) e += (noise.ridged(nx * 0.42, ny * 0.42, 3, 2.0, 0.5) - 0.4) * 0.12 * r;
      }
      elev[p] = e;
    }
  }

  // --- Distance (in pixels) from water pixels to the nearest land. ----------
  const dist = new Float32Array(P);
  const INF = 1e9;
  for (let p = 0; p < P; p++) dist[p] = land[p] ? 0 : INF;
  const D1 = 1;
  const D2 = 1.4142;
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const p = py * pw + px;
      let d = dist[p]!;
      if (d === 0) continue;
      if (px > 0) d = Math.min(d, dist[p - 1]! + D1);
      if (py > 0) {
        d = Math.min(d, dist[p - pw]! + D1);
        if (px > 0) d = Math.min(d, dist[p - pw - 1]! + D2);
        if (px < pw - 1) d = Math.min(d, dist[p - pw + 1]! + D2);
      }
      dist[p] = d;
    }
  }
  for (let py = ph - 1; py >= 0; py--) {
    for (let px = pw - 1; px >= 0; px--) {
      const p = py * pw + px;
      let d = dist[p]!;
      if (d === 0) continue;
      if (px < pw - 1) d = Math.min(d, dist[p + 1]! + D1);
      if (py < ph - 1) {
        d = Math.min(d, dist[p + pw]! + D1);
        if (px < pw - 1) d = Math.min(d, dist[p + pw + 1]! + D2);
        if (px > 0) d = Math.min(d, dist[p + pw - 1]! + D2);
      }
      dist[p] = d;
    }
  }

  // --- Base colours ----------------------------------------------------------
  // Per-tile land colour with climatic tint, muted for a cartographic feel.
  const tr = new Float32Array(W * H);
  const tg = new Float32Array(W * H);
  const tb = new Float32Array(W * H);
  for (let t = 0; t < W * H; t++) {
    const base = LAND[map.biome[t]!] ?? LAND[Biome.Grassland]!;
    const m = map.moisture[t]!;
    const temp = map.temperature[t]!;
    let cr = base[0] * (1.04 - m * 0.08);
    let cg = base[1] * (1.0 + (m - 0.5) * 0.05);
    let cb = base[2] * (1.0 - m * 0.04);
    const cold = Math.max(0, 0.3 - temp) * 1.2;
    cr += (190 - cr) * cold * 0.4;
    cg += (192 - cg) * cold * 0.4;
    cb += (196 - cb) * cold * 0.4;
    const lum = cr * 0.3 + cg * 0.59 + cb * 0.11;
    tr[t] = cr + (lum - cr) * 0.14;
    tg[t] = cg + (lum - cg) * 0.14;
    tb[t] = cb + (lum - cb) * 0.14;
  }
  const r = new Float32Array(P);
  const g = new Float32Array(P);
  const b = new Float32Array(P);
  for (let py = 0; py < ph; py++) {
    const v = (py + 0.5) / S - 0.5;
    let y0 = Math.floor(v);
    const fy = v - y0;
    let y1 = y0 + 1;
    if (y0 < 0) y0 = 0;
    if (y1 >= H) y1 = H - 1;
    for (let px = 0; px < pw; px++) {
      const p = py * pw + px;
      const t = pixTile[p]!;
      if (land[p]) {
        // Blend the cell colour with a bilinear field of neighbouring land colours.
        const u = (px + 0.5) / S - 0.5;
        let x0 = Math.floor(u);
        const fx = u - x0;
        let x1 = x0 + 1;
        if (x0 < 0) x0 = 0;
        if (x1 >= W) x1 = W - 1;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sw = 0;
        const corners = [y0 * W + x0, y0 * W + x1, y1 * W + x0, y1 * W + x1];
        const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
        for (let k = 0; k < 4; k++) {
          const c = corners[k]!;
          if (map.biome[c]! <= Biome.Lake) continue;
          const w = weights[k]!;
          sr += tr[c]! * w;
          sg += tg[c]! * w;
          sb += tb[c]! * w;
          sw += w;
        }
        if (sw > 0) {
          r[p] = tr[t]! * 0.45 + (sr / sw) * 0.55;
          g[p] = tg[t]! * 0.45 + (sg / sw) * 0.55;
          b[p] = tb[t]! * 0.45 + (sb / sw) * 0.55;
        } else {
          r[p] = tr[t]!;
          g[p] = tg[t]!;
          b[p] = tb[t]!;
        }
      } else if (isLake[p]) {
        r[p] = LAKE[0];
        g[p] = LAKE[1];
        b[p] = LAKE[2];
      } else {
        const depth = Math.max(0, Math.min(1, (0.5 - elev[p]!) / 0.38));
        const d = dist[p]!;
        const near = Math.max(0, 1 - d / (S * 1.7));
        let cr = SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * depth;
        let cg = SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * depth;
        let cb = SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * depth;
        const glow = near * near * 0.8;
        cr += (COAST[0] - cr) * glow;
        cg += (COAST[1] - cg) * glow;
        cb += (COAST[2] - cb) * glow;
        const temp = map.temperature[t]!;
        const floes = noise.noise2D(px * 0.045, py * 0.045) * 0.5 + 0.5;
        const ice = Math.max(0, Math.min(1, (0.07 - temp) * 12)) * (0.25 + floes * 0.35);
        if (ice > 0) {
          cr += (SEA_ICE[0] - cr) * ice;
          cg += (SEA_ICE[1] - cg) * ice;
          cb += (SEA_ICE[2] - cb) * ice;
        }
        r[p] = cr;
        g[p] = cg;
        b[p] = cb;
      }
    }
  }

  // Soften tile edges between land biomes (two box-blur passes, land only).
  const tmpR = new Float32Array(P);
  const tmpG = new Float32Array(P);
  const tmpB = new Float32Array(P);
  for (let pass = 0; pass < 2; pass++) {
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const p = py * pw + px;
        if (!land[p]) {
          tmpR[p] = r[p]!;
          tmpG[p] = g[p]!;
          tmpB[p] = b[p]!;
          continue;
        }
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let k = -2; k <= 2; k++) {
          const x = px + k;
          if (x < 0 || x >= pw) continue;
          const q = p + k;
          if (!land[q]) continue;
          sr += r[q]!;
          sg += g[q]!;
          sb += b[q]!;
          n++;
        }
        tmpR[p] = sr / n;
        tmpG[p] = sg / n;
        tmpB[p] = sb / n;
      }
    }
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const p = py * pw + px;
        if (!land[p]) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let k = -2; k <= 2; k++) {
          const y = py + k;
          if (y < 0 || y >= ph) continue;
          const q = p + k * pw;
          if (!land[q]) continue;
          sr += tmpR[q]!;
          sg += tmpG[q]!;
          sb += tmpB[q]!;
          n++;
        }
        r[p] = sr / n;
        g[p] = sg / n;
        b[p] = sb / n;
      }
    }
  }

  // --- Final composition: hillshade, texture, coastlines -----------------------
  const out = new Uint8ClampedArray(P * 4);
  const lx = -0.6;
  const ly = -0.75;
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const p = py * pw + px;
      const t = pixTile[p]!;
      const biome = map.biome[t]!;
      let cr = r[p]!;
      let cg = g[p]!;
      let cb = b[p]!;
      const h = hash2(px, py);
      if (land[p]) {
        const ex = (px < pw - 1 ? elev[p + 1]! : elev[p]!) - (px > 0 ? elev[p - 1]! : elev[p]!);
        const ey = (py < ph - 1 ? elev[p + pw]! : elev[p]!) - (py > 0 ? elev[p - pw]! : elev[p]!);
        const rel = reliefField(px, py);
        const k = 10 + rel * 30;
        let shade = 1 + (ex * lx + ey * ly) * k;
        shade = shade < 0.62 ? 0.62 : shade > 1.32 ? 1.32 : shade;
        cr *= shade;
        cg *= shade;
        cb *= shade;
        // Snow on high ground.
        if (rel > 0.6) {
          const patch = noise.noise2D(px * 0.09, py * 0.09) * 0.25;
          const snow = (elev[p]! - 0.9) * 10 + (rel - 1) * 0.5 + (shade - 1) * 0.9 + patch;
          if (snow > 0) {
            const s = Math.min(0.75, snow);
            cr += (240 - cr) * s;
            cg += (242 - cg) * s;
            cb += (246 - cb) * s;
          }
        }
        // Forest canopy stipple.
        if (FORESTS.has(biome)) {
          const m = h % 11;
          if (m === 0 || m === 5) {
            cr *= 0.8;
            cg *= 0.84;
            cb *= 0.8;
          } else if (m === 3) {
            cr *= 1.06;
            cg *= 1.07;
            cb *= 1.04;
          }
        } else if (biome === Biome.Desert) {
          const dune = Math.sin(px * 0.55 + Math.sin(py * 0.21) * 3.2) * 0.03;
          cr *= 1 + dune;
          cg *= 1 + dune;
          cb *= 1 + dune * 0.6;
        }
        // Paper grain.
        const grain = ((h & 255) / 255 - 0.5) * 0.05;
        cr *= 1 + grain;
        cg *= 1 + grain;
        cb *= 1 + grain;
        // Dark coastline ink on the land side.
        const touchesWater =
          (px > 0 && !land[p - 1]) || (px < pw - 1 && !land[p + 1]) || (py > 0 && !land[p - pw]) || (py < ph - 1 && !land[p + pw]);
        if (touchesWater) {
          cr *= 0.62;
          cg *= 0.62;
          cb *= 0.64;
        }
      } else {
        const d = dist[p]!;
        if (!isLake[p]) {
          // Faint contour lines following the coast, as on old charts.
          const c1 = Math.abs(d - S * 1.2);
          const c2 = Math.abs(d - S * 2.6);
          if (c1 < 0.6 || c2 < 0.55) {
            const a = c1 < 0.6 ? 0.1 : 0.06;
            cr += (200 - cr) * a;
            cg += (225 - cg) * a;
            cb += (235 - cb) * a;
          }
          const grain = ((h & 255) / 255 - 0.5) * 0.025;
          cr *= 1 + grain;
          cg *= 1 + grain;
          cb *= 1 + grain;
        }
        if (d <= 1.01) {
          // Bright surf line.
          cr += (170 - cr) * 0.35;
          cg += (205 - cg) * 0.35;
          cb += (220 - cb) * 0.35;
        }
      }
      const o = p * 4;
      out[o] = cr;
      out[o + 1] = cg;
      out[o + 2] = cb;
      out[o + 3] = 255;
    }
  }
  return { width: pw, height: ph, data: out, land };
}

/** Draws smoothed rivers with widths that grow downstream. */
export function drawRivers(ctx: CanvasRenderingContext2D, map: WorldMap, grid: PixelGrid): void {
  const N = map.size;
  const hasUpstream = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    const to = map.riverTo[t]!;
    if (map.river[t] && to >= 0) hasUpstream[to] = 1;
  }
  const drawn = new Uint8Array(N);
  const cx = (t: number) => grid.centerX[t]!;
  const cy = (t: number) => grid.centerY[t]!;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const widths = [0, 1.1, 1.7, 2.6];
  for (let src = 0; src < N; src++) {
    if (!map.river[src] || hasUpstream[src]) continue;
    // Walk downstream from each source until water or an already drawn river.
    const chain: number[] = [src];
    let cur = src;
    for (let guard = 0; guard < 400; guard++) {
      const next = map.riverTo[cur]!;
      if (next < 0) break;
      chain.push(next);
      if (!map.river[next] || drawn[next]) break;
      cur = next;
    }
    for (const t of chain) if (map.river[t]) drawn[t] = 1;
    if (chain.length < 2) continue;
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!;
      const bt = chain[i + 1]!;
      const prev = i > 0 ? chain[i - 1]! : a;
      const startX = i > 0 ? (cx(prev) + cx(a)) / 2 : cx(a);
      const startY = i > 0 ? (cy(prev) + cy(a)) / 2 : cy(a);
      const last = i === chain.length - 2;
      const endX = last ? cx(bt) : (cx(a) + cx(bt)) / 2;
      const endY = last ? cy(bt) : (cy(a) + cy(bt)) / 2;
      const mag = map.river[a] || 1;
      ctx.strokeStyle = 'rgba(58, 108, 146, 0.95)';
      ctx.lineWidth = widths[mag]! * (grid.S / 8);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cx(a), cy(a), endX, endY);
      ctx.stroke();
    }
  }
}
