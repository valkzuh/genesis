import type { Command, EventType, HistoryEvent, World, WorldSettings } from '../types/simulation';
import { createWorld } from '../simulation/genesis';
import { stepYear } from '../simulation/engine';
import { executeCommand } from '../simulation/commands';
import type { MapRenderer } from '../rendering/MapRenderer';
import { SPEEDS, useGame } from './gameStore';

const PING_COLORS: Partial<Record<EventType, number>> = {
  war: 0xe0533b,
  conquest: 0xf08a3c,
  peace: 0x7cc7a0,
  founding: 0xf0d78c,
  secession: 0xc89cf0,
  civil_war: 0xe05a8a,
  revolution: 0xe8a0d8,
  collapse: 0xffffff,
  famine: 0xd9b25a,
  plague: 0x9fd16a,
  disaster: 0xb88ae0,
  divine: 0xffe9a8,
  technology: 0x6fb3e0,
  alliance: 0x5fb37a,
  golden_age: 0xf6d36b,
  exploration: 0x7fd3e0,
  reform: 0xa9c4ef,
};

const ADJECTIVES = ['amber', 'ashen', 'azure', 'brazen', 'crimson', 'distant', 'elder', 'emerald', 'gilded', 'hidden', 'iron', 'ivory', 'jade', 'lunar', 'misty', 'obsidian', 'silent', 'silver', 'stormy', 'sunken', 'verdant', 'wandering', 'wild', 'winter'];
const NOUNS = ['anvil', 'aurora', 'crown', 'delta', 'dragon', 'ember', 'falcon', 'harbor', 'horizon', 'lantern', 'meridian', 'monolith', 'oracle', 'pillar', 'river', 'saga', 'sparrow', 'spire', 'summit', 'tide', 'throne', 'valley', 'willow', 'zenith'];

/** A memorable random seed. UI-level randomness only; the simulation is seeded from it. */
export function randomSeed(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return `${a}-${n}-${Math.floor(Math.random() * 900 + 100)}`;
}

/**
 * Owns the simulation loop. Years advance in fixed steps; each animation
 * frame runs as many steps as the chosen speed requires, within a time
 * budget, so the interface stays responsive at any speed.
 */
class Controller {
  renderer: MapRenderer | null = null;
  private raf = 0;
  private lastFrame = 0;
  private acc = 0;
  private lastPublish = 0;
  private lastSeenEvent = 0;
  private lastToast = 0;
  private pendingToast: HistoryEvent | null = null;

  get world(): World | null {
    return useGame.getState().world;
  }

  attachRenderer(r: MapRenderer): void {
    this.renderer = r;
    const world = this.world;
    if (world) r.setWorld(world);
  }

  detachRenderer(r: MapRenderer): void {
    if (this.renderer === r) this.renderer = null;
  }

  // ---------------------------------------------------------------------------
  // Worlds
  // ---------------------------------------------------------------------------

  generate(seed: string, settings: Partial<WorldSettings> = {}): Promise<void> {
    this.pause();
    useGame.setState({ busy: 'Forging a new world…' });
    return new Promise((resolve) => {
      // Yield so the loading overlay paints before the heavy work starts.
      window.setTimeout(() => {
        try {
          const world = createWorld(seed.trim() || randomSeed(), settings);
          this.install(world, settings);
        } catch (err) {
          console.error(err);
          useGame.getState().pushToast({ text: `World generation failed: ${(err as Error).message}`, kind: 'error', tile: -1, civs: [], importance: 5, year: 0 });
        } finally {
          useGame.setState({ busy: null });
          resolve();
        }
      }, 40);
    });
  }

