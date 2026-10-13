import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, RefreshCw, Save, Trash, Upload } from 'lucide-react';
import { useGame } from '../../store/gameStore';
import { controller } from '../../store/controller';
import { deleteSave, exportWorld, importWorldFile, listSaves, loadSave, saveWorld, type SaveMeta } from '../../store/persistence';
import { formatPopulation } from '../../utils/format';
import { Empty, Section } from '../ui';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function WorldsPanel() {
  const world = useGame((s) => s.world);
  const version = useGame((s) => s.version);
  const unsaved = useGame((s) => s.unsaved);
  const askConfirm = useGame((s) => s.askConfirm);
  const pushToast = useGame((s) => s.pushToast);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setSaves(await listSaves());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (world) setLabel(`${world.name} — Year ${world.year}`);
  }, [world, version]);

  const notify = (text: string, ok = true) => pushToast({ text, kind: ok ? 'success' : 'error', tile: -1, civs: [], importance: 2, year: 0 });

  const doSave = async (id?: string, name?: string) => {
    if (!world) return;
    controller.pause();
    setBusy(true);
    try {
      await saveWorld(world, (name ?? label).trim() || world.name, id);
      useGame.setState({ unsaved: false });
      notify(`Saved “${(name ?? label).trim() || world.name}”`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      notify(`Save failed: ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  };

  const doLoad = async (meta: SaveMeta) => {
    setBusy(true);
    try {
      const loaded = await loadSave(meta.id);
      controller.install(loaded);
      notify(`Loaded “${meta.label}” at year ${loaded.year}`);
    } catch (e) {
      setError((e as Error).message);
      notify(`Load failed: ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  };

  const guardUnsaved = (action: () => void, what: string) => {
    if (world && unsaved) {
      askConfirm({
        title: 'Leave this world?',
        message: `The current world has unsaved history. ${what} will replace it. Continue?`,
        confirmLabel: 'Continue',
        danger: true,
        onConfirm: action,
      });
    } else {
      action();
    }
  };

  return (
    <div className="space-y-6">
      {world && (
        <Section title="Current World">
          <div className="card space-y-3 px-3 py-3">
            <div className="text-[0.78rem] text-ink-300">
              <div className="font-display text-[0.92rem] font-semibold text-parchment">World of {world.name}</div>
              <div className="mt-0.5">
                Seed <span className="font-mono text-ink-200">{world.seed}</span> · Year {world.year} · {world.civs.filter((c) => c.alive).length} nations
              </div>
              <div className={unsaved ? 'mt-1 text-gold-300' : 'mt-1 text-peace'}>{unsaved ? '● Unsaved changes' : '✓ All changes saved'}</div>
            </div>
            <label className="block">
              <span className="eyebrow">Save name</span>
              <input className="field mt-1" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void doSave()}>
                <Save className="h-4 w-4" /> Save new
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => world && exportWorld(world)}>
                <Download className="h-4 w-4" /> Export JSON
              </button>
            </div>
          </div>
        </Section>
      )}

      <Section
        title={`Saved Worlds (${saves.length})`}
        action={
          <button type="button" className="icon-btn h-7 w-7" aria-label="Refresh" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      >
        {error && <div className="rounded-lg border border-war/40 bg-war/10 px-3 py-2 text-[0.74rem] text-[#f3a796]">{error}</div>}
        {saves.length === 0 ? (
          <Empty>No saved worlds yet. Saves are stored in this browser.</Empty>
        ) : (
          <div className="space-y-2">
            {saves.map((s) => (
              <div key={s.id} className="card px-3 py-2.5">
                <div className="truncate text-[0.8rem] font-semibold text-ink-100">{s.label}</div>
                <div className="mt-0.5 text-[0.68rem] text-ink-400">
                  {s.worldName} · Year {s.year} · {s.civs} nations · {formatPopulation(s.population)}
                </div>
                <div className="text-[0.66rem] text-ink-500">
                  {formatDate(s.savedAt)} · {(s.bytes / 1024 / 1024).toFixed(1)} MB
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button type="button" className="btn flex-1 py-1 text-[0.72rem]" disabled={busy} onClick={() => guardUnsaved(() => void doLoad(s), 'Loading this save')}>
                    <FolderOpen className="h-3.5 w-3.5" /> Load
                  </button>
                  <button
                    type="button"
                    className="btn flex-1 py-1 text-[0.72rem]"
                    disabled={busy || !world}
                    onClick={() =>
                      askConfirm({
                        title: 'Overwrite save?',
                        message: `“${s.label}” (year ${s.year}) will be replaced by the current world at year ${world?.year}. This cannot be undone.`,
                        confirmLabel: 'Overwrite',
                        danger: true,
                        onConfirm: () => void doSave(s.id, s.label),
                      })
                    }
                  >
                    <Save className="h-3.5 w-3.5" /> Overwrite
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger px-2 py-1"
                    aria-label="Delete save"
                    disabled={busy}
                    onClick={() =>
                      askConfirm({
                        title: 'Delete save?',
                        message: `“${s.label}” will be permanently deleted from this browser.`,
                        confirmLabel: 'Delete',
                        danger: true,
                        onConfirm: async () => {
                          try {
                            await deleteSave(s.id);
                            await refresh();
                            notify(`Deleted “${s.label}”`);
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        },
                      })
                    }
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Import">
        <p className="-mt-1 text-[0.72rem] text-ink-400">Load a world exported from GENESIS (.json). Files are validated before loading.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            guardUnsaved(async () => {
              setBusy(true);
              try {
                const imported = await importWorldFile(file);
                controller.install(imported);
                notify(`Imported ${imported.name} at year ${imported.year}`);
              } catch (err) {
                setError((err as Error).message);
                notify(`Import failed: ${(err as Error).message}`, false);
              } finally {
                setBusy(false);
              }
            }, 'Importing a world');
          }}
        />
        <button type="button" className="btn w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Import world file
        </button>
      </Section>
    </div>
  );
}
