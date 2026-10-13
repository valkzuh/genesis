import { useEffect, useState, type ReactNode } from 'react';
import { Dices, Globe, MousePointerClick, Play, Sparkles, X, Keyboard, Map as MapIcon, Save } from 'lucide-react';
import { useGame } from '../store/gameStore';
import { controller, randomSeed } from '../store/controller';
import type { WorldSettings } from '../types/simulation';
import { cx } from './ui';

function Modal({ children, onClose, wide = false, label }: { children: ReactNode; onClose: () => void; wide?: boolean; label: string }) {
  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('panel-surface relative max-h-[92vh] w-full animate-slide-up overflow-y-auto rounded-2xl border shadow-2xl shadow-black/60', wide ? 'max-w-3xl' : 'max-w-md')}>
        <button type="button" className="icon-btn absolute right-3 top-3" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

const SIZES = [
  { id: 'compact', label: 'Compact', width: 128, height: 80, note: '128×80 · fast' },
  { id: 'standard', label: 'Standard', width: 160, height: 100, note: '160×100' },
  { id: 'vast', label: 'Vast', width: 200, height: 125, note: '200×125 · slower' },
] as const;

const LANDS = [
  { id: 'archipelago', label: 'Archipelago', value: 0.3 },
  { id: 'continents', label: 'Continents', value: 0.4 },
  { id: 'supercontinent', label: 'Great Lands', value: 0.52 },
] as const;

const DISASTERS = [
  { id: 'calm', label: 'Calm', value: 0.5 },
  { id: 'normal', label: 'Natural', value: 1 },
  { id: 'turbulent', label: 'Turbulent', value: 2 },
] as const;

function Segmented<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-lg bg-ink-950/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={cx('rounded-md px-2 py-1.5 text-[0.74rem] font-semibold transition', value === o.id ? 'bg-ink-700 text-gold-200 shadow' : 'text-ink-300 hover:text-ink-100')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewWorldDialog() {
  const world = useGame((s) => s.world);
  const unsaved = useGame((s) => s.unsaved);
  const [seed, setSeed] = useState(randomSeed());
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('standard');
  const [land, setLand] = useState<(typeof LANDS)[number]['id']>('continents');
  const [disasters, setDisasters] = useState<(typeof DISASTERS)[number]['id']>('normal');
  const [autoCivs, setAutoCivs] = useState(true);
  const [civs, setCivs] = useState(11);
  const close = () => useGame.setState({ dialog: null });
  const create = () => {
    const sz = SIZES.find((s) => s.id === size)!;
    const settings: Partial<WorldSettings> = {
      width: sz.width,
      height: sz.height,
      landFraction: LANDS.find((l) => l.id === land)!.value,
      disasterRate: DISASTERS.find((d) => d.id === disasters)!.value,
      civCount: autoCivs ? 0 : civs,
    };
    close();
    void controller.generate(seed, settings);
  };
  return (
    <Modal onClose={close} label="New world">
      <div className="px-6 pb-6 pt-6">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-gold-400" />
          <h2 className="font-display text-[1.15rem] font-bold tracking-[0.14em] text-parchment">FORGE A NEW WORLD</h2>
        </div>
        <p className="mt-1 text-[0.78rem] text-ink-300">Every seed creates a different planet with different peoples and a different history.</p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="eyebrow">World seed</span>
            <div className="mt-1 flex gap-2">
              <input className="field font-mono" value={seed} maxLength={64} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} autoFocus />
              <button type="button" className="btn shrink-0" aria-label="Random seed" onClick={() => setSeed(randomSeed())}>
                <Dices className="h-4 w-4" />
              </button>
            </div>
          </label>
          <div>
            <span className="eyebrow">Map size</span>
            <div className="mt-1">
              <Segmented options={SIZES} value={size} onChange={setSize} />
            </div>
            <div className="mt-1 text-[0.68rem] text-ink-400">{SIZES.find((s) => s.id === size)!.note} tiles</div>
          </div>
          <div>
            <span className="eyebrow">Geography</span>
            <div className="mt-1">
              <Segmented options={LANDS} value={land} onChange={setLand} />
            </div>
          </div>
          <div>
            <span className="eyebrow">Natural disasters</span>
            <div className="mt-1">
              <Segmented options={DISASTERS} value={disasters} onChange={setDisasters} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="eyebrow">Founding nations</span>
              <label className="flex items-center gap-1.5 text-[0.72rem] text-ink-300">
                <input type="checkbox" checked={autoCivs} onChange={(e) => setAutoCivs(e.target.checked)} className="accent-[#e2c06a]" /> Automatic
              </label>
            </div>
            <div className={cx('mt-1 flex items-center gap-3', autoCivs && 'opacity-40')}>
              <input type="range" min={4} max={20} value={civs} disabled={autoCivs} onChange={(e) => setCivs(Number(e.target.value))} className="flex-1" />
              <span className="num w-6 text-right text-[0.85rem] font-semibold text-gold-200">{autoCivs ? '—' : civs}</span>
            </div>
          </div>
          {world && unsaved && world.year > 1 && (
            <div className="rounded-lg border border-gold-500/30 bg-gold-500/[0.08] px-3 py-2 text-[0.74rem] text-gold-100">
              The World of {world.name} (year {world.year}) has unsaved history and will be replaced. Save it first from the Worlds panel if you want to keep it.
            </div>
          )}
          <button type="button" className="btn btn-gold w-full py-2.5 text-[0.85rem]" onClick={create}>
            <Sparkles className="h-4 w-4" /> Create world
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HelpItem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[0.8rem] font-semibold text-gold-200 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {title}
      </div>
      <div className="space-y-1 text-[0.76rem] leading-relaxed text-ink-200">{children}</div>
    </div>
  );
}

