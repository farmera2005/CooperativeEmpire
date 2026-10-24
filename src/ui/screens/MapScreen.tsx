import { useEffect, useMemo, useState } from 'react';
import { brandName, getBrand } from '../../data/brands';
import { competitorName, facilityCatchment, grainShareByTown, supplyShareByTown, totalAcres, yearOf, type DivisionId, type Town } from '../../engine/index';
import { DIVISION_LABEL } from '../../data/supply';
import { Panel } from '../components/Panel';
import { DEFAULT_LAYERS, DIVISION_COLORS, TerritoryMap, type Bubbles, type Choropleth, type Heat, type MapLayer, type MapSite } from '../components/TerritoryMap';
import { num } from '../format';
import { useStore } from '../store';

type Business = Exclude<DivisionId, 'CORP'>;
type Theme = 'none' | 'share' | 'members' | 'districts' | 'heat';
const BUSINESSES: Business[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
const LAYER_LABEL: Record<MapLayer, string> = {
  counties: 'Counties', roads: 'Roads', rail: 'Rail lines', labels: 'Town names', markets: 'Markets beyond the map', ours: 'Our facilities', competitors: 'Competitors',
};
const THEME_LABEL: Record<Theme, string> = { none: 'None', share: 'Our market share', members: 'Members and customers', districts: 'Board districts', heat: 'Facility heatmap' };

/** Map preferences are a per-viewer convenience; storage may be unavailable. */
const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export function MapScreen() {
  const game = useStore((s) => s.game)!;
  const world = game.world;
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>(() => load('map.layers', DEFAULT_LAYERS));
  const [prefs, setPrefs] = useState<{ theme: Theme; business: Business | 'ALL' }>(() => load('map.prefs', { theme: 'share' as Theme, business: 'ALL' as Business | 'ALL' }));
  useEffect(() => save('map.layers', layers), [layers]);
  useEffect(() => save('map.prefs', prefs), [prefs]);
  const { theme, business } = prefs;
  const shareBusiness: Business = business === 'ALL' ? 'GRAIN' : business;
  const ours = game.coop.facilities.filter((f) => f.status !== 'closed');
  const [facilityId, setFacilityId] = useState<number | null>(ours[0]?.id ?? null);
  const [sel, setSel] = useState<Town | null>(null);
  const year = yearOf(game.clock.monthIndex);

  const stats = useMemo(() => {
    const by: Record<number, { members: number; nonmembers: number; acres: number }> = {};
    for (const t of world.towns) by[t.id] = { members: 0, nonmembers: 0, acres: 0 };
    for (const m of game.members.list) {
      if (m.status !== 'active') continue;
      const b = by[m.townId];
      if (m.kind === 'member') b.members += m.weight;
      else b.nonmembers += m.weight;
      b.acres += totalAcres(m) * m.weight;
    }
    return by;
  }, [game.members.list, world.towns]);
  const share = useMemo<Record<number, number>>(() => {
    if (shareBusiness === 'GRAIN') return Object.fromEntries(Object.entries(grainShareByTown(game)).map(([k, v]) => [k, v.share]));
    return supplyShareByTown(game, shareBusiness);
  }, [game, shareBusiness]);
  const catchment = useMemo(() => (theme === 'heat' && facilityId !== null ? facilityCatchment(game, facilityId) : null), [game, theme, facilityId]);
  const heatFacility = ours.find((f) => f.id === facilityId);

  const choropleth: Choropleth | undefined = theme === 'share' ? {
    values: Object.fromEntries(world.towns.map((t) => [t.id, Math.min(1, (share[t.id] ?? 0) / 0.6)])),
    label: (id) => `Our ${DIVISION_LABEL[shareBusiness].toLowerCase()} share: ${((share[id] ?? 0) * 100).toFixed(0)}%`,
    from: '#f1f4e6', to: DIVISION_COLORS[shareBusiness], legend: `Our ${DIVISION_LABEL[shareBusiness].toLowerCase()} share`, legendLow: '0%', legendHigh: '60%+',
  } : undefined;
  const bubbles: Bubbles | undefined = theme === 'members' ? {
    values: Object.fromEntries(world.towns.map((t) => [t.id, stats[t.id].members])), color: '#3f5f2a',
    label: (id) => `${num(stats[id].members)} members, ${num(stats[id].nonmembers)} non-member customers`, legend: 'members per town (circle area)',
  } : undefined;
  const heat: Heat | undefined = catchment && heatFacility ? (() => {
    const max = Math.max(1e-9, ...Object.values(catchment.byTown).map((b) => b.value));
    return {
      values: Object.fromEntries(Object.entries(catchment.byTown).map(([k, v]) => [k, v.value / max])),
      townId: heatFacility.townId, reachMiles: catchment.reachMiles,
      label: (id: number) => {
        const b = catchment.byTown[id];
        return b && b.value > 0 ? `${heatFacility.name}: ${num(b.value)} ${catchment.unit} (${(b.share * 100).toFixed(0)}% of the town's)` : `${heatFacility.name}: none`;
      },
      legend: `${heatFacility.name}'s business by town`,
    };
  })() : undefined;

  const inBusiness = (d: string) => business === 'ALL' || d === business;
  const sites: MapSite[] = [
    ...ours.filter((f) => inBusiness(f.division)).map((f) => ({ id: f.id, townId: f.townId, ours: true, label: `${f.name} (${f.status})`, division: f.division, inactive: f.status !== 'operating' })),
    ...game.competitors.filter((c) => c.status === 'active').flatMap((c) => c.sites
      .filter((s) => inBusiness(s.division ?? 'GRAIN') && (s.arrivalYear ?? 0) <= year)
      .map((s) => ({ townId: s.townId, ours: false, label: `${competitorName(game, c)} (${DIVISION_LABEL[(s.division ?? 'GRAIN') as Business].toLowerCase()})`, division: s.division ?? 'GRAIN' }))),
  ];
  const fz = game.setup.fictionalizeBrands;
  const setTheme = (t: Theme) => setPrefs({ ...prefs, theme: t });
  const topTowns = catchment ? Object.entries(catchment.byTown).filter(([, b]) => b.value > 0).sort((a, b) => b[1].value - a[1].value).slice(0, 8) : [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <div className="xl:col-span-3">
        <TerritoryMap world={world} homeTownId={game.coop.homeTownId} fictionalize={fz} height={720} onSelectTown={setSel} selectedTownId={sel?.id}
          sites={sites} layers={layers} showDistricts={theme === 'districts'} choropleth={choropleth} bubbles={bubbles} heat={heat}
          onSelectSite={(s) => { if (s.ours && s.id !== undefined) { setFacilityId(s.id); setTheme('heat'); } }} selectedSiteId={theme === 'heat' ? facilityId ?? undefined : undefined} />
      </div>
      <div className="space-y-4">
        <Panel title="Map layers">
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 text-xs font-semibold uppercase text-stone-500">Show</legend>
            {(Object.keys(LAYER_LABEL) as MapLayer[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{LAYER_LABEL[k]}
              </label>
            ))}
          </fieldset>
          <label className="mt-3 block text-sm">Business
            <select className="input mt-1 w-full" value={business} onChange={(e) => setPrefs({ ...prefs, business: e.target.value as Business | 'ALL' })}>
              <option value="ALL">All businesses</option>
              {BUSINESSES.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}
            </select>
            <span className="text-xs text-stone-500">Filters facilities and competitors{theme === 'share' ? '; picks the market share shown' : ''}.</span>
          </label>
          <fieldset className="mt-3 space-y-1 text-sm">
            <legend className="mb-1 text-xs font-semibold uppercase text-stone-500">Shading</legend>
            {(Object.keys(THEME_LABEL) as Theme[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="map-theme" checked={theme === k} onChange={() => setTheme(k)} disabled={k === 'heat' && !ours.length} />{THEME_LABEL[k]}
              </label>
            ))}
          </fieldset>
          {theme === 'heat' && (
            <label className="mt-2 block text-sm">Facility
              <select className="input mt-1 w-full" value={facilityId ?? ''} onChange={(e) => setFacilityId(Number(e.target.value))}>
                {ours.map((f) => <option key={f.id} value={f.id}>{f.name} ({DIVISION_LABEL[f.division as Business] ?? f.division})</option>)}
              </select>
              <span className="text-xs text-stone-500">Or click one of our facilities on the map.</span>
            </label>
          )}
          {theme === 'share' && business === 'ALL' && <p className="mt-2 text-xs text-stone-500">Showing grain share; pick a business to see its share.</p>}
        </Panel>

        {theme === 'heat' && heatFacility && catchment && (
          <Panel title={heatFacility.name}>
            <div className="text-sm">About <b>{num(catchment.total)}</b> {catchment.unit} from {topTowns.length ? `${Object.values(catchment.byTown).filter((b) => b.value > 0).length} towns` : 'no towns yet'}, within {catchment.reachMiles} miles.</div>
            {topTowns.length > 0 && (
              <table className="data mt-2">
                <thead><tr><th>Town</th><th className="r">{catchment.unit}</th><th className="r">Our share</th></tr></thead>
                <tbody>{topTowns.map(([id, b]) => <tr key={id}><td>{world.towns[Number(id)].name}</td><td className="r">{num(b.value)}</td><td className="r">{(b.share * 100).toFixed(0)}%</td></tr>)}</tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-stone-500">Estimated from farms' current business with us: each town counts toward our nearest {DIVISION_LABEL[heatFacility.division as Business]?.toLowerCase() ?? ''} site within reach.</p>
          </Panel>
        )}

        <Panel title={sel ? sel.name : 'Town details'}>
          {sel ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-stone-500">County</dt><dd>{world.counties[sel.countyId].name}</dd>
              <dt className="text-stone-500">District</dt><dd>{world.districts[sel.districtId]?.name}</dd>
              <dt className="text-stone-500">Population</dt><dd className="num">{num(sel.population)}</dd>
              <dt className="text-stone-500">Highway</dt><dd>{sel.onHighway ? 'Yes' : 'No'}</dd>
              <dt className="text-stone-500">Rail</dt><dd>{sel.railLineIds.map((id) => world.rail[id].kind === 'mainline' ? 'Main line' : 'Branch').join(', ') || 'None'}</dd>
              <dt className="text-stone-500">Members</dt><dd className="num">{num(stats[sel.id].members)}</dd>
              <dt className="text-stone-500">Non-member customers</dt><dd className="num">{num(stats[sel.id].nonmembers)}</dd>
              <dt className="text-stone-500">Farm acres</dt><dd className="num">{num(stats[sel.id].acres)}</dd>
              <dt className="text-stone-500">Our {DIVISION_LABEL[shareBusiness].toLowerCase()} share</dt><dd className="num">{((share[sel.id] ?? 0) * 100).toFixed(0)}%</dd>
              <dt className="text-stone-500">Sites here</dt><dd>{sites.filter((s) => s.townId === sel.id).map((s) => s.label).join(', ') || 'None'}</dd>
            </dl>
          ) : <p className="text-sm text-stone-500">Click a town for details. Click one of our facilities to see its heatmap.</p>}
        </Panel>

        <Panel title="Rail lines">
          <ul className="space-y-1 text-sm">
            {world.rail.map((r) => (
              <li key={r.id}>
                <b>{r.kind === 'mainline' ? 'Main line' : r.name}</b> — {getBrand(r.ownerBrandId) ? brandName(r.ownerBrandId, fz) : 'short line'}
                {r.kind === 'branch' && <span className="text-xs text-stone-500"> · abandonment risk {(r.abandonmentRisk * 100).toFixed(1)}%/yr after deregulation</span>}
                <div className="text-xs text-stone-500">{r.townIds.map((id) => world.towns[id].name).join(' – ')}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
