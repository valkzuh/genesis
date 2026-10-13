import { Biome, Resource, type LandmassInfo, type WorldMap } from '../types/world';
import { Rng } from '../utils/rng';
import { SimplexNoise } from '../utils/noise';
import { clamp01, smoothstep } from '../utils/math';
import { BIOMES, isWaterBiome } from './biomes';
import { LANGUAGES, NameRegistry } from '../utils/names';
import { MinHeap } from '../utils/heap';

export interface MapOptions {
  width: number;
  height: number;
  /** Target fraction of tiles that are land (0.25..0.6). */
  landFraction: number;
}

export const DEFAULT_MAP_OPTIONS: MapOptions = { width: 160, height: 100, landFraction: 0.4 };

/** 4-neighbourhood offsets used throughout the simulation. */
export function neighbors4(i: number, w: number, h: number, out: number[]): number[] {
  out.length = 0;
  const x = i % w;
  const y = (i / w) | 0;
  if (x > 0) out.push(i - 1);
  if (x < w - 1) out.push(i + 1);
  if (y > 0) out.push(i - w);
  if (y < h - 1) out.push(i + w);
  return out;
}

export function neighbors8(i: number, w: number, h: number, out: number[]): number[] {
  out.length = 0;
  const x = i % w;
  const y = (i / w) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= w) continue;
      out.push(ny * w + nx);
    }
  }
  return out;
}

interface ContinentSeed {
  x: number;
  y: number;
  rx: number;
  ry: number;
  cos: number;
  sin: number;
  weight: number;
}

/**
 * Generates the complete static geography for a seed. Pure and deterministic:
 * the same seed and options always produce byte-identical arrays.
 */
