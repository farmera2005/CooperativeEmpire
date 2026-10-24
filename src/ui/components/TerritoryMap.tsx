import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { brandName, getBrand } from '../../data/brands';
import type { Town, WorldState } from '../../engine/index';
import { num } from '../format';

type MapWorld = Omit<WorldState, 'weather'>;

export type MapLayer = 'counties' | 'roads' | 'rail' | 'labels' | 'markets' | 'ours' | 'competitors';
export const DEFAULT_LAYERS: Record<MapLayer, boolean> = { counties: true, roads: true, rail: true, labels: true, markets: true, ours: true, competitors: true };

const DISTRICT_COLORS = ['#d9c77a', '#8fb879', '#7fa9c8', '#d39a80', '#b39fcf'];
/** One color per business, used by site badges and the legend. */
export const DIVISION_COLORS: Record<string, string> = { GRAIN: '#b8901c', AGRONOMY: '#3f5f2a', FEED: '#8a5a2b', ENERGY: '#3b6e8f', RETAIL: '#a3472b' };
const DIVISION_LETTER: Record<string, string> = { GRAIN: 'G', AGRONOMY: 'A', FEED: 'F', ENERGY: 'E', RETAIL: 'R' };

/** Kept for callers that shade towns directly. */
export interface TownOverlay {
  intensity?: number;
  label?: string;
}

export interface MapSite {
  /** Our facility id (ours only), so the screen can select it. */
  id?: number;
  townId: number;
  ours: boolean;
  label: string;
  division?: string;
  /** Under construction, mothballed: drawn faded. */
  inactive?: boolean;
}

/** A town-level shading: 0..1 per town, drawn as a halo in the given color ramp. */
export interface Choropleth {
  values: Record<number, number>;
  label: (townId: number) => string;
  from: string;
  to: string;
  legend: string;
  legendLow: string;
  legendHigh: string;
}

/** Proportional circles (e.g. members per town). */
export interface Bubbles {
  values: Record<number, number>;
  color: string;
  label: (townId: number) => string;
  legend: string;
}

/** One facility's draw by town (0..1), with its reach circle. */
export interface Heat {
  values: Record<number, number>;
  townId: number;
  reachMiles: number;
  label: (townId: number) => string;
  legend: string;
}

