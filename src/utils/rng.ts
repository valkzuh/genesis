/**
 * Seeded pseudo-random number generation.
 *
 * GENESIS never calls `Math.random()` inside simulation code. Every random
 * decision flows through an {@link Rng} whose complete state is four 32-bit
 * integers, so it can be serialised into save files and restored exactly.
 * The generator is SFC32 (Small Fast Counting), seeded through cyrb128.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Hashes an arbitrary string into four well-mixed 32-bit words. */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Stable 32-bit hash of a string (FNV-1a). Useful for cheap deterministic keys. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number | RngState) {
    if (typeof seed === 'object') {
      this.a = seed.a | 0;
      this.b = seed.b | 0;
      this.c = seed.c | 0;
      this.d = seed.d | 0;
      return;
    }
    const [a, b, c, d] = cyrb128(String(seed));
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
    // Discard the first outputs so similar seeds diverge immediately.
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  /** Next raw unsigned 32-bit integer. */
  nextU32(): number {
    let a = this.a;
    let b = this.b;
    let c = this.c;
    let d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  /** Uniform integer in [min, maxInclusive]. */
  intRange(min: number, maxInclusive: number): number {
    return min + this.int(maxInclusive - min + 1);
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** Approximately normal sample (Irwin–Hall with 4 terms; cheap and bounded). */
  normal(mean = 0, sd = 1): number {
    const s = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + s * sd * 1.7320508;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[this.int(items.length)] as T;
  }

  /** Picks an item with probability proportional to `weight(item)`. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const item of items) {
      const w = Math.max(0, weight(item));
      if (r < w) return item;
      r -= w;
    }
    return items[items.length - 1];
  }

  /** Fisher–Yates shuffle (in place). */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Derives an independent generator from this one's current state and a label. */
  fork(label: string): Rng {
    const s = `${this.a}:${this.b}:${this.c}:${this.d}:${label}`;
    return new Rng(s);
  }

  getState(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  setState(state: RngState): void {
    this.a = state.a | 0;
    this.b = state.b | 0;
    this.c = state.c | 0;
    this.d = state.d | 0;
  }
}