export function generateMap(seed: string, options: MapOptions = DEFAULT_MAP_OPTIONS): WorldMap {
  const W = Math.max(40, Math.floor(options.width));
  const H = Math.max(30, Math.floor(options.height));
  const N = W * H;
  const rng = new Rng(`${seed}::terrain`);
  const elevNoise = new SimplexNoise(rng);
  const warpNoise = new SimplexNoise(rng);
  const ridgeNoise = new SimplexNoise(rng);
  const moistNoise = new SimplexNoise(rng);
  const tempNoise = new SimplexNoise(rng);
  const resNoise = new SimplexNoise(rng);
  const beltNoise = new SimplexNoise(rng);

  // Map coordinates are normalised so the longer side spans ~1 unit.
  const scale = 1 / Math.max(W, H);

  // --- 1. Continents ------------------------------------------------------
  const continents: ContinentSeed[] = [];
  const continentCount = rng.intRange(2, 5);
  for (let c = 0; c < continentCount; c++) {
    // Rejection-sample centres so major continents tend to stay apart.
    let cx = 0;
    let cy = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      cx = rng.range(0.16, 0.84) * W;
      cy = rng.range(0.2, 0.8) * H;
      const minDist = W * (0.3 - attempt * 0.005);
      if (continents.every((o) => Math.hypot(o.x - cx, (o.y - cy) * 1.2) >= minDist)) break;
    }
    const angle = rng.range(0, Math.PI);
    continents.push({
      x: cx,
      y: cy,
      rx: rng.range(0.1, 0.22) * W,
      ry: rng.range(0.1, 0.2) * H,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      weight: rng.range(0.8, 1.1),
    });
  }
  // A scattering of small island seeds for archipelagos.
  const islandCount = rng.intRange(3, 8);
  for (let c = 0; c < islandCount; c++) {
    const angle = rng.range(0, Math.PI);
    continents.push({
      x: rng.range(0.06, 0.94) * W,
      y: rng.range(0.1, 0.9) * H,
      rx: rng.range(0.025, 0.07) * W,
      ry: rng.range(0.03, 0.08) * H,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      weight: rng.range(0.55, 0.85),
    });
  }

  const raw = new Float32Array(N);
  const ridgeField = new Float32Array(N);
  const beltField = new Float32Array(N);
  const rot = rng.range(0, Math.PI * 2);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const nx = x * scale;
      const ny = y * scale;
      // Domain warp for organic coastlines.
      const wx = nx + 0.09 * warpNoise.fbm(nx * 3.1 + 11.3, ny * 3.1 - 7.7, 3);
      const wy = ny + 0.09 * warpNoise.fbm(nx * 3.1 - 41.9, ny * 3.1 + 23.1, 3);
      let mask = 0;
      for (const c of continents) {
        const ox = wx / scale - c.x;
        const oy = wy / scale - c.y;
        const dx = (ox * c.cos + oy * c.sin) / c.rx;
        const dy = (-ox * c.sin + oy * c.cos) / c.ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = c.weight * (1 - smoothstep(0.35, 1.25, d));
        if (v > mask) mask = v;
      }
      const detail = elevNoise.fbm(wx * 4.6, wy * 4.6, 7, 2.05, 0.56);
      // Ridged noise sampled in a rotated frame gives ranges a dominant grain.
      const rx = (wx * cosR - wy * sinR) * 5.5;
      const ry = (wx * sinR + wy * cosR) * 5.5;
      const ridge = ridgeNoise.ridged(rx, ry * 0.7, 5, 2.1, 0.5);
      // Mountain belts: ranges only rise where a low-frequency "orogeny" field is high.
      const belt = smoothstep(0.0, 0.42, beltNoise.fbm(nx * 2.2 + 3.7, ny * 2.2 - 1.3, 3));
      ridgeField[i] = ridge;
      beltField[i] = belt;
      // Edge falloff keeps the map border oceanic.
      const ex = Math.min(x, W - 1 - x) / (W * 0.08);
      const ey = Math.min(y, H - 1 - y) / (H * 0.1);
      const edge = smoothstep(0, 1, Math.min(ex, ey));
      raw[i] = (mask * 0.56 + (detail * 0.5 + 0.5) * 0.5 - 0.08) * (0.25 + 0.75 * edge);
    }
  }

  // Sea level by quantile so the land fraction is predictable.
  const sorted = Float32Array.from(raw).sort();
  const landFraction = Math.min(0.62, Math.max(0.2, options.landFraction));
  const rawSea = sorted[Math.floor((1 - landFraction) * (N - 1))]!;
  const rawMax = sorted[N - 1]!;
  const rawMin = sorted[0]!;

  // Normalise: water in [0, 0.5), land in [0.5, 1]. Add mountain ridges on land.
  const elevation = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = raw[i]!;
    if (r < rawSea) {
      elevation[i] = (0.5 * (r - rawMin)) / Math.max(1e-6, rawSea - rawMin);
    } else {
      const land = (r - rawSea) / Math.max(1e-6, rawMax - rawSea); // 0..1
      const inland = smoothstep(0.0, 0.18, land);
      const ridge = ridgeField[i]!;
      const belt = beltField[i]!;
      const ranges = Math.pow(smoothstep(0.52, 0.9, ridge), 1.2) * 0.7 * inland * belt;
      const h = clamp01(Math.pow(land, 0.85) * 0.42 + ranges + ridge * 0.1 * inland * (0.4 + 0.6 * belt));
      elevation[i] = 0.5 + 0.5 * h;
    }
  }
  // Force a water frame around the map.
  for (let x = 0; x < W; x++) {
    elevation[x] = Math.min(elevation[x]!, 0.3);
    elevation[(H - 1) * W + x] = Math.min(elevation[(H - 1) * W + x]!, 0.3);
  }
  for (let y = 0; y < H; y++) {
    elevation[y * W] = Math.min(elevation[y * W]!, 0.3);
    elevation[y * W + W - 1] = Math.min(elevation[y * W + W - 1]!, 0.3);
  }
  const SEA = 0.5;
  const isLandElev = (i: number) => elevation[i]! >= SEA;

  // --- 2. Remove specks: single-tile islands/lakes look noisy. -------------
  const nb: number[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      neighbors4(i, W, H, nb);
      let landN = 0;
      for (const n of nb) if (isLandElev(n)) landN++;
      if (isLandElev(i) && landN === 0) elevation[i] = SEA - 0.02;
      else if (!isLandElev(i) && landN === 4) elevation[i] = SEA + 0.01;
    }
  }

  // --- 3. Water bodies: oceans touch the border, enclosed water becomes lakes.
  const waterBody = new Int32Array(N).fill(-1);
  const bodySizes: number[] = [];
  const bodyTouchesEdge: boolean[] = [];
  const queue = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (isLandElev(i) || waterBody[i] !== -1) continue;
    const id = bodySizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    waterBody[i] = id;
    let size = 0;
    let edge = false;
    while (head < tail) {
      const c = queue[head++]!;
      size++;
      const cx = c % W;
      const cy = (c / W) | 0;
      if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) edge = true;
      neighbors4(c, W, H, nb);
      for (const n of nb) {
        if (!isLandElev(n) && waterBody[n] === -1) {
          waterBody[n] = id;
          queue[tail++] = n;
        }
      }
    }
    bodySizes.push(size);
    bodyTouchesEdge.push(edge);
  }
  const isOceanTile = (i: number) => waterBody[i]! >= 0 && (bodyTouchesEdge[waterBody[i]!]! || bodySizes[waterBody[i]!]! > 60);
  const lake = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (waterBody[i]! >= 0 && !isOceanTile(i)) lake[i] = 1;

  // --- 4. Distance from the sea (BFS) and shore distance for water tiles. ----
  const seaDist = new Int32Array(N).fill(-1); // land tiles: steps to ocean
  const shoreDistance = new Uint8Array(N);
  {
    let head = 0;
    let tail = 0;
    for (let i = 0; i < N; i++) {
      if (isOceanTile(i)) {
        seaDist[i] = 0;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const c = queue[head++]!;
      neighbors4(c, W, H, nb);
      for (const n of nb) {
        if (seaDist[n] === -1) {
          seaDist[n] = seaDist[c]! + 1;
          queue[tail++] = n;
        }
      }
    }
    const landDist = new Int32Array(N).fill(-1);
    head = 0;
    tail = 0;
    for (let i = 0; i < N; i++) {
      if (isLandElev(i)) {
        landDist[i] = 0;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const c = queue[head++]!;
      neighbors4(c, W, H, nb);
      for (const n of nb) {
        if (landDist[n] === -1) {
          landDist[n] = landDist[c]! + 1;
          queue[tail++] = n;
        }
      }
    }
    for (let i = 0; i < N; i++) shoreDistance[i] = Math.min(255, Math.max(0, landDist[i]!));
  }

  // --- 5. Temperature -------------------------------------------------------
  const temperature = new Float32Array(N);
  const latitudeOf = (y: number) => Math.abs((y + 0.5) / H - 0.5) * 2; // 0 equator .. 1 pole
  for (let y = 0; y < H; y++) {
    const lat = latitudeOf(y);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const h = elevation[i]! >= SEA ? (elevation[i]! - SEA) * 2 : 0;
      const n = tempNoise.fbm(x * scale * 3, y * scale * 3, 3) * 0.08;
      temperature[i] = clamp01(1.02 - Math.pow(lat, 1.35) * 1.08 - h * 0.42 + n);
    }
  }

  // --- 6. Moisture: noise + circulation bands + coast + rain shadows ---------
  const moisture = new Float32Array(N);
  const windMoisture = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = latitudeOf(y);
    // Trade winds blow east→west in the tropics, westerlies in mid latitudes.
    const westward = lat < 0.33 || lat > 0.72;
    let air = 1;
    for (let k = 0; k < W; k++) {
      const x = westward ? W - 1 - k : k;
      const i = y * W + x;
      if (elevation[i]! < SEA) {
        air = Math.min(1, air + 0.12);
        windMoisture[i] = air;
        continue;
      }
      const h = (elevation[i]! - SEA) * 2;
      const prevX = westward ? x + 1 : x - 1;
      const prev = prevX >= 0 && prevX < W ? y * W + prevX : i;
      const prevH = elevation[prev]! >= SEA ? (elevation[prev]! - SEA) * 2 : 0;
      const rise = Math.max(0, h - prevH);
      const rain = air * (0.035 + rise * 1.6);
      windMoisture[i] = Math.min(1, air * 0.9 + rise * 1.2);
      air = Math.max(0.05, air - rain);
    }
  }
  for (let y = 0; y < H; y++) {
    const lat = latitudeOf(y);
    const band = 0.55 + 0.45 * Math.cos(lat * Math.PI * 3);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const n = moistNoise.fbm(x * scale * 3.3 + 5, y * scale * 3.3 - 9, 5) * 0.5 + 0.5;
      const coast = seaDist[i]! >= 0 ? Math.exp(-seaDist[i]! / 7) : 0;
      moisture[i] = clamp01(n * 0.42 + band * 0.3 + coast * 0.16 + windMoisture[i]! * 0.22 - 0.06);
    }
  }

  // --- 7. Rivers via priority flood + flow accumulation ---------------------
  const filled = new Float32Array(N);
  const parent = new Int32Array(N).fill(-1);
  const order = new Int32Array(N);
  let orderLen = 0;
  {
    const visited = new Uint8Array(N);
    const heap = new MinHeap(N);
    for (let i = 0; i < N; i++) {
      if (!isLandElev(i) && !lake[i]) {
        visited[i] = 1;
        filled[i] = elevation[i]!;
        // Only shoreline water seeds the flood; it is enough and keeps the heap small.
        neighbors4(i, W, H, nb);
        let touchesLand = false;
        for (const n of nb) if (isLandElev(n) || lake[n]) touchesLand = true;
        if (touchesLand) heap.push(i, elevation[i]!);
      }
    }
    const EPS = 1e-5;
    while (heap.size > 0) {
      const c = heap.pop();
      order[orderLen++] = c;
      neighbors4(c, W, H, nb);
      for (const n of nb) {
        if (visited[n]) continue;
        visited[n] = 1;
        parent[n] = c;
        filled[n] = Math.max(elevation[n]!, filled[c]! + EPS);
        heap.push(n, filled[n]!);
      }
    }
  }
  // Large depressions become lakes.
  {
    const depth = new Float32Array(N);
    for (let i = 0; i < N; i++) if (isLandElev(i)) depth[i] = filled[i]! - elevation[i]!;
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || depth[i]! < 0.012 || !isLandElev(i)) continue;
      const comp: number[] = [];
      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      seen[i] = 1;
      while (head < tail) {
        const c = queue[head++]!;
        comp.push(c);
        neighbors4(c, W, H, nb);
        for (const n of nb) {
          if (!seen[n] && isLandElev(n) && depth[n]! >= 0.006) {
            seen[n] = 1;
            queue[tail++] = n;
          }
        }
      }
      if (comp.length >= 2 && comp.length <= 40) for (const c of comp) lake[c] = 1;
    }
  }
  const accumulation = new Float32Array(N);
  for (let k = orderLen - 1; k >= 0; k--) {
    const c = order[k]!;
    if (!isLandElev(c) && !lake[c]) continue;
    const rain = isLandElev(c) ? 0.25 + moisture[c]! : 0.5;
    accumulation[c] = accumulation[c]! + rain;
    const p = parent[c]!;
    if (p >= 0) accumulation[p] = accumulation[p]! + accumulation[c]!;
  }
  const river = new Uint8Array(N);
  const riverTo = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!isLandElev(i) || lake[i]) continue;
    const a = accumulation[i]!;
    if (a >= 17) {
      river[i] = a >= 85 ? 3 : a >= 38 ? 2 : 1;
      riverTo[i] = parent[i]!;
    }
  }
  // Rivers moisten their valleys.
  const nb8: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!river[i]) continue;
    moisture[i] = clamp01(moisture[i]! + 0.12 + river[i]! * 0.05);
    neighbors8(i, W, H, nb8);
    for (const n of nb8) moisture[n] = clamp01(moisture[n]! + 0.04 * river[i]!);
  }

  // --- 8. Biomes ------------------------------------------------------------
  // Relief classes use land-elevation quantiles so every world has ranges.
  const landHeights: number[] = [];
  for (let i = 0; i < N; i++) if (isLandElev(i) && !lake[i]) landHeights.push((elevation[i]! - SEA) * 2);
  landHeights.sort((a, b) => a - b);
  const q = (f: number) => landHeights[Math.min(landHeights.length - 1, Math.max(0, Math.floor(f * (landHeights.length - 1))))] ?? 1;
  const hPeak = Math.max(q(0.99), 0.3);
  const hMountain = Math.max(q(0.955), 0.22);
  const hHill = Math.max(q(0.87), 0.15);
  const biome = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (lake[i]) {
      biome[i] = Biome.Lake;
      continue;
    }
    if (!isLandElev(i)) {
      biome[i] = shoreDistance[i]! <= 2 ? Biome.Ocean : Biome.DeepOcean;
      continue;
    }
    const h = (elevation[i]! - SEA) * 2;
    const t = temperature[i]!;
    const m = moisture[i]!;
    let b: Biome;
    if (h >= hPeak) b = Biome.Peaks;
    else if (h >= hMountain) b = Biome.Mountains;
    else if (t < 0.1) b = Biome.Ice;
    else if (h >= hHill) b = Biome.Hills;
    else if (t < 0.24) b = Biome.Tundra;
    else if (t < 0.4) b = m > 0.5 ? Biome.Taiga : Biome.Steppe;
    else if (t < 0.7) {
      if (m < 0.22) b = Biome.Desert;
      else if (m < 0.36) b = Biome.Steppe;
      else if (m < 0.44) b = Biome.Shrubland;
      else if (m < 0.62) b = Biome.Grassland;
      else if (m > 0.86 && h < 0.12) b = Biome.Marsh;
      else b = Biome.TemperateForest;
    } else {
      if (m < 0.27) b = Biome.Desert;
      else if (m < 0.42) b = Biome.Savanna;
      else if (m < 0.55) b = Biome.Grassland;
      else if (m > 0.88 && h < 0.1) b = Biome.Marsh;
      else b = Biome.TropicalForest;
    }
    biome[i] = b;
  }
  // Rivers never flow through lakes visually; clear them there.
  for (let i = 0; i < N; i++) if (lake[i]) river[i] = 0;

  // --- 9. Landmasses ---------------------------------------------------------
  const landmass = new Int16Array(N).fill(-1);
  const landmasses: LandmassInfo[] = [];
  const nameRng = new Rng(`${seed}::landmass-names`);
  const registry = new NameRegistry();
  let landTiles = 0;
  for (let i = 0; i < N; i++) {
    if (isWaterBiome(biome[i]!) || landmass[i] !== -1) continue;
    const id = landmasses.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    landmass[i] = id;
    let sx = 0;
    let sy = 0;
    while (head < tail) {
      const c = queue[head++]!;
      sx += c % W;
      sy += (c / W) | 0;
      neighbors4(c, W, H, nb);
      for (const n of nb) {
        if (landmass[n] === -1 && !isWaterBiome(biome[n]!)) {
          landmass[n] = id;
          queue[tail++] = n;
        }
      }
    }
    const size = tail;
    landTiles += size;
    const cx = Math.round(sx / size);
    const cy = Math.round(sy / size);
    // Snap the centre to the closest tile of this landmass.
    let best = i;
    let bestD = Infinity;
    for (let k = 0; k < tail; k++) {
      const c = queue[k]!;
      const d = (c % W - cx) ** 2 + (((c / W) | 0) - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    landmasses.push({ id, name: registry.placeName(nameRng.pick(LANGUAGES), nameRng), size, center: best });
  }

  // --- 10. Coastal flags ------------------------------------------------------
  const coastal = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (isWaterBiome(biome[i]!)) continue;
    neighbors4(i, W, H, nb);
    for (const n of nb) {
      if (biome[n] === Biome.Ocean || biome[n] === Biome.DeepOcean) {
        coastal[i] = 1;
        break;
      }
    }
  }

  // --- 11. Resources ----------------------------------------------------------
  const resource = new Uint8Array(N);
  const resRng = new Rng(`${seed}::resources`);
  for (let i = 0; i < N; i++) {
    const b = biome[i]!;
    if (isWaterBiome(b) || b === Biome.Peaks || b === Biome.Ice) continue;
    const x = i % W;
    const y = (i / W) | 0;
    const cluster = resNoise.fbm(x * scale * 9, y * scale * 9, 2) * 0.5 + 0.5; // 0..1
    const factor = 0.35 + cluster * 1.3;
    const t = temperature[i]!;
    const candidates: [Resource, number][] = [];
    if (b === Biome.Hills || b === Biome.Mountains) {
      candidates.push([Resource.Iron, 0.11], [Resource.Gold, 0.025], [Resource.Marble, b === Biome.Hills ? 0.07 : 0.035]);
    } else {
      candidates.push([Resource.Iron, 0.012]);
    }
    if (river[i]) candidates.push([Resource.Gold, 0.008]);
    if (b === Biome.TemperateForest || b === Biome.Taiga || b === Biome.TropicalForest) candidates.push([Resource.Timber, 0.09]);
    if (coastal[i]) candidates.push([Resource.Fish, 0.12]);
    if (b === Biome.Grassland || b === Biome.Steppe || b === Biome.Savanna) candidates.push([Resource.Horses, 0.06]);
    if (t > 0.68 && (b === Biome.TropicalForest || b === Biome.Savanna || b === Biome.Grassland)) candidates.push([Resource.Spices, 0.07]);
    if ((b === Biome.Grassland || b === Biome.TemperateForest || b === Biome.Savanna) && (river[i] || moisture[i]! > 0.55)) candidates.push([Resource.Grain, 0.075]);
    for (const [res, p] of candidates) {
      if (resRng.chance(p * factor)) {
        resource[i] = res;
        break;
      }
    }
  }

  // --- 12. Yields -------------------------------------------------------------
  const yFood = new Float32Array(N);
  const yTimber = new Float32Array(N);
  const yStone = new Float32Array(N);
  const yIron = new Float32Array(N);
  const yTrade = new Float32Array(N);
  const moveCost = new Float32Array(N);
  const defense = new Float32Array(N);
  const appeal = new Float32Array(N);
  let maxAppeal = 0;
  for (let i = 0; i < N; i++) {
    const info = BIOMES[biome[i]!]!;
    if (info.water) {
      moveCost[i] = 99;
      defense[i] = 1;
      continue;
    }
    let food = info.food;
    let timber = info.timber;
    let stone = info.stone;
    let iron = info.iron;
    let trade = info.trade;
    let move = info.moveCost;
    const def = info.defense;
    const r = river[i]!;
    if (r) {
      food += 0.32 + r * 0.14;
      if (biome[i] === Biome.Desert || biome[i] === Biome.Steppe) food += 0.55; // floodplain oases
      trade += 0.22 * r;
      move *= 0.9;
    }
    if (coastal[i]) {
      food += 0.2;
      trade += 0.32;
    }
    neighbors4(i, W, H, nb);
    for (const n of nb) {
      if (biome[n] === Biome.Lake) {
        food += 0.15;
        trade += 0.08;
        break;
      }
    }
    switch (resource[i]) {
      case Resource.Iron:
        iron += 2.2;
        break;
      case Resource.Gold:
        trade += 1.4;
        break;
      case Resource.Marble:
        stone += 1.8;
        trade += 0.2;
        break;
      case Resource.Timber:
        timber += 1.8;
        break;
      case Resource.Fish:
        food += 0.6;
        break;
      case Resource.Horses:
        food += 0.2;
        break;
      case Resource.Spices:
        trade += 1.2;
        break;
      case Resource.Grain:
        food += 0.8;
        break;
      default:
        break;
    }
    // Cold and altitude shorten the growing season.
    food *= 0.25 + 0.75 * smoothstep(0.08, 0.38, temperature[i]!);
    yFood[i] = food;
    yTimber[i] = timber;
    yStone[i] = stone;
    yIron[i] = iron;
    yTrade[i] = trade;
    moveCost[i] = move;
    defense[i] = def;
    const a = food * 1.0 + trade * 0.45 + (stone + iron + timber) * 0.12 - (move - 1) * 0.12;
    appeal[i] = a;
    if (a > maxAppeal) maxAppeal = a;
  }
  for (let i = 0; i < N; i++) appeal[i] = clamp01(appeal[i]! / Math.max(1e-6, maxAppeal));

  return {
    width: W,
    height: H,
    size: N,
    seaLevel: SEA,
    elevation,
    temperature,
    moisture,
    biome,
    river,
    riverTo,
    resource,
    landmass,
    coastal,
    shoreDistance,
    yFood,
    yTimber,
    yStone,
    yIron,
    yTrade,
    moveCost,
    defense,
    appeal,
    landmasses,
    landTiles,
  };
}

export const isLand = (map: WorldMap, i: number): boolean => !isWaterBiome(map.biome[i]!);
