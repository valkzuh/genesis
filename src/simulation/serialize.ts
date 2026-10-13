import type { City, Civ, CommandRecord, Culture, GlobalSample, HistoryEvent, Relation, War, World, WorldSettings } from '../types/simulation';
import type { LandmassInfo, WorldMap } from '../types/world';
import { Rng, type RngState } from '../utils/rng';
import { NameRegistry } from '../utils/names';
import { emptyCache, SAVE_VERSION } from './genesis';
import { rebuildTerritory } from './territory';
import { rebuildActiveWars, rebuildRelationIndex } from './world';
import { checkInvariants } from './invariants';

export const SAVE_FORMAT = 'genesis-world';

type TypedArray = Float32Array | Int16Array | Int32Array | Uint8Array | Uint16Array;

/** Typed arrays are stored as base64 of their raw little-endian bytes. */
function encode(arr: TypedArray): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decode<T extends TypedArray>(b64: unknown, ctor: { new (buffer: ArrayBuffer): T; BYTES_PER_ELEMENT: number }, length: number, label: string): T {
  if (typeof b64 !== 'string') throw new Error(`Save is missing array "${label}".`);
  const bytes = decodeBytes(b64);
  if (bytes.byteLength !== length * ctor.BYTES_PER_ELEMENT) throw new Error(`Array "${label}" has the wrong size.`);
  // Copy into a fresh, aligned buffer.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new ctor(buffer);
}

const MAP_ARRAYS = {
  elevation: Float32Array,
  temperature: Float32Array,
  moisture: Float32Array,
  biome: Uint8Array,
  river: Uint8Array,
  riverTo: Int32Array,
  resource: Uint8Array,
  landmass: Int16Array,
  coastal: Uint8Array,
  shoreDistance: Uint8Array,
  yFood: Float32Array,
  yTimber: Float32Array,
  yStone: Float32Array,
  yIron: Float32Array,
  yTrade: Float32Array,
  moveCost: Float32Array,
  defense: Float32Array,
  appeal: Float32Array,
} as const;

type MapArrayKey = keyof typeof MAP_ARRAYS;

export interface SerializedWorld {
  saveVersion: number;
  seed: string;
  name: string;
  year: number;
  startYear: number;
  settings: WorldSettings;
  map: {
    width: number;
    height: number;
    seaLevel: number;
    landTiles: number;
    landmasses: LandmassInfo[];
    arrays: Record<MapArrayKey, string>;
  };
  tiles: {
    owner: string;
    pop: string;
    culture: string;
    devastation: string;
    blight: string;
    cityAt: string;
  };
  civs: Civ[];
  cultures: Culture[];
  cities: City[];
  relations: Relation[];
  wars: War[];
  events: HistoryEvent[];
  eventSeq: number;
  history: GlobalSample[];
  commandLog: CommandRecord[];
  rng: RngState;
  names: string[];
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  label: string;
  /** Summary for save lists, so they can be shown without parsing the world. */
  summary: { worldName: string; seed: string; year: number; civs: number; population: number };
  world: SerializedWorld;
}

export function serializeWorld(world: World): SerializedWorld {
  const arrays = {} as Record<MapArrayKey, string>;
  for (const key of Object.keys(MAP_ARRAYS) as MapArrayKey[]) arrays[key] = encode(world.map[key]);
  // Plain-data deep copy of entity arrays (they contain only JSON-safe values).
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    saveVersion: SAVE_VERSION,
    seed: world.seed,
    name: world.name,
    year: world.year,
    startYear: world.startYear,
    settings: { ...world.settings },
    map: {
      width: world.map.width,
      height: world.map.height,
      seaLevel: world.map.seaLevel,
      landTiles: world.map.landTiles,
      landmasses: clone(world.map.landmasses),
      arrays,
    },
    tiles: {
      owner: encode(world.owner),
      pop: encode(world.pop),
      culture: encode(world.culture),
      devastation: encode(world.devastation),
      blight: encode(world.blight),
      cityAt: encode(world.cityAt),
    },
    civs: clone(world.civs),
    cultures: clone(world.cultures),
    cities: clone(world.cities),
    relations: clone(world.relations),
    wars: clone(world.wars),
    events: clone(world.events),
    eventSeq: world.eventSeq,
    history: clone(world.history),
    commandLog: clone(world.commandLog),
    rng: world.rng.getState(),
    names: world.names.values().sort(),
  };
}

