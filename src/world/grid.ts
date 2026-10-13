/**
 * Precomputed 4-neighbour lookup tables. `table[i * 4 + k]` is the k-th
 * neighbour of tile i, or -1 beyond the map edge. Tables are cached per map
 * size so hot simulation loops avoid allocating neighbour arrays.
 */
const cache = new Map<string, Int32Array>();

export function neighborTable(width: number, height: number): Int32Array {
  const key = `${width}x${height}`;
  let table = cache.get(key);
  if (table) return table;
  const n = width * height;
  table = new Int32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = (i / width) | 0;
    table[i * 4] = x > 0 ? i - 1 : -1;
    table[i * 4 + 1] = x < width - 1 ? i + 1 : -1;
    table[i * 4 + 2] = y > 0 ? i - width : -1;
    table[i * 4 + 3] = y < height - 1 ? i + width : -1;
  }
  cache.set(key, table);
  return table;
}