  install(world: World, settings?: Partial<WorldSettings>): void {
    this.pause();
    this.lastSeenEvent = world.eventSeq - 1;
    this.pendingToast = null;
    const s = useGame.getState();
    useGame.setState({
      world,
      worldKey: s.worldKey + 1,
      version: s.version + 1,
      selectedCiv: null,
      selectedTile: null,
      inspectorOpen: false,
      godTool: null,
      godCiv: null,
      toasts: [],
      unsaved: false,
      lastSettings: settings ?? s.lastSettings,
    });
    this.renderer?.setWorld(world);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', world.seed);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Non-browser environments.
    }
  }

  // ---------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------

  play(): void {
    if (!this.world || useGame.getState().running) return;
    useGame.setState({ running: true });
    this.lastFrame = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  pause(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (useGame.getState().running) useGame.setState({ running: false });
    this.publish(true);
  }

  toggle(): void {
    if (useGame.getState().running) this.pause();
    else this.play();
  }

  step(years = 1): void {
    const world = this.world;
    if (!world) return;
    for (let i = 0; i < years; i++) stepYear(world);
    this.afterTicks(world);
    this.publish(true);
  }

  setSpeed(index: number): void {
    useGame.setState({ speed: Math.max(0, Math.min(SPEEDS.length - 1, index)) });
  }

  faster(): void {
    this.setSpeed(useGame.getState().speed + 1);
  }

  slower(): void {
    this.setSpeed(useGame.getState().speed - 1);
  }

  private frame(now: number): void {
    const state = useGame.getState();
    const world = state.world;
    if (!state.running || !world) {
      this.raf = 0;
      return;
    }
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const speed = SPEEDS[state.speed] ?? 5;
    this.acc += dt * speed;
    const start = performance.now();
    let ticks = 0;
    while (this.acc >= 1 && performance.now() - start < 14 && ticks < 12) {
      stepYear(world);
      this.acc -= 1;
      ticks++;
    }
    // Never build an unbounded backlog if the machine cannot keep up.
    if (this.acc > 3) this.acc = 3;
    if (ticks > 0) {
      this.afterTicks(world);
      this.publish(false);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private afterTicks(world: World): void {
    this.renderer?.notifyDataChanged();
    useGame.setState({ unsaved: true });
    this.processEvents(world);
  }

  /** Surfaces newly recorded major events as map pings and notifications. */
  private processEvents(world: World): void {
    const events = world.events;
    const fresh: HistoryEvent[] = [];
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.id <= this.lastSeenEvent) break;
      fresh.push(e);
    }
    if (fresh.length === 0) return;
    fresh.reverse();
    this.lastSeenEvent = fresh[fresh.length - 1]!.id;
    const speed = SPEEDS[useGame.getState().speed] ?? 5;
    let pings = 0;
    for (const e of fresh) {
      if (e.tile >= 0 && e.importance >= 3 && pings < 4) {
        const color = PING_COLORS[e.type];
        if (color !== undefined) {
          this.renderer?.ping(e.tile, color, e.importance >= 5 ? 1.5 : e.importance >= 4 ? 1.15 : 0.8);
          pings++;
        }
      }
      const threshold = speed >= 40 ? 5 : 4;
      if (e.importance >= threshold && e.type !== 'divine') {
        if (!this.pendingToast || e.importance >= this.pendingToast.importance) this.pendingToast = e;
      }
    }
    const now = performance.now();
    if (this.pendingToast && now - this.lastToast > 1100) {
      const e = this.pendingToast;
      this.pendingToast = null;
      this.lastToast = now;
      useGame.getState().pushToast({ text: e.text, kind: e.type, tile: e.tile, civs: e.civs, importance: e.importance, year: e.year });
    }
  }

  private publish(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastPublish < 180) return;
    this.lastPublish = now;
    useGame.getState().bump();
  }

  // ---------------------------------------------------------------------------
  // Divine intervention
  // ---------------------------------------------------------------------------

  command(command: Command): boolean {
    const world = this.world;
    if (!world) return false;
    const result = executeCommand(world, command);
    const tile = 'tile' in command ? command.tile : -1;
    useGame.getState().pushToast({
      text: result.message,
      kind: result.ok ? 'divine' : 'error',
      tile,
      civs: [],
      importance: result.ok ? 3 : 1,
      year: world.year,
    });
    if (result.ok) {
      this.lastSeenEvent = world.eventSeq - 1;
      if (tile >= 0) this.renderer?.ping(tile, 0xffe9a8, 1.6);
      this.renderer?.notifyDataChanged();
      useGame.setState({ unsaved: true });
    }
    this.publish(true);
    return result.ok;
  }

  // ---------------------------------------------------------------------------
  // Camera helpers
  // ---------------------------------------------------------------------------

  focusTile(tile: number, zoom?: number): void {
    if (tile >= 0) this.renderer?.focusTile(tile, zoom);
  }

  focusCiv(id: number): void {
    const world = this.world;
    const civ = world?.civs[id];
    if (!world || !civ) return;
    const cap = world.cities[civ.capital];
    if (cap) this.focusTile(cap.tile, Math.max(2, Math.min(4, 60 / Math.sqrt(Math.max(4, civ.tiles)))));
  }
}

export const controller = new Controller();
