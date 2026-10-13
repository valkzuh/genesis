import { useEffect } from 'react';
import { Crosshair, Maximize, Minus, Plus, X } from 'lucide-react';
import { useGame, type Toast } from '../store/gameStore';
import { controller } from '../store/controller';
import { DENSITY_STOPS, DIPLO_COLORS, MAP_MODES, allianceBlocs } from '../rendering/overlay';
import { BIOMES, RESOURCES } from '../world/biomes';
import { Biome } from '../types/world';
import { NATION_PALETTE, toHex } from '../utils/color';
import { CivSwatch, EventIcon, eventMeta, Hint, cx } from './ui';
import { GOD_TOOLS } from './godTools';

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] ring-1 ring-black/40" style={{ background: color }} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function Legend() {
  const mode = useGame((s) => s.mapMode);
  const world = useGame((s) => s.world);
  const selected = useGame((s) => s.selectedCiv);
  useGame((s) => s.version);
  const info = MAP_MODES.find((m) => m.id === mode)!;
  let body: React.ReactNode = null;
  if (mode === 'political') {
    body = (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-war" /> War front
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-gold-300" /> Selected nation
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[0.8rem] leading-none text-gold-200">★</span> Capital · <span className="h-2 w-2 rounded-full bg-ink-100" /> City
        </div>
      </div>
    );
  } else if (mode === 'geographic') {
    const biomes = [Biome.Grassland, Biome.TemperateForest, Biome.TropicalForest, Biome.Taiga, Biome.Steppe, Biome.Savanna, Biome.Desert, Biome.Tundra, Biome.Marsh, Biome.Hills, Biome.Mountains, Biome.Ice];
    body = (
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {biomes.map((b) => (
          <Swatch key={b} color={toHex(BIOMES[b]!.color)} label={BIOMES[b]!.name} />
        ))}
      </div>
    );
  } else if (mode === 'population') {
    body = (
      <div>
        <div className="h-2 w-44 rounded-full" style={{ background: `linear-gradient(90deg, ${DENSITY_STOPS.map((c) => toHex(c)).join(',')})` }} />
        <div className="mt-1 flex justify-between text-ink-400">
          <span>Sparse</span>
          <span>Dense · cities</span>
        </div>
      </div>
    );
  } else if (mode === 'resources') {
    body = (
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {RESOURCES.slice(1).map((r) => (
          <Swatch key={r.id} color={toHex(r.color)} label={r.name} />
        ))}
      </div>
    );
  } else if (mode === 'diplomacy' && world) {
    const civ = selected !== null ? world.civs[selected] : undefined;
    if (civ && civ.alive) {
      body = (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-ink-100">
            <CivSwatch civ={civ} size={10} /> Seen from the {civ.name}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Swatch color={toHex(DIPLO_COLORS.war)} label="At war" />
            <Swatch color={toHex(DIPLO_COLORS.ally)} label="Ally" />
            <Swatch color={toHex(DIPLO_COLORS.trade)} label="Trade partner" />
            <Swatch color={toHex(DIPLO_COLORS.rival)} label="Rival" />
            <Swatch color={toHex(DIPLO_COLORS.friendly)} label="Friendly" />
            <Swatch color={toHex(DIPLO_COLORS.hostile)} label="Hostile" />
            <Swatch color={toHex(DIPLO_COLORS.neutral)} label="Neutral" />
            <Swatch color={toHex(DIPLO_COLORS.unknown)} label="No contact" />
          </div>
        </div>
      );
    } else {
      const blocs = allianceBlocs(world);
      body = (
        <div className="space-y-1">
          <div className="text-ink-300">Alliance blocs · select a nation for its view</div>
          {blocs.length === 0 && <div className="text-ink-400">No alliances yet</div>}
          {blocs.slice(0, 6).map((b, i) => (
            <Swatch key={b.name + i} color={toHex(NATION_PALETTE[(i * 7 + 3) % NATION_PALETTE.length]!)} label={`${b.name} (${b.members.length})`} />
          ))}
        </div>
      );
    }
  }
  return (
    <div className="glass pointer-events-auto max-w-[17rem] rounded-xl px-3 py-2.5 text-[0.68rem] text-ink-200 shadow-xl shadow-black/30">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="section-title text-[0.62rem]">{info.label} Map</span>
        <span className="text-ink-400">{info.description}</span>
      </div>
      {body}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((s) => s.dismissToast);
  const world = useGame((s) => s.world);
  useEffect(() => {
    const t = window.setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 6000 : 5200);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.kind, dismiss]);
  const meta = eventMeta(toast.kind);
  return (
    <div
      className="glass pointer-events-auto flex w-80 animate-slide-left items-start gap-2.5 rounded-xl px-3 py-2.5 shadow-2xl shadow-black/40"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <div className="mt-0.5">
        <EventIcon type={toast.kind} size={16} />
      </div>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          if (toast.tile >= 0) controller.focusTile(toast.tile);
          const civ = toast.civs[0];
          if (civ !== undefined && world?.civs[civ]) useGame.getState().selectCiv(civ);
        }}
      >
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.12em]" style={{ color: meta.color }}>
          {meta.label}
          {toast.year > 0 ? ` · Year ${toast.year}` : ''}
        </div>
        <div className="mt-0.5 text-[0.76rem] leading-snug text-ink-100">{toast.text}</div>
      </button>
      <button type="button" className="text-ink-400 hover:text-ink-100" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function MapHud() {
  const toasts = useGame((s) => s.toasts);
  const godTool = useGame((s) => s.godTool);
  const timelineOpen = useGame((s) => s.timelineOpen);
  const tool = godTool ? GOD_TOOLS[godTool] : null;
  const bottom = timelineOpen ? 'bottom-[16.5rem]' : 'bottom-14';
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {tool && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 animate-slide-up">
          <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 shadow-xl" style={{ boxShadow: `0 0 0 1px ${tool.css}55, 0 10px 30px -10px ${tool.css}` }}>
            <Crosshair className="h-4 w-4" style={{ color: tool.css }} />
            <span className="text-[0.78rem] text-ink-100">
              Click the map to {tool.verb} · <span className="text-ink-400">Shift-click to repeat · Esc to cancel</span>
            </span>
            <button type="button" className="btn btn-ghost py-1" onClick={() => useGame.setState({ godTool: null })}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
      <div className={cx('absolute left-3 transition-all', bottom)}>
        <Legend />
      </div>
      <div className={cx('absolute right-3 flex flex-col gap-1 transition-all', bottom)}>
        <Hint text="Zoom in" side="left">
          <button type="button" className="glass pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-ink-100 hover:text-gold-200" onClick={() => controller.renderer?.zoomBy(1.6)} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
        </Hint>
        <Hint text="Zoom out" side="left">
          <button type="button" className="glass pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-ink-100 hover:text-gold-200" onClick={() => controller.renderer?.zoomBy(1 / 1.6)} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
        </Hint>
        <Hint text="Show whole world" side="left">
          <button type="button" className="glass pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-ink-100 hover:text-gold-200" onClick={() => controller.renderer?.fitToView()} aria-label="Fit world">
            <Maximize className="h-4 w-4" />
          </button>
        </Hint>
      </div>
    </div>
  );
}
