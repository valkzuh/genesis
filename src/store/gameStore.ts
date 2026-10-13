import { create } from 'zustand';
import type { Command, EventType, World, WorldSettings } from '../types/simulation';
import type { MapMode } from '../rendering/overlay';

export type PanelId = 'overview' | 'nations' | 'diplomacy' | 'history' | 'god' | 'worlds';
export type GodTool = 'spawn_civ' | 'famine' | 'plague' | 'earthquake' | 'flood';
export type InspectorTab = 'overview' | 'economy' | 'diplomacy' | 'history';
export type DialogId = 'new-world' | 'help' | null;

export interface Toast {
  id: number;
  text: string;
  kind: EventType | 'info' | 'error' | 'success';
  tile: number;
  civs: number[];
  importance: number;
  year: number;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export const SPEEDS = [1, 2, 5, 10, 20, 40, 80] as const;
export const DEFAULT_SPEED = 3;

export interface GameState {
  world: World | null;
  /** Bumped (throttled) whenever the simulation advances; components re-read the world. */
  version: number;
  /** Bumped whenever a different world is installed. */
  worldKey: number;
  running: boolean;
  speed: number;
  mapMode: MapMode;
  selectedCiv: number | null;
  selectedTile: number | null;
  panel: PanelId | null;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  timelineOpen: boolean;
  godTool: GodTool | null;
  godCiv: number | null;
  toasts: Toast[];
  dialog: DialogId;
  confirm: ConfirmRequest | null;
  busy: string | null;
  lastSettings: Partial<WorldSettings>;
  unsaved: boolean;
  zoom: number;

  set: (partial: Partial<GameState>) => void;
  bump: () => void;
  selectCiv: (id: number | null, opts?: { open?: boolean }) => void;
  selectTile: (tile: number | null) => void;
  togglePanel: (panel: PanelId) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  askConfirm: (req: ConfirmRequest) => void;
}

let toastSeq = 1;

export const useGame = create<GameState>((set, get) => ({
  world: null,
  version: 0,
  worldKey: 0,
  running: false,
  speed: DEFAULT_SPEED,
  mapMode: 'political',
  selectedCiv: null,
  selectedTile: null,
  panel: 'overview',
  inspectorOpen: false,
  inspectorTab: 'overview',
  timelineOpen: false,
  godTool: null,
  godCiv: null,
  toasts: [],
  dialog: null,
  confirm: null,
  busy: null,
  lastSettings: {},
  unsaved: false,
  zoom: 1,

  set: (partial) => set(partial),
  bump: () => set({ version: get().version + 1 }),
  selectCiv: (id, opts) =>
    set((s) => ({
      selectedCiv: id,
      inspectorOpen: id !== null ? (opts?.open ?? true) : s.selectedTile !== null,
      godCiv: id ?? s.godCiv,
    })),
  selectTile: (tile) => set((s) => ({ selectedTile: tile, inspectorOpen: tile !== null || s.selectedCiv !== null })),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  pushToast: (toast) =>
    set((s) => {
      const next = [...s.toasts, { ...toast, id: toastSeq++ }];
      return { toasts: next.slice(-4) };
    }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  askConfirm: (req) => set({ confirm: req }),
}));

/** Commands are dispatched through the runner so the map and UI refresh immediately. */
export type CommandDispatcher = (command: Command) => void;
