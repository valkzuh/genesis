import { useMemo, useState } from 'react';
import { Crosshair, Flame, Handshake, Sparkles, Swords } from 'lucide-react';
import { useGame } from '../../store/gameStore';
import { controller } from '../../store/controller';
import { summarizeWar } from '../../simulation/queries';
import { CAUSE_LABEL } from '../../simulation/war';
import { allianceBlocs } from '../../rendering/overlay';
import { getRelation, warBetween } from '../../simulation/world';
import { formatNumber } from '../../utils/format';
import { mix, toHex } from '../../utils/color';
import type { Civ, War, World } from '../../types/simulation';
import { CivLink, CivSwatch, Empty, Hint, Section } from '../ui';
import { useThrottledVersion } from '../hooks';

function WarCard({ world, war }: { world: World; war: War }) {
  const s = summarizeWar(world, war);
  const score = Math.max(-100, Math.min(100, war.score));
  const capital = world.cities[world.civs[war.leadDefender]!.capital];
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.05] bg-war/[0.06] px-3 py-2">
        <Swords className="h-3.5 w-3.5 text-war" />
        <span className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold text-ink-100">{war.name}</span>
        <span className="chip text-[0.62rem]">{CAUSE_LABEL[war.cause]}</span>
      </div>
      <div className="space-y-2 px-3 py-2.5 text-[0.74rem]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div className="min-w-0 space-y-0.5">
            {s.attackers.map((c) => (
              <CivLink key={c.id} civ={c} className="w-full" />
            ))}
          </div>
          <span className="pt-0.5 text-[0.65rem] font-semibold uppercase text-ink-400">vs</span>
          <div className="min-w-0 space-y-0.5 text-right">
            {s.defenders.map((c) => (
              <CivLink key={c.id} civ={c} className="w-full justify-end" />
            ))}
          </div>
        </div>
        <Hint text={`War score ${Math.round(score)} (positive favours the attackers)`} className="w-full">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
            <div
              className="absolute inset-y-0 rounded-full"
              style={
                score >= 0
                  ? { left: '50%', width: `${score / 2}%`, background: toHex(s.attackers[0]?.color ?? 0xe0533b) }
                  : { right: '50%', width: `${-score / 2}%`, background: toHex(s.defenders[0]?.color ?? 0x5fb37a) }
              }
            />
          </div>
        </Hint>
        <div className="flex items-center justify-between text-[0.68rem] text-ink-300">
          <span className="num">
            {s.duration} {s.duration === 1 ? 'year' : 'years'} · {formatNumber(s.casualties.attacker + s.casualties.defender)} dead
          </span>
          <span className="flex items-center gap-1">
            {capital && (
              <button type="button" className="icon-btn h-6 w-6" title="Show on map" onClick={() => controller.focusTile(capital.tile)}>
                <Crosshair className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" className="icon-btn h-6 w-6" title="Force peace (God Mode)" onClick={() => controller.command({ type: 'force_peace', war: war.id })}>
              <Sparkles className="h-3.5 w-3.5 text-gold-300" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function opinionColor(op: number): string {
  if (op >= 0) return toHex(mix(0x3a4252, 0x5fb37a, Math.min(1, op / 80)));
  return toHex(mix(0x3a4252, 0xd4553f, Math.min(1, -op / 80)));
}

function RelationMatrix({ world, civs }: { world: World; civs: Civ[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const n = civs.length;
  if (n < 2) return <Empty>Too few nations for a matrix.</Empty>;
  const cell = Math.max(9, Math.min(18, Math.floor(250 / n)));
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-px" style={{ gridTemplateColumns: `14px repeat(${n}, ${cell}px)` }}>
          <div />
          {civs.map((c) => (
            <div key={`h${c.id}`} className="flex items-end justify-center pb-0.5">
              <CivSwatch civ={c} size={Math.min(10, cell - 2)} />
            </div>
          ))}
          {civs.map((row) => (
            <div key={`r${row.id}`} className="contents">
              <div className="flex items-center justify-center">
                <CivSwatch civ={row} size={Math.min(10, cell - 2)} />
              </div>
              {civs.map((col) => {
                if (row.id === col.id) return <div key={col.id} style={{ height: cell }} className="rounded-[2px] bg-white/[0.03]" />;
                const rel = getRelation(world, row.id, col.id);
                const war = warBetween(world, row.id, col.id);
                const label = rel
                  ? `${row.baseName} ↔ ${col.baseName}: opinion ${Math.round(rel.opinion)}${war ? ' · AT WAR' : ''}${rel.alliance ? ' · allied' : ''}${rel.rivalry ? ' · rivals' : ''}${rel.trade ? ' · trade' : ''}`
                  : `${row.baseName} and ${col.baseName} have not met`;
                return (
                  <div
                    key={col.id}
                    onMouseEnter={() => setHover(label)}
                    onMouseLeave={() => setHover(null)}
                    className="relative grid place-items-center rounded-[2px]"
                    style={{ height: cell, background: war ? '#c0412c' : rel ? opinionColor(rel.opinion) : 'rgba(255,255,255,0.02)' }}
                  >
                    {rel?.alliance && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
                    {war && <span className="text-[8px] font-bold leading-none text-white">✕</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 min-h-[1.2rem] text-[0.68rem] text-ink-300">{hover ?? 'Hover a cell to see how two nations regard each other.'}</div>
    </div>
  );
}

export function DiplomacyPanel() {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const wars = useMemo(() => [...world.cache.activeWars].sort((a, b) => a.startYear - b.startYear), [world, version]);
  const blocs = useMemo(() => allianceBlocs(world), [world, version]);
  const slow = useThrottledVersion(1200);
  const living = useMemo(() => world.civs.filter((c) => c.alive).sort((a, b) => b.population - a.population).slice(0, 24), [world, slow]);
  const rivalries = useMemo(() => world.relations.filter((r) => r.rivalry), [world, version]);
  const recent = useMemo(() => world.wars.filter((w) => w.endYear !== null).slice(-6).reverse(), [world, version]);

  return (
    <div className="space-y-6">
      <Section title={`Active Wars (${wars.length})`}>
        {wars.length === 0 ? <Empty>The world is at peace — for now.</Empty> : <div className="space-y-2">{wars.map((w) => <WarCard key={w.id} world={world} war={w} />)}</div>}
      </Section>

      <Section title={`Alliance Blocs (${blocs.length})`}>
        {blocs.length === 0 ? (
          <Empty>No alliances have been forged.</Empty>
        ) : (
          <div className="space-y-2">
            {blocs.map((b, i) => (
              <div key={b.name + i} className="card px-3 py-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold text-peace">
                  <Handshake className="h-3.5 w-3.5" /> {b.name}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.74rem]">
                  {b.members.map((id) => (
                    <CivLink key={id} civ={world.civs[id]!} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Rivalries (${rivalries.length})`}>
        {rivalries.length === 0 ? (
          <Empty>No bitter rivalries yet.</Empty>
        ) : (
          <div className="space-y-1">
            {rivalries.map((r) => (
              <div key={`${r.a}-${r.b}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[0.74rem] hover:bg-white/[0.03]">
                <CivLink civ={world.civs[r.a]!} className="min-w-0 flex-1" />
                <Flame className="h-3.5 w-3.5 shrink-0 text-[#e08a3c]" />
                <CivLink civ={world.civs[r.b]!} className="min-w-0 flex-1 justify-end" />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Relations Matrix">
        <RelationMatrix world={world} civs={living} />
      </Section>

      <Section title="Recent Peace Treaties">
        {recent.length === 0 ? (
          <Empty>No war has ended yet.</Empty>
        ) : (
          <div className="space-y-1.5">
            {recent.map((w) => (
              <div key={w.id} className="rounded-lg px-2 py-1.5 text-[0.73rem] leading-snug text-ink-200 hover:bg-white/[0.03]">
                <span className="num mr-1.5 text-gold-300/90">{w.endYear}</span>
                {w.summary}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
