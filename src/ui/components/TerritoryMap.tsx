import { useMemo, useState } from 'react';
import { brandName, getBrand } from '../../data/brands';
import type { Town, WorldState } from '../../engine/index';
import { num } from '../format';

type MapWorld = Omit<WorldState, 'weather'>;

const DISTRICT_COLORS = ['#e8dcb0', '#cfe0c3', '#c9dbe6', '#ead0c4', '#ddd3e8'];

export interface TownOverlay {
  /** 0..1 intensity for shading the town (e.g. member density). */
  intensity?: number;
  label?: string;
}

export interface MapSite {
  townId: number;
  ours: boolean;
  label: string;
}

export function TerritoryMap({
  world, homeTownId, overlay, showDistricts = true, fictionalize = false, height = 520, onSelectTown, selectedTownId, sites = [],
}: {
  sites?: MapSite[];
  world: MapWorld;
  homeTownId?: number;
  overlay?: Record<number, TownOverlay>;
  showDistricts?: boolean;
  fictionalize?: boolean;
  height?: number;
  onSelectTown?: (t: Town) => void;
  selectedTownId?: number;
}) {
  const [hover, setHover] = useState<Town | null>(null);
  const pad = 9;
  const vb = `${-pad} ${-pad} ${world.width + pad * 2} ${world.height + pad * 2}`;
  const maxPop = useMemo(() => Math.max(...world.towns.map((t) => t.population)), [world]);
  const r = (t: Town) => 0.7 + 1.6 * Math.sqrt(t.population / maxPop);
  return (
    <div className="relative">
      <svg viewBox={vb} style={{ maxHeight: height, width: '100%' }} preserveAspectRatio="xMidYMid meet" className="rounded border border-stone-300 bg-[#f4f0e2]" role="img" aria-label="Trade territory map">
        <defs>
          <clipPath id="map-clip"><rect x={-pad} y={-pad} width={world.width + pad * 2} height={world.height + pad * 2} /></clipPath>
        </defs>
        <g clipPath="url(#map-clip)">
          {world.counties.map((c) => (
            <g key={c.id}>
              <rect x={c.x0} y={c.y0} width={c.x1 - c.x0} height={c.y1 - c.y0} fill="#efe8d0" stroke="#b7ab86" strokeWidth={0.25} strokeDasharray="1.5 1" />
              <text x={c.x0 + 1} y={c.y0 + 2.6} fontSize={2} fill="#8a7d55" fontStyle="italic">{c.name} County</text>
            </g>
          ))}
          {showDistricts && world.towns.map((t) => (
            <circle key={`d${t.id}`} cx={t.x} cy={t.y} r={4.5} fill={DISTRICT_COLORS[t.districtId % DISTRICT_COLORS.length]} opacity={0.55} />
          ))}
          {world.roads.map((rd, i) => {
            const a = world.towns[rd.a];
            const b = world.towns[rd.b];
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={rd.major ? '#b04a2f' : '#9a917a'} strokeWidth={rd.major ? 0.6 : 0.3} />;
          })}
          {world.rail.map((rl) => (
            <g key={rl.id} opacity={rl.status === 'abandoned' ? 0.3 : 1}>
              <polyline points={rl.path.map((p) => p.join(',')).join(' ')} fill="none" stroke="#2c2c2c" strokeWidth={rl.kind === 'mainline' ? 0.7 : 0.45} />
              <polyline points={rl.path.map((p) => p.join(',')).join(' ')} fill="none" stroke="#f4f0e2" strokeWidth={rl.kind === 'mainline' ? 0.35 : 0.2} strokeDasharray="1 1" />
            </g>
          ))}
          {world.destinations.map((d) => {
            const x = Math.min(Math.max(d.x, -pad + 1), world.width + pad - 1);
            const y = Math.min(Math.max(d.y, -pad + 2), world.height + pad - 1);
            const anchor = d.x < 0 ? 'start' : d.x > world.width ? 'end' : 'middle';
            return (
              <g key={d.id}>
                <circle cx={x} cy={y} r={0.9} fill="#3b6e8f" />
                <text x={x + (anchor === 'start' ? 1.4 : anchor === 'end' ? -1.4 : 0)} y={y + (d.y < 0 ? 2.6 : d.y > world.height ? -1.4 : 0.6)} fontSize={1.6} fill="#3b6e8f" textAnchor={anchor}>
                  {d.name} · {d.milesFromEdge} mi
                </text>
              </g>
            );
          })}
          {sites.map((s, i) => {
            const t = world.towns[s.townId];
            const same = sites.filter((x) => x.townId === s.townId);
            const k = same.indexOf(s);
            const x = t.x - 2.4 - k * 1.8;
            const y = t.y - 2.6;
            return s.ours
              ? <rect key={`s${i}`} x={x - 0.8} y={y - 0.8} width={1.6} height={1.6} fill="#3f5f2a" stroke="#fff" strokeWidth={0.2}><title>{s.label}</title></rect>
              : <polygon key={`s${i}`} points={`${x},${y - 0.9} ${x - 0.85},${y + 0.7} ${x + 0.85},${y + 0.7}`} fill="#7a7466" stroke="#fff" strokeWidth={0.2}><title>{s.label}</title></polygon>;
          })}
          {world.towns.map((t) => {
            const ov = overlay?.[t.id];
            const fill = ov?.intensity !== undefined ? `rgba(63,95,42,${0.15 + 0.85 * ov.intensity})` : t.isCountySeat ? '#24261f' : '#fff';
            return (
              <g key={t.id} onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover(null)} onClick={() => onSelectTown?.(t)} className={onSelectTown ? 'cursor-pointer' : ''}>
                <circle cx={t.x} cy={t.y} r={r(t)} fill={fill} stroke={t.id === selectedTownId ? '#c9a227' : '#24261f'} strokeWidth={t.id === selectedTownId ? 0.8 : 0.3} />
                {t.id === homeTownId && <text x={t.x} y={t.y - r(t) - 0.6} fontSize={3} textAnchor="middle" fill="#c9a227">★</text>}
                <text x={t.x + r(t) + 0.6} y={t.y + 0.8} fontSize={t.isCountySeat ? 2 : 1.5} fontWeight={t.isCountySeat ? 700 : 400} fill="#24261f">{t.name}</text>
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-2 top-2 rounded border border-stone-300 bg-white/95 p-2 text-xs shadow">
          <div className="font-semibold">{hover.name}{hover.isCountySeat ? ' (county seat)' : ''}</div>
          <div>{world.counties[hover.countyId].name} County · {world.districts[hover.districtId]?.name ?? ''}</div>
          <div>Population {num(hover.population)}{hover.onHighway ? ' · on highway' : ''}</div>
          <div>{hover.railLineIds.length ? hover.railLineIds.map((id) => {
            const rl = world.rail[id];
            return `${rl.kind === 'mainline' ? 'Main line' : rl.name} (${getBrand(rl.ownerBrandId) ? brandName(rl.ownerBrandId, fictionalize) : 'short line'})`;
          }).join(', ') : 'No rail'}</div>
          {overlay?.[hover.id]?.label && <div className="mt-1">{overlay[hover.id].label}</div>}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-stone-600">
        <span>● county seat ○ town ★ home office</span>
        {sites.length > 0 && <span><span className="inline-block h-2 w-2 bg-field align-middle" /> our elevator ▲ competitor elevator</span>}
        <span><span className="inline-block h-0.5 w-5 bg-[#b04a2f] align-middle" /> highway</span>
        <span><span className="inline-block h-0.5 w-5 bg-[#2c2c2c] align-middle" /> rail (thick = main line)</span>
        {showDistricts && <span>shading = board district</span>}
      </div>
    </div>
  );
}
