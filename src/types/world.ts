/**
 * Static geography of a generated world. Everything in here is produced once
 * by the world generator and never changes during a simulation.
 */

export const Biome = {
  DeepOcean: 0,
  Ocean: 1,
  Lake: 2,
  Ice: 3,
  Tundra: 4,
  Taiga: 5,
  Steppe: 6,
  Grassland: 7,
  TemperateForest: 8,
  Shrubland: 9,
  Desert: 10,
  Savanna: 11,
  TropicalForest: 12,
  Marsh: 13,
  Hills: 14,
  Mountains: 15,
  Peaks: 16,
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];
export const BIOME_COUNT = 17;

export const Resource = {
  None: 0,
  Iron: 1,
  Gold: 2,
  Marble: 3,
  Timber: 4,
  Fish: 5,
  Horses: 6,
  Spices: 7,
  Grain: 8,
} as const;
export type Resource = (typeof Resource)[keyof typeof Resource];
export const RESOURCE_COUNT = 9;

export interface LandmassInfo {
  id: number;
  name: string;
  size: number;
  /** Tile index nearest to the landmass centroid (for labelling). */
  center: number;
}

export interface WorldMap {
  width: number;
  height: number;
  size: number;
  seaLevel: number;
  /** 0..1 normalised height; tiles below `seaLevel` are water. */
  elevation: Float32Array;
  /** 0 (polar) .. 1 (tropical). */
  temperature: Float32Array;
  /** 0 (arid) .. 1 (wet). */
  moisture: Float32Array;
  biome: Uint8Array;
  /** River magnitude on a tile: 0 none, 1 stream, 2 river, 3 great river. */
  river: Uint8Array;
  /** Downstream neighbour for river tiles (-1 if none). Used for drawing. */
  riverTo: Int32Array;
  resource: Uint8Array;
  /** Connected landmass id for land tiles, -1 for water. */
  landmass: Int16Array;
  /** 1 if a land tile touches the sea (ocean, not lakes). */
  coastal: Uint8Array;
  /** Water-tile distance to the nearest land (0 for land). */
  shoreDistance: Uint8Array;
  // Static yields per tile (already include biome, river, coast and deposits).
  yFood: Float32Array;
  yTimber: Float32Array;
  yStone: Float32Array;
  yIron: Float32Array;
  yTrade: Float32Array;
  moveCost: Float32Array;
  defense: Float32Array;
  /** Overall settlement appeal 0..1, used for founding cities and expansion. */
  appeal: Float32Array;
  landmasses: LandmassInfo[];
  landTiles: number;
}
