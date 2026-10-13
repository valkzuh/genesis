import { describe, expect, it } from 'vitest';
import { Rng } from '../utils/rng';
import { SimplexNoise } from '../utils/noise';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-2');
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
    expect(same).toBeLessThan(3);
  });

  it('restores exactly from a saved state', () => {
    const a = new Rng('restore');
    for (let i = 0; i < 37; i++) a.next();
    const state = a.getState();
    const expected = Array.from({ length: 50 }, () => a.next());
    const b = new Rng(state);
    const actual = Array.from({ length: 50 }, () => b.next());
    expect(actual).toEqual(expected);
  });

  it('stays within documented ranges and is roughly uniform', () => {
    const r = new Rng('uniform');
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(1700);
    for (let i = 0; i < 1000; i++) {
      const n = r.intRange(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('weighted picks respect zero weights', () => {
    const r = new Rng('weights');
    for (let i = 0; i < 500; i++) expect(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b');
    expect(r.weighted(['a'], () => 0)).toBeUndefined();
  });
});

describe('SimplexNoise', () => {
  it('is seeded and bounded', () => {
    const n1 = new SimplexNoise(new Rng('noise'));
    const n2 = new SimplexNoise(new Rng('noise'));
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      const v = n1.noise2D(x, y);
      expect(v).toBe(n2.noise2D(x, y));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });
});
