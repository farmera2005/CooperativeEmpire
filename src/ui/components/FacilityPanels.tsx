import { useMemo, useState } from 'react';
import { COMPONENTS, KIND_DIVISION, KIND_LABEL, TYPICAL_SITE, type ComponentId, type FacilityKind } from '../../data/facilities';
import { LENDING } from '../../data/tuning';
import { MAINTENANCE } from '../../data/grain';
import {
  estimateProject, facilityBu, formatMonthShort, grainCapacity, netBookValue, renovationCost, yearOf,
  type Components, type DivisionId, type Facility, type MaintenanceLevel,
} from '../../engine/index';
import { money, num } from '../format';
import { useStore } from '../store';
import { Panel } from './Panel';

const UNIT_LABEL: Record<string, string> = { bu: 'bu', buPerHr: 'bu/hr', each: '', acres: 'acres', tons: 'tons', tonsPerYr: 'tons/yr', gal: 'gal', sqft: 'sq ft' };

export function capacityText(c: Components, kind: FacilityKind = 'elevator'): string {
  if (kind === 'elevator') {
    const cap = grainCapacity(c);
    return `${num(cap.storageBu)} bu${cap.pileBu ? ` + ${num(cap.pileBu)} pile` : ''}, leg ${num(cap.receiveBuHr)} bu/hr, dryer ${num(cap.dryBuHr)} bu/hr, ${cap.loadout === 'truck' ? 'truck only' : `${cap.loadout} rail`}`;
  }
  return (Object.keys(c) as ComponentId[])
    .filter((id) => id !== 'site' && (c[id] ?? 0) > 0)
    .map((id) => {
      const def = COMPONENTS[id];
      return def.unit === 'each' ? `${c[id]} × ${def.label.toLowerCase()}` : `${def.label.split(' (')[0]} ${num(c[id] ?? 0)} ${UNIT_LABEL[def.unit]}`;
    })
    .join(', ');
}

export function FinanceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const max = LENDING.maxFinancePct.value;
  return (
    <label className="flex items-center gap-2 text-sm">
      Term loan for <input type="range" min={0} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Share financed with a term loan" /> {Math.round(value * 100)}%
    </label>
  );
}

