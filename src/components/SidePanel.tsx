import { X } from 'lucide-react';
import { useGame, type PanelId } from '../store/gameStore';
import { OverviewPanel } from './panels/OverviewPanel';
import { NationsPanel } from './panels/NationsPanel';
import { DiplomacyPanel } from './panels/DiplomacyPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { GodPanel } from './panels/GodPanel';
import { WorldsPanel } from './panels/WorldsPanel';

const TITLES: Record<PanelId, { title: string; subtitle: string }> = {
  overview: { title: 'World Overview', subtitle: 'The state of the world at a glance' },
  nations: { title: 'Nations', subtitle: 'Living powers and the archive of the fallen' },
  diplomacy: { title: 'Diplomacy', subtitle: 'Wars, alliances and rivalries' },
  history: { title: 'History', subtitle: 'The chronicle of everything that has happened' },
  god: { title: 'God Mode', subtitle: 'Shape the fate of nations' },
  worlds: { title: 'Worlds', subtitle: 'Save, load, import and export' },
};

export function SidePanel() {
  const panel = useGame((s) => s.panel);
  const world = useGame((s) => s.world);
  if (!panel) return null;
  const meta = TITLES[panel];
  return (
    <aside className="panel-surface absolute inset-y-0 left-[3.3rem] z-20 flex w-[calc(100vw-3.3rem)] shrink-0 animate-fade-in flex-col border-r shadow-2xl shadow-black/50 sm:left-[4.4rem] sm:w-[min(23rem,calc(100vw-4.4rem))] lg:relative lg:left-0 lg:shadow-none">
      <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-4 pb-3 pt-3.5">
        <div>
          <h2 className="font-display text-[1.02rem] font-bold tracking-[0.12em] text-parchment">{meta.title.toUpperCase()}</h2>
          <p className="mt-0.5 text-[0.7rem] text-ink-400">{meta.subtitle}</p>
        </div>
        <button type="button" className="icon-btn -mr-1" aria-label="Close panel" onClick={() => useGame.setState({ panel: null })}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!world && panel !== 'worlds' ? (
          <div className="text-sm text-ink-300">No world loaded.</div>
        ) : panel === 'overview' ? (
          <OverviewPanel />
        ) : panel === 'nations' ? (
          <NationsPanel />
        ) : panel === 'diplomacy' ? (
          <DiplomacyPanel />
        ) : panel === 'history' ? (
          <HistoryPanel />
        ) : panel === 'god' ? (
          <GodPanel />
        ) : (
          <WorldsPanel />
        )}
      </div>
    </aside>
  );
}
