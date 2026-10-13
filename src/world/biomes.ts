import { Biome, Resource } from '../types/world';

export interface BiomeInfo {
  id: Biome;
  name: string;
  /** Base map colour (geographic mode). */
  color: number;
  food: number;
  timber: number;
  stone: number;
  iron: number;
  trade: number;
  moveCost: number;
  defense: number;
  water: boolean;
  description: string;
}

const B = (
  id: Biome,
  name: string,
  color: number,
  food: number,
  timber: number,
  stone: number,
  iron: number,
  trade: number,
  moveCost: number,
  defense: number,
  water: boolean,
  description: string,
): BiomeInfo => ({ id, name, color, food, timber, stone, iron, trade, moveCost, defense, water, description });

export const BIOMES: readonly BiomeInfo[] = [
  B(Biome.DeepOcean, 'Deep Ocean', 0x1d3247, 0, 0, 0, 0, 0, 99, 1, true, 'Open sea, impassable before sail.'),
  B(Biome.Ocean, 'Coastal Sea', 0x2c5470, 0, 0, 0, 0, 0, 99, 1, true, 'Shallow coastal waters.'),
  B(Biome.Lake, 'Lake', 0x3a6c88, 0, 0, 0, 0, 0, 99, 1, true, 'Inland freshwater.'),
  B(Biome.Ice, 'Ice Sheet', 0xe6eaec, 0, 0, 0.1, 0, 0, 3.2, 1.25, false, 'Frozen and nearly uninhabitable.'),
  B(Biome.Tundra, 'Tundra', 0xa9a88f, 0.16, 0.1, 0.2, 0.08, 0.05, 1.6, 1.05, false, 'Cold plains with a short growing season.'),
  B(Biome.Taiga, 'Boreal Forest', 0x4e6a50, 0.36, 1.25, 0.2, 0.12, 0.08, 1.7, 1.15, false, 'Dense conifer forest rich in timber.'),
  B(Biome.Steppe, 'Steppe', 0xb3ab78, 0.55, 0.1, 0.18, 0.06, 0.22, 1.0, 1.0, false, 'Dry grassland, ideal for horses.'),
  B(Biome.Grassland, 'Grassland', 0x8da35a, 1.1, 0.2, 0.15, 0.05, 0.3, 1.0, 1.0, false, 'Fertile open plains.'),
  B(Biome.TemperateForest, 'Temperate Forest', 0x5b7d45, 0.78, 1.3, 0.2, 0.1, 0.2, 1.4, 1.15, false, 'Broadleaf woodland with good soils.'),
  B(Biome.Shrubland, 'Shrubland', 0xa39a62, 0.5, 0.3, 0.3, 0.1, 0.2, 1.1, 1.05, false, 'Scrub and chaparral.'),
  B(Biome.Desert, 'Desert', 0xd8c28e, 0.06, 0.0, 0.35, 0.1, 0.25, 1.6, 1.0, false, 'Arid sands; only rivers make it bloom.'),
  B(Biome.Savanna, 'Savanna', 0xb8a75b, 0.75, 0.3, 0.2, 0.06, 0.25, 1.1, 1.0, false, 'Warm grassland with scattered trees.'),
  B(Biome.TropicalForest, 'Rainforest', 0x3e6d3a, 0.7, 1.4, 0.1, 0.05, 0.28, 1.9, 1.2, false, 'Humid jungle, fertile but hard to clear.'),
  B(Biome.Marsh, 'Wetland', 0x6a7c5c, 0.45, 0.4, 0.05, 0.1, 0.1, 2.0, 1.25, false, 'Marshes and fens.'),
  B(Biome.Hills, 'Hills', 0x9b8f63, 0.45, 0.5, 0.9, 0.5, 0.15, 1.8, 1.35, false, 'Rolling uplands with quarries and ore.'),
  B(Biome.Mountains, 'Mountains', 0x8b7f71, 0.08, 0.2, 1.3, 1.0, 0.05, 3.5, 1.7, false, 'Rugged ranges, rich in minerals.'),
  B(Biome.Peaks, 'High Peaks', 0xdcd8d0, 0, 0, 0.8, 0.6, 0, 6, 2.0, false, 'Snow-capped summits.'),
];

/** Water biomes occupy ids 0..2 (DeepOcean, Ocean, Lake); everything above is land. */
export const isWaterBiome = (b: number): boolean => b <= Biome.Lake;

export interface ResourceInfo {
  id: Resource;
  name: string;
  color: number;
  description: string;
}

export const RESOURCES: readonly ResourceInfo[] = [
  { id: Resource.None, name: 'None', color: 0x000000, description: '' },
  { id: Resource.Iron, name: 'Iron', color: 0x9aa3ad, description: '+iron: arms and tools' },
  { id: Resource.Gold, name: 'Gold', color: 0xf0c64a, description: '+wealth from precious metals' },
  { id: Resource.Marble, name: 'Marble', color: 0xe8e0d2, description: '+stone for monuments and cities' },
  { id: Resource.Timber, name: 'Old-growth Timber', color: 0x7a9a4a, description: '+timber for building and ships' },
  { id: Resource.Fish, name: 'Fisheries', color: 0x5fb3d6, description: '+food from rich fishing grounds' },
  { id: Resource.Horses, name: 'Horses', color: 0xc08a54, description: '+mobility and cavalry strength' },
  { id: Resource.Spices, name: 'Spices', color: 0xd9673b, description: '+trade from luxury goods' },
  { id: Resource.Grain, name: 'Fertile Soil', color: 0xe3d36a, description: '+food from exceptional farmland' },
];
