export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Moves `current` toward `target` by fraction `rate` (exponential smoothing). */
export const approach = (current: number, target: number, rate: number): number =>
  current + (target - current) * rate;

export const sum = (values: Iterable<number>): number => {
  let s = 0;
  for (const v of values) s += v;
  return s;
};

/** Returns 0 for NaN/±Infinity so corrupted values never propagate. */
export const finite = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

/** Logistic squashing into (0, 1). */
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Rounds to a fixed number of decimals (used to keep save files compact). */
export const roundTo = (v: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};
