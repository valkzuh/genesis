import { useMemo } from 'react';
import {
  Castle,
  Coins,
  Crosshair,
  Crown,
  FlaskConical,
  Hammer,
  Heart,
  MapPin,
  Mountain,
  Pickaxe,
  Scale,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Swords,
  TreePine,
  Trophy,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import { useGame, type InspectorTab } from '../store/gameStore';
import { controller } from '../store/controller';
import type { Civ, World } from '../types/simulation';
import { ERAS, GOVERNMENTS, LEADER_TRAITS, PERSONALITIES } from '../simulation/constants';
import { accomplishments, citiesOfCiv, civEvents, originText, overextension, relationsOf, summarizeWar, tileInfo, warsOfCiv } from '../simulation/queries';
import { eraProgress } from '../simulation/technology';
import { leaderDisplayName } from '../simulation/civs';
import { CAUSE_LABEL } from '../simulation/war';
import { effectMagnitude } from '../simulation/economy';
import { formatNumber, formatPopulation, signed } from '../utils/format';
import { colorWithAlpha, toHex } from '../utils/color';
import { TrendChart } from './charts';
import { CivLink, Empty, GovIcon, Hint, Pill, Section, Stat, StatBar, cx } from './ui';
import { EventRow } from './panels/HistoryPanel';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'economy', label: 'Economy' },
  { id: 'diplomacy', label: 'Diplomacy' },
  { id: 'history', label: 'History' },
];

function meterColor(v: number): string {
  return v > 60 ? '#6fbf8e' : v > 35 ? '#e2c06a' : '#e0533b';
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Hint text={hint} className="block w-full">
      <div className="w-full">
        <div className="mb-1 flex items-center justify-between text-[0.7rem]">
          <span className="text-ink-300">{label}</span>
          <span className="num font-semibold" style={{ color: meterColor(value) }}>
            {Math.round(value)}%
          </span>
        </div>
        <StatBar value={value} color={meterColor(value)} />
      </div>
    </Hint>
  );
}

