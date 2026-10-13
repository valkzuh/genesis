import { useEffect } from 'react';
import { useGame } from './store/gameStore';
import { controller, randomSeed } from './store/controller';
import { TopBar } from './components/TopBar';
import { NavRail } from './components/NavRail';
import { MapView } from './components/MapView';
import { MapHud } from './components/MapHud';
import { SidePanel } from './components/SidePanel';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { Dialogs } from './components/Dialogs';
import { MAP_MODES } from './rendering/overlay';

const ONBOARD_KEY = 'genesis.onboarded.v1';

function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useGame.getState();
      if (s.dialog || s.confirm) {
        if (e.key === 'Escape') useGame.setState({ dialog: null, confirm: null });
        return;
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          controller.toggle();
          break;
        case '.':
        case 'ArrowRight':
          if (!s.running) controller.step(e.shiftKey ? 10 : 1);
          break;
        case '+':
        case '=':
          controller.faster();
          break;
        case '-':
        case '_':
          controller.slower();
          break;
        case 'Escape':
          if (s.godTool) useGame.setState({ godTool: null });
          else if (s.inspectorOpen) useGame.setState({ inspectorOpen: false, selectedCiv: null, selectedTile: null });
          break;
        case 'f':
        case 'F':
          if (s.selectedCiv !== null) controller.focusCiv(s.selectedCiv);
          break;
        case 'o':
        case 'O':
          s.togglePanel('overview');
          break;
        case 'n':
        case 'N':
          s.togglePanel('nations');
          break;
        case 'd':
        case 'D':
          s.togglePanel('diplomacy');
          break;
        case 'h':
        case 'H':
          s.togglePanel('history');
          break;
        case 'g':
        case 'G':
          s.togglePanel('god');
          break;
        case 't':
        case 'T':
          useGame.setState({ timelineOpen: !s.timelineOpen });
          break;
        case '?':
          useGame.setState({ dialog: 'help' });
          break;
        default: {
          const mode = MAP_MODES.find((m) => m.key === e.key);
          if (mode) useGame.setState({ mapMode: mode.id });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Warn before leaving with unsaved history. */
function useUnloadGuard(): void {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useGame.getState();
      if (s.unsaved && s.world && s.world.year > 50) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}

export function App() {
  const panel = useGame((s) => s.panel);
  const inspectorOpen = useGame((s) => s.inspectorOpen);
  const hasWorld = useGame((s) => s.world !== null);
  useKeyboardShortcuts();
  useUnloadGuard();

  useEffect(() => {
    if (useGame.getState().world) return;
    let seed = randomSeed();
    try {
      const param = new URLSearchParams(window.location.search).get('seed');
      if (param && param.trim().length > 0) seed = param.trim().slice(0, 64);
    } catch {
      // ignore malformed URLs
    }
    void controller.generate(seed);
    try {
      if (!window.localStorage.getItem(ONBOARD_KEY)) {
        useGame.setState({ dialog: 'help' });
        window.localStorage.setItem(ONBOARD_KEY, '1');
      }
    } catch {
      // Storage may be unavailable (private mode); onboarding still works via the help button.
    }
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-ink-100">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <NavRail />
        {panel && <SidePanel />}
        <main className="relative min-w-0 flex-1 overflow-hidden bg-[#0e1a26]">
          <MapView />
          {hasWorld && <MapHud />}
          {hasWorld && <Timeline />}
        </main>
        {inspectorOpen && hasWorld && <Inspector />}
      </div>
      <Dialogs />
    </div>
  );
}