export function createSaveFile(world: World, label: string): SaveFile {
  let population = 0;
  let civs = 0;
  for (const c of world.civs) {
    if (!c.alive) continue;
    civs++;
    population += c.population;
  }
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    label,
    summary: { worldName: world.name, seed: world.seed, year: world.year, civs, population: Math.round(population) },
    world: serializeWorld(world),
  };
}

/**
 * Upgrades older save data to the current schema. Version 1 is the first
 * public format; future versions add their migrations here.
 */
export function migrateSave(file: SaveFile): SaveFile {
  if (file.version > SAVE_VERSION) {
    throw new Error(`This save was made by a newer version of GENESIS (format v${file.version}).`);
  }
  return file;
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`Save is missing "${label}".`);
}

export function deserializeWorld(data: SerializedWorld): World {
  if (!data || typeof data !== 'object') throw new Error('Save data is empty.');
  const { width, height } = data.map ?? ({} as SerializedWorld['map']);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 10 || height < 10) throw new Error('Save has an invalid map size.');
  const N = width * height;
  const mapArrays = {} as Record<MapArrayKey, TypedArray>;
  for (const key of Object.keys(MAP_ARRAYS) as MapArrayKey[]) {
    mapArrays[key] = decode(data.map.arrays?.[key], MAP_ARRAYS[key] as never, N, key);
  }
  const map = {
    width,
    height,
    size: N,
    seaLevel: data.map.seaLevel,
    landTiles: data.map.landTiles,
    landmasses: data.map.landmasses ?? [],
    ...mapArrays,
  } as unknown as WorldMap;
  for (const key of ['civs', 'cultures', 'cities', 'relations', 'wars', 'events', 'history', 'commandLog', 'names'] as const) {
    assertArray(data[key], key);
  }
  const world: World = {
    saveVersion: SAVE_VERSION,
    seed: String(data.seed),
    name: String(data.name),
    year: Number(data.year),
    startYear: Number(data.startYear ?? 1),
    settings: { ...data.settings },
    map,
    owner: decode(data.tiles?.owner, Int16Array, N, 'owner'),
    pop: decode(data.tiles?.pop, Float32Array, N, 'pop'),
    culture: decode(data.tiles?.culture, Int16Array, N, 'culture'),
    devastation: decode(data.tiles?.devastation, Float32Array, N, 'devastation'),
    blight: decode(data.tiles?.blight, Float32Array, N, 'blight'),
    cityAt: decode(data.tiles?.cityAt, Int32Array, N, 'cityAt'),
    civs: data.civs,
    cultures: data.cultures,
    cities: data.cities,
    relations: data.relations,
    wars: data.wars,
    events: data.events,
    eventSeq: Number(data.eventSeq),
    history: data.history,
    commandLog: data.commandLog,
    rng: new Rng(data.rng),
    names: new NameRegistry(data.names),
    cache: emptyCache(N),
  };
  if (!Number.isFinite(world.year)) throw new Error('Save has an invalid year.');
  rebuildRelationIndex(world);
  rebuildActiveWars(world);
  rebuildTerritory(world);
  return world;
}

/** Parses and validates a save file (object or JSON text) into a live world. */
export function loadSaveFile(input: unknown): World {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (!raw || typeof raw !== 'object') throw new Error('Not a GENESIS save file.');
  const file = raw as SaveFile;
  if (file.format !== SAVE_FORMAT) throw new Error('Not a GENESIS save file.');
  if (typeof file.version !== 'number') throw new Error('Save file has no version.');
  const migrated = migrateSave(file);
  const world = deserializeWorld(migrated.world);
  const problems = checkInvariants(world);
  if (problems.length > 0) throw new Error(`Save file is corrupted: ${problems[0]}`);
  return world;
}

/** Deterministic fingerprint of the authoritative world state (for tests and replays). */
export function worldFingerprint(world: World): string {
  const s = serializeWorld(world);
  const text = JSON.stringify({ ...s, map: undefined });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}-${text.length}`;
}