function CivHeader({ world, civ }: { world: World; civ: Civ }) {
  const gov = GOVERNMENTS[civ.government];
  const pers = PERSONALITIES[civ.personality];
  const age = (civ.extinctYear ?? world.year) - civ.foundedYear;
  const atWar = world.cache.activeWars.some((w) => w.participants.some((p) => p.civ === civ.id && p.left === null));
  const golden = effectMagnitude(civ, 'golden_age') > 0;
  const boom = effectMagnitude(civ, 'boom') > 0;
  const lt = LEADER_TRAITS[civ.leader.trait];
  return (
    <div className="relative overflow-hidden border-b border-white/[0.06]">
      <div className="absolute inset-0 opacity-90" style={{ background: `linear-gradient(135deg, ${colorWithAlpha(civ.color, 0.38)}, transparent 70%)` }} />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: toHex(civ.color) }} />
      <div className="relative px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg ring-1 ring-black/40" style={{ background: `linear-gradient(145deg, ${toHex(civ.color)}, ${colorWithAlpha(civ.color, 0.6)})` }}>
            {civ.alive ? <GovIcon gov={civ.government} size={20} /> : <Skull className="h-5 w-5 text-ink-950/80" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.08rem] font-bold leading-tight tracking-wide text-parchment">{civ.name}</h2>
            <div className="mt-0.5 text-[0.7rem] text-ink-300">
              {gov.name} · {pers.name} · {civ.adjective} people
            </div>
          </div>
          <div className="-mr-2 -mt-1 flex">
            {civ.alive && (
              <Hint text="Show on map (F)" side="bottom">
                <button type="button" className="icon-btn" aria-label="Show on map" onClick={() => controller.focusCiv(civ.id)}>
                  <Crosshair className="h-4 w-4" />
                </button>
              </Hint>
            )}
            {civ.alive && (
              <Hint text="Divine intervention" side="bottom">
                <button type="button" className="icon-btn" aria-label="God mode" onClick={() => useGame.setState({ panel: 'god', godCiv: civ.id })}>
                  <Sparkles className="h-4 w-4 text-gold-300" />
                </button>
              </Hint>
            )}
            <button type="button" className="icon-btn" aria-label="Close inspector" onClick={() => useGame.setState({ inspectorOpen: false, selectedCiv: null, selectedTile: null })}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          <Pill color={ERAS[civ.era]!.color}>{ERAS[civ.era]!.name} era</Pill>
          {!civ.alive && <Pill color="#d8d2c4">Fallen</Pill>}
          {atWar && <Pill color="#e0533b">At war</Pill>}
          {golden && <Pill color="#f6d36b">Golden age</Pill>}
          {boom && <Pill color="#7fd3a0">Economic boom</Pill>}
          {civ.plague > 0 && <Pill color="#9fd16a">Plague</Pill>}
          {civ.famineYears > 0 && <Pill color="#d9b25a">Famine</Pill>}
          {civ.alive && civ.stability < 25 && <Pill color="#e05a8a">Unrest</Pill>}
        </div>
        {civ.alive ? (
          <div className="mt-3 flex items-center gap-2 text-[0.74rem]">
            <Crown className="h-3.5 w-3.5 shrink-0 text-gold-400" />
            <span className="min-w-0 truncate text-ink-100">{leaderDisplayName(civ.leader)}</span>
            <Hint text={lt.description} side="bottom">
              <span className="chip text-[0.62rem]">{lt.name}</span>
            </Hint>
            <span className="ml-auto shrink-0 text-[0.68rem] text-ink-400">since {civ.leader.since}</span>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[0.74rem] text-ink-200">
            <span className="font-semibold text-parchment">Fell in year {civ.extinctYear}</span> after {age} years. <span className="text-ink-300">{civ.fate}</span>
          </div>
        )}
        <div className="mt-2 text-[0.68rem] text-ink-400">
          Founded year {civ.foundedYear} · {age} years of history · {originText(world, civ)}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ world, civ }: { world: World; civ: Civ }) {
  const version = useGame((s) => s.version);
  const history = useMemo(() => civ.history.map((h) => ({ y: h.y, pop: h.pop, tiles: h.tiles, tech: h.tech, stab: h.stab })), [civ, version]);
  const cities = useMemo(() => citiesOfCiv(world, civ.id).slice(0, 6), [world, civ, version]);
  const deeds = useMemo(() => accomplishments(world, civ).slice(-10).reverse(), [world, civ, version]);
  const capital = world.cities[civ.capital];
  const progress = eraProgress(civ);
  const over = overextension(civ);
  return (
    <div className="space-y-5">
      {civ.alive ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Population" icon={<Users />} value={formatPopulation(civ.population)} sub={`Peak ${formatPopulation(civ.counters.peakPopulation)}`} />
            <Stat label="Territory" icon={<Mountain />} value={`${civ.tiles} prov.`} sub={`${civ.cityCount} cities${over > 1.05 ? ` · overstretched ×${over.toFixed(1)}` : ''}`} />
            <Stat label="Treasury" icon={<Coins />} value={formatNumber(civ.wealth)} sub={`Revenue ${formatNumber(civ.revenue)}/yr`} />
            <Stat label="Military" icon={<Shield />} value={formatNumber(civ.army)} sub={`Strength ${formatNumber(civ.armyPower)}`} />
          </div>
          <div className="card space-y-3 px-3 py-3">
            <Hint text={civ.era < ERAS.length - 1 ? `${Math.round(progress * 100)}% of the way to the ${ERAS[civ.era + 1]!.name} era · ${civ.researchRate.toFixed(1)} research/yr` : 'The final era'} className="block w-full">
              <div className="w-full">
                <div className="mb-1 flex items-center justify-between text-[0.7rem]">
                  <span className="flex items-center gap-1.5 text-ink-300">
                    <FlaskConical className="h-3.5 w-3.5" /> {ERAS[civ.era]!.name} era
                  </span>
                  <span className="text-ink-400">{civ.era < ERAS.length - 1 ? `→ ${ERAS[civ.era + 1]!.name}` : 'Pinnacle'}</span>
                </div>
                <StatBar value={progress * 100} color={ERAS[civ.era]!.color} />
              </div>
            </Hint>
            <Meter label="Stability" value={civ.stability} hint="Political order. Low stability breeds revolutions, secession, civil war and collapse." />
            <Meter label="Happiness" value={civ.happiness} hint="How well the people live: food, prosperity, taxes, war and plague." />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Peak population" icon={<Users />} value={formatPopulation(civ.counters.peakPopulation)} sub={`in year ${civ.counters.peakPopulationYear}`} />
          <Stat label="Greatest extent" icon={<Mountain />} value={`${civ.counters.peakTiles} prov.`} sub={`in year ${civ.counters.peakTilesYear}`} />
          <Stat label="Wars won" icon={<Trophy />} value={civ.counters.warsWon} sub={`${civ.counters.warsLost} lost`} />
          <Stat label="Last era" icon={<FlaskConical />} value={ERAS[civ.era]!.name} />
        </div>
      )}

      <Section title="Population">
        <TrendChart data={history} series={[{ key: 'pop', name: 'Population', color: toHex(civ.color) }]} area height={110} format={(v) => formatPopulation(v)} />
      </Section>
      <Section title="Territory & Stability">
        <TrendChart
          data={history}
          series={[
            { key: 'tiles', name: 'Provinces', color: '#e2c06a' },
            { key: 'stab', name: 'Stability', color: '#7fb6e0' },
          ]}
          height={100}
          format={(v) => `${Math.round(v)}`}
        />
      </Section>

      {civ.alive && (
        <Section title="Cities">
          <div className="space-y-1">
            {cities.map((c) => (
              <button key={c.id} type="button" onClick={() => controller.focusTile(c.tile, 4)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[0.75rem] hover:bg-white/[0.04]">
                {c.id === civ.capital ? <Crown className="h-3.5 w-3.5 text-gold-400" /> : <Castle className="h-3.5 w-3.5 text-ink-400" />}
                <span className="min-w-0 flex-1 truncate text-ink-100">{c.name}</span>
                {c.owner !== c.founder && <span className="chip text-[0.6rem]">captured</span>}
                <span className="num text-ink-300">{formatPopulation(world.pop[c.tile]!)}</span>
              </button>
            ))}
            {capital && cities.length === 0 && <Empty>No cities.</Empty>}
          </div>
        </Section>
      )}

      <Section title="Historical Accomplishments">
        {deeds.length === 0 ? (
          <Empty>No deeds recorded yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {deeds.map((d, i) => (
              <li key={`${d.year}-${i}`} className="flex gap-2 text-[0.74rem] leading-snug">
                <span className="num w-10 shrink-0 text-right text-gold-300/80">{d.year}</span>
                <span className="text-ink-200">{d.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ResourceRow({ icon, label, value, need, detail }: { icon: React.ReactNode; label: string; value: string; need: number; detail?: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.75rem]">
      <span className="text-ink-400 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="w-14 text-ink-300">{label}</span>
      <span className="num w-16 text-ink-100">{value}</span>
      <div className="flex-1">
        <Hint text={need > 0.5 ? 'Shortage — this nation needs more' : 'Supply is adequate'} className="block w-full">
          <StatBar value={(1 - need) * 100} color={need > 0.6 ? '#e0533b' : need > 0.3 ? '#e2c06a' : '#6fbf8e'} height={4} className="w-full" />
        </Hint>
      </div>
      {detail && <span className="num w-14 text-right text-[0.68rem] text-ink-400">{detail}</span>}
    </div>
  );
}

function EconomyTab({ civ }: { civ: Civ }) {
  const version = useGame((s) => s.version);
  const history = useMemo(() => civ.history.map((h) => ({ y: h.y, wealth: h.wealth, output: h.output, army: h.army })), [civ, version]);
  const b = civ.budget;
  const savings = Math.max(0, 1 - b.military - b.research - b.development);
  const parts = [
    { label: 'Military', value: b.military, color: '#e0533b' },
    { label: 'Research', value: b.research, color: '#6fb3e0' },
    { label: 'Development', value: b.development, color: '#e2c06a' },
    { label: 'Savings', value: savings, color: '#6fbf8e' },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Economic output" icon={<Hammer />} value={formatNumber(civ.output)} sub="per year" />
        <Stat label="Revenue" icon={<Coins />} value={formatNumber(civ.revenue)} sub={`Treasury ${formatNumber(civ.wealth)}`} />
      </div>
      <Section title="Stockpiles">
        <div className="space-y-2">
          <ResourceRow icon={<Wheat />} label="Food" value={formatNumber(civ.food)} need={civ.needs.food} detail={`${signed(civ.foodBalance, 0)}/yr`} />
          <ResourceRow icon={<TreePine />} label="Timber" value={formatNumber(civ.timber)} need={civ.needs.timber} />
          <ResourceRow icon={<Pickaxe />} label="Stone" value={formatNumber(civ.stone)} need={civ.needs.stone} />
          <ResourceRow icon={<Shield />} label="Iron" value={formatNumber(civ.iron)} need={civ.needs.iron} />
          <ResourceRow icon={<Mountain />} label="Land" value={civ.landHunger > 0.5 ? 'Scarce' : 'Ample'} need={Math.max(civ.landHunger, civ.needs.land * 0.6)} />
        </div>
        {civ.famineYears > 0 && <div className="rounded-lg border border-[#d9b25a]/40 bg-[#d9b25a]/10 px-2.5 py-1.5 text-[0.72rem] text-[#ecd08f]">Famine for {civ.famineYears} year(s): people are starving.</div>}
      </Section>
      <Section title="Budget">
        <div className="flex h-3 overflow-hidden rounded-full">
          {parts.map((p) => (
            <div key={p.label} style={{ width: `${p.value * 100}%`, background: p.color }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.72rem]">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="text-ink-300">{p.label}</span>
              <span className="num ml-auto text-ink-100">{Math.round(p.value * 100)}%</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Wealth & Output">
        <TrendChart
          data={history}
          series={[
            { key: 'output', name: 'Output', color: '#e2c06a' },
            { key: 'wealth', name: 'Treasury', color: '#6fbf8e' },
          ]}
          height={110}
        />
      </Section>
      <Section title="Army">
        <TrendChart data={history} series={[{ key: 'army', name: 'Soldiers', color: '#e0533b' }]} area height={90} />
      </Section>
    </div>
  );
}

function DiplomacyTab({ world, civ }: { world: World; civ: Civ }) {
  const version = useGame((s) => s.version);
  const relations = useMemo(() => relationsOf(world, civ.id), [world, civ, version]);
  const wars = useMemo(() => warsOfCiv(world, civ.id), [world, civ, version]);
  const active = wars.filter((w) => w.endYear === null);
  const past = wars.filter((w) => w.endYear !== null).slice(0, 8);
  const allies = relations.filter((r) => r.rel.alliance);
  const rivals = relations.filter((r) => r.rel.rivalry);
  const partners = relations.filter((r) => r.rel.trade);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Won" icon={<Trophy />} value={civ.counters.warsWon} />
        <Stat label="Lost" icon={<Skull />} value={civ.counters.warsLost} />
        <Stat label="Drawn" icon={<Scale />} value={civ.counters.warsDrawn} />
      </div>
      <Section title={`Active Wars (${active.length})`}>
        {active.length === 0 ? (
          <Empty>{civ.alive ? 'At peace.' : 'No longer fighting.'}</Empty>
        ) : (
          <div className="space-y-2">
            {active.map((w) => {
              const s = summarizeWar(world, w);
              const side = w.participants.find((p) => p.civ === civ.id)?.side;
              const enemies = side === 'attacker' ? s.defenders : s.attackers;
              const score = side === 'attacker' ? w.score : -w.score;
              return (
                <div key={w.id} className="card px-3 py-2 text-[0.74rem]">
                  <div className="flex items-center gap-1.5 font-semibold text-ink-100">
                    <Swords className="h-3.5 w-3.5 text-war" /> {w.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-300">
                    vs {enemies.map((e) => <CivLink key={e.id} civ={e} />)}
                  </div>
                  <div className="mt-1 text-[0.68rem] text-ink-400">
                    {CAUSE_LABEL[w.cause]} · {s.duration} yrs · {score >= 15 ? 'winning' : score <= -15 ? 'losing' : 'deadlocked'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="Treaties">
        <div className="space-y-2 text-[0.74rem]">
          <div>
            <div className="eyebrow mb-1">Allies</div>
            {allies.length === 0 ? <span className="text-ink-400">None</span> : <div className="flex flex-wrap gap-x-3 gap-y-1">{allies.map((r) => <CivLink key={r.other.id} civ={r.other} />)}</div>}
          </div>
          <div>
            <div className="eyebrow mb-1">Rivals</div>
            {rivals.length === 0 ? <span className="text-ink-400">None</span> : <div className="flex flex-wrap gap-x-3 gap-y-1">{rivals.map((r) => <CivLink key={r.other.id} civ={r.other} />)}</div>}
          </div>
          <div>
            <div className="eyebrow mb-1">Trade partners</div>
            {partners.length === 0 ? <span className="text-ink-400">None</span> : <div className="flex flex-wrap gap-x-3 gap-y-1">{partners.map((r) => <CivLink key={r.other.id} civ={r.other} />)}</div>}
          </div>
        </div>
      </Section>
      <Section title="Relations">
        {relations.length === 0 ? (
          <Empty>{civ.alive ? 'Has not met any other nation.' : 'Relations ended with its fall.'}</Empty>
        ) : (
          <div className="space-y-1">
            {relations.map(({ other, rel, atWar }) => (
              <div key={other.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[0.73rem] hover:bg-white/[0.03]">
                <CivLink civ={other} className="min-w-0 flex-1" />
                {atWar && <Swords className="h-3.5 w-3.5 text-war" />}
                {rel.alliance && <Heart className="h-3.5 w-3.5 text-peace" />}
                <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={rel.opinion >= 0 ? { left: '50%', width: `${rel.opinion / 2}%`, background: '#6fbf8e' } : { right: '50%', width: `${-rel.opinion / 2}%`, background: '#e0533b' }}
                  />
                </div>
                <span className="num w-7 text-right text-ink-300">{Math.round(rel.opinion)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Past Wars">
        {past.length === 0 ? (
          <Empty>No wars fought yet.</Empty>
        ) : (
          <div className="space-y-1.5">
            {past.map((w) => (
              <div key={w.id} className="text-[0.72rem] leading-snug text-ink-300">
                <span className="num mr-1.5 text-gold-300/80">
                  {w.startYear}–{w.endYear}
                </span>
                {w.summary}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function HistoryTab({ world, civ }: { world: World; civ: Civ }) {
  const version = useGame((s) => s.version);
  const events = useMemo(() => civEvents(world, civ.id).slice(-150).reverse(), [world, civ, version]);
  return (
    <div className="space-y-1">
      {events.length === 0 && <Empty>No recorded events.</Empty>}
      {events.map((e) => (
        <div key={e.id} className="flex gap-1">
          <span className="num w-9 shrink-0 pt-1.5 text-right text-[0.68rem] text-gold-300/80">{e.year}</span>
          <div className="min-w-0 flex-1">
            <EventRow e={e} showCivs={false} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TileCard({ world, tile }: { world: World; tile: number }) {
  useGame((s) => s.version);
  const info = tileInfo(world, tile);
  const rows: [string, string][] = [
    ['Terrain', info.biome],
    ['Location', `${info.x}, ${info.y}${info.landmass ? ` · ${info.landmass}` : ''}`],
    ['Climate', `${info.temperature > 0.66 ? 'Hot' : info.temperature > 0.33 ? 'Temperate' : 'Cold'}, ${info.moisture > 0.6 ? 'wet' : info.moisture > 0.35 ? 'moderate' : 'dry'}`],
    ['Fertility', `${info.food.toFixed(2)} food · ${info.trade.toFixed(2)} trade`],
  ];
  if (info.river) rows.push(['River', ['', 'Stream', 'River', 'Great river'][info.river]!]);
  if (info.resource) rows.push(['Resource', info.resource]);
  if (info.population > 0) rows.push(['Population', formatPopulation(info.population)]);
  if (info.culture) rows.push(['Culture', info.culture]);
  if (info.control !== null) rows.push(['Control', `${Math.round(info.control * 100)}%`]);
  if (info.devastation > 0.05) rows.push(['Devastation', `${Math.round(info.devastation * 100)}%`]);
  if (info.blight > 0.05) rows.push(['Blight', `${Math.round(info.blight * 100)}%`]);
  return (
    <div className="card mx-4 mt-3 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[0.76rem] font-semibold text-ink-100">
        <MapPin className="h-3.5 w-3.5 text-gold-400" />
        {info.city ? (info.city.ruined ? `Ruins of ${info.city.name}` : info.city.name) : info.owner ? `Province of the ${info.owner.baseName}` : 'Unclaimed land'}
        <button type="button" className="icon-btn ml-auto h-6 w-6" aria-label="Clear tile" onClick={() => useGame.setState({ selectedTile: null })}>
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="mb-2 text-[0.68rem] text-ink-400">{info.resourceDescription ?? info.biomeDescription}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.72rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-400">{k}</dt>
            <dd className="num truncate text-right text-ink-200">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Inspector() {
  const world = useGame((s) => s.world)!;
  useGame((s) => s.version);
  const selected = useGame((s) => s.selectedCiv);
  const tile = useGame((s) => s.selectedTile);
  const tab = useGame((s) => s.inspectorTab);
  const civ = selected !== null ? world.civs[selected] : undefined;
  const showTile = tile !== null && (!civ || world.owner[tile] === civ.id);
  return (
    <aside className="panel-surface absolute inset-y-0 right-0 z-20 flex w-[min(24rem,100vw)] shrink-0 animate-slide-left flex-col border-l shadow-2xl shadow-black/50 xl:relative xl:shadow-none">
      {civ ? (
        <>
          <CivHeader world={world} civ={civ} />
          {showTile && <TileCard world={world} tile={tile} />}
          <div className="flex gap-1 px-4 pt-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => useGame.setState({ inspectorTab: t.id })}
                className={cx('flex-1 rounded-md py-1.5 text-[0.72rem] font-semibold transition', tab === t.id ? 'bg-ink-700 text-gold-200 shadow' : 'text-ink-300 hover:bg-white/[0.04] hover:text-ink-100')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {tab === 'overview' && <OverviewTab world={world} civ={civ} />}
            {tab === 'economy' && <EconomyTab civ={civ} />}
            {tab === 'diplomacy' && <DiplomacyTab world={world} civ={civ} />}
            {tab === 'history' && <HistoryTab world={world} civ={civ} />}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
            <h2 className="font-display text-[1rem] font-bold tracking-[0.12em] text-parchment">LAND</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => useGame.setState({ inspectorOpen: false, selectedTile: null })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {tile !== null ? <TileCard world={world} tile={tile} /> : <div className="p-4 text-sm text-ink-300">Select a place on the map.</div>}
          <div className="px-4 py-3 text-[0.72rem] text-ink-400">
            <Sun className="mb-1 inline h-3.5 w-3.5 text-gold-400" /> Unclaimed land may be settled by expanding nations — or you can raise a new people here from the God Mode panel.
          </div>
        </>
      )}
    </aside>
  );
}
