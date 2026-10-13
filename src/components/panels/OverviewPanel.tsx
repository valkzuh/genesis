import { useMemo, useState } from 'react';
import { Castle, Coins, Crown, FlaskConical, Landmark, Shield, Swords, Users } from 'lucide-react';
import { useGame } from '../../store/gameStore';
import { controller } from '../../store/controller';
import { RANK_METRICS, metricValue, rankCivs, worldStats, type RankMetric } from '../../simulation/queries';
import { ERAS } from '../../simulation/constants';
import { formatNumber, formatPopulation } from '../../utils/format';
import { toHex } from '../../utils/color';
import { TrendChart } from '../charts';
import { CivLink, EventIcon, Section, Stat, cx } from '../ui';

function formatMetric(metric: RankMetric, v: number): string {
  switch (metric) {
    case 'population':
      return formatPopulation(v);
    case 'territory':
      return `${Math.round(v)} prov.`;
    case 'stability':
      return `${Math.round(v)}%`;
    case 'technology':
      return `${formatNumber(v)} rp`;
    default:
      return formatNumber(v);
  }
}

export function OverviewPanel() {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const [metric, setMetric] = useState<RankMetric>('population');
  const stats = useMemo(() => worldStats(world), [world, version]);
  const ranking = useMemo(() => rankCivs(world, metric).slice(0, 10), [world, version, metric]);
  const history = useMemo(() => world.history.map((h) => ({ y: h.y, pop: h.pop, civs: h.civs, wars: h.wars, era: h.avgEra })), [world, version]);
  const eraCounts = useMemo(() => {
    const counts = ERAS.map(() => 0);
    for (const c of world.civs) if (c.alive) counts[c.era]!++;
    return counts;
  }, [world, version]);
  const major = useMemo(() => {
    const out = [];
    for (let i = world.events.length - 1; i >= 0 && out.length < 8; i--) {
      const e = world.events[i]!;
      if (e.importance >= 4) out.push(e);
    }
    return out;
  }, [world, version]);
  const top = ranking[0] ? metricValue(ranking[0], metric) : 1;

  const leaders: { label: string; icon: React.ReactNode; civ: typeof stats.largest; value: string }[] = [
    { label: 'Largest', icon: <Castle />, civ: stats.largest, value: stats.largest ? `${stats.largest.tiles} provinces` : '' },
    { label: 'Most populous', icon: <Users />, civ: stats.mostPopulous, value: stats.mostPopulous ? formatPopulation(stats.mostPopulous.population) : '' },
    { label: 'Wealthiest', icon: <Coins />, civ: stats.wealthiest, value: stats.wealthiest ? `${formatNumber(stats.wealthiest.wealth)} gold` : '' },
    { label: 'Most advanced', icon: <FlaskConical />, civ: stats.mostAdvanced, value: stats.mostAdvanced ? ERAS[stats.mostAdvanced.era]!.name : '' },
    { label: 'Mightiest army', icon: <Shield />, civ: stats.strongest, value: stats.strongest ? `${formatNumber(stats.strongest.army)} soldiers` : '' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Year" icon={<Crown />} value={world.year.toLocaleString('en-US')} sub={`${ERAS[stats.maxEra]!.name} age at the frontier`} />
        <Stat label="Population" icon={<Users />} value={formatPopulation(stats.population)} sub={`${stats.cities} cities`} />
        <Stat label="Nations" icon={<Landmark />} value={stats.living} sub={`${stats.total - stats.living} fallen in history`} />
        <Stat label="Active wars" icon={<Swords />} value={stats.wars} accent={stats.wars > 0 ? '#f08a73' : undefined} sub={`${world.wars.length} wars recorded`} />
      </div>

      <Section title="Leading Powers">
        <div className="space-y-1">
          {leaders.map((l) => (
            <div key={l.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.78rem] hover:bg-white/[0.03]">
              <span className="text-ink-400 [&>svg]:h-3.5 [&>svg]:w-3.5">{l.icon}</span>
              <span className="w-24 shrink-0 text-ink-300">{l.label}</span>
              {l.civ ? <CivLink civ={l.civ} focus className="min-w-0 flex-1 font-medium" /> : <span className="flex-1 text-ink-400">—</span>}
              <span className="num shrink-0 text-[0.7rem] text-ink-300">{l.value}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="World Population">
        <TrendChart data={history} series={[{ key: 'pop', name: 'Population', color: '#e2c06a' }]} area height={130} format={(v) => formatPopulation(v)} />
      </Section>

      <Section title="Nations & Wars">
        <TrendChart
          data={history}
          series={[
            { key: 'civs', name: 'Nations', color: '#7fb6e0' },
            { key: 'wars', name: 'Wars', color: '#e0533b' },
          ]}
          height={110}
          format={(v) => `${Math.round(v)}`}
        />
      </Section>

      <Section title="Rankings">
        <div className="flex flex-wrap gap-1">
          {RANK_METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={cx('chip transition', metric === m.id ? 'border-gold-400/50 bg-gold-400/15 text-gold-200' : 'hover:text-ink-100')}
            >
              {m.label}
            </button>
          ))}
        </div>
        <ol className="space-y-1">
          {ranking.map((civ, i) => {
            const v = metricValue(civ, metric);
            return (
              <li key={civ.id} className="group rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                <div className="flex items-center gap-2 text-[0.78rem]">
                  <span className="num w-4 text-right text-[0.7rem] text-ink-400">{i + 1}</span>
                  <CivLink civ={civ} focus className="min-w-0 flex-1" />
                  <span className="num text-[0.72rem] text-ink-200">{formatMetric(metric, v)}</span>
                </div>
                <div className="ml-6 mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, (v / Math.max(1e-9, top)) * 100)}%`, background: toHex(civ.color) }} />
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Technological Ages">
        <div className="space-y-1">
          {ERAS.map((era, i) => (
            <div key={era.name} className="flex items-center gap-2 text-[0.72rem]">
              <span className={cx('w-24 shrink-0', eraCounts[i]! > 0 ? 'text-ink-200' : 'text-ink-500')}>{era.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div className="h-full rounded-full" style={{ width: `${(eraCounts[i]! / Math.max(1, stats.living)) * 100}%`, background: era.color }} />
              </div>
              <span className="num w-5 text-right text-ink-300">{eraCounts[i]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Major Events">
        <div className="space-y-1.5">
          {major.length === 0 && <div className="text-[0.75rem] text-ink-400">History is yet to be written. Press play.</div>}
          {major.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => e.tile >= 0 && controller.focusTile(e.tile)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[0.74rem] leading-snug hover:bg-white/[0.04]"
            >
              <span className="mt-0.5">
                <EventIcon type={e.type} />
              </span>
              <span className="min-w-0 flex-1 text-ink-200">
                <span className="num mr-1.5 text-gold-300/90">{e.year}</span>
                {e.text}
              </span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
