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
      {tab === 'facilities' && <Facilities />}
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

function capacityText(c: Components) {
  const cap = grainCapacity(c);
  return `${bu(cap.storageBu)} bu${cap.pileBu ? ` + ${bu(cap.pileBu)} pile` : ''}, leg ${bu(cap.receiveBuHr)} bu/hr, dryer ${bu(cap.dryBuHr)} bu/hr, ${cap.loadout === 'truck' ? 'truck only' : `${cap.loadout} rail`}`;
}

const UPGRADE_OPTIONS: { id: ComponentId; label: string; unit: string; def: number }[] = [
  { id: 'storage-steel', label: 'Steel bins', unit: 'bu', def: 100_000 },
  { id: 'storage-concrete', label: 'Concrete silos', unit: 'bu', def: 250_000 },
  { id: 'storage-flat', label: 'Flat storage', unit: 'bu', def: 250_000 },
  { id: 'ground-pile', label: 'Ground pile', unit: 'bu', def: 300_000 },
  { id: 'receiving', label: 'Receiving pit & leg', unit: 'bu/hr', def: 5_000 },
  { id: 'dryer', label: 'Dryer', unit: 'bu/hr', def: 1_000 },
  ...LOADOUT_COMPONENTS.map((id) => ({ id, label: COMPONENTS[id].label, unit: 'each', def: 1 })),
];

