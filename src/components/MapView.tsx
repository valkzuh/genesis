import { useEffect, useRef, useState } from 'react';
import { MapRenderer, type MapViewState } from '../rendering/MapRenderer';
import { useGame, type GameState } from '../store/gameStore';
import { controller } from '../store/controller';
import { COMMAND_RADIUS } from '../simulation/commands';
import { TileTooltip } from './TileTooltip';
import { GOD_TOOLS } from './godTools';

function viewFromState(s: GameState): MapViewState {
  const tool = s.godTool ? GOD_TOOLS[s.godTool] : null;
  return {
    mode: s.mapMode,
    selectedCiv: s.selectedCiv,
    toolRadius: s.godTool ? (COMMAND_RADIUS[s.godTool] ?? 0) : null,
    toolColor: tool?.color ?? 0xffffff,
  };
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [hover, setHover] = useState<{ tile: number; x: number; y: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const godTool = useGame((s) => s.godTool);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let renderer: MapRenderer | null = null;
    let pendingHover: { tile: number; x: number; y: number } | null = null;
    let hoverFrame = 0;
    MapRenderer.create(host, {
      onHover: (tile, x, y) => {
        pendingHover = tile === null ? null : { tile, x, y };
        if (!hoverFrame) {
          hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0;
            setHover(pendingHover);
          });
        }
      },
      onClick: (tile, ev) => {
        const s = useGame.getState();
        const world = s.world;
        if (!world) return;
        if (s.godTool) {
          const ok = controller.command({ type: s.godTool, tile } as never);
          if (ok && !ev.shiftKey) useGame.setState({ godTool: null });
          return;
        }
        const owner = world.owner[tile]!;
        if (owner >= 0) {
          useGame.setState({ selectedCiv: owner, selectedTile: tile, inspectorOpen: true, godCiv: owner });
        } else {
          useGame.setState({ selectedCiv: null, selectedTile: tile, inspectorOpen: true });
        }
      },
      onCancel: () => {
        if (useGame.getState().godTool) useGame.setState({ godTool: null });
      },
      onZoom: (zoom) => {
        const s = useGame.getState();
        if (Math.abs(s.zoom - zoom) > 0.01) useGame.setState({ zoom });
      },
    })
      .then((r) => {
        if (cancelled) {
          r.destroy();
          return;
        }
        renderer = r;
        rendererRef.current = r;
        r.setView(viewFromState(useGame.getState()));
        controller.attachRenderer(r);
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setFailed((err as Error)?.message ?? 'Unknown error');
      });
    const unsubscribe = useGame.subscribe((s, prev) => {
      if (!renderer) return;
      if (s.mapMode !== prev.mapMode || s.selectedCiv !== prev.selectedCiv || s.godTool !== prev.godTool) {
        renderer.setView(viewFromState(s));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      if (renderer) {
        controller.detachRenderer(renderer);
        renderer.destroy();
      }
      rendererRef.current = null;
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className={godTool ? 'absolute inset-0 cursor-crosshair' : 'absolute inset-0 cursor-default'} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="glass max-w-md rounded-xl p-5 text-center">
            <div className="section-title mb-2">Map unavailable</div>
            <p className="text-sm text-ink-200">
              GENESIS could not start its WebGL map renderer ({failed}). The simulation still runs; try a browser with hardware acceleration enabled.
            </p>
          </div>
        </div>
      )}
      {hover && <TileTooltip tile={hover.tile} x={hover.x} y={hover.y} />}
    </div>
  );
}
