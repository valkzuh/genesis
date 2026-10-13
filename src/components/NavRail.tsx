import { Flag, Gem, LayoutDashboard, Landmark, Link2, Mountain, ScrollText, Sparkles, Users, Handshake, Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGame, type PanelId } from '../store/gameStore';
import { MAP_MODES, type MapMode } from '../rendering/overlay';
import { Hint, cx } from './ui';

const MODE_LABELS: Record<MapMode, string> = {
  political: 'Political',
  geographic: 'Terrain',
  population: 'People',
  resources: 'Resources',
  diplomacy: 'Relations',
};

const MODE_ICONS: Record<MapMode, ReactNode> = {
  political: <Flag />,
  geographic: <Mountain />,
  population: <Users />,
  resources: <Gem />,
  diplomacy: <Link2 />,
};

const PANELS: { id: PanelId; label: string; icon: ReactNode; key: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard />, key: 'O', hint: 'World dashboard and rankings' },
  { id: 'nations', label: 'Nations', icon: <Landmark />, key: 'N', hint: 'Living nations and the archive of fallen ones' },
  { id: 'diplomacy', label: 'Diplomacy', icon: <Handshake />, key: 'D', hint: 'Wars, alliances, rivalries and relations' },
  { id: 'history', label: 'History', icon: <ScrollText />, key: 'H', hint: 'Searchable chronicle of world history' },
  { id: 'god', label: 'God Mode', icon: <Sparkles />, key: 'G', hint: 'Intervene in the world' },
  { id: 'worlds', label: 'Worlds', icon: <Archive />, key: '', hint: 'Save, load, import and export' },
];

function RailButton({ active, label, icon, onClick, hint, accent }: { active: boolean; label: string; icon: ReactNode; onClick: () => void; hint: ReactNode; accent?: boolean }) {
  return (
    <Hint text={hint} side="right">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cx(
          'group relative flex w-[2.8rem] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.06em] transition sm:w-[3.9rem] sm:py-1.5',
          active ? 'bg-gold-400/12 text-gold-200' : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-100',
        )}
      >
        {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-x-[5px] -translate-y-1/2 rounded-r bg-gold-400" />}
        <span className={cx('[&>svg]:h-[1.15rem] [&>svg]:w-[1.15rem]', accent && !active && 'text-gold-400/80')}>{icon}</span>
        <span className="hidden leading-none sm:block">{label}</span>
      </button>
    </Hint>
  );
}

export function NavRail() {
  const mapMode = useGame((s) => s.mapMode);
  const panel = useGame((s) => s.panel);
  const togglePanel = useGame((s) => s.togglePanel);
  return (
    <nav className="z-20 flex w-[3.3rem] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-white/[0.06] bg-ink-900 py-2 sm:w-[4.4rem]" aria-label="Main">
      <div className="eyebrow mb-0.5 hidden text-[0.52rem] text-ink-400 sm:block">Map</div>
      {MAP_MODES.map((m) => (
        <RailButton
          key={m.id}
          active={mapMode === m.id}
          label={MODE_LABELS[m.id]}
          icon={MODE_ICONS[m.id]}
          onClick={() => useGame.setState({ mapMode: m.id })}
          hint={
            <span>
              <span className="font-semibold">{m.label} map</span> — {m.description} <span className="kbd">{m.key}</span>
            </span>
          }
        />
      ))}
      <div className="my-1.5 h-px w-10 bg-white/[0.08]" />
      <div className="eyebrow mb-0.5 hidden text-[0.52rem] text-ink-400 sm:block">Panels</div>
      {PANELS.map((p) => (
        <RailButton
          key={p.id}
          active={panel === p.id}
          label={p.label.replace(' Mode', '')}
          icon={p.icon}
          accent={p.id === 'god'}
          onClick={() => togglePanel(p.id)}
          hint={
            <span>
              <span className="font-semibold">{p.label}</span> — {p.hint} {p.key && <span className="kbd">{p.key}</span>}
            </span>
          }
        />
      ))}
    </nav>
  );
}
