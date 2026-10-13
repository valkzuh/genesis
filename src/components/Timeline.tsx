import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import { useGame } from '../store/gameStore';
import { controller } from '../store/controller';
import type { EventType, HistoryEvent, War, World } from '../types/simulation';
import { toHex } from '../utils/color';
import { EventIcon, eventMeta, cx } from './ui';

const LANES: { id: string; label: string; types: EventType[] }[] = [
  { id: 'politics', label: 'Politics', types: ['revolution', 'reform', 'secession', 'collapse', 'civil_war', 'founding'] },
  { id: 'diplomacy', label: 'Diplomacy', types: ['alliance', 'rivalry', 'peace', 'conquest'] },
  { id: 'progress', label: 'Progress', types: ['technology', 'golden_age', 'exploration'] },
  { id: 'catastrophe', label: 'Catastrophe', types: ['famine', 'plague', 'disaster'] },
  { id: 'divine', label: 'Divine', types: ['divine'] },
];

const LABEL_W = 86;
const WAR_ROWS = 5;
const WAR_ROW_H = 7;
const LANE_H = 22;

interface Marker {
  x: number;
  y: number;
  r: number;
  event: HistoryEvent;
  color: string;
  dim: boolean;
}

interface Bar {
  x0: number;
  x1: number;
  y: number;
  war: War;
  color: string;
  dim: boolean;
}

function layout(world: World, width: number, selected: number | null): { markers: Marker[]; bars: Bar[]; x: (y: number) => number; height: number } {
  const start = world.startYear;
  const end = Math.max(world.year, start + 10);
  const plotW = Math.max(50, width - LABEL_W - 16);
  const x = (year: number) => LABEL_W + ((year - start) / (end - start)) * plotW;
  const bars: Bar[] = [];
  const rowEnds = new Array(WAR_ROWS).fill(-Infinity);
  const warTop = 22;
  for (const war of world.wars) {
    const x0 = x(war.startYear);
    const x1 = Math.max(x0 + 2, x(war.endYear ?? world.year));
    let row = rowEnds.findIndex((e) => e < x0 - 1);
    if (row < 0) row = WAR_ROWS - 1;
    rowEnds[row] = x1;
    const lead = world.civs[war.leadAttacker];
    const involved = selected !== null && war.participants.some((p) => p.civ === selected);
    bars.push({ x0, x1, y: warTop + row * WAR_ROW_H, war, color: lead ? toHex(lead.color) : '#e0533b', dim: selected !== null && !involved });
  }
  const laneTop = warTop + WAR_ROWS * WAR_ROW_H + 10;
  const markers: Marker[] = [];
  const laneOf = new Map<EventType, number>();
  LANES.forEach((l, i) => l.types.forEach((t) => laneOf.set(t, i)));
  for (const e of world.events) {
    if (e.importance < 3) continue;
    if (e.type === 'founding' && e.year === world.startYear) continue;
    const lane = laneOf.get(e.type);
    if (lane === undefined) continue;
    const jitter = ((e.id * 7) % 5) - 2;
    markers.push({
      x: x(e.year),
      y: laneTop + lane * LANE_H + LANE_H / 2 + jitter,
      r: e.importance >= 5 ? 5 : e.importance >= 4 ? 3.8 : 2.6,
      event: e,
      color: eventMeta(e.type).color,
      dim: selected !== null && !e.civs.includes(selected),
    });
  }
  return { markers, bars, x, height: laneTop + LANES.length * LANE_H + 6 };
}

