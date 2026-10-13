import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useGame } from '../../store/gameStore';
import { controller } from '../../store/controller';
import type { EventType, HistoryEvent } from '../../types/simulation';
import { CivSwatch, Empty, EventIcon, cx } from '../ui';
import { useThrottledVersion } from '../hooks';

export const EVENT_CATEGORIES: { id: string; label: string; types: EventType[]; color: string }[] = [
  { id: 'war', label: 'War', types: ['war', 'battle', 'peace', 'conquest', 'civil_war'], color: '#e0533b' },
  { id: 'politics', label: 'Politics', types: ['revolution', 'reform', 'secession', 'collapse', 'leader', 'founding'], color: '#e8a0d8' },
  { id: 'diplomacy', label: 'Diplomacy', types: ['alliance', 'diplomacy', 'trade', 'rivalry'], color: '#5fb37a' },
  { id: 'progress', label: 'Progress', types: ['technology', 'golden_age', 'city', 'exploration'], color: '#6fb3e0' },
  { id: 'catastrophe', label: 'Catastrophe', types: ['famine', 'plague', 'disaster'], color: '#b88ae0' },
  { id: 'divine', label: 'Divine', types: ['divine'], color: '#ffe9a8' },
];

const PAGE = 120;

export function EventRow({ e, showCivs = true }: { e: HistoryEvent; showCivs?: boolean }) {
  const world = useGame((s) => s.world)!;
  const selectCiv = useGame((s) => s.selectCiv);
  return (
    <button
      type="button"
      onClick={() => {
        if (e.tile >= 0) controller.focusTile(e.tile);
        const first = e.civs[0];
        if (first !== undefined && world.civs[first]) selectCiv(first);
      }}
      className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]"
    >
      <span className="mt-0.5">
        <EventIcon type={e.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.74rem] leading-snug text-ink-200 group-hover:text-ink-100">{e.text}</span>
        {showCivs && e.civs.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {e.civs.slice(0, 4).map((id) => {
              const civ = world.civs[id];
              return civ ? <CivSwatch key={id} civ={civ} size={8} /> : null;
            })}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 pt-0.5">
        {Array.from({ length: e.importance }, (_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-gold-400/70" />
        ))}
      </span>
    </button>
  );
}

export function HistoryPanel() {
  const world = useGame((s) => s.world)!;
  const version = useThrottledVersion(900);
  const selected = useGame((s) => s.selectedCiv);
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<Set<string>>(() => new Set(EVENT_CATEGORIES.map((c) => c.id)));
  const [minImportance, setMinImportance] = useState(2);
  const [onlySelected, setOnlySelected] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const types = new Set<EventType>();
    for (const c of EVENT_CATEGORIES) if (cats.has(c.id)) for (const t of c.types) types.add(t);
    const q = query.trim().toLowerCase();
    const out: HistoryEvent[] = [];
    for (let i = world.events.length - 1; i >= 0; i--) {
      const e = world.events[i]!;
      if (e.importance < minImportance || !types.has(e.type)) continue;
      if (onlySelected && selected !== null && !e.civs.includes(selected)) continue;
      if (q && !e.text.toLowerCase().includes(q) && !String(e.year).startsWith(q)) continue;
      out.push(e);
    }
    return out;
  }, [world, version, cats, query, minImportance, onlySelected, selected]);

  const shown = filtered.slice(0, limit);
  const groups: { century: number; events: HistoryEvent[] }[] = [];
  for (const e of shown) {
    const century = Math.floor((e.year - 1) / 100);
    const last = groups[groups.length - 1];
    if (last && last.century === century) last.events.push(e);
    else groups.push({ century, events: [e] });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input className="field pl-8" placeholder="Search history (names, places, years)…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1">
        {EVENT_CATEGORIES.map((c) => {
          const on = cats.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                const next = new Set(cats);
                if (on) next.delete(c.id);
                else next.add(c.id);
                setCats(next);
                setLimit(PAGE);
              }}
              className={cx('chip transition', !on && 'opacity-45')}
              style={on ? { color: c.color, borderColor: `${c.color}66`, background: `${c.color}18` } : undefined}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[0.72rem] text-ink-300">
        <label className="flex flex-1 items-center gap-2">
          <span className="shrink-0">Significance</span>
          <input type="range" min={1} max={5} value={minImportance} onChange={(e) => setMinImportance(Number(e.target.value))} className="flex-1" />
          <span className="num w-3 text-gold-200">{minImportance}+</span>
        </label>
        <label className={cx('flex items-center gap-1.5', selected === null && 'opacity-40')}>
          <input type="checkbox" checked={onlySelected} disabled={selected === null} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-[#e2c06a]" />
          Selected nation
        </label>
      </div>
      <div className="text-[0.68rem] text-ink-400">
        {filtered.length.toLocaleString('en-US')} of {world.events.length.toLocaleString('en-US')} recorded events
      </div>
      {groups.length === 0 ? (
        <Empty>No events match these filters.</Empty>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.century + ':' + g.events[0]!.id}>
              <div className="sticky top-[-1rem] z-10 -mx-1 mb-1 bg-ink-850/95 px-1 py-1 backdrop-blur">
                <span className="eyebrow text-gold-300/80">
                  Years {g.century * 100 + 1}–{(g.century + 1) * 100}
                </span>
              </div>
              {g.events.map((e) => (
                <div key={e.id} className="flex gap-1">
                  <span className="num w-9 shrink-0 pt-1.5 text-right text-[0.68rem] text-gold-300/80">{e.year}</span>
                  <div className="min-w-0 flex-1">
                    <EventRow e={e} />
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filtered.length > limit && (
            <button type="button" className="btn w-full" onClick={() => setLimit(limit + PAGE)}>
              Show older events
            </button>
          )}
        </div>
      )}
    </div>
  );
}
