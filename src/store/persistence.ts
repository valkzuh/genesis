import type { World } from '../types/simulation';
import { createSaveFile, loadSaveFile, type SaveFile } from '../simulation/serialize';

/**
 * Browser persistence. Saves live in IndexedDB (two object stores: small
 * metadata records for listing, and the full save files), so several worlds
 * can be kept without hitting localStorage's size limits.
 */

const DB_NAME = 'genesis-worlds';
const DB_VERSION = 1;
const META = 'meta';
const FILES = 'files';

export interface SaveMeta {
  id: string;
  label: string;
  savedAt: string;
  worldName: string;
  seed: string;
  year: number;
  civs: number;
  population: number;
  bytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support IndexedDB; use Export instead.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the save database.'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted (is the disk full?).'));
  });
}

export async function listSaves(): Promise<SaveMeta[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).getAll();
    const rows = await new Promise<SaveMeta[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as SaveMeta[]);
      req.onerror = () => reject(req.error);
    });
    return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } finally {
    db.close();
  }
}

/** Saves a world. Pass an existing id to overwrite that slot. */
export async function saveWorld(world: World, label: string, id?: string): Promise<SaveMeta> {
  const file = createSaveFile(world, label);
  const text = JSON.stringify(file);
  const meta: SaveMeta = {
    id: id ?? `save-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    label,
    savedAt: file.savedAt,
    worldName: file.summary.worldName,
    seed: file.summary.seed,
    year: file.summary.year,
    civs: file.summary.civs,
    population: file.summary.population,
    bytes: text.length,
  };
  const db = await openDb();
  try {
    const tx = db.transaction([META, FILES], 'readwrite');
    tx.objectStore(META).put(meta);
    tx.objectStore(FILES).put(text, meta.id);
    await done(tx);
  } finally {
    db.close();
  }
  return meta;
}

export async function loadSave(id: string): Promise<World> {
  const db = await openDb();
  try {
    const tx = db.transaction(FILES, 'readonly');
    const req = tx.objectStore(FILES).get(id);
    const text = await new Promise<string | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!text) throw new Error('That save could not be found.');
    return loadSaveFile(text);
  } finally {
    db.close();
  }
}

export async function deleteSave(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([META, FILES], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(FILES).delete(id);
    await done(tx);
  } finally {
    db.close();
  }
}

/** Downloads the world as a portable JSON file. */
export function exportWorld(world: World): void {
  const file: SaveFile = createSaveFile(world, `${world.name} — Year ${world.year}`);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = world.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.href = url;
  a.download = `genesis-${safe}-year-${world.year}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Reads and validates an exported world file. */
export async function importWorldFile(file: File): Promise<World> {
  if (file.size > 60 * 1024 * 1024) throw new Error('That file is too large to be a GENESIS world.');
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  return loadSaveFile(parsed);
}