function ChronicleCanvas() {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const selected = useGame((s) => s.selectedCiv);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; y: number; text: string; year: string; type: EventType } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => layout(world, width, selected), [world, version, width, selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = data.height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${data.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, data.height);
    // Century grid.
    const start = world.startYear;
    const end = Math.max(world.year, start + 10);
    const span = end - start;
    const step = span > 1500 ? 250 : span > 700 ? 100 : span > 250 ? 50 : span > 80 ? 20 : 10;
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textBaseline = 'top';
    for (let y = Math.ceil(start / step) * step; y <= end; y += step) {
      const x = data.x(y);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 14);
      ctx.lineTo(x + 0.5, data.height);
      ctx.stroke();
      ctx.fillStyle = 'rgba(146,155,176,0.85)';
      ctx.fillText(String(y), x + 3, 2);
    }
    // Selected nation's lifespan.
    if (selected !== null) {
      const civ = world.civs[selected];
      if (civ) {
        const x0 = data.x(civ.foundedYear);
        const x1 = data.x(civ.extinctYear ?? world.year);
        ctx.fillStyle = 'rgba(226,192,106,0.035)';
        ctx.fillRect(x0, 14, Math.max(2, x1 - x0), data.height - 14);
        ctx.fillStyle = toHex(civ.color);
        ctx.fillRect(x0, 14, Math.max(2, x1 - x0), 3);
      }
    }
    // Lane labels.
    ctx.fillStyle = 'rgba(146,155,176,0.9)';
    ctx.font = '600 9px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('WARS', 8, 22 + (WAR_ROWS * WAR_ROW_H) / 2);
    const laneTop = 22 + WAR_ROWS * WAR_ROW_H + 10;
    LANES.forEach((l, i) => {
      ctx.fillText(l.label.toUpperCase(), 8, laneTop + i * LANE_H + LANE_H / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(LABEL_W, laneTop + i * LANE_H + 0.5);
      ctx.lineTo(width - 8, laneTop + i * LANE_H + 0.5);
      ctx.stroke();
    });
    for (const b of data.bars) {
      ctx.globalAlpha = b.dim ? 0.18 : 0.9;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x0, b.y, b.x1 - b.x0, WAR_ROW_H - 2);
      if (b.war.endYear === null) {
        ctx.strokeStyle = '#ff7a60';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x0 + 0.5, b.y + 0.5, b.x1 - b.x0 - 1, WAR_ROW_H - 3);
      }
    }
    for (const m of data.markers) {
      ctx.globalAlpha = m.dim ? 0.15 : 0.95;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // "Now" marker.
    const now = data.x(world.year);
    ctx.strokeStyle = 'rgba(240,215,140,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(now, 14);
    ctx.lineTo(now, data.height);
    ctx.stroke();
  }, [data, width, world, selected]);

  const pick = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best: Marker | null = null;
    let bestD = 64;
    for (const m of data.markers) {
      const d = (m.x - mx) ** 2 + (m.y - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) return { kind: 'event' as const, marker: best, mx, my };
    for (const b of data.bars) {
      if (mx >= b.x0 - 1 && mx <= b.x1 + 1 && my >= b.y - 1 && my <= b.y + WAR_ROW_H) return { kind: 'war' as const, bar: b, mx, my };
    }
    return null;
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="block cursor-pointer"
        onMouseMove={(e) => {
          const hit = pick(e.clientX, e.clientY);
          if (!hit) return setHover(null);
          if (hit.kind === 'event') setHover({ x: hit.mx, y: hit.my, text: hit.marker.event.text, year: `Year ${hit.marker.event.year}`, type: hit.marker.event.type });
          else {
            const w = hit.bar.war;
            setHover({ x: hit.mx, y: hit.my, text: w.summary ?? `${w.name} (ongoing)`, year: `${w.startYear}–${w.endYear ?? 'now'}`, type: 'war' });
          }
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const hit = pick(e.clientX, e.clientY);
          if (!hit) return;
          if (hit.kind === 'event') {
            const ev = hit.marker.event;
            if (ev.tile >= 0) controller.focusTile(ev.tile);
            if (ev.civs[0] !== undefined) useGame.getState().selectCiv(ev.civs[0]);
          } else {
            const w = hit.bar.war;
            useGame.getState().selectCiv(w.leadAttacker);
            const cap = world.cities[world.civs[w.leadDefender]?.capital ?? -1];
            if (cap) controller.focusTile(cap.tile);
          }
        }}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-72 rounded-md border border-white/10 bg-ink-900/95 px-2.5 py-1.5 text-[0.7rem] shadow-xl"
          style={{ left: Math.min(hover.x + 12, width - 300), top: Math.max(0, hover.y - 50) }}
        >
          <div className="mb-0.5 flex items-center gap-1.5 font-semibold" style={{ color: eventMeta(hover.type).color }}>
            <EventIcon type={hover.type} size={12} /> {hover.year}
          </div>
          <div className="leading-snug text-ink-100">{hover.text}</div>
        </div>
      )}
    </div>
  );
}

export function Timeline() {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const open = useGame((s) => s.timelineOpen);
  const latest = useMemo(() => {
    const out: HistoryEvent[] = [];
    for (let i = world.events.length - 1; i >= 0 && out.length < 8; i--) {
      const e = world.events[i]!;
      if (e.importance >= 3) out.push(e);
    }
    return out;
  }, [world, version]);

  return (
    <div className={cx('absolute inset-x-0 bottom-0 z-10 border-t border-white/[0.07] bg-ink-900/88 backdrop-blur-md transition-[height] duration-300', open ? 'h-[16rem]' : 'h-11')}>
      <div className="flex h-11 items-center gap-3 px-3">
        <button type="button" onClick={() => useGame.setState({ timelineOpen: !open })} className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-white/[0.05]" aria-expanded={open}>
          <ScrollText className="h-4 w-4 text-gold-400" />
          <span className="section-title text-[0.66rem]">Chronicle</span>
          {open ? <ChevronDown className="h-4 w-4 text-ink-300" /> : <ChevronUp className="h-4 w-4 text-ink-300" />}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {latest.length === 0 && <span className="text-[0.74rem] text-ink-400">The chronicle is empty. Press play to let history begin.</span>}
          {latest.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                if (e.tile >= 0) controller.focusTile(e.tile);
                if (e.civs[0] !== undefined) useGame.getState().selectCiv(e.civs[0]);
              }}
              className={cx('flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[0.7rem] hover:border-gold-400/40 hover:bg-white/[0.06]', i === 0 ? 'max-w-[28rem] animate-fade-in' : 'max-w-[18rem] opacity-80', i > 2 && 'hidden 2xl:flex', i > 1 && 'hidden xl:flex')}
              title={e.text}
            >
              <EventIcon type={e.type} size={12} />
              <span className="num text-gold-300/90">{e.year}</span>
              <span className="truncate text-ink-200">{e.text}</span>
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="h-[calc(16rem-2.75rem)] overflow-y-auto px-2 pb-2">
          <ChronicleCanvas />
        </div>
      )}
    </div>
  );
}