function HelpDialog() {
  const close = () => useGame.setState({ dialog: null });
  const running = useGame((s) => s.running);
  return (
    <Modal onClose={close} wide label="How to play">
      <div className="px-7 pb-7 pt-7">
        <div className="text-center">
          <div className="font-display text-[1.7rem] font-bold tracking-[0.3em] text-gold-300">GENESIS</div>
          <p className="mx-auto mt-2 max-w-xl text-[0.85rem] leading-relaxed text-ink-200">
            A living world. Dozens of peoples rise from the dawn of history, settle the land, trade, scheme, wage war, rebel, collapse and rise again — all on their own. You are not a ruler. You are the observer, and occasionally, a god.
          </p>
        </div>
        <div className="divider my-5" />
        <div className="grid gap-3 md:grid-cols-2">
          <HelpItem icon={<Play />} title="Time">
            <p>
              <span className="kbd">Space</span> plays or pauses. <span className="kbd">+</span>/<span className="kbd">-</span> change speed (1–80 years per second). <span className="kbd">.</span> or <span className="kbd">→</span> advances one year while paused, <span className="kbd">Shift</span>+<span className="kbd">→</span> ten years.
            </p>
          </HelpItem>
          <HelpItem icon={<MousePointerClick />} title="The map">
            <p>Scroll to zoom, drag to pan. Click a nation to open its inspector; click empty land for local details. The inspector updates live while time flows.</p>
          </HelpItem>
          <HelpItem icon={<MapIcon />} title="Map modes">
            <p>
              <span className="kbd">1</span> Political · <span className="kbd">2</span> Terrain · <span className="kbd">3</span> Population · <span className="kbd">4</span> Resources · <span className="kbd">5</span> Relations (of the selected nation, or alliance blocs when none is selected).
            </p>
          </HelpItem>
          <HelpItem icon={<Keyboard />} title="Panels">
            <p>
              <span className="kbd">O</span> Overview · <span className="kbd">N</span> Nations & archive · <span className="kbd">D</span> Diplomacy · <span className="kbd">H</span> History · <span className="kbd">G</span> God Mode · <span className="kbd">T</span> Chronicle timeline · <span className="kbd">F</span> focus selected.
            </p>
          </HelpItem>
          <HelpItem icon={<Sparkles />} title="God Mode">
            <p>Raise new nations, grant riches, spark booms and scientific revolutions, sow discord, compel war or impose peace — or strike with famine, plague, earthquake and flood. Every act is recorded in history.</p>
          </HelpItem>
          <HelpItem icon={<Save />} title="Worlds">
            <p>Save several worlds in this browser, reload them later, or export them as files. Simulations are deterministic: the same seed and the same interventions always produce the same history.</p>
          </HelpItem>
        </div>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="btn btn-gold px-6 py-2.5 text-[0.85rem]"
            autoFocus
            onClick={() => {
              close();
              if (!running) controller.play();
            }}
          >
            <Play className="h-4 w-4" fill="currentColor" /> {running ? 'Continue' : 'Let history begin'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDialog() {
  const confirm = useGame((s) => s.confirm);
  if (!confirm) return null;
  const close = () => useGame.setState({ confirm: null });
  return (
    <Modal onClose={close} label={confirm.title}>
      <div className="px-6 pb-6 pt-6">
        <h2 className="font-display text-[1.05rem] font-bold tracking-[0.1em] text-parchment">{confirm.title}</h2>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-200">{confirm.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={close} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className={cx('btn', confirm.danger ? 'btn-danger' : 'btn-gold')}
            onClick={() => {
              close();
              confirm.onConfirm();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BusyOverlay() {
  const busy = useGame((s) => s.busy);
  const [dots, setDots] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setDots((d) => (d + 1) % 4), 350);
    return () => window.clearInterval(t);
  }, [busy]);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-[60] grid animate-fade-in place-items-center bg-ink-950/80 backdrop-blur-sm">
      <div className="text-center">
        <div className="mx-auto h-14 w-14 animate-spin rounded-full border-2 border-gold-400/20 border-t-gold-400" />
        <div className="mt-4 font-display text-[0.95rem] tracking-[0.18em] text-gold-200">
          {busy.replace('…', '')}
          {'.'.repeat(dots)}
        </div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const dialog = useGame((s) => s.dialog);
  return (
    <>
      {dialog === 'new-world' && <NewWorldDialog />}
      {dialog === 'help' && <HelpDialog />}
      <ConfirmDialog />
      <BusyOverlay />
    </>
  );
}
