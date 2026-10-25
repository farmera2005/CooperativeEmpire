import { useState } from 'react';
import { COMPONENTS, KIND_LABEL, type ComponentId, type FacilityKind } from '../../data/facilities';
import { LENDING } from '../../data/tuning';
import { MAINTENANCE } from '../../data/grain';
import {
  facilityBu, formatMonthShort, grainCapacity, netBookValue,
  type Components, type DivisionId, type Facility, type MaintenanceLevel,
} from '../../engine/index';
import { money, num } from '../format';
import { useStore } from '../store';
import { Panel } from './Panel';
import { OfferUnits, ProjectPlanner, ProjectsUnderWay, SiteDetail } from './Projects';

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
  const draft = useStore((s) => s.draft);
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
      <ProjectsUnderWay facilityIds={list.map((f) => f.id)} />
      {selected && <SiteDetail f={selected} />}
      {selected && <SiteActions f={selected} />}
      {draft && list.some((f) => f.id === draft.facilityId) && <ProjectPlanner kinds={[...new Set(list.map((f) => f.kind))]} />}
    </div>
  );
}

/** Running the site: mothball, reopen, or close it. Building happens through projects. */
export function SiteActions({ f }: { f: Facility }) {
  const command = useStore((s) => s.command);
  return (
    <Panel title={`${f.name}: operation`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {f.status === 'operating' && <button className="btn" onClick={() => command({ type: 'mothballFacility', facilityId: f.id })}>Mothball</button>}
        {f.status === 'mothballed' && <button className="btn" onClick={() => command({ type: 'reopenFacility', facilityId: f.id })}>Reopen</button>}
        <button className="btn text-rust" onClick={() => { if (window.confirm(`Close and sell ${f.name}? Members in town will be unhappy.`)) command({ type: 'closeFacility', facilityId: f.id }); }}>Close and sell</button>
        <span className="text-xs text-stone-500">To add, rebuild or replace equipment, use the unit list above and the project planner.</span>
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
                  <td className="text-xs">{capacityText(o.components, o.kind)}<details><summary className="cursor-pointer text-sky">What's there</summary><OfferUnits o={o} /></details></td>
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

