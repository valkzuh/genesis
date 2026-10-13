import { useEffect, useMemo, useState } from 'react';
import { Bird, Bug, Coins, Crosshair, Flag, FlaskConical, Mountain, Sparkles, Sun, Swords, TrendingUp, WavesHorizontal, Wheat, Zap } from 'lucide-react';
import { useGame, type GodTool } from '../../store/gameStore';
import { controller } from '../../store/controller';
import type { Command, World } from '../../types/simulation';
import { CivSwatch, Empty, Hint, Section, cx } from '../ui';
import { GOD_TOOLS } from '../godTools';

const CIV_POWERS: { type: 'grant_resources' | 'economic_boom' | 'tech_boost' | 'destabilize' | 'bless'; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  { type: 'grant_resources', label: 'Bestow Riches', description: 'Grain, gold, iron, timber and stone rain from the heavens.', icon: <Coins />, color: '#f0d78c' },
  { type: 'economic_boom', label: 'Economic Boom', description: 'Production and trade surge for 25 years.', icon: <TrendingUp />, color: '#7fd3a0' },
  { type: 'tech_boost', label: 'Gift of Knowledge', description: 'A scientific revolution: a leap in research.', icon: <FlaskConical />, color: '#6fb3e0' },
  { type: 'bless', label: 'Divine Favour', description: 'Stability, happiness and an end to plague.', icon: <Sun />, color: '#f6d36b' },
  { type: 'destabilize', label: 'Sow Discord', description: 'Omens and unrest; revolution may follow.', icon: <Zap />, color: '#e05a8a' },
];

const MAP_POWER_ICONS: Record<GodTool, React.ReactNode> = {
  spawn_civ: <Flag />,
  famine: <Wheat />,
  plague: <Bug />,
  earthquake: <Mountain />,
  flood: <WavesHorizontal />,
};

