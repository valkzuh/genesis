import { Application, BitmapFont, BitmapText, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { World } from '../types/simulation';
import { lighten, mix } from '../utils/color';
import { buildPixelGrid, drawRivers, paintTerrain, type PixelGrid } from './terrainPainter';
import { OverlayPainter, type MapMode } from './overlay';
import { computeCivLabels } from './labels';

export interface MapHandlers {
  onHover: (tile: number | null, clientX: number, clientY: number) => void;
  onClick: (tile: number, event: PointerEvent) => void;
  onCancel?: () => void;
  onZoom?: (zoom: number) => void;
}

export interface MapViewState {
  mode: MapMode;
  selectedCiv: number | null;
  /** Radius in tiles of the active map-targeted divine power, or null. */
  toolRadius: number | null;
  toolColor: number;
}

interface Ping {
  g: Graphics;
  x: number;
  y: number;
  color: number;
  born: number;
  life: number;
  size: number;
}

interface CityView {
  marker: Sprite;
  label: BitmapText | null;
  tier: number;
  /** Rank by population among all living cities (0 = largest). */
  rank: number;
}

/** Texture resolution: about 1.6 million pixels regardless of map size. */
function pixelsPerTile(width: number, height: number): number {
  return Math.max(6, Math.min(12, Math.floor(Math.sqrt(1_650_000 / (width * height)))));
}
const MAX_ZOOM = 6;
const CITY_FONT = 'GenesisCity';

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Renders the world map with PixiJS. Terrain is painted once per world on the
 * CPU; the political / thematic overlay is repainted only when the data it
 * shows has changed, at most a few times per second.
 */
export class MapRenderer {
  private app!: Application;
  private readonly root: HTMLElement;
  private readonly handlers: MapHandlers;
  private viewport = new Container();
  private terrainSprite: Sprite | null = null;
  private overlaySprite: Sprite | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayTexture: Texture | null = null;
  private painter: OverlayPainter | null = null;
  private grid: PixelGrid | null = null;
  private world: World | null = null;
  private readonly civLabelLayer = new Container();
  private readonly cityLayer = new Container();
  private readonly cityLabelLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly toolGraphic = new Graphics();
  private readonly hoverGraphic = new Graphics();
  private civLabels = new Map<number, Text>();
  private labelMeta = new Map<number, { ok: boolean; baseScale: number }>();
  private cities = new Map<number, CityView>();
  private markerTextures: Texture[] = [];
  private ruinTexture: Texture | null = null;
  private capitalTexture: Texture | null = null;
  private pings: Ping[] = [];
  private view: MapViewState = { mode: 'political', selectedCiv: null, toolRadius: null, toolColor: 0xffffff };

  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private anim: { from: [number, number, number]; to: [number, number, number]; start: number; dur: number } | null = null;

  private overlayDirty = true;
  private labelsDirty = true;
  private citiesDirty = true;
  private lastTerritoryVersion = -1;
  private lastCityVersion = -1;
  private lastOverlayPaint = 0;
  private lastLabelUpdate = 0;
  private lastCityUpdate = 0;
  private dataDirty = false;
  private hoverTile: number | null = null;
  private destroyed = false;

  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; panX: number; panY: number } | null = null;
  private dragMoved = false;
  private pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private constructor(root: HTMLElement, handlers: MapHandlers) {
    this.root = root;
    this.handlers = handlers;
  }

  static async create(root: HTMLElement, handlers: MapHandlers): Promise<MapRenderer> {
    const r = new MapRenderer(root, handlers);
    await r.init();
    return r;
  }

  private async init(): Promise<void> {
    try {
      await Promise.all([document.fonts.load('700 48px Cinzel'), document.fonts.load('600 14px Inter')]);
    } catch {
      // Fonts are optional; system fallbacks still render.
    }
    this.app = new Application();
    await this.app.init({
      resizeTo: this.root,
      antialias: true,
      background: 0x0e1a26,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    if (this.destroyed) return;
    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    this.root.appendChild(canvas);
    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.cityLayer, this.civLabelLayer, this.cityLabelLayer, this.toolGraphic, this.hoverGraphic, this.fxLayer);
    this.createMarkerTextures();
    BitmapFont.install({
      name: CITY_FONT,
      style: {
        fontFamily: 'Inter, sans-serif',
        fontSize: 26,
        fontWeight: '600',
        fill: '#f3eedf',
        stroke: { color: '#14110d', width: 5, join: 'round' },
      },
      chars: [['a', 'z'], ['A', 'Z'], ['0', '9'], " -'.,()"],
      resolution: 2,
      padding: 4,
    });
    this.bindInput(canvas);
    this.app.ticker.add(() => this.tick());
    this.resizeObserver = new ResizeObserver(() => this.clampCamera());
    this.resizeObserver.observe(this.root);
  }

  private createMarkerTextures(): void {
    const make = (draw: (g: Graphics) => void): Texture => {
      const g = new Graphics();
      draw(g);
      const tex = this.app.renderer.generateTexture({ target: g, resolution: 3, antialias: true });
      g.destroy();
      return tex;
    };
    // Tiered city dots: white fill (tinted per nation) with a dark ring.
    const radii = [2.6, 3.4, 4.4, 5.6];
    this.markerTextures = radii.map((r) =>
      make((g) => {
        g.circle(0, 0, r + 1.6).fill({ color: 0x14110d, alpha: 0.85 });
        g.circle(0, 0, r).fill({ color: 0xffffff });
      }),
    );
    this.capitalTexture = make((g) => {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? 8.5 : 3.8;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.poly(pts).fill({ color: 0xffffff }).stroke({ color: 0x14110d, width: 1.8, alpha: 0.9 });
    });
    this.ruinTexture = make((g) => {
      g.moveTo(-3.5, -3.5).lineTo(3.5, 3.5).moveTo(3.5, -3.5).lineTo(-3.5, 3.5).stroke({ color: 0x14110d, width: 3.4, alpha: 0.7 });
      g.moveTo(-3.5, -3.5).lineTo(3.5, 3.5).moveTo(3.5, -3.5).lineTo(-3.5, 3.5).stroke({ color: 0xb8b2a6, width: 1.6 });
    });
  }

  // -------------------------------------------------------------------------
  // World
  // -------------------------------------------------------------------------

  setWorld(world: World): void {
    if (this.destroyed) return;
    const sameMap = this.world !== null && this.grid !== null && this.world.seed === world.seed && this.world.map.width === world.map.width && this.world.map.height === world.map.height && this.world.map.elevation === world.map.elevation;
    this.world = world;
    if (!sameMap) this.buildStatic(world);
    this.clearDynamic();
    this.overlayDirty = true;
    this.labelsDirty = true;
    this.citiesDirty = true;
    if (!sameMap) this.fitToView(false);
  }

  private buildStatic(world: World): void {
    this.terrainSprite?.destroy({ texture: true, textureSource: true });
    this.overlaySprite?.destroy({ texture: true, textureSource: true });
    const grid = buildPixelGrid(world.map, world.seed, pixelsPerTile(world.map.width, world.map.height));
    this.grid = grid;
    const terrain = paintTerrain(world.map, grid, world.seed);
    const tc = document.createElement('canvas');
    tc.width = grid.pw;
    tc.height = grid.ph;
    const tctx = tc.getContext('2d')!;
    tctx.putImageData(new ImageData(terrain.data as unknown as Uint8ClampedArray<ArrayBuffer>, grid.pw, grid.ph), 0, 0);
    drawRivers(tctx, world.map, grid);
    const terrainTexture = Texture.from(tc);
    this.terrainSprite = new Sprite(terrainTexture);
    const oc = document.createElement('canvas');
    oc.width = grid.pw;
    oc.height = grid.ph;
    this.overlayCanvas = oc;
    this.painter = new OverlayPainter(grid, world.map.size);
    this.overlayTexture = Texture.from(oc);
    this.overlaySprite = new Sprite(this.overlayTexture);
    this.viewport.addChildAt(this.terrainSprite, 0);
    this.viewport.addChildAt(this.overlaySprite, 1);
  }

  private clearDynamic(): void {
    for (const t of this.civLabels.values()) t.destroy();
    this.civLabels.clear();
    for (const c of this.cities.values()) {
      c.marker.destroy();
      c.label?.destroy();
    }
    this.cities.clear();
    for (const p of this.pings) p.g.destroy();
    this.pings = [];
    this.lastTerritoryVersion = -1;
    this.lastCityVersion = -1;
  }

  setView(view: MapViewState): void {
    const changed = view.mode !== this.view.mode || view.selectedCiv !== this.view.selectedCiv;
    this.view = view;
    if (changed) {
      this.overlayDirty = true;
      this.labelsDirty = true;
    }
    this.drawTool();
  }

  /** Called whenever the simulation advanced; repaints are throttled internally. */
  notifyDataChanged(): void {
    this.dataDirty = true;
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  private viewSize(): { w: number; h: number } {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  private minZoom(): number {
    if (!this.grid) return 0.2;
    const { w, h } = this.viewSize();
    return Math.min(w / this.grid.pw, h / this.grid.ph) * 0.92;
  }

  private clampCamera(): void {
    if (!this.grid || !this.app?.renderer) return;
    const { w, h } = this.viewSize();
    this.zoom = Math.max(this.minZoom(), Math.min(MAX_ZOOM, this.zoom));
    const mw = this.grid.pw * this.zoom;
    const mh = this.grid.ph * this.zoom;
    const margin = 80;
    if (mw <= w) this.panX = (w - mw) / 2;
    else this.panX = Math.min(margin, Math.max(w - mw - margin, this.panX));
    if (mh <= h) this.panY = (h - mh) / 2;
    else this.panY = Math.min(margin, Math.max(h - mh - margin, this.panY));
    this.applyCamera();
  }

  private applyCamera(): void {
    this.viewport.position.set(this.panX, this.panY);
    this.viewport.scale.set(this.zoom);
    const inv = 1 / this.zoom;
    for (const c of this.cities.values()) {
      c.marker.scale.set(inv * (c.tier === 9 ? 1.1 : 1));
      if (c.label) c.label.scale.set(inv * 0.5);
    }
    for (const p of this.pings) p.g.scale.set(inv);
    this.hoverGraphic.scale.set(1);
    this.drawHover();
    this.updateCityVisibility();
    this.updateLabelVisibility();
    this.handlers.onZoom?.(this.zoom);
  }

  fitToView(animate = true): void {
    if (!this.grid) return;
    const { w, h } = this.viewSize();
    const z = Math.min(w / this.grid.pw, h / this.grid.ph) * 0.98;
    const x = (w - this.grid.pw * z) / 2;
    const y = (h - this.grid.ph * z) / 2;
    this.animateTo(z, x, y, animate ? 450 : 0);
  }

  zoomBy(factor: number): void {
    const { w, h } = this.viewSize();
    this.zoomAt(w / 2, h / 2, this.zoom * factor, true);
  }

  private zoomAt(sx: number, sy: number, newZoom: number, animate: boolean): void {
    const z = Math.max(this.minZoom(), Math.min(MAX_ZOOM, newZoom));
    const x = sx - ((sx - this.panX) * z) / this.zoom;
    const y = sy - ((sy - this.panY) * z) / this.zoom;
    if (animate) this.animateTo(z, x, y, 220);
    else {
      this.anim = null;
      this.zoom = z;
      this.panX = x;
      this.panY = y;
      this.clampCamera();
    }
  }

  focusTile(tile: number, zoom?: number): void {
    if (!this.grid) return;
    const { w, h } = this.viewSize();
    const z = Math.max(this.zoom, zoom ?? Math.max(this.zoom, 2.4));
    const wx = this.grid.centerX[tile]!;
    const wy = this.grid.centerY[tile]!;
    this.animateTo(z, w / 2 - wx * z, h / 2 - wy * z, 500);
  }

  private animateTo(zoom: number, x: number, y: number, dur: number): void {
    if (dur <= 0) {
      this.zoom = zoom;
      this.panX = x;
      this.panY = y;
      this.anim = null;
      this.clampCamera();
      return;
    }
    this.anim = { from: [this.zoom, this.panX, this.panY], to: [zoom, x, y], start: performance.now(), dur };
  }

  getZoom(): number {
    return this.zoom;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private tileAt(clientX: number, clientY: number): number | null {
    if (!this.grid) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = Math.floor((sx - this.panX) / this.zoom);
    const wy = Math.floor((sy - this.panY) / this.zoom);
    if (wx < 0 || wy < 0 || wx >= this.grid.pw || wy >= this.grid.ph) return null;
    return this.grid.pixTile[wy * this.grid.pw + wx]!;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
        this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, this.zoom * factor, false);
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.anim = null;
      if (e.button === 2) {
        this.handlers.onCancel?.();
        return;
      }
      if (this.pointers.size === 1) {
        this.dragStart = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY };
        this.dragMoved = false;
      } else if (this.pointers.size === 2) {
        const [a, b] = Array.from(this.pointers.values()) as [{ x: number; y: number }, { x: number; y: number }];
        const rect = canvas.getBoundingClientRect();
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top };
        this.dragMoved = true;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = Array.from(this.pointers.values()) as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt(this.pinch.cx, this.pinch.cy, this.pinch.zoom * (d / Math.max(1, this.pinch.dist)), false);
        return;
      }
      if (this.dragStart && this.pointers.size === 1) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (!this.dragMoved && Math.hypot(dx, dy) > 4) this.dragMoved = true;
        if (this.dragMoved) {
          this.panX = this.dragStart.panX + dx;
          this.panY = this.dragStart.panY + dy;
          this.clampCamera();
          canvas.style.cursor = 'grabbing';
          return;
        }
      }
      const tile = this.tileAt(e.clientX, e.clientY);
      if (tile !== this.hoverTile) {
        this.hoverTile = tile;
        this.drawHover();
        this.drawTool();
      }
      this.handlers.onHover(tile, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      const wasDrag = this.dragMoved;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) {
        canvas.style.cursor = '';
        if (!wasDrag && this.dragStart && e.type === 'pointerup' && e.button === 0) {
          const tile = this.tileAt(e.clientX, e.clientY);
          if (tile !== null) this.handlers.onClick(tile, e);
        }
        this.dragStart = null;
        this.dragMoved = false;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      if (this.pointers.size === 0) {
        this.hoverTile = null;
        this.drawHover();
        this.drawTool();
        this.handlers.onHover(null, 0, 0);
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  private tick(): void {
    if (this.destroyed || !this.world || !this.grid) return;
    const now = performance.now();
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.start) / this.anim.dur);
      const k = ease(t);
      this.zoom = this.anim.from[0] + (this.anim.to[0] - this.anim.from[0]) * k;
      this.panX = this.anim.from[1] + (this.anim.to[1] - this.anim.from[1]) * k;
      this.panY = this.anim.from[2] + (this.anim.to[2] - this.anim.from[2]) * k;
      if (t >= 1) this.anim = null;
      this.clampCamera();
    }
    const world = this.world;
    const territoryChanged = world.cache.territoryVersion !== this.lastTerritoryVersion;
    const cityChanged = world.cache.cityVersion !== this.lastCityVersion;
    if (this.dataDirty) {
      const mode = this.view.mode;
      if (territoryChanged || mode === 'population' || mode === 'diplomacy') this.overlayDirty = true;
      if (territoryChanged) this.labelsDirty = true;
      this.citiesDirty = true;
      this.dataDirty = false;
    }
    if (cityChanged) this.citiesDirty = true;
    const overlayInterval = this.view.mode === 'population' ? 450 : 140;
    if (this.overlayDirty && now - this.lastOverlayPaint > overlayInterval) {
      this.paintOverlay();
      this.lastOverlayPaint = now;
      this.overlayDirty = false;
      this.lastTerritoryVersion = world.cache.territoryVersion;
    }
    if (this.labelsDirty && now - this.lastLabelUpdate > 500) {
      this.updateCivLabels();
      this.lastLabelUpdate = now;
      this.labelsDirty = false;
    }
    if (this.citiesDirty && now - this.lastCityUpdate > 300) {
      this.updateCities();
      this.lastCityUpdate = now;
      this.citiesDirty = false;
      this.lastCityVersion = world.cache.cityVersion;
    }
    this.updatePings(now);
  }

  private paintOverlay(): void {
    if (!this.world || !this.painter || !this.overlayCanvas || !this.overlayTexture) return;
    this.painter.paint(this.world, { mode: this.view.mode, selectedCiv: this.view.selectedCiv });
    const ctx = this.overlayCanvas.getContext('2d')!;
    ctx.putImageData(this.painter.image, 0, 0);
    this.overlayTexture.source.update();
  }

  private updateCivLabels(): void {
    if (!this.world || !this.grid) return;
    const world = this.world;
    const labels = computeCivLabels(world, this.grid).sort((a, b) => b.weight - a.weight || a.civ - b.civ);
    const seen = new Set<number>();
    const mode = this.view.mode;
    const sel = this.view.selectedCiv;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const BASE = 64;
    for (const l of labels) {
      seen.add(l.civ);
      let text = this.civLabels.get(l.civ);
      if (!text) {
        text = new Text({
          text: l.text,
          style: new TextStyle({
            fontFamily: 'Cinzel, Georgia, serif',
            fontWeight: '700',
            fontSize: BASE,
            fill: '#f7f0dc',
            letterSpacing: 6,
            stroke: { color: '#16120d', width: 6, join: 'round' },
            dropShadow: { color: '#000000', alpha: 0.3, blur: 5, distance: 0, angle: 0 },
          }),
          resolution: 2,
        });
        text.anchor.set(0.5);
        this.civLabelLayer.addChild(text);
        this.civLabels.set(l.civ, text);
      } else if (text.text !== l.text) {
        text.text = l.text;
      }
      // Measure at base size, then fit within the territory and avoid other labels.
      text.scale.set(1);
      const baseW = text.width;
      const baseH = text.height;
      let scale = Math.min(l.size / BASE, l.maxWidth / Math.max(1, baseW));
      scale = Math.max(scale, 6 / BASE);
      const cos = Math.cos(l.angle);
      const sin = Math.sin(l.angle);
      const boxAt = (cx: number, cy: number, sc: number) => {
        const w = baseW * sc + 6;
        const h = baseH * sc * 0.78 + 4;
        const bw = w * Math.abs(cos) + h * Math.abs(sin);
        const bh = w * Math.abs(sin) + h * Math.abs(cos);
        return { x0: cx - bw / 2, y0: cy - bh / 2, x1: cx + bw / 2, y1: cy + bh / 2 };
      };
      const hits = (b: { x0: number; y0: number; x1: number; y1: number }) => placed.some((p) => p.x0 < b.x1 && p.x1 > b.x0 && p.y0 < b.y1 && p.y1 > b.y0);
      let px = l.x;
      let py = l.y;
      let box = boxAt(px, py, scale);
      let ok = !hits(box);
      if (!ok) {
        search: for (const shrink of [1, 0.82, 0.68, 0.56]) {
          const sc = scale * shrink;
          const h = baseH * sc;
          // Try the original spot, then nudges across and along the label's axis.
          const offsets: [number, number][] = [
            [0, 0],
            [0, -h * 0.9],
            [0, h * 0.9],
            [-baseW * sc * 0.18, 0],
            [baseW * sc * 0.18, 0],
          ];
          for (const [ox, oy] of offsets) {
            const cx = l.x + ox * cos - oy * sin;
            const cy = l.y + ox * sin + oy * cos;
            const b = boxAt(cx, cy, sc);
            if (!hits(b)) {
              scale = sc;
              px = cx;
              py = cy;
              box = b;
              ok = true;
              break search;
            }
          }
        }
      }
      if (!ok) {
        scale *= 0.55;
        box = boxAt(px, py, scale);
      }
      placed.push(box);
      text.position.set(px, py);
      text.rotation = l.angle;
      text.scale.set(scale);
      this.labelMeta.set(l.civ, { ok, baseScale: scale });
      const faded = mode === 'geographic' || mode === 'resources';
      let alpha = faded ? 0.4 : sel !== null && sel !== l.civ && mode === 'political' ? 0.6 : 0.88;
      if (!ok) alpha *= 0.7;
      text.alpha = alpha;
    }
    this.updateLabelVisibility();
    for (const [id, text] of this.civLabels) {
      if (!seen.has(id)) {
        text.destroy();
        this.civLabels.delete(id);
        this.labelMeta.delete(id);
      }
    }
  }

  /** Hides nation names that would be illegibly small on screen at the current zoom. */
  private updateLabelVisibility(): void {
    for (const [id, text] of this.civLabels) {
      const meta = this.labelMeta.get(id);
      const screenPx = (meta?.baseScale ?? text.scale.x) * 64 * this.zoom;
      text.visible = screenPx >= (meta?.ok === false ? 13 : 8.5);
    }
  }

  private tierOf(pop: number, capital: boolean): number {
    if (capital) return 9;
    if (pop > 250_000) return 3;
    if (pop > 60_000) return 2;
    if (pop > 15_000) return 1;
    return 0;
  }

  private updateCities(): void {
    if (!this.world || !this.grid) return;
    const world = this.world;
    const seen = new Set<number>();
    const inv = 1 / this.zoom;
    for (const city of world.cities) {
      const owner = city.owner >= 0 ? world.civs[city.owner] : undefined;
      const capital = !!owner && owner.capital === city.id;
      const tier = city.ruined ? -1 : this.tierOf(world.pop[city.tile]!, capital);
      // Old ruins fade from the map after a few centuries.
      if (city.ruined && city.ruinedYear !== null && world.year - city.ruinedYear > 300) continue;
      seen.add(city.id);
      let view = this.cities.get(city.id);
      const texture = tier === -1 ? this.ruinTexture! : tier === 9 ? this.capitalTexture! : this.markerTextures[tier]!;
      if (!view) {
        const marker = new Sprite(texture);
        marker.anchor.set(0.5);
        marker.scale.set(inv);
        this.cityLayer.addChild(marker);
        view = { marker, label: null, tier, rank: 0 };
        this.cities.set(city.id, view);
      } else if (view.tier !== tier) {
        view.marker.texture = texture;
        view.tier = tier;
      }
      view.marker.position.set(this.grid.centerX[city.tile]!, this.grid.centerY[city.tile]!);
      view.marker.tint = owner ? (tier === 9 ? lighten(owner.color, 0.55) : mix(lighten(owner.color, 0.45), 0xffffff, 0.2)) : 0xffffff;
      if (!view.label) {
        const label = new BitmapText({ text: city.name, style: { fontFamily: CITY_FONT, fontSize: 26 } });
        label.anchor.set(0.5, 0);
        label.scale.set(inv * 0.5);
        this.cityLabelLayer.addChild(label);
        view.label = label;
      } else if (view.label.text !== city.name) {
        view.label.text = city.name;
      }
      view.label.position.set(this.grid.centerX[city.tile]!, this.grid.centerY[city.tile]! + 5 * inv);
      view.label.alpha = city.ruined ? 0.55 : 1;
    }
    for (const [id, view] of this.cities) {
      if (!seen.has(id)) {
        view.marker.destroy();
        view.label?.destroy();
        this.cities.delete(id);
      }
    }
    // Prominence ranking drives level of detail.
    const ranked = Array.from(this.cities.entries())
      .filter(([, v]) => v.tier >= 0)
      .sort((a, b) => world.pop[world.cities[b[0]]!.tile]! - world.pop[world.cities[a[0]]!.tile]! || a[0] - b[0]);
    ranked.forEach(([, v], i) => (v.rank = i));
    for (const v of this.cities.values()) if (v.tier < 0) v.rank = 1e9;
    this.updateCityVisibility();
  }

  /** Level of detail: more and smaller settlements appear as you zoom in. */
  private updateCityVisibility(): void {
    const z = this.zoom;
    const markerCount = z >= 3 ? Infinity : Math.round(16 * z * z + 6);
    const labelCount = z < 1.25 ? 0 : z >= 4 ? Infinity : Math.round(6 * z * z);
    for (const view of this.cities.values()) {
      const capital = view.tier === 9;
      const ruin = view.tier < 0;
      view.marker.visible = capital || (ruin ? z > 2.6 : view.rank < markerCount);
      if (view.label) {
        view.label.visible = capital ? z > 1.05 : ruin ? z > 3.5 : view.rank < labelCount;
        view.label.position.y = view.marker.position.y + 5.5 / z;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  ping(tile: number, color: number, size = 1): void {
    if (!this.grid || tile < 0) return;
    if (this.pings.length > 24) {
      const old = this.pings.shift();
      old?.g.destroy();
    }
    const g = new Graphics();
    g.scale.set(1 / this.zoom);
    g.position.set(this.grid.centerX[tile]!, this.grid.centerY[tile]!);
    this.fxLayer.addChild(g);
    this.pings.push({ g, x: this.grid.centerX[tile]!, y: this.grid.centerY[tile]!, color, born: performance.now(), life: 1800, size });
  }

  private updatePings(now: number): void {
    if (this.pings.length === 0) return;
    const keep: Ping[] = [];
    for (const p of this.pings) {
      const t = (now - p.born) / p.life;
      if (t >= 1) {
        p.g.destroy();
        continue;
      }
      const r = (8 + 34 * ease(t)) * p.size;
      p.g.clear();
      p.g.circle(0, 0, r).stroke({ color: p.color, width: 3, alpha: (1 - t) * 0.95 });
      p.g.circle(0, 0, r * 0.55).stroke({ color: p.color, width: 1.5, alpha: (1 - t) * 0.6 });
      p.g.circle(0, 0, 3.5).fill({ color: p.color, alpha: 1 - t });
      keep.push(p);
    }
    this.pings = keep;
  }

  private drawHover(): void {
    const g = this.hoverGraphic;
    g.clear();
    if (this.hoverTile === null || !this.grid || this.view.toolRadius !== null) return;
    const x = this.grid.centerX[this.hoverTile]!;
    const y = this.grid.centerY[this.hoverTile]!;
    const r = 6 / this.zoom + 3;
    g.circle(x, y, r).stroke({ color: 0xffffff, width: 1.5 / this.zoom, alpha: 0.85 });
    g.circle(x, y, r + 1.5 / this.zoom).stroke({ color: 0x000000, width: 1 / this.zoom, alpha: 0.4 });
  }

  private drawTool(): void {
    const g = this.toolGraphic;
    g.clear();
    if (this.view.toolRadius === null || this.hoverTile === null || !this.grid) return;
    const x = this.grid.centerX[this.hoverTile]!;
    const y = this.grid.centerY[this.hoverTile]!;
    const r = Math.max(0.6, this.view.toolRadius) * this.grid.S;
    g.circle(x, y, r).fill({ color: this.view.toolColor, alpha: 0.16 }).stroke({ color: this.view.toolColor, width: 2 / this.zoom, alpha: 0.95 });
    g.circle(x, y, 3 / this.zoom).fill({ color: this.view.toolColor, alpha: 1 });
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    try {
      this.app?.destroy(true, { children: true, texture: true, textureSource: true });
    } catch {
      // The app may not have finished initialising.
    }
  }
}
