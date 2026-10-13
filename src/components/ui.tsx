import { useState, type ReactNode } from 'react';
import {
  Anchor,
  BookOpen,
  Bug,
  Castle,
  Crown,
  Flag,
  FlaskConical,
  Handshake,
  HeartPulse,
  Landmark,
  Mountain,
  Scale,
  Scroll,
  Skull,
  Sparkles,
  Sprout,
  Sun,
  Swords,
  TriangleAlert,
  Users,
  Wheat,
  Bird,
  Compass,
  Flame,
} from 'lucide-react';
import type { Civ, EventType, GovernmentId } from '../types/simulation';
import { toHex, colorWithAlpha } from '../utils/color';
import { useGame } from '../store/gameStore';
import { controller } from '../store/controller';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Heraldic colour swatch for a nation. */
export function CivSwatch({ civ, size = 14, className }: { civ: Civ; size?: number; className?: string }) {
  return (
    <span
      className={cx('inline-block shrink-0 rounded-[3px] ring-1 ring-black/40', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${toHex(civ.color)}, ${colorWithAlpha(civ.color, 0.75)})`,
        boxShadow: civ.alive ? `0 0 0 1px rgba(255,255,255,0.08) inset` : undefined,
        opacity: civ.alive ? 1 : 0.55,
      }}
    />
  );
}

/** Clickable nation name: selects it in the inspector. */
export function CivLink({ civ, className, focus = false, short = false }: { civ: Civ; className?: string; focus?: boolean; short?: boolean }) {
  const selectCiv = useGame((s) => s.selectCiv);
  return (
    <button
      type="button"
      className={cx('inline-flex min-w-0 items-center gap-1.5 text-left hover:text-gold-200', !civ.alive && 'text-ink-300', className)}
      onClick={(e) => {
        e.stopPropagation();
        selectCiv(civ.id);
        if (focus && civ.alive) controller.focusCiv(civ.id);
      }}
      title={civ.alive ? civ.name : `${civ.name} (fallen)`}
    >
      <CivSwatch civ={civ} size={11} />
      <span className="truncate">{short ? civ.baseName : civ.name}</span>
    </button>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatBar({ value, max = 100, color, height = 6, className }: { value: number; max?: number; color: string; height?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-white/[0.07]', className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <div className="flex items-center gap-1.5 eyebrow">
        {icon && <span className="text-ink-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        {label}
      </div>
      <div className="mt-1 num text-[1.05rem] font-semibold leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[0.7rem] text-ink-300">{sub}</div>}
    </div>
  );
}

/** Lightweight hover tooltip. */
export function Hint({ text, children, side = 'top', className }: { text: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'right' | 'left'; className?: string }) {
  const [open, setOpen] = useState(false);
  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
      : side === 'bottom'
        ? 'top-full left-1/2 -translate-x-1/2 mt-2'
        : side === 'right'
          ? 'left-full top-1/2 -translate-y-1/2 ml-2'
          : 'right-full top-1/2 -translate-y-1/2 mr-2';
  return (
    <span className={cx('relative', className && /(^|\s)(hidden|block|flex|inline-flex|inline-block)(\s|$)/.test(className) ? '' : 'inline-flex', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && (
        <span role="tooltip" className={cx('pointer-events-none absolute z-50 w-max max-w-64 rounded-md border border-white/10 bg-ink-900/95 px-2.5 py-1.5 text-[0.72rem] font-medium leading-snug text-ink-100 shadow-xl shadow-black/40 animate-fade-in', pos)}>
          {text}
        </span>
      )}
    </span>
  );
}

const EVENT_META: Record<EventType, { icon: typeof Swords; color: string; label: string }> = {
  founding: { icon: Flag, color: '#f0d78c', label: 'Founding' },
  city: { icon: Castle, color: '#c9b48a', label: 'Settlement' },
  war: { icon: Swords, color: '#e0533b', label: 'War' },
  battle: { icon: Swords, color: '#e0533b', label: 'Battle' },
  peace: { icon: Bird, color: '#7cc7a0', label: 'Peace' },
  conquest: { icon: Castle, color: '#f08a3c', label: 'Conquest' },
  alliance: { icon: Handshake, color: '#5fb37a', label: 'Alliance' },
  diplomacy: { icon: Scroll, color: '#8fb4d9', label: 'Diplomacy' },
  trade: { icon: Anchor, color: '#4aa3a8', label: 'Trade' },
  rivalry: { icon: Flame, color: '#e08a3c', label: 'Rivalry' },
  famine: { icon: Wheat, color: '#d9b25a', label: 'Famine' },
  plague: { icon: Bug, color: '#9fd16a', label: 'Plague' },
  disaster: { icon: TriangleAlert, color: '#b88ae0', label: 'Disaster' },
  technology: { icon: FlaskConical, color: '#6fb3e0', label: 'Technology' },
  revolution: { icon: Crown, color: '#e8a0d8', label: 'Revolution' },
  reform: { icon: Scale, color: '#a9c4ef', label: 'Reform' },
  secession: { icon: Flag, color: '#c89cf0', label: 'Secession' },
  civil_war: { icon: Swords, color: '#e05a8a', label: 'Civil War' },
  collapse: { icon: Skull, color: '#d8d2c4', label: 'Collapse' },
  leader: { icon: Users, color: '#b9c0cf', label: 'Leaders' },
  divine: { icon: Sparkles, color: '#ffe9a8', label: 'Divine' },
  golden_age: { icon: Sun, color: '#f6d36b', label: 'Golden Age' },
  exploration: { icon: Compass, color: '#7fd3e0', label: 'Exploration' },
};

export function eventMeta(type: EventType | 'info' | 'error' | 'success') {
  if (type === 'info') return { icon: BookOpen, color: '#b9c0cf', label: 'Info' };
  if (type === 'error') return { icon: TriangleAlert, color: '#e0533b', label: 'Error' };
  if (type === 'success') return { icon: Sprout, color: '#6fbf8e', label: 'Success' };
  return EVENT_META[type];
}

export const EVENT_TYPES = Object.keys(EVENT_META) as EventType[];

export function EventIcon({ type, size = 14 }: { type: EventType | 'info' | 'error' | 'success'; size?: number }) {
  const meta = eventMeta(type);
  const Icon = meta.icon;
  return <Icon style={{ color: meta.color, width: size, height: size }} className="shrink-0" />;
}

const GOV_ICONS: Record<GovernmentId, typeof Crown> = {
  tribal: Mountain,
  kingdom: Crown,
  empire: Castle,
  republic: Landmark,
  merchant: Anchor,
  theocracy: Sun,
  dictatorship: Swords,
  federation: Handshake,
};

export function GovIcon({ gov, size = 14 }: { gov: GovernmentId; size?: number }) {
  const Icon = GOV_ICONS[gov];
  return <Icon style={{ width: size, height: size }} className="shrink-0 text-gold-300" />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[0.78rem] text-ink-300">{children}</div>;
}

export function Pill({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={cx('chip', className)} style={color ? { color, borderColor: `${color}55`, background: `${color}14` } : undefined}>
      {children}
    </span>
  );
}

export function HealthIcon() {
  return <HeartPulse />;
}
