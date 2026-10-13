/**
 * Binary min-heap of integer items keyed by float priorities. Ties are broken
 * by item id so ordering is fully deterministic.
 */
export class MinHeap {
  private items: Int32Array;
  private keys: Float64Array;
  size = 0;

  constructor(capacity = 64) {
    this.items = new Int32Array(Math.max(4, capacity));
    this.keys = new Float64Array(Math.max(4, capacity));
  }

  private grow(): void {
    const items = new Int32Array(this.items.length * 2);
    const keys = new Float64Array(this.keys.length * 2);
    items.set(this.items);
    keys.set(this.keys);
    this.items = items;
    this.keys = keys;
  }

  private less(i: number, j: number): boolean {
    const ki = this.keys[i]!;
    const kj = this.keys[j]!;
    return ki < kj || (ki === kj && this.items[i]! < this.items[j]!);
  }

  private swap(i: number, j: number): void {
    const ti = this.items[i]!;
    this.items[i] = this.items[j]!;
    this.items[j] = ti;
    const tk = this.keys[i]!;
    this.keys[i] = this.keys[j]!;
    this.keys[j] = tk;
  }

  push(item: number, key: number): void {
    if (this.size >= this.items.length) this.grow();
    let i = this.size++;
    this.items[i] = item;
    this.keys[i] = key;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  peekKey(): number {
    return this.keys[0]!;
  }

  pop(): number {
    const top = this.items[0]!;
    const last = --this.size;
    if (last > 0) {
      this.items[0] = this.items[last]!;
      this.keys[0] = this.keys[last]!;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < last && this.less(l, m)) m = l;
        if (r < last && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}
