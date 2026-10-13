import { useMemo } from 'react';
import { ChevronsLeft, ChevronsRight, CircleQuestionMark, Globe, Pause, Play, Save, StepForward, Swords, Users, Landmark, Dices } from 'lucide-react';
import { useGame, SPEEDS } from '../store/gameStore';
import { controller } from '../store/controller';
import { worldStats } from '../simulation/queries';
import { ERAS } from '../simulation/constants';
import { formatPopulation } from '../utils/format';
import { Hint, cx } from './ui';

function Logo() {
  return (
    <div className="flex items-center gap-2.5 pr-2">
      <div className="relative grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sea to-[#13283a] ring-1 ring-gold-400/70 shadow-[0_0_18px_-4px_rgba(226,192,106,0.55)]">
        <Globe className="h-4.5 w-4.5 text-gold-200" strokeWidth={1.6} />
      </div>
      <div className="leading-none">
        <div className="font-display text-[1.15rem] font-bold tracking-[0.28em] text-gold-300">GENESIS</div>
        <div className="mt-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.3em] text-ink-400">Living World Simulator</div>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value, accent, hint }: { icon: React.ReactNode; label: string; value: string; accent?: string; hint: string }) {
  return (
    <Hint text={hint} side="bottom">
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 hover:bg-white/[0.04]">
        <span className="text-ink-300 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div className="leading-tight">
          <div className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</div>
          <div className="num text-[0.85rem] font-semibold" style={accent ? { color: accent } : undefined}>
            {value}
          </div>
        </div>
      </div>
    </Hint>
  );
}

export function TopBar() {
  const world = useGame((s) => s.world);
  const version = useGame((s) => s.version);
  const running = useGame((s) => s.running);
  const speed = useGame((s) => s.speed);
  const unsaved = useGame((s) => s.unsaved);
  const stats = useMemo(() => (world ? worldStats(world) : null), [world, version]);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-gradient-to-b from-ink-850 to-ink-900 px-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]">
      <Logo />
      <div className="hidden h-8 w-px bg-white/[0.07] md:block" />
      {world && (
        <div className="hidden min-w-0 flex-col leading-tight md:flex">
          <div className="truncate font-display text-[0.92rem] font-semibold tracking-wide text-parchment">World of {world.name}</div>
          <button
            type="button"
            className="flex items-center gap-1 text-left text-[0.66rem] text-ink-400 hover:text-gold-200"
            title="Copy seed to clipboard"
            onClick={() => {
              void navigator.clipboard?.writeText(world.seed).catch(() => undefined);
              useGame.getState().pushToast({ text: `Seed “${world.seed}” copied`, kind: 'info', tile: -1, civs: [], importance: 1, year: world.year });
            }}
          >
            <Dices className="h-3 w-3" /> seed <span className="font-mono text-ink-300">{world.seed}</span>
          </button>
        </div>
      )}

      <div className="mx-auto flex items-center gap-4">
        {world && stats && (
          <div className="flex items-center gap-3">
            <div className="text-center leading-none">
              <div className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-ink-400">{ERAS[stats.maxEra]!.name} Age</div>
              <div className="num mt-1 font-display text-[1.35rem] font-bold tracking-wide text-gold-200">Year {world.year.toLocaleString('en-US')}</div>
            </div>
          </div>
        )}
        {stats && (
          <div className="hidden items-center lg:flex">
            <StatChip icon={<Users />} label="Population" value={formatPopulation(stats.population)} hint="Total population of all living nations" />
            <StatChip icon={<Landmark />} label="Nations" value={`${stats.living}`} hint={`${stats.living} living nations · ${stats.total - stats.living} fallen`} />
            <StatChip icon={<Swords />} label="Wars" value={`${stats.wars}`} accent={stats.wars > 0 ? '#f08a73' : undefined} hint="Wars currently being fought" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-ink-950/60 p-1">
        <Hint text={<span>Slower <span className="kbd">-</span></span>} side="bottom">
          <button type="button" className="icon-btn" aria-label="Slower" onClick={() => controller.slower()} disabled={speed === 0}>
            <ChevronsLeft className="h-4 w-4" />
          </button>
        </Hint>
        <Hint text={<span>{running ? 'Pause' : 'Play'} <span className="kbd">Space</span></span>} side="bottom">
          <button
            type="button"
            aria-label={running ? 'Pause' : 'Play'}
            onClick={() => controller.toggle()}
            disabled={!world}
            className={cx(
              'grid h-9 w-9 place-items-center rounded-lg transition',
              running ? 'bg-gold-500/20 text-gold-200 ring-1 ring-gold-400/50' : 'bg-gradient-to-b from-gold-400 to-gold-500 text-ink-950 shadow-[0_6px_16px_-6px_rgba(226,192,106,0.8)]',
            )}
          >
            {running ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5 translate-x-[1px]" fill="currentColor" />}
          </button>
        </Hint>
        <Hint text={<span>Advance one year <span className="kbd">.</span></span>} side="bottom">
          <button type="button" className="icon-btn" aria-label="Advance one year" onClick={() => controller.step(1)} disabled={running || !world}>
            <StepForward className="h-4 w-4" />
          </button>
        </Hint>
        <Hint text={<span>Faster <span className="kbd">+</span></span>} side="bottom">
          <button type="button" className="icon-btn" aria-label="Faster" onClick={() => controller.faster()} disabled={speed === SPEEDS.length - 1}>
            <ChevronsRight className="h-4 w-4" />
          </button>
        </Hint>
        <div className="num w-[4.6rem] pr-1 text-center text-[0.7rem] font-semibold leading-tight text-ink-200">
          <div className="text-gold-200">×{SPEEDS[speed]}</div>
          <div className="text-[0.56rem] uppercase tracking-wider text-ink-400">yrs / sec</div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Hint text="Save, load, import and export worlds" side="bottom">
          <button type="button" className={cx('btn', unsaved && 'border-gold-500/40')} onClick={() => useGame.getState().togglePanel('worlds')}>
            <Save className="h-4 w-4" />
            <span className="hidden xl:inline">Worlds</span>
          </button>
        </Hint>
        <Hint text="Generate a new world" side="bottom">
          <button type="button" className="btn btn-gold" onClick={() => useGame.setState({ dialog: 'new-world' })}>
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">New World</span>
          </button>
        </Hint>
        <Hint text={<span>How to play <span className="kbd">?</span></span>} side="bottom">
          <button type="button" className="icon-btn" aria-label="Help" onClick={() => useGame.setState({ dialog: 'help' })}>
            <CircleQuestionMark className="h-4.5 w-4.5" />
          </button>
        </Hint>
      </div>
    </header>
  );
}