function Facilities() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [sel, setSel] = useState<number | null>(null);
  const list = game.coop.facilities.filter((f) => f.status !== 'closed');
  const selected = list.find((f) => f.id === sel) ?? null;
  return (
    <div className="space-y-4">
      <Panel title="Elevators">
        {!list.length ? <p className="text-sm text-stone-500">No facilities.</p> : (
          <table className="data">
            <thead><tr><th>Facility</th><th>Status</th><th>Capacity</th><th className="r">Inventory</th><th className="r">Condition</th><th className="r">Wait memory</th><th>Staffing</th><th className="r">Book value</th><th></th></tr></thead>
            <tbody>
              {list.map((f) => {
                const cap = grainCapacity(f.components);
                return (
                  <tr key={f.id} className={sel === f.id ? 'bg-[#f1ead2]' : ''}>
                    <td><button className="hover:underline" onClick={() => setSel(f.id)}>{f.name}</button><div className="text-xs text-stone-500">built {f.builtYear}</div></td>
                    <td className="capitalize">{f.status === 'underConstruction' ? 'under construction' : f.status}</td>
                    <td className="text-xs">{capacityText(f.components)}</td>
                    <td className="r">{bu(facilityBu(f))}<div className="text-xs text-stone-500">{cap.storageBu + cap.pileBu ? Math.round((100 * facilityBu(f)) / (cap.storageBu + cap.pileBu)) : 0}% full</div></td>
                    <td className={`r ${f.condition < 40 ? 'text-rust' : ''}`}>{Math.round(f.condition)}</td>
                    <td className="r">{f.grain.waitMemory.toFixed(1)} h</td>
                    <td>
                      <select className="input py-0 text-xs" value={f.staffing.level} onChange={(e) => command({ type: 'setStaffing', facilityId: f.id, level: e.target.value as Facility['staffing']['level'], pay: f.staffing.pay })}>
                        <option value="lean">Lean</option><option value="standard">Standard</option><option value="full">Full</option>
                      </select>
                      <select className="input ml-1 py-0 text-xs" value={f.staffing.pay} onChange={(e) => command({ type: 'setStaffing', facilityId: f.id, level: f.staffing.level, pay: e.target.value as Facility['staffing']['pay'] })}>
                        <option value="below">Pay below market</option><option value="at">At market</option><option value="above">Above market</option>
                      </select>
                    </td>
                    <td className="r">{money(netBookValue(game, f.id))}</td>
                    <td><button className="btn py-0" onClick={() => setSel(f.id)}>Manage</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      {game.coop.projects.length > 0 && (
        <Panel title="Capital projects under way">
          <table className="data">
            <thead><tr><th>Project</th><th className="r">Budget</th><th className="r">Spent</th><th className="r">Completes</th></tr></thead>
            <tbody>{game.coop.projects.map((p) => <tr key={p.id}><td>{p.label}</td><td className="r">{money(p.budget)}</td><td className="r">{money(p.spent)}</td><td className="r">{formatMonthShort(p.completeMonth)}</td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {selected && <ManageFacility f={selected} />}
    </div>
  );
}

function FinanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const max = LENDING.maxFinancePct.value;
  return (
    <label className="flex items-center gap-2 text-sm">
      Term loan for <input type="range" min={0} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} /> {Math.round(value * 100)}%
    </label>
  );
}

function ManageFacility({ f }: { f: Facility }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [comp, setComp] = useState<ComponentId>('storage-steel');
  const [qty, setQty] = useState(100_000);
  const [fin, setFin] = useState(0.5);
  const busy = game.coop.projects.some((p) => p.facilityId === f.id);
  const est = useMemo(() => estimateProject(game, f.townId, { [comp]: qty }, f), [game, f, comp, qty]);
  const opt = UPGRADE_OPTIONS.find((o) => o.id === comp)!;
  return (
    <Panel title={`Manage ${f.name}`}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-semibold">Upgrade</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" value={comp} onChange={(e) => { const id = e.target.value as ComponentId; setComp(id); setQty(UPGRADE_OPTIONS.find((o) => o.id === id)!.def); }}>
              {UPGRADE_OPTIONS.filter((o) => COMPONENTS[o.id].availableFrom <= yearOf(game.clock.monthIndex)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {opt.unit !== 'each' && <><input className="input w-28" type="number" value={qty} step={opt.unit === 'bu' ? 10_000 : 500} onChange={(e) => setQty(Math.max(0, Number(e.target.value)))} /> <span className="text-sm">{opt.unit}</span></>}
          </div>
          <div className="text-sm">Estimated cost <b>{money(est.cost)}</b>, about {est.months} months.</div>
          {est.problems.length > 0 && <div className="text-sm text-rust">{est.problems.join(' ')}</div>}
          <FinanceSlider value={fin} onChange={setFin} />
          <button className="btn btn-primary" disabled={busy || est.problems.length > 0} onClick={() => command({ type: 'upgradeFacility', facilityId: f.id, components: { [comp]: qty }, financePct: fin })}>Approve upgrade</button>
          {busy && <div className="text-xs text-stone-500">A project is already under way here.</div>}
        </div>
        <div className="space-y-2 text-sm">
          <div className="font-semibold">Site</div>
          <div>{capacityText(f.components)}</div>
          <div>Condition {Math.round(f.condition)}/100 · built {f.builtYear}</div>
          <button className="btn" disabled={busy} onClick={() => command({ type: 'renovateFacility', facilityId: f.id, financePct: fin })}>Renovate ({money(renovationCost(game, f))})</button>
          <div className="flex gap-2">
            {f.status === 'operating' && <button className="btn" onClick={() => command({ type: 'mothballFacility', facilityId: f.id })}>Mothball</button>}
            {f.status === 'mothballed' && <button className="btn" onClick={() => command({ type: 'reopenFacility', facilityId: f.id })}>Reopen</button>}
            <button className="btn text-rust" onClick={() => { if (window.confirm(`Close and sell ${f.name}? Members in town will be unhappy.`)) command({ type: 'closeFacility', facilityId: f.id }); }}>Close and sell</button>
          </div>
        </div>
      </div>
    </Panel>
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
      <Panel title="Elevators for sale">
        {!game.coop.offers.length ? <p className="text-sm text-stone-500">Nothing is for sale right now. New offers usually appear each January.</p> : (
          <>
            <table className="data">
              <thead><tr><th>Town</th><th>Seller</th><th>Built</th><th>Capacity</th><th className="r">Condition</th><th className="r">Asking</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {game.coop.offers.map((o) => (
                  <tr key={o.id}>
                    <td>{game.world.towns[o.townId].name}</td>
                    <td>{o.sellerName}</td>
                    <td>{o.builtYear}</td>
                    <td className="text-xs">{capacityText(o.components)}</td>
                    <td className="r">{o.diligenceDone ? `${Math.round(o.condition)}` : `${Math.round(o.conditionEstimate[0])}–${Math.round(o.conditionEstimate[1])}?`}{o.envFound && <div className="text-xs text-grain">cleanup by seller</div>}</td>
                    <td className="r">{money(o.price)}</td>
                    <td>{formatMonthShort(o.expiresMonth)}</td>
                    <td className="flex gap-1">
                      {!o.diligenceDone && <button className="btn py-0" onClick={() => command({ type: 'dueDiligence', offerId: o.id })}>Due diligence</button>}
                      <button className="btn btn-primary py-0" onClick={() => command({ type: 'buyFacility', offerId: o.id, financePct: fin })}>Buy</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center gap-4"><FinanceSlider value={fin} onChange={setFin} /><span className="text-xs text-stone-500">Due diligence costs a fee but reveals true condition and may find contamination before you own it.</span></div>
          </>
        )}
      </Panel>
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
