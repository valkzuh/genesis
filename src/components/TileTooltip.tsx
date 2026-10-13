import { useGame } from '../store/gameStore';
import { tileInfo } from '../simulation/queries';
import { formatPopulation } from '../utils/format';
import { CivSwatch } from './ui';
import { GOD_TOOLS } from './godTools';

/** Floating card describing the tile under the cursor. */
export function TileTooltip({ tile, x, y }: { tile: number; x: number; y: number }) {
  const world = useGame((s) => s.world);
  useGame((s) => s.version);
  const godTool = useGame((s) => s.godTool);
  if (!world || tile < 0 || tile >= world.map.size) return null;
  const info = tileInfo(world, tile);
  const tool = godTool ? GOD_TOOLS[godTool] : null;
  // Keep the card inside the map area so it never covers side panels.
  const host = document.querySelector('main')?.getBoundingClientRect();
  const minX = host ? host.left + 8 : 8;
  const maxX = host ? host.right - 236 : window.innerWidth - 236;
  const maxY = host ? host.bottom - 170 : window.innerHeight - 170;
  const left = x + 18 > maxX ? Math.max(minX, x - 240) : x + 18;
  const top = Math.min(y + 16, maxY);
  return (
    <div className="pointer-events-none fixed z-40 w-56 rounded-lg border border-white/10 bg-ink-900/92 px-3 py-2 text-[0.72rem] shadow-2xl shadow-black/50 backdrop-blur" style={{ left, top }}>
      {tool && (
        <div className="mb-1.5 border-b border-white/10 pb-1.5 font-semibold" style={{ color: tool.css }}>
          Click to {tool.verb}
        </div>
      )}
      {info.owner ? (
        <div className="flex items-center gap-1.5 font-semibold text-ink-100">
          <CivSwatch civ={info.owner} size={10} />
          <span className="truncate">{info.owner.name}</span>
        </div>
      ) : (
        <div className="font-semibold text-ink-300">{info.biome === 'Deep Ocean' || info.biome === 'Coastal Sea' || info.biome === 'Lake' ? 'Open water' : 'Unclaimed land'}</div>
      )}
      {info.city && (
        <div className="mt-0.5 text-gold-200">
          {info.city.ruined ? `Ruins of ${info.city.name}` : info.city.name}
          {info.owner && info.owner.capital === info.city.id ? ' · capital' : ''}
        </div>
      )}
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-ink-300">
        <span>{info.biome}</span>
        <span className="text-right">{info.river ? 'River' : info.coastal ? 'Coast' : ''}</span>
        {info.population > 0 && (
          <>
            <span>Population</span>
            <span className="num text-right text-ink-100">{formatPopulation(info.population)}</span>
          </>
        )}
        {info.resource && (
          <>
            <span>Resource</span>
            <span className="text-right text-ink-100">{info.resource}</span>
          </>
        )}
        {info.culture && info.owner && info.culture !== info.owner.adjective && (
          <>
            <span>Culture</span>
            <span className="text-right text-ink-100">{info.culture}</span>
          </>
        )}
        {info.devastation > 0.1 && (
          <>
            <span>Devastation</span>
            <span className="num text-right text-war">{Math.round(info.devastation * 100)}%</span>
          </>
        )}
        {info.blight > 0.1 && (
          <>
            <span>Blight</span>
            <span className="num text-right text-[#d9b25a]">{Math.round(info.blight * 100)}%</span>
          </>
        )}
      </div>
    </div>
  );
}