/** Our facilities in a division, with staffing and a manage panel. */
export function FacilitiesPanel({ division }: { division: DivisionId }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [sel, setSel] = useState<number | null>(null);
  const list = game.coop.facilities.filter((f) => f.status !== 'closed' && f.division === division);
  const selected = list.find((f) => f.id === sel) ?? null;
  const projects = game.coop.projects.filter((p) => list.some((f) => f.id === p.facilityId));
  return (
    <div className="space-y-4">
      <Panel title="Our facilities">
        {!list.length ? <p className="text-sm text-stone-500">None yet. Buy one that's for sale or build one below.</p> : (
          <table className="data">
            <thead><tr><th>Facility</th><th>Status</th><th>Capacity</th>{division === 'GRAIN' && <th className="r">Inventory</th>}<th className="r">Condition</th><th>Staffing</th><th>Upkeep</th><th className="r">Book value</th><th></th></tr></thead>
            <tbody>
              {list.map((f) => {
                const cap = grainCapacity(f.components);
                return (
                  <tr key={f.id} className={sel === f.id ? 'bg-[#f1ead2]' : ''}>
                    <td><button className="hover:underline" onClick={() => setSel(f.id)}>{f.name}</button><div className="text-xs text-stone-500">built {f.builtYear}</div></td>
                    <td className="capitalize">{f.status === 'underConstruction' ? 'under construction' : f.status}</td>
                    <td className="text-xs">{capacityText(f.components, f.kind)}</td>
                    {division === 'GRAIN' && <td className="r">{num(facilityBu(f))}<div className="text-xs text-stone-500">{cap.storageBu + cap.pileBu ? Math.round((100 * facilityBu(f)) / (cap.storageBu + cap.pileBu)) : 0}% full · wait memory {f.grain.waitMemory.toFixed(1)} h</div></td>}
                    <td className={`r ${f.condition < 40 ? 'text-rust' : ''}`}>{Math.round(f.condition)}</td>
                    <td>
                      <select className="input py-0 text-xs" aria-label="Staffing level" value={f.staffing.level} onChange={(e) => command({ type: 'setStaffing', facilityId: f.id, level: e.target.value as Facility['staffing']['level'], pay: f.staffing.pay })}>
                        <option value="lean">Lean</option><option value="standard">Standard</option><option value="full">Full</option>
                      </select>
                      <select className="input ml-1 py-0 text-xs" aria-label="Pay position" value={f.staffing.pay} onChange={(e) => command({ type: 'setStaffing', facilityId: f.id, level: f.staffing.level, pay: e.target.value as Facility['staffing']['pay'] })}>
                        <option value="below">Pay below market</option><option value="at">At market</option><option value="above">Above market</option>
                      </select>
                    </td>
                    <td>
                      <select className="input py-0 text-xs" aria-label="Maintenance" value={f.maintenance ?? 'routine'} onChange={(e) => command({ type: 'setMaintenance', facilityId: f.id, level: e.target.value as MaintenanceLevel })}
                        title="Preventive upkeep costs more but cuts breakdowns and wear; deferring it saves money now and costs more later">
                        <option value="deferred">Deferred</option><option value="routine">Routine</option><option value="preventive">Preventive</option>
                      </select>
                      {f.downMonth === game.clock.monthIndex && <div className="text-xs text-rust">broken down this month</div>}
                    </td>
                    <td className="r">{money(netBookValue(game, f.id))}</td>
                    <td><button className="btn py-0" onClick={() => setSel(f.id)}>Manage</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {list.length > 0 && <p className="mt-2 text-xs text-stone-500">Upkeep: preventive maintenance spends {Math.round((MAINTENANCE.repairFactor.value.preventive - 1) * 100)}% more on repairs and makes breakdowns about {Math.round(1 / MAINTENANCE.breakdownFactor.value.preventive)}× rarer, with slower wear; deferring it halves repair spending but doubles breakdowns and speeds wear. Breakdowns strike in the busy season, take equipment out of service and bring an emergency repair bill.</p>}
      </Panel>
      {projects.length > 0 && (
        <Panel title="Capital projects under way">
          <table className="data">
            <thead><tr><th>Project</th><th className="r">Budget</th><th className="r">Spent</th><th className="r">Completes</th></tr></thead>
            <tbody>{projects.map((p) => <tr key={p.id}><td>{p.label}</td><td className="r">{money(p.budget)}</td><td className="r">{money(p.spent)}</td><td className="r">{formatMonthShort(p.completeMonth)}</td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {selected && <ManageFacility f={selected} />}
    </div>
  );
}

const DEFAULT_QTY: Partial<Record<ComponentId, number>> = {
  'storage-steel': 100_000, 'storage-concrete': 250_000, 'storage-flat': 250_000, 'ground-pile': 300_000, receiving: 5_000, dryer: 1_000,
  'dry-fert-plant': 2_000, 'nh3-storage': 150, 'liquid-fert-tanks': 1_000, 'feed-mill': 10_000, 'bulk-fuel-plant': 30_000, 'propane-storage': 30_000,
  'c-store': 500, 'farm-store': 2_000,
};

export function ManageFacility({ f }: { f: Facility }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const year = yearOf(game.clock.monthIndex);
  const options = (Object.keys(COMPONENTS) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].division === f.division && COMPONENTS[id].availableFrom <= year && !(COMPONENTS[id].buildableTo && year > COMPONENTS[id].buildableTo!));
  const [comp, setComp] = useState<ComponentId>(options[0]);
  const [qty, setQty] = useState(DEFAULT_QTY[options[0]] ?? 1);
  const [fin, setFin] = useState(0.5);
  const busy = game.coop.projects.some((p) => p.facilityId === f.id);
  const est = useMemo(() => estimateProject(game, f.townId, { [comp]: qty }, f), [game, f, comp, qty]);
  const unit = COMPONENTS[comp].unit;
  return (
    <Panel title={`Manage ${f.name}`}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-semibold">Upgrade</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" aria-label="Component" value={comp} onChange={(e) => { const id = e.target.value as ComponentId; setComp(id); setQty(DEFAULT_QTY[id] ?? 1); }}>
              {options.map((id) => <option key={id} value={id}>{COMPONENTS[id].label}</option>)}
            </select>
            <input className="input w-28" type="number" aria-label="Quantity" value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value)))} /> <span className="text-sm">{UNIT_LABEL[unit] || 'units'}</span>
          </div>
          <div className="text-sm">Estimated cost <b>{money(est.cost)}</b>, about {est.months} months.</div>
          {est.problems.length > 0 && <div className="text-sm text-rust">{est.problems.join(' ')}</div>}
          <FinanceSlider value={fin} onChange={setFin} />
          <button className="btn btn-primary" disabled={busy || est.problems.length > 0 || qty <= 0} onClick={() => command({ type: 'upgradeFacility', facilityId: f.id, components: { [comp]: qty }, financePct: fin })}>Approve upgrade</button>
          {busy && <div className="text-xs text-stone-500">A project is already under way here.</div>}
        </div>
        <div className="space-y-2 text-sm">
          <div className="font-semibold">Site</div>
          <div>{capacityText(f.components, f.kind)}</div>
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

/** Facilities of the given kinds offered for sale. */
export function OffersPanel({ kinds, fin, setFin }: { kinds: FacilityKind[]; fin: number; setFin: (v: number) => void }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const offers = game.coop.offers.filter((o) => kinds.includes(o.kind));
  return (
    <Panel title="For sale">
      {!offers.length ? <p className="text-sm text-stone-500">Nothing of this kind is for sale right now. New offers usually appear each January.</p> : (
        <>
          <table className="data">
            <thead><tr><th>Town</th><th>What</th><th>Seller</th><th>Built</th><th>Capacity</th><th className="r">Condition</th><th className="r">Asking</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>{game.world.towns[o.townId].name}</td>
                  <td>{KIND_LABEL[o.kind]}</td>
                  <td>{o.sellerName}</td>
                  <td>{o.builtYear}</td>
                  <td className="text-xs">{capacityText(o.components, o.kind)}</td>
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
  );
}

/** Build a new supply site from editable components (defaults: a typical site). */
export function BuildSupplySite({ kind, fin, setFin }: { kind: Exclude<FacilityKind, 'elevator'>; fin: number; setFin: (v: number) => void }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const year = yearOf(game.clock.monthIndex);
  const [townId, setTownId] = useState(game.coop.homeTownId);
  const [comps, setComps] = useState<Components>({ ...TYPICAL_SITE[kind] });
  const est = useMemo(() => estimateProject(game, townId, comps), [game, townId, comps]);
  const ids = (Object.keys(COMPONENTS) as ComponentId[]).filter((id) => COMPONENTS[id].division === KIND_DIVISION[kind] && COMPONENTS[id].availableFrom <= year && (TYPICAL_SITE[kind][id] !== undefined || kind === 'agronomy' || kind === 'feedmill' || kind === 'energy'));
  return (
    <Panel title={`Build a new ${KIND_LABEL[kind].toLowerCase()}`}>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <label>Town<select className="input mt-1 w-full" value={townId} onChange={(e) => setTownId(Number(e.target.value))}>{game.world.towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.onHighway ? ' (highway)' : ''}</option>)}</select></label>
        {ids.map((id) => (
          <label key={id}>{COMPONENTS[id].label}{UNIT_LABEL[COMPONENTS[id].unit] ? ` (${UNIT_LABEL[COMPONENTS[id].unit]})` : ''}
            <input className="input mt-1 w-full" type="number" min={0} value={comps[id] ?? 0} onChange={(e) => setComps({ ...comps, [id]: Math.max(0, Number(e.target.value)) })} />
          </label>
        ))}
      </div>
      <div className="mt-2 text-sm">Estimated cost <b>{money(est.cost)}</b> including site, about {est.months} months to permit and build.</div>
      {est.problems.length > 0 && <div className="text-sm text-rust">{est.problems.join(' ')}</div>}
      <div className="mt-2 flex items-center gap-4">
        <FinanceSlider value={fin} onChange={setFin} />
        <button className="btn btn-primary" disabled={est.problems.length > 0} onClick={() => command({ type: 'buildFacility', kind, townId, components: comps, financePct: fin })}>Approve construction</button>
      </div>
    </Panel>
  );
}
