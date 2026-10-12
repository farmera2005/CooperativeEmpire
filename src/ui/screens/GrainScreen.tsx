import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COMPONENTS, LOADOUT_COMPONENTS, type ComponentId, type LoadoutType } from '../../data/facilities';
import { COMMODITIES, COMMODITY_LABEL, type Commodity } from '../../data/grain';
import { LENDING } from '../../data/tuning';
import {
  competitorName, estimateProject, facilityBu, formatMonthShort, grainCapacity, netBookValue, renovationCost, specComponents, yearOf,
  type BuildSpec, type Components, type Facility, type GameState, type GrainPolicy,
} from '../../engine/index';
import { BreakdownView } from '../components/BreakdownView';
import { FacilitiesPanel, FinanceSlider, OffersPanel } from '../components/FacilityPanels';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { money, num } from '../format';
import { useStore } from '../store';

type GrainTab = 'overview' | 'facilities' | 'policies' | 'buy';

export function GrainScreen() {
  const [tab, setTab] = useState<GrainTab>(() => (useStore.getState().game!.coop.facilities.length ? 'overview' : 'buy'));
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['overview', 'Overview'], ['facilities', 'Facilities'], ['policies', 'Policies'], ['buy', 'Buy or build']] as [GrainTab, string][]).map(([id, l]) => (
          <button key={id} className={`btn ${tab === id ? 'btn-primary' : ''}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'facilities' && <FacilitiesPanel division="GRAIN" />}
      {tab === 'policies' && <Policies />}
      {tab === 'buy' && <BuyOrBuild />}
    </div>
  );
}

const bu = (x: number) => num(Math.round(x));
const price = (x: number) => (x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2));

function Overview() {
  const game = useStore((s) => s.game)!;
  const g = game.coop.grain;
  const r = g.report;
  const pol = game.coop.grainPolicy;
  const chart = g.reports.slice(-24).map((x) => ({
    m: formatMonthShort(x.monthIndex),
    received: Math.round(COMMODITIES.reduce((a, c) => a + x.byCommodity[c].receivedBu, 0)),
    shipped: Math.round(COMMODITIES.reduce((a, c) => a + x.byCommodity[c].shippedBu, 0)),
    turnedAway: Math.round(COMMODITIES.reduce((a, c) => a + x.byCommodity[c].turnedAwayBu, 0)),
  }));
  if (!game.coop.facilities.length) return <Panel title="Grain">The co-op has no elevator yet. Use <b>Buy or build</b> to get into the grain business.</Panel>;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title={<>Positions and <Term id="basis">basis</Term></>} className="xl:col-span-2">
        <table className="data">
          <thead>
            <tr><th>Commodity</th><th className="r">Futures</th><th className="r">Local basis</th><th className="r">Our bid</th><th className="r">Best sale (net)</th><th className="r"><Term id="carry">Carry</Term>/mo</th>
              <th className="r">Owned bu</th><th className="r"><Term id="dp">DP</Term> bu</th><th className="r"><Term id="open-storage">Open storage</Term></th><th className="r"><Term id="hedge">Futures short</Term></th><th className="r">Net open</th><th className="r">Limit</th><th className="r">Inventory value</th></tr>
          </thead>
          <tbody>
            {COMMODITIES.map((c) => {
              const p = g.pos[c];
              const m = r?.byCommodity[c];
              const open = Math.max(0, p.ownedBu - p.dpBu) - p.shortBu;
              const over = Math.abs(open) > pol.positionLimit[c];
              return (
                <tr key={c}>
                  <td>{COMMODITY_LABEL[c]}</td>
                  <td className="r">{m ? `$${m.futures.toFixed(2)}` : '—'}</td>
                  <td className="r">{m ? price(m.localBasis) : '—'}</td>
                  <td className="r">{m ? `$${(m.futures + m.ourBid).toFixed(2)} (${price(m.ourBid)})` : '—'}</td>
                  <td className="r">{m ? price(m.bestSaleNet) : '—'}</td>
                  <td className="r">{m ? `${(m.carry * 100).toFixed(1)}¢` : '—'}</td>
                  <td className="r">{bu(p.ownedBu)}</td><td className="r">{bu(p.dpBu)}</td><td className="r">{bu(p.openStorageBu)}</td>
                  <td className="r">{bu(p.shortBu)}</td>
                  <td className={`r ${over ? 'font-semibold text-rust' : ''}`}>{bu(open)}{over ? ' OVER' : ''}</td>
                  <td className="r">{bu(pol.positionLimit[c])}</td>
                  <td className="r">{money(p.book)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 text-sm text-stone-600">
          Margin account: <b>{money(g.marginAccount)}</b>{r && r.marginCall > 0 && <span className="ml-2 text-rust">Margin call this month: {money(r.marginCall)}</span>}
          <span className="ml-4">Hedge ratio {Math.round(pol.hedgeRatio * 100)}% · pricing posture {pol.posture}</span>
        </div>
      </Panel>
      <Panel title="This month">
        {r ? (
          <table className="data">
            <thead><tr><th></th>{COMMODITIES.map((c) => <th key={c} className="r">{COMMODITY_LABEL[c]}</th>)}</tr></thead>
            <tbody>
              {([['Offered to us', 'offeredBu'], ['Received', 'receivedBu'], ['Turned away', 'turnedAwayBu'], ['Bought (spot)', 'purchasedBu'], ['Shipped', 'shippedBu']] as const).map(([l, k]) => (
                <tr key={k}><td>{l}</td>{COMMODITIES.map((c) => <td key={c} className="r">{bu(r.byCommodity[c][k])}</td>)}</tr>
              ))}
              <tr><td>Shipped by</td>{COMMODITIES.map((c) => <td key={c} className="r text-xs">{Object.entries(r.byCommodity[c].shippedVia).map(([k, v]) => `${k} ${bu(v)}`).join(', ') || '—'}</td>)}</tr>
              <tr><td>Worst harvest wait</td><td className="r" colSpan={3}>{r.maxWaitHours.toFixed(1)} hours</td></tr>
            </tbody>
          </table>
        ) : <p className="text-sm text-stone-500">End a month to see grain activity.</p>}
      </Panel>
      <Panel title="Why this month's grain margin?">
        {r ? <BreakdownView b={r.grossMargin} /> : <p className="text-sm text-stone-500">No activity yet.</p>}
      </Panel>
      <Panel title="Bushels by month" className="xl:col-span-2">
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid stroke="#e7e2d3" />
              <XAxis dataKey="m" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} />
              <Tooltip formatter={(v) => `${Number(v).toLocaleString()} bu`} />
              <Legend />
              <Bar dataKey="received" fill="#3f5f2a" name="Received" />
              <Bar dataKey="shipped" fill="#c9a227" name="Shipped" />
              <Bar dataKey="turnedAway" fill="#a3472b" name="Turned away" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

function Policies() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const p = game.coop.grainPolicy;
  const set = (policy: Partial<GrainPolicy>) => command({ type: 'setGrainPolicy', policy });
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Pricing and service">
        <div className="space-y-3 text-sm">
          <label className="block">Bid posture
            <select className="input ml-2" value={p.posture} onChange={(e) => set({ posture: e.target.value as GrainPolicy['posture'] })}>
              <option value="aggressive">Aggressive (bid above the market)</option><option value="market">Market</option><option value="premium">Premium (bid under, sell service)</option>
            </select>
          </label>
          <div>Contracts offered:
            {([['offerOpenStorage', 'Open storage'], ['offerDelayedPrice', 'Delayed price'], ['offerForward', 'Forward contracts']] as const).map(([k, l]) => (
              <label key={k} className="ml-3"><input type="checkbox" checked={p[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {l}</label>
            ))}
          </div>
          <label className="block">Storage charges × <input className="input w-20" type="number" step={0.1} value={p.storageFee} onChange={(e) => set({ storageFee: Number(e.target.value) })} /> standard</label>
          <label className="block">Drying charges × <input className="input w-20" type="number" step={0.1} value={p.dryingFee} onChange={(e) => set({ dryingFee: Number(e.target.value) })} /> standard</label>
          <p className="text-xs text-stone-500">Aggressive bids win bushels but thin the margin. Farmers compare our net price after hauling with every elevator within reach, and remember long harvest waits.</p>
        </div>
      </Panel>
      <Panel title="Risk policy (board limits)">
        <div className="space-y-3 text-sm">
          <label className="block"><Term id="hedge">Hedge ratio</Term>
            <input className="ml-2 align-middle" type="range" min={0} max={1} step={0.05} value={p.hedgeRatio} onChange={(e) => set({ hedgeRatio: Number(e.target.value) })} /> {Math.round(p.hedgeRatio * 100)}%
          </label>
          {COMMODITIES.map((c: Commodity) => (
            <label key={c} className="block">{COMMODITY_LABEL[c]} position limit
              <input className="input ml-2 w-28" type="number" step={5000} value={p.positionLimit[c]} onChange={(e) => set({ positionLimit: { ...p.positionLimit, [c]: Math.max(0, Number(e.target.value)) } })} /> bu net open
            </label>
          ))}
          <label className="block">Carry appetite
            <select className="input ml-2" value={p.carryAppetite} onChange={(e) => set({ carryAppetite: e.target.value as GrainPolicy['carryAppetite'] })}>
              <option value="low">Low (ship early)</option><option value="normal">Normal</option><option value="high">High (store for carry)</option>
            </select>
          </label>
          <p className="text-xs text-stone-500">A co-op elevator is a basis trader, not a price speculator. Below a full hedge, owned grain is a bet on price. A rally with a full house brings margin calls financed on the line of credit.</p>
        </div>
      </Panel>
    </div>
  );
}

function BuyOrBuild() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [fin, setFin] = useState(0.5);
  const year = yearOf(game.clock.monthIndex);
  return (
    <div className="space-y-4">
      <OffersPanel kinds={['elevator']} fin={fin} setFin={setFin} />
      <BuildNew year={year} game={game} fin={fin} setFin={setFin} />
      <Panel title="Competing elevators">
        <table className="data">
          <thead><tr><th>Competitor</th><th>Type</th><th>Town</th><th>Capacity</th><th>Built</th></tr></thead>
          <tbody>
            {game.competitors.filter((c) => c.status === 'active').flatMap((c) => c.sites.map((s) => (
              <tr key={`${c.id}-${s.id}`}><td>{competitorName(game, c)}</td><td className="capitalize">{c.kind}</td><td>{game.world.towns[s.townId].name}</td><td className="text-xs">{bu(s.storageBu)} bu, {bu(s.receiveBuHr)} bu/hr, {s.loadout}</td><td>{s.builtYear}</td></tr>
            )))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function BuildNew({ game, year, fin, setFin }: { game: GameState; year: number; fin: number; setFin: (v: number) => void }) {
  const command = useStore((s) => s.command);
  const towns = game.world.towns;
  const [townId, setTownId] = useState(game.coop.homeTownId);
  const [spec, setSpec] = useState<BuildSpec>({ storageType: year < 1975 ? 'storage-concrete' : 'storage-steel', storageBu: 250_000, receiveBuHr: 5_000, dryBuHr: 1_000, loadout: 'truck' });
  const est = useMemo(() => estimateProject(game, townId, specComponents(spec)), [game, townId, spec]);
  const loadouts: LoadoutType[] = ['truck', ...LOADOUT_COMPONENTS.map((id) => COMPONENTS[id].loadout!)];
  return (
    <Panel title="Build a new elevator">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
        <label>Town<select className="input mt-1 w-full" value={townId} onChange={(e) => setTownId(Number(e.target.value))}>{towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.railLineIds.length ? ' (rail)' : ''}</option>)}</select></label>
        <label>Storage type<select className="input mt-1 w-full" value={spec.storageType} onChange={(e) => setSpec({ ...spec, storageType: e.target.value as BuildSpec['storageType'] })}>
          <option value="storage-concrete">Concrete silos</option><option value="storage-steel">Steel bins</option><option value="storage-flat">Flat storage</option></select></label>
        <label>Storage (bu)<input className="input mt-1 w-full" type="number" step={10_000} value={spec.storageBu} onChange={(e) => setSpec({ ...spec, storageBu: Number(e.target.value) })} /></label>
        <label>Leg (bu/hr)<input className="input mt-1 w-full" type="number" step={500} value={spec.receiveBuHr} onChange={(e) => setSpec({ ...spec, receiveBuHr: Number(e.target.value) })} /></label>
        <label>Dryer (bu/hr)<input className="input mt-1 w-full" type="number" step={100} value={spec.dryBuHr} onChange={(e) => setSpec({ ...spec, dryBuHr: Number(e.target.value) })} /></label>
        <label>Load-out<select className="input mt-1 w-full" value={spec.loadout} onChange={(e) => setSpec({ ...spec, loadout: e.target.value as LoadoutType })}>{loadouts.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
      </div>
      <div className="mt-2 text-sm">Estimated cost <b>{money(est.cost)}</b> including site, about {est.months} months to permit and build.</div>
      {est.problems.length > 0 && <div className="text-sm text-rust">{est.problems.join(' ')}</div>}
      <div className="mt-2 flex items-center gap-4">
        <FinanceSlider value={fin} onChange={setFin} />
        <button className="btn btn-primary" disabled={est.problems.length > 0} onClick={() => command({ type: 'buildElevator', townId, spec, financePct: fin })}>Approve construction</button>
      </div>
    </Panel>
  );
}
