/** Colour helpers. Colours are stored as 0xRRGGBB integers. */

export type RGB = [number, number, number];

export const toRGB = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export const fromRGB = (r: number, g: number, b: number): number =>
  ((Math.round(r) & 255) << 16) | ((Math.round(g) & 255) << 8) | (Math.round(b) & 255);

export const toHex = (c: number): string => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

export const fromHex = (hex: string): number => parseInt(hex.replace('#', ''), 16) & 0xffffff;

export function mix(a: number, b: number, t: number): number {
  const [r1, g1, b1] = toRGB(a);
  const [r2, g2, b2] = toRGB(b);
  return fromRGB(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);
export const darken = (c: number, t: number): number => mix(c, 0x000000, t);

export function hsl(h: number, s: number, l: number): number {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return fromRGB((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function toHSL(c: number): [number, number, number] {
  const [r8, g8, b8] = toRGB(c);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Perceptually weighted RGB distance ("redmean"), good enough for palette picking. */
export function colorDistance(a: number, b: number): number {
  const [r1, g1, b1] = toRGB(a);
  const [r2, g2, b2] = toRGB(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * Muted, map-friendly national colours. They are deliberately desaturated so
 * that political overlays read well over terrain without looking garish.
 */
export const NATION_PALETTE: readonly number[] = [
  0xb5523b, // brick
  0x3f6fb0, // royal blue
  0xc9a227, // ochre gold
  0x6b8e3d, // olive
  0x8a4f9e, // amethyst
  0x2f8f83, // teal
  0xc46f2e, // burnt orange
  0x9c3a5a, // wine
  0x4d5fa8, // indigo
  0xa3a83a, // chartreuse
  0x5c9bc4, // sky
  0xd08a6a, // terracotta
  0x3d7a52, // forest
  0xb07fb8, // orchid
  0x8f6a3b, // umber
  0xc75a7a, // rose
  0x4f9e9a, // sea green
  0x7a5ab5, // violet
  0xd4b25a, // straw
  0x6e7f8f, // slate
  0xa34a2a, // rust
  0x5ea05a, // leaf
  0x2e5f8a, // navy
  0xc98d3c, // amber
  0x8e3f3f, // oxblood
  0x6a9c7c, // sage
  0xb36b9a, // mauve
  0x3a8fb0, // cerulean
  0x9a8a4a, // khaki
  0x7c4a7a, // plum
  0xd06e50, // coral
  0x4a7a3a, // moss
];

export function colorWithAlpha(c: number, alpha: number): string {
  const [r, g, b] = toRGB(c);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
