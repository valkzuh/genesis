import { useMemo } from 'react';
import { ChevronsLeft, ChevronsRight, CircleQuestionMark, Globe, Pause, Play, RotateCcw, Save, StepForward, Swords, Users, Landmark, Dices } from 'lucide-react';
import { useGame, SPEEDS } from '../store/gameStore';
import { controller } from '../store/controller';
import { worldStats } from '../simulation/queries';
import { ERAS } from '../simulation/constants';
import { formatPopulation } from '../utils/format';
import { Hint, cx } from './ui';

function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 pr-1">
      <div className="relative grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sea to-[#13283a] shadow-[0_0_18px_-4px_rgba(226,192,106,0.55)] ring-1 ring-gold-400/70">
        <Globe className="h-4.5 w-4.5 text-gold-200" strokeWidth={1.6} />
      </div>
      <div className="hidden leading-none sm:block">
        <div className="font-display text-[1.15rem] font-bold tracking-[0.28em] text-gold-300">GENESIS</div>
        <div className="mt-0.5 hidden whitespace-nowrap text-[0.56rem] font-semibold uppercase tracking-[0.3em] text-ink-400 2xl:block">Living World Simulator</div>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value, accent, hint }: { icon: React.ReactNode; label: string; value: string; accent?: string; hint: string }) {
  return (
    <Hint text={hint} side="bottom">
      <div className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.04]">
        <span className="text-ink-300 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div className="leading-tight">
          <div className="hidden text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-ink-400 2xl:block">{label}</div>
          <div className="num whitespace-nowrap text-[0.85rem] font-semibold" style={accent ? { color: accent } : undefined}>
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
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-gradient-to-b from-ink-850 to-ink-900 px-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] sm:gap-3 sm:px-3">
      <Logo />
      {world && (
        <>
          <div className="hidden h-8 w-px bg-white/[0.07] xl:block" />
          <div className="hidden min-w-0 max-w-[15rem] flex-col leading-tight xl:flex">
            <div className="truncate whitespace-nowrap font-display text-[0.92rem] font-semibold tracking-wide text-parchment">World of {world.name}</div>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 text-left text-[0.66rem] text-ink-400 hover:text-gold-200"
              title="Copy seed to clipboard"
              onClick={() => {
                void navigator.clipboard?.writeText(world.seed).catch(() => undefined);
                useGame.getState().pushToast({ text: `Seed “${world.seed}” copied`, kind: 'info', tile: -1, civs: [], importance: 1, year: 0 });
              }}
            >
              <Dices className="h-3 w-3 shrink-0" /> <span className="shrink-0">seed</span> <span className="truncate font-mono text-ink-300">{world.seed}</span>
            </button>
          </div>
        </>
      )}

      <div className="mx-auto flex min-w-0 items-center gap-3">
        {world && stats && (
          <div className="shrink-0 text-center leading-none">
            <div className="hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-ink-400 md:block">{ERAS[stats.maxEra]!.name} Age</div>
            <div className="num whitespace-nowrap font-display text-[1.05rem] font-bold tracking-wide text-gold-200 sm:mt-1 sm:text-[1.3rem]">Year {world.year.toLocaleString('en-US')}</div>
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

      <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-white/[0.07] bg-ink-950/60 p-1 sm:gap-1">
        <Hint text="Reset this world to year 1 (same seed)" side="bottom" className="hidden sm:inline-flex">
          <button
            type="button"
            className="icon-btn"
            aria-label="Reset world"
            disabled={!world || world.year <= 1}
            onClick={() =>
              world &&
              useGame.getState().askConfirm({
                title: 'Reset this world?',
                message: `The World of ${world.name} will return to year 1 with the same seed. ${world.year - 1} years of history and your interventions will be lost unless saved.`,
                confirmLabel: 'Reset world',
                danger: true,
                onConfirm: () => void controller.reset(),
              })
            }
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </Hint>
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
        <Hint text={<span>Advance one year <span className="kbd">.</span></span>} side="bottom" className="hidden sm:inline-flex">
          <button type="button" className="icon-btn" aria-label="Advance one year" onClick={() => controller.step(1)} disabled={running || !world}>
            <StepForward className="h-4 w-4" />
          </button>
        </Hint>
        <Hint text={<span>Faster <span className="kbd">+</span></span>} side="bottom">
          <button type="button" className="icon-btn" aria-label="Faster" onClick={() => controller.faster()} disabled={speed === SPEEDS.length - 1}>
            <ChevronsRight className="h-4 w-4" />
          </button>
        </Hint>
        <div className="num w-[2.6rem] pr-1 text-center text-[0.7rem] font-semibold leading-tight text-ink-200 sm:w-[4.4rem]">
          <div className="text-gold-200">×{SPEEDS[speed]}</div>
          <div className="hidden text-[0.56rem] uppercase tracking-wider text-ink-400 sm:block">yrs / sec</div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Hint text="Save, load, import and export worlds" side="bottom" className="hidden sm:inline-flex">
          <button type="button" className={cx('btn px-2.5', unsaved && 'border-gold-500/40')} aria-label="Worlds" onClick={() => useGame.getState().togglePanel('worlds')}>
            <Save className="h-4 w-4" />
            <span className="hidden 2xl:inline">Worlds</span>
          </button>
        </Hint>
        <Hint text="Generate a new world" side="bottom">
          <button type="button" className="btn btn-gold whitespace-nowrap px-2.5" aria-label="New World" onClick={() => useGame.setState({ dialog: 'new-world' })}>
            <Globe className="h-4 w-4" />
            <span className="hidden xl:inline">New World</span>
          </button>
        </Hint>
        <Hint text={<span>How to play <span className="kbd">?</span></span>} side="bottom" className="hidden md:inline-flex">
          <button type="button" className="icon-btn" aria-label="Help" onClick={() => useGame.setState({ dialog: 'help' })}>
            <CircleQuestionMark className="h-4.5 w-4.5" />
          </button>
        </Hint>
      </div>
    </header>
  );
}
