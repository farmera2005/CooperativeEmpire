import { useMemo, useState } from 'react';
import { DIVISION_LABEL } from '../../data/supply';
import { formatMonthShort, locationAnalysis, type LocationResult } from '../../engine/index';
import { BreakdownView } from '../components/BreakdownView';
import { Panel, Stat } from '../components/Panel';
import { DIVISION_COLORS } from '../components/TerritoryMap';
import { money, num, pct } from '../format';
import { useStore } from '../store';

type SortKey = 'contribution' | 'net' | 'revenue' | 'roa' | 'name';

/** Location business analysis (D-121): each site's results, its costs, and how it ranks. */
export function LocationsScreen() {
  const game = useStore((s) => s.game)!;
  const [months, setMonths] = useState(12);
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<SortKey>('contribution');
  const [selId, setSelId] = useState<number | null>(null);
  const la = useMemo(() => locationAnalysis(game, months), [game, months]);
  const value = (r: LocationResult) => (loaded ? r.net : r.contribution);
  const rows = [...la.sites].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'revenue') return b.revenue - a.revenue;
    if (sort === 'roa') return b.returnOnAssets - a.returnOnAssets;
    return (sort === 'net' ? b.net - a.net : value(b) - value(a)) || a.facilityId - b.facilityId;
  });
  const sel = la.sites.find((r) => r.facilityId === selId) ?? rows[0];
  const towns = game.world.towns;
  const maxAbs = Math.max(1, ...la.sites.map((r) => Math.abs(value(r))));
  const losing = la.sites.filter((r) => r.status === 'operating' && value(r) < 0);
  const byTown = new Map<number, LocationResult[]>();
  for (const r of la.sites) byTown.set(r.townId, [...(byTown.get(r.townId) ?? []), r]);
  const townRows = [...byTown.entries()].map(([townId, list]) => ({
    townId, list,
    revenue: list.reduce((a, r) => a + r.revenue, 0), contribution: list.reduce((a, r) => a + r.contribution, 0), net: list.reduce((a, r) => a + r.net, 0),
  })).sort((a, b) => (loaded ? b.net - a.net : b.contribution - a.contribution));

  if (!la.sites.length) return <Panel title="Location analysis"><p className="text-sm text-stone-500">The co-op has no locations yet. Buy or build a facility to see its results here.</p></Panel>;
  const th = (k: SortKey, label: string, right = true) => (
    <th className={`${right ? 'r' : ''} cursor-pointer`} onClick={() => setSort(k)} aria-sort={sort === k ? 'descending' : undefined}>{label}{sort === k ? ' ▾' : ''}</th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label>Period <select className="input ml-1" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          <option value={3}>Last 3 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option>
        </select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={loaded} onChange={(e) => setLoaded(e.target.checked)} /> Charge corporate overhead and interest to locations (by gross revenue)</label>
        <span className="text-xs text-stone-500">{formatMonthShort(la.from)} – {formatMonthShort(la.to)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Locations" value={num(byTown.size)} sub={`${la.sites.length} sites`} />
        <Stat label={loaded ? 'Net after overhead' : 'Contribution before overhead'} value={money(la.sites.reduce((a, r) => a + value(r), 0), { compact: true })} tone={la.sites.reduce((a, r) => a + value(r), 0) >= 0 ? 'good' : 'bad'} />
        <Stat label="Sites losing money" value={num(losing.length)} tone={losing.length ? 'bad' : 'good'} sub={losing.map((r) => r.name).slice(0, 3).join(', ')} />
        <Stat label="Best return on assets" value={pct(Math.max(...la.sites.map((r) => r.returnOnAssets)), 0)} sub={[...la.sites].sort((a, b) => b.returnOnAssets - a.returnOnAssets)[0]?.name} />
      </div>
      {la.estimated && <p className="rounded border border-grain bg-[#fbf3d6] p-2 text-sm">Some sites have no volume history yet (a new site, or a save from before location tracking), so their share of division results is split evenly for now. It sharpens as months of history build up.</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Sites" className="xl:col-span-2">
          <div className="overflow-auto">
            <table className="data">
              <thead><tr>
                {th('name', 'Site', false)}<th>Business</th><th className="r">Volume</th>{th('revenue', 'Sales + services')}<th className="r">Gross margin</th><th className="r">Site costs</th><th className="r">Division costs</th>
                {th('contribution', 'Contribution')}{loaded && <><th className="r">Overhead</th>{th('net', 'Net')}</>}{th('roa', 'Return on assets')}<th>Contribution</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.facilityId} onClick={() => setSelId(r.facilityId)} className={`cursor-pointer ${sel?.facilityId === r.facilityId ? 'bg-[#f3ecd6]' : ''}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelId(r.facilityId); }}>
                    <td><div className="font-semibold">{r.name}</div><div className="text-xs text-stone-500">{towns[r.townId].name}{r.status !== 'operating' ? ` · ${r.status}` : ''}</div></td>
                    <td><span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: DIVISION_COLORS[r.division] }} /> {DIVISION_LABEL[r.division as keyof typeof DIVISION_LABEL]}</td>
                    <td className="r">{r.division === 'GRAIN' ? `${num(r.volume)} bu` : `${money(r.volume * 100, { compact: true })} won`}<div className="text-xs text-stone-500">{pct(r.volumeShare, 0)} of division</div></td>
                    <td className="r">{money(r.revenue, { compact: true })}</td>
                    <td className="r">{money(r.grossRevenue, { compact: true })}</td>
                    <td className="r">{money(-r.directTotal, { compact: true })}</td>
                    <td className="r">{money(-r.divisionCosts, { compact: true })}</td>
                    <td className={`r font-semibold ${r.contribution < 0 ? 'text-rust' : ''}`}>{money(r.contribution, { compact: true })}</td>
                    {loaded && <><td className="r">{money(-r.overhead, { compact: true })}</td><td className={`r font-semibold ${r.net < 0 ? 'text-rust' : ''}`}>{money(r.net, { compact: true })}</td></>}
                    <td className="r">{r.bookValue > 0 ? pct(r.returnOnAssets, 0) : '—'}</td>
                    <td className="w-32">
                      <div className="relative h-3 bg-stone-100" aria-hidden>
                        <div className="absolute top-0 h-3" style={{ left: value(r) >= 0 ? '50%' : `${50 - (50 * Math.abs(value(r))) / maxAbs}%`, width: `${(50 * Math.abs(value(r))) / maxAbs}%`, background: value(r) >= 0 ? '#3f5f2a' : '#a3472b' }} />
                        <div className="absolute left-1/2 top-0 h-3 w-px bg-stone-400" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">Site costs are booked to each site: its crew, depreciation, repairs, insurance, utilities, property tax, compliance and incidents. Gross margin and the division's shared costs (selling and delivery, bad debt, the division manager and salespeople) are spread by volume: bushels received for grain, sales won for farm supply. Click a site for its breakdown.</p>
        </Panel>

        {sel && (
          <Panel title={sel.name}>
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-stone-500">Town</dt><dd>{towns[sel.townId].name}</dd>
              <dt className="text-stone-500">Business</dt><dd>{DIVISION_LABEL[sel.division as keyof typeof DIVISION_LABEL]}</dd>
              <dt className="text-stone-500">Capacity</dt><dd>{sel.capacity || '—'}</dd>
              <dt className="text-stone-500">Condition</dt><dd className={sel.condition < 50 ? 'text-rust' : ''}>{Math.round(sel.condition)} / 100</dd>
              <dt className="text-stone-500">Age</dt><dd>{sel.ageYears} years</dd>
              <dt className="text-stone-500">Staffing</dt><dd>{sel.staffing}</dd>
              <dt className="text-stone-500">Maintenance</dt><dd>{sel.maintenance}</dd>
              <dt className="text-stone-500">Book value</dt><dd>{money(sel.bookValue, { compact: true })}</dd>
              <dt className="text-stone-500">Return on assets</dt><dd>{sel.bookValue > 0 ? pct(sel.returnOnAssets, 1) : '—'} a year</dd>
            </dl>
            <div className="mt-3"><BreakdownView b={sel.why} /></div>
          </Panel>
        )}
      </div>

      {byTown.size < la.sites.length && (
        <Panel title="By location (all businesses in a town)">
          <table className="data">
            <thead><tr><th>Town</th><th>Sites</th><th className="r">Sales + services</th><th className="r">Contribution</th>{loaded && <th className="r">Net</th>}</tr></thead>
            <tbody>{townRows.map((t) => (
              <tr key={t.townId}><td className="font-semibold">{towns[t.townId].name}</td><td className="text-xs">{t.list.map((r) => DIVISION_LABEL[r.division as keyof typeof DIVISION_LABEL]).join(', ')}</td>
                <td className="r">{money(t.revenue, { compact: true })}</td><td className={`r ${t.contribution < 0 ? 'text-rust' : ''}`}>{money(t.contribution, { compact: true })}</td>{loaded && <td className={`r ${t.net < 0 ? 'text-rust' : ''}`}>{money(t.net, { compact: true })}</td>}</tr>
            ))}</tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