function CivSelect({ world, value, onChange, label, exclude }: { world: World; value: number | null; onChange: (id: number) => void; label: string; exclude?: number | null }) {
  const living = world.civs.filter((c) => c.alive && c.id !== exclude).sort((a, b) => a.name.localeCompare(b.name));
  const current = value !== null ? world.civs[value] : undefined;
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="relative mt-1">
        {current && current.alive && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
            <CivSwatch civ={current} size={11} />
          </span>
        )}
        <select className={cx('field appearance-none', current && 'pl-7')} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
          <option value="" disabled>
            Choose a nation…
          </option>
          {living.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function describe(world: World, cmd: Command): string {
  const civ = (id: number) => world.civs[id]?.name ?? 'a lost nation';
  const at = (tile: number) => {
    const o = world.owner[tile];
    return o !== undefined && o >= 0 ? ` on the ${civ(o)}` : '';
  };
  switch (cmd.type) {
    case 'spawn_civ':
      return 'Raised a new nation';
    case 'grant_resources':
      return `Bestowed riches on the ${civ(cmd.civ)}`;
    case 'economic_boom':
      return `Economic boom for the ${civ(cmd.civ)}`;
    case 'famine':
      return `Famine${at(cmd.tile)}`;
    case 'plague':
      return `Plague${at(cmd.tile)}`;
    case 'earthquake':
      return `Earthquake${at(cmd.tile)}`;
    case 'flood':
      return `Great flood${at(cmd.tile)}`;
    case 'force_war':
      return `Forced the ${civ(cmd.attacker)} to war on the ${civ(cmd.defender)}`;
    case 'force_peace':
      return `Imposed peace on the ${world.wars[cmd.war]?.name ?? 'war'}`;
    case 'tech_boost':
      return `Gift of knowledge to the ${civ(cmd.civ)}`;
    case 'destabilize':
      return `Sowed discord in the ${civ(cmd.civ)}`;
    case 'bless':
      return `Blessed the ${civ(cmd.civ)}`;
  }
}

export function GodPanel() {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const godCiv = useGame((s) => s.godCiv);
  const godTool = useGame((s) => s.godTool);
  const [attacker, setAttacker] = useState<number | null>(null);
  const [defender, setDefender] = useState<number | null>(null);

  const target = godCiv !== null && world.civs[godCiv]?.alive ? godCiv : null;
  useEffect(() => {
    if (target === null) {
      const first = world.civs.find((c) => c.alive);
      if (first) useGame.setState({ godCiv: first.id });
    }
  }, [target, world, version]);
  const wars = useMemo(() => [...world.cache.activeWars], [world, version]);
  const log = useMemo(() => world.commandLog.slice(-12).reverse(), [world, version]);

  const run = (cmd: Command) => controller.command(cmd);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gold-500/25 bg-gradient-to-br from-gold-500/[0.08] to-transparent px-3.5 py-3 text-[0.74rem] leading-relaxed text-ink-200">
        <div className="mb-1 flex items-center gap-1.5 font-display text-[0.78rem] font-bold tracking-[0.12em] text-gold-300">
          <Sparkles className="h-3.5 w-3.5" /> YOU ARE THE OBSERVER
        </div>
        Every power below changes the simulation itself, and every intervention is written into the chronicle of history.
      </div>

      <Section title="Bless or Curse a Nation">
        <CivSelect world={world} value={target} onChange={(id) => useGame.setState({ godCiv: id })} label="Target nation" />
        <div className="grid grid-cols-1 gap-1.5">
          {CIV_POWERS.map((p) => (
            <button
              key={p.type}
              type="button"
              disabled={target === null}
              onClick={() => target !== null && run({ type: p.type, civ: target })}
              className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left transition hover:border-white/15 hover:bg-white/[0.05] disabled:opacity-40"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4" style={{ background: `${p.color}1f`, color: p.color }}>
                {p.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8rem] font-semibold text-ink-100">{p.label}</span>
                <span className="block text-[0.68rem] text-ink-400">{p.description}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Powers over the Land">
        <p className="-mt-1 text-[0.7rem] text-ink-400">Choose a power, then click a place on the map.</p>
        <div className="grid grid-cols-1 gap-1.5">
          {(Object.keys(GOD_TOOLS) as GodTool[]).map((id) => {
            const t = GOD_TOOLS[id];
            const active = godTool === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => useGame.setState({ godTool: active ? null : id })}
                className={cx(
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                  active ? 'animate-glow border-gold-400/60 bg-gold-400/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]',
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4" style={{ background: `${t.css}1f`, color: t.css }}>
                  {MAP_POWER_ICONS[id]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8rem] font-semibold text-ink-100">{t.label}</span>
                  <span className="block text-[0.68rem] text-ink-400">{t.description}</span>
                </span>
                {active && <Crosshair className="h-4 w-4 text-gold-300" />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="War and Peace">
        <div className="grid grid-cols-2 gap-2">
          <CivSelect world={world} value={attacker} onChange={setAttacker} label="Aggressor" exclude={defender} />
          <CivSelect world={world} value={defender} onChange={setDefender} label="Victim" exclude={attacker} />
        </div>
        <button
          type="button"
          className="btn btn-danger w-full"
          disabled={attacker === null || defender === null || attacker === defender}
          onClick={() => attacker !== null && defender !== null && run({ type: 'force_war', attacker, defender })}
        >
          <Swords className="h-4 w-4" /> Compel War
        </button>
        {wars.length === 0 ? (
          <Empty>No wars to end.</Empty>
        ) : (
          <div className="space-y-1">
            {wars.map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.74rem] hover:bg-white/[0.03]">
                <Swords className="h-3.5 w-3.5 shrink-0 text-war" />
                <span className="min-w-0 flex-1 truncate text-ink-200">{w.name}</span>
                <Hint text="End this war by divine decree" side="left">
                  <button type="button" className="btn py-1 text-[0.7rem]" onClick={() => run({ type: 'force_peace', war: w.id })}>
                    <Bird className="h-3.5 w-3.5" /> Impose peace
                  </button>
                </Hint>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Interventions (${world.commandLog.length})`}>
        {log.length === 0 ? (
          <Empty>You have not yet intervened in this world.</Empty>
        ) : (
          <div className="space-y-1">
            {log.map((r, i) => (
              <div key={`${r.year}-${i}`} className="flex gap-2 rounded-lg px-2 py-1 text-[0.72rem] text-ink-300">
                <span className="num w-10 shrink-0 text-right text-gold-300/80">{r.year}</span>
                <span className="min-w-0 flex-1">{describe(world, r.command)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
