import { useMemo, useState } from 'react';
import { Search, Skull } from 'lucide-react';
import { useGame } from '../../store/gameStore';
import { controller } from '../../store/controller';
import { ERAS, GOVERNMENTS } from '../../simulation/constants';
import { formatPopulation } from '../../utils/format';
import type { Civ } from '../../types/simulation';
import { CivSwatch, Empty, GovIcon, Hint, StatBar, cx } from '../ui';

type SortKey = 'population' | 'territory' | 'era' | 'stability' | 'age' | 'name';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'population', label: 'Population' },
  { id: 'territory', label: 'Territory' },
  { id: 'era', label: 'Era' },
  { id: 'stability', label: 'Stability' },
  { id: 'age', label: 'Age' },
  { id: 'name', label: 'Name' },
];

function stabilityColor(v: number): string {
  return v > 60 ? '#6fbf8e' : v > 35 ? '#e2c06a' : '#e0533b';
}

function sortCivs(civs: Civ[], key: SortKey): Civ[] {
  const by: Record<SortKey, (a: Civ, b: Civ) => number> = {
    population: (a, b) => b.population - a.population,
    territory: (a, b) => b.tiles - a.tiles,
    era: (a, b) => b.techPoints - a.techPoints,
    stability: (a, b) => b.stability - a.stability,
    age: (a, b) => a.foundedYear - b.foundedYear,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...civs].sort((a, b) => by[key](a, b) || a.id - b.id);
}

export function NationsPanel() {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const selected = useGame((s) => s.selectedCiv);
  const selectCiv = useGame((s) => s.selectCiv);
  const [tab, setTab] = useState<'living' | 'archive'>('living');
  const [sort, setSort] = useState<SortKey>('population');
  const [query, setQuery] = useState('');

  const living = useMemo(() => sortCivs(world.civs.filter((c) => c.alive), sort), [world, version, sort]);
  const fallen = useMemo(() => world.civs.filter((c) => !c.alive).sort((a, b) => (b.extinctYear ?? 0) - (a.extinctYear ?? 0)), [world, version]);
  const q = query.trim().toLowerCase();
  const filter = (c: Civ) => !q || c.name.toLowerCase().includes(q) || c.adjective.toLowerCase().includes(q);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-950/60 p-1">
        {(['living', 'archive'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx('rounded-md py-1.5 text-[0.75rem] font-semibold transition', tab === t ? 'bg-ink-700 text-gold-200 shadow' : 'text-ink-300 hover:text-ink-100')}
          >
            {t === 'living' ? `Living (${living.length})` : `Archive (${fallen.length})`}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input className="field pl-8" placeholder="Search nations…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {tab === 'living' ? (
        <>
          <div className="flex flex-wrap gap-1">
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSort(s.id)} className={cx('chip', sort === s.id ? 'border-gold-400/50 bg-gold-400/15 text-gold-200' : 'hover:text-ink-100')}>
                {s.label}
              </button>
            ))}
          </div>
          <ul className="space-y-1">
            {living.filter(filter).map((civ) => (
              <li key={civ.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectCiv(civ.id);
                    controller.focusCiv(civ.id);
                  }}
                  className={cx(
                    'w-full rounded-lg border px-2.5 py-2 text-left transition',
                    selected === civ.id ? 'border-gold-400/40 bg-gold-400/[0.07]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.03]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CivSwatch civ={civ} size={13} />
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold text-ink-100">{civ.name}</span>
                    <Hint text={GOVERNMENTS[civ.government].name} side="left">
                      <GovIcon gov={civ.government} size={13} />
                    </Hint>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 pl-5 text-[0.68rem] text-ink-300">
                    <span className="num">{formatPopulation(civ.population)}</span>
                    <span className="num">{civ.tiles} prov.</span>
                    <span style={{ color: ERAS[civ.era]!.color }}>{ERAS[civ.era]!.name}</span>
                    <div className="ml-auto w-16">
                      <StatBar value={civ.stability} color={stabilityColor(civ.stability)} height={4} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : fallen.length === 0 ? (
        <Empty>No nation has fallen yet. Give it time — or intervene.</Empty>
      ) : (
        <ul className="space-y-1">
          {fallen.filter(filter).map((civ) => (
            <li key={civ.id}>
              <button
                type="button"
                onClick={() => selectCiv(civ.id)}
                className={cx(
                  'w-full rounded-lg border px-2.5 py-2 text-left transition',
                  selected === civ.id ? 'border-gold-400/40 bg-gold-400/[0.07]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.03]',
                )}
              >
                <div className="flex items-center gap-2">
                  <CivSwatch civ={civ} size={13} />
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold text-ink-200">{civ.name}</span>
                  <Skull className="h-3.5 w-3.5 text-ink-400" />
                </div>
                <div className="mt-1 pl-5 text-[0.68rem] text-ink-400">
                  <span className="num">
                    Year {civ.foundedYear} – {civ.extinctYear} · {(civ.extinctYear ?? world.year) - civ.foundedYear} years
                  </span>
                </div>
                <div className="mt-0.5 truncate pl-5 text-[0.68rem] text-ink-300">{civ.fate}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