interface View { x: number; y: number; w: number; h: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t)))).join(',')})`;
};

export function TerritoryMap({
  world, homeTownId, fictionalize = false, height = 520, onSelectTown, selectedTownId, sites = [],
  layers = DEFAULT_LAYERS, showDistricts = false, choropleth, bubbles, heat, overlay, onSelectSite, selectedSiteId, legendExtra,
}: {
  world: MapWorld;
  homeTownId?: number;
  fictionalize?: boolean;
  height?: number;
  onSelectTown?: (t: Town) => void;
  selectedTownId?: number;
  sites?: MapSite[];
  layers?: Partial<Record<MapLayer, boolean>>;
  showDistricts?: boolean;
  choropleth?: Choropleth;
  bubbles?: Bubbles;
  heat?: Heat;
  overlay?: Record<number, TownOverlay>;
  onSelectSite?: (s: MapSite) => void;
  selectedSiteId?: number;
  legendExtra?: ReactNode;
}) {
  const L = { ...DEFAULT_LAYERS, ...layers };
  // A margin around the territory holds the arrows to markets beyond the map.
  const pad = 12;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [widthPx, setWidthPx] = useState(800);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidthPx(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fw = world.width + pad * 2;
  const fh = world.height + pad * 2;
  // As tall as the width allows, up to `height`; the view then widens or deepens to fill the frame.
  const heightPx = Math.min(height, (widthPx * fh) / fw);
  const base: View = useMemo(() => {
    const aspect = widthPx / heightPx;
    const w = Math.max(fw, fh * aspect);
    const h = w / aspect;
    return { x: world.width / 2 - w / 2, y: world.height / 2 - h / 2, w, h };
  }, [world, widthPx, heightPx, fw, fh]);
  const [view, setView] = useState<View>(base);
  useEffect(() => setView(base), [base]);
  const ppu = Math.min(widthPx / view.w, heightPx / view.h); // screen pixels per mile
  const px = (p: number) => p / ppu; // a size in screen pixels, in map units
  const zoom = base.w / view.w;

  const [hover, setHover] = useState<Town | null>(null);
  const maxPop = useMemo(() => Math.max(...world.towns.map((t) => t.population)), [world]);
  const townR = (t: Town) => px(3 + 5 * Math.sqrt(t.population / maxPop));

  // ---- zoom and pan ----
  const toWorld = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    const s = Math.min(r.width / view.w, r.height / view.h);
    const ox = (r.width - view.w * s) / 2;
    const oy = (r.height - view.h * s) / 2;
    return { x: view.x + (cx - r.left - ox) / s, y: view.y + (cy - r.top - oy) / s };
  };
  const zoomBy = (f: number, at?: { x: number; y: number }) => {
    const c = at ?? { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    const w = Math.min(base.w, Math.max(base.w / 8, view.w / f));
    const h = (w * base.h) / base.w;
    const x = Math.min(Math.max(c.x - ((c.x - view.x) * w) / view.w, base.x - w * 0.25), base.x + base.w - w * 0.75);
    const y = Math.min(Math.max(c.y - ((c.y - view.y) * h) / view.h, base.y - h * 0.25), base.y + base.h - h * 0.75);
    setView(w >= base.w ? base : { x, y, w, h });
  };
  // A native listener: React's wheel handlers are passive and cannot stop the page scrolling.
  const zoomRef = useRef(zoomBy);
  zoomRef.current = (f, at) => zoomBy(f, at);
  const toWorldRef = useRef(toWorld);
  toWorldRef.current = toWorld;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current(e.deltaY < 0 ? 1.25 : 0.8, toWorldRef.current(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean } | null>(null);
  const onDown = (e: ReactPointerEvent) => {
    if (zoom === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, v: view, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / ppu;
    const dy = (e.clientY - d.y) / ppu;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    setView({ ...d.v, x: d.v.x - dx, y: d.v.y - dy });
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };
  const clickOk = () => !drag.current?.moved;

  // ---- site badges, grouped per town ----
  // Competitors are drawn as one marker per town with a count; ours individually.
  const visibleSites: (MapSite & { count?: number })[] = useMemo(() => {
    const out: (MapSite & { count?: number })[] = L.ours ? sites.filter((s) => s.ours) : [];
    if (L.competitors) {
      const byTown = new Map<number, MapSite[]>();
      for (const s of sites) if (!s.ours) byTown.set(s.townId, [...(byTown.get(s.townId) ?? []), s]);
      for (const [townId, list] of [...byTown].sort((a, b) => a[0] - b[0])) {
        const divs = new Set(list.map((s) => s.division ?? 'GRAIN'));
        out.push({ townId, ours: false, label: list.map((s) => s.label).join('\n'), division: divs.size === 1 ? [...divs][0] : undefined, count: list.length });
      }
    }
    return out;
  }, [sites, L.ours, L.competitors]);
  const badge = px(13);
  const siteBoxes = useMemo(() => {
    const out: { s: MapSite; x: number; y: number }[] = [];
    const byTown = new Map<number, MapSite[]>();
    for (const s of visibleSites) byTown.set(s.townId, [...(byTown.get(s.townId) ?? []), s]);
    for (const [townId, list] of byTown) {
      const t = world.towns[townId];
      const ordered = [...list].sort((a, b) => Number(b.ours) - Number(a.ours));
      const n = ordered.length;
      ordered.forEach((s, k) => out.push({ s, x: t.x + (k - (n - 1) / 2) * badge * 1.15, y: t.y - townR(t) - badge * 0.75 }));
    }
    return out;
  }, [visibleSites, world, badge, ppu]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- labels: greedy placement in priority order, skipped when they would collide ----
  const ourTowns = new Set(sites.filter((s) => s.ours).map((s) => s.townId));
  type Anchor = 'start' | 'end' | 'middle';
  /** Space taken by town labels, sites and markets, for the county names placed after them. */
  const countyTaken = useRef<Box[]>([]);
  const textW = (s: string, sizePx: number, bold = false) => px(s.length * sizePx * (bold ? 0.6 : 0.56));
  const boxFor = (x: number, y: number, w: number, h: number, anchor: Anchor): Box => {
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    return { x0, y0: y - h * 0.8, x1: x0 + w, y1: y + h * 0.25 };
  };
  // Markets beyond the map: an arrow at the edge of what is in view, toward the market.
  const markets = useMemo(() => {
    if (!L.markets) return [] as { id: number; x: number; y: number; anchor: Anchor; text: string; box: Box }[];
    return world.destinations.map((d) => {
      // Pinned to the frame edge on the market's side, so the label never runs back over the towns.
      const anchor: Anchor = d.x < 0 ? 'start' : d.x > world.width ? 'end' : 'middle';
      const x = anchor === 'start' ? view.x + px(8) : anchor === 'end' ? view.x + view.w - px(8) : Math.min(Math.max(d.x, view.x + px(80)), view.x + view.w - px(80));
      const y = d.y < 0 && anchor === 'middle' ? view.y + px(16) : d.y > world.height && anchor === 'middle' ? view.y + view.h - px(8) : Math.min(Math.max(d.y, view.y + px(16)), view.y + view.h - px(8));
      const arrow = d.x < 0 ? '◀' : d.x > world.width ? '▶' : d.y < 0 ? '▲' : '▼';
      const text = anchor === 'end' ? `${d.name} ${d.milesFromEdge} mi ${arrow}` : `${arrow} ${d.name} ${d.milesFromEdge} mi`;
      return { id: d.id, x, y, anchor, text, box: boxFor(x, y, textW(text, 11, true), px(13), anchor) };
    });
  }, [L.markets, world, view, ppu]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => {
    if (!L.labels) return [] as { t: Town; x: number; y: number; anchor: 'start' | 'end' | 'middle'; size: number; bold: boolean }[];
    const taken: Box[] = markets.map((m) => m.box);
    for (const t of world.towns) { const r = townR(t); taken.push({ x0: t.x - r, y0: t.y - r, x1: t.x + r, y1: t.y + r }); }
    for (const b of siteBoxes) taken.push({ x0: b.x - badge / 2, y0: b.y - badge / 2, x1: b.x + badge / 2, y1: b.y + badge / 2 });
    const prio = (t: Town) => (t.id === homeTownId || t.id === selectedTownId ? 1e9 : 0) + (ourTowns.has(t.id) ? 1e8 : 0) + (t.isCountySeat ? 1e7 : 0) + t.population;
    const out: { t: Town; x: number; y: number; anchor: 'start' | 'end' | 'middle'; size: number; bold: boolean }[] = [];
    for (const t of [...world.towns].sort((a, b) => prio(b) - prio(a) || a.id - b.id)) {
      const bold = t.isCountySeat || t.id === homeTownId;
      const sizePx = bold ? 13 : 11.5;
      const size = px(sizePx);
      const w = px(t.name.length * sizePx * (bold ? 0.6 : 0.56));
      const h = px(sizePx * 1.15);
      const r = townR(t) + px(3);
      const cands: { x: number; y: number; anchor: 'start' | 'end' | 'middle'; box: Box }[] = [
        { x: t.x + r, y: t.y + h * 0.35, anchor: 'start', box: { x0: t.x + r, y0: t.y - h / 2, x1: t.x + r + w, y1: t.y + h / 2 } },
        { x: t.x - r, y: t.y + h * 0.35, anchor: 'end', box: { x0: t.x - r - w, y0: t.y - h / 2, x1: t.x - r, y1: t.y + h / 2 } },
        { x: t.x, y: t.y + r + h * 0.8, anchor: 'middle', box: { x0: t.x - w / 2, y0: t.y + r, x1: t.x + w / 2, y1: t.y + r + h } },
        { x: t.x, y: t.y - r - px(2), anchor: 'middle', box: { x0: t.x - w / 2, y0: t.y - r - h, x1: t.x + w / 2, y1: t.y - r } },
      ];
      const must = t.id === selectedTownId || t.id === homeTownId;
      const pick = cands.find((c) => !taken.some((b) => overlaps(b, c.box))) ?? (must ? cands[0] : undefined);
      if (!pick) continue;
      taken.push(pick.box);
      out.push({ t, x: pick.x, y: pick.y, anchor: pick.anchor, size, bold });
    }
    countyTaken.current = taken;
    return out;
  }, [L.labels, world, siteBoxes, ppu, homeTownId, selectedTownId, sites, markets]); // eslint-disable-line react-hooks/exhaustive-deps
  // County names go last, in a free spot along the county's edges, or not at all.
  const countyLabels = useMemo(() => {
    if (!L.counties) return [] as { id: number; x: number; y: number; text: string }[];
    const taken = L.labels ? [...countyTaken.current] : markets.map((m) => m.box);
    if (!L.labels) {
      for (const t of world.towns) { const r = townR(t); taken.push({ x0: t.x - r, y0: t.y - r, x1: t.x + r, y1: t.y + r }); }
      for (const b of siteBoxes) taken.push({ x0: b.x - badge / 2, y0: b.y - badge / 2, x1: b.x + badge / 2, y1: b.y + badge / 2 });
    }
    const out: { id: number; x: number; y: number; text: string }[] = [];
    for (const c of world.counties) {
      const text = `${c.name.toUpperCase()} COUNTY`;
      const w = textW(text, 13, true) * 1.15;
      const h = px(15);
      const cx = (c.x0 + c.x1) / 2;
      const cands = [[cx, c.y1 - px(8)], [cx, c.y0 + px(18)], [cx, (c.y0 + c.y1) / 2], [c.x0 + w / 2 + px(6), c.y1 - px(8)], [c.x1 - w / 2 - px(6), c.y1 - px(8)], [c.x0 + w / 2 + px(6), c.y0 + px(18)], [c.x1 - w / 2 - px(6), c.y0 + px(18)]];
      for (const [x, y] of cands) {
        const box = boxFor(x, y, w, h, 'middle');
        if (taken.some((b) => overlaps(b, box))) continue;
        taken.push(box);
        out.push({ id: c.id, x, y, text });
        break;
      }
    }
    return out;
  }, [L.counties, L.labels, world, labels, markets, siteBoxes, ppu]); // eslint-disable-line react-hooks/exhaustive-deps

  const vb = `${view.x} ${view.y} ${view.w} ${view.h}`;
  const heatTown = heat ? world.towns[heat.townId] : undefined;
  const legendSwatch = (c: string, round = false) => <span className={`inline-block h-3 w-3 align-middle ${round ? 'rounded-full' : 'rounded-sm'}`} style={{ background: c }} />;
  const divisionsShown = [...new Set(sites.filter((s) => (s.ours ? L.ours : L.competitors)).map((s) => s.division ?? 'GRAIN'))].sort((a, b) => Object.keys(DIVISION_COLORS).indexOf(a) - Object.keys(DIVISION_COLORS).indexOf(b));

  return (
    <div ref={wrap} className="relative select-none">
      <svg
        ref={svg} viewBox={vb} style={{ height: heightPx, width: '100%' }} preserveAspectRatio="xMidYMid meet"
        className={`rounded border border-stone-300 bg-[#f6f2e4] ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        role="img" aria-label="Trade territory map" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      >
        <defs>
          <radialGradient id="heat-blob">
            <stop offset="0%" stopColor="#d7301f" stopOpacity={0.85} />
            <stop offset="55%" stopColor="#fc8d59" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#fdcc8a" stopOpacity={0} />
          </radialGradient>
        </defs>

        {L.counties && world.counties.map((c) => (
          <g key={c.id}>
            <rect x={c.x0} y={c.y0} width={c.x1 - c.x0} height={c.y1 - c.y0} fill="#efe8cf" stroke="#b7ab86" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(4)}`} />
          </g>
        ))}

        {showDistricts && world.towns.map((t) => (
          <circle key={`d${t.id}`} cx={t.x} cy={t.y} r={px(22)} fill={DISTRICT_COLORS[t.districtId % DISTRICT_COLORS.length]} opacity={0.45} />
        ))}

        {choropleth && world.towns.map((t) => {
          const v = choropleth.values[t.id] ?? 0;
          return v > 0.005 ? <circle key={`c${t.id}`} cx={t.x} cy={t.y} r={px(20)} fill={mix(choropleth.from, choropleth.to, v)} opacity={0.35 + 0.5 * v} /> : null;
        })}

        {heat && heatTown && (
          <g>
            {world.towns.map((t) => {
              const v = heat.values[t.id] ?? 0;
              return v > 0.01 ? <circle key={`h${t.id}`} cx={t.x} cy={t.y} r={4 + 7 * Math.sqrt(v)} fill="url(#heat-blob)" opacity={0.35 + 0.65 * Math.sqrt(v)} /> : null;
            })}
            <circle cx={heatTown.x} cy={heatTown.y} r={heat.reachMiles} fill="none" stroke="#d7301f" strokeWidth={px(1.5)} strokeDasharray={`${px(6)} ${px(4)}`} opacity={0.8} />
          </g>
        )}

        {L.roads && world.roads.map((rd, i) => {
          const a = world.towns[rd.a];
          const b = world.towns[rd.b];
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={rd.major ? '#c0563a' : '#b3aa92'} strokeWidth={px(rd.major ? 2.5 : 1.2)} strokeLinecap="round" />;
        })}

        {L.rail && world.rail.map((rl) => {
          const pts = rl.path.map((p) => p.join(',')).join(' ');
          const w = rl.kind === 'mainline' ? 3.5 : 2.4;
          return (
            <g key={rl.id} opacity={rl.status === 'abandoned' ? 0.3 : 1}>
              <polyline points={pts} fill="none" stroke="#2c2c2c" strokeWidth={px(w)} />
              <polyline points={pts} fill="none" stroke="#f6f2e4" strokeWidth={px(w * 0.45)} strokeDasharray={`${px(4)} ${px(4)}`} />
            </g>
          );
        })}

        {bubbles && world.towns.map((t) => {
          const v = bubbles.values[t.id] ?? 0;
          const max = Math.max(1, ...Object.values(bubbles.values));
          return v > 0 ? <circle key={`b${t.id}`} cx={t.x} cy={t.y} r={px(4 + 16 * Math.sqrt(v / max))} fill={bubbles.color} opacity={0.45} stroke={bubbles.color} strokeWidth={px(1)} /> : null;
        })}

        {markets.map((m) => (
          <text key={`m${m.id}`} x={m.x} y={m.y} fontSize={px(11)} fill="#3b6e8f" textAnchor={m.anchor} fontWeight={600} stroke="#f6f2e4" strokeWidth={px(3)} paintOrder="stroke">{m.text}</text>
        ))}

        {world.towns.map((t) => {
          const ov = overlay?.[t.id];
          const fill = ov?.intensity !== undefined ? mix('#ffffff', '#3f5f2a', ov.intensity) : t.isCountySeat ? '#24261f' : '#ffffff';
          const sel = t.id === selectedTownId;
          return (
            <g key={t.id} onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover(null)} onClick={() => clickOk() && onSelectTown?.(t)}
              className={onSelectTown ? 'cursor-pointer' : ''} tabIndex={onSelectTown ? 0 : -1} role={onSelectTown ? 'button' : undefined} aria-label={t.name}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTown?.(t); }}>
              <circle cx={t.x} cy={t.y} r={townR(t)} fill={fill} stroke={sel ? '#c9a227' : '#24261f'} strokeWidth={px(sel ? 3 : 1.2)} />
              {t.id === homeTownId && <text x={t.x} y={t.y + px(4)} fontSize={px(12)} textAnchor="middle" fill="#c9a227" stroke="#24261f" strokeWidth={px(0.6)}>★</text>}
            </g>
          );
        })}

        {siteBoxes.map(({ s, x, y }, i) => {
          const c = s.division ? DIVISION_COLORS[s.division] ?? '#555' : '#6b6458';
          const sel = s.ours && s.id !== undefined && s.id === selectedSiteId;
          const h = badge / 2;
          return (
            <g key={`s${i}`} opacity={s.inactive ? 0.5 : 1} onClick={() => clickOk() && onSelectSite?.(s)} className={s.ours && onSelectSite ? 'cursor-pointer' : ''}>
              <title>{s.label}</title>
              {s.ours ? (
                <>
                  <rect x={x - h} y={y - h} width={badge} height={badge} rx={px(3)} fill={c} stroke={sel ? '#d7301f' : '#ffffff'} strokeWidth={px(sel ? 2.5 : 1.2)} />
                  <text x={x} y={y + px(4)} fontSize={px(10)} fontWeight={700} textAnchor="middle" fill="#ffffff">{DIVISION_LETTER[s.division ?? 'GRAIN']}</text>
                </>
              ) : (
                <>
                  <polygon points={`${x},${y - h} ${x - h},${y + h * 0.8} ${x + h},${y + h * 0.8}`} fill="#ffffff" stroke={s.division ? c : '#6b6458'} strokeWidth={px(1.8)} />
                  {(s as { count?: number }).count! > 1 && <text x={x} y={y + h * 0.55} fontSize={px(8.5)} fontWeight={700} textAnchor="middle" fill="#3d3a33">{(s as { count?: number }).count}</text>}
                </>
              )}
            </g>
          );
        })}

        {countyLabels.map((c) => (
          <text key={`cl${c.id}`} x={c.x} y={c.y} fontSize={px(13)} textAnchor="middle" fill="#a89a6c" fontStyle="italic" fontWeight={600} style={{ letterSpacing: px(1) }} pointerEvents="none">{c.text}</text>
        ))}
        {labels.map(({ t, x, y, anchor, size, bold }) => (
          <text key={`l${t.id}`} x={x} y={y} fontSize={size} fontWeight={bold ? 700 : 500} textAnchor={anchor} fill="#24261f"
            stroke="#f6f2e4" strokeWidth={px(3)} paintOrder="stroke" pointerEvents="none">{t.name}</text>
        ))}
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button className="btn h-7 w-7 justify-center p-0" aria-label="Zoom in" onClick={() => zoomBy(1.5)}>+</button>
        <button className="btn h-7 w-7 justify-center p-0" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>−</button>
        <button className="btn h-7 w-7 justify-center p-0 text-xs" aria-label="Reset view" onClick={() => setView(base)}>⟲</button>
      </div>

      {hover && (
        <div className="pointer-events-none absolute left-2 top-2 max-w-xs rounded border border-stone-300 bg-white/95 p-2 text-xs shadow">
          <div className="font-semibold">{hover.name}{hover.isCountySeat ? ' (county seat)' : ''}</div>
          <div>{world.counties[hover.countyId].name} County · {world.districts[hover.districtId]?.name ?? ''}</div>
          <div>Population {num(hover.population)}{hover.onHighway ? ' · on highway' : ''}</div>
          <div>{hover.railLineIds.length ? hover.railLineIds.map((id) => {
            const rl = world.rail[id];
            return `${rl.kind === 'mainline' ? 'Main line' : rl.name} (${getBrand(rl.ownerBrandId) ? brandName(rl.ownerBrandId, fictionalize) : 'short line'})`;
          }).join(', ') : 'No rail'}</div>
          {sites.filter((s) => s.townId === hover.id && (s.ours ? L.ours : L.competitors)).map((s, i) => <div key={i}>{s.ours ? '■' : '△'} {s.label}</div>)}
          {heat && <div className="mt-1 text-[#b02a1a]">{heat.label(hover.id)}</div>}
          {choropleth && <div className="mt-1">{choropleth.label(hover.id)}</div>}
          {bubbles && <div className="mt-1">{bubbles.label(hover.id)}</div>}
          {overlay?.[hover.id]?.label && <div className="mt-1">{overlay[hover.id].label}</div>}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
        <span>● county seat ○ town <span className="text-grain">★</span> home office</span>
        {(L.ours || L.competitors) && divisionsShown.length > 0 && <span className="flex items-center gap-1">businesses (our sites filled): {divisionsShown.map((d) => <span key={d} className="flex items-center gap-0.5">{legendSwatch(DIVISION_COLORS[d])}{DIVISION_LETTER[d]}</span>)}</span>}
        {L.competitors && visibleSites.some((s) => !s.ours) && <span>△ competitors (number = how many; outline = business)</span>}
        {L.roads && <span><span className="inline-block h-0.5 w-5 bg-[#c0563a] align-middle" /> highway</span>}
        {L.rail && <span><span className="inline-block h-0.5 w-5 bg-[#2c2c2c] align-middle" /> rail (thick = main line)</span>}
        {showDistricts && <span className="flex items-center gap-1">board districts {world.districts.map((d) => <span key={d.id} className="flex items-center gap-0.5">{legendSwatch(DISTRICT_COLORS[d.id % DISTRICT_COLORS.length], true)}{d.name}</span>)}</span>}
        {choropleth && <span className="flex items-center gap-1">{choropleth.legend}: {choropleth.legendLow}<span className="inline-block h-2 w-16 rounded" style={{ background: `linear-gradient(to right, ${choropleth.from}, ${choropleth.to})` }} />{choropleth.legendHigh}</span>}
        {bubbles && <span className="flex items-center gap-1">{legendSwatch(bubbles.color, true)} {bubbles.legend}</span>}
        {heat && <span className="flex items-center gap-1">{heat.legend}<span className="inline-block h-2 w-16 rounded" style={{ background: 'linear-gradient(to right, #fdcc8a, #fc8d59, #d7301f)' }} /> · dashed circle = reach</span>}
        {legendExtra}
        <span className="ml-auto">{zoom > 1 ? `zoom ${zoom.toFixed(1)}× · drag to pan` : 'scroll or +/− to zoom'}</span>
      </div>
    </div>
  );
}
