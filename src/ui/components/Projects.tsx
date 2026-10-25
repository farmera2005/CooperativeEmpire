// Facilities as installed units, and capital projects built from the equipment catalog (D-129).
// Site detail lists every bin, leg, dryer and tank with its maker, year, capacity and
// condition; the planner assembles a project from catalog models and makers; consultants
// design sites and manage construction.

import { Fragment, useMemo, useState } from 'react';
import { brandName } from '../../data/brands';
import { COMPONENTS, KIND_DIVISION, KIND_LABEL, TYPICAL_SITE, type ComponentId, type FacilityKind } from '../../data/facilities';
import type { EquipmentModel, MakerLine } from '../../data/equipment';
import {
  consultantsAvailable, decompose, designCost, designFee, designWarnings, footprintAcres, formatMonthShort, makersFor, modelOf, modelsFor,
  needsMaker, quoteProject, rebuildCost, siteAcres, trackRecord, unitPrice, yearOf,
  type Consultant, type Facility, type FacilityOffer, type GameState, type InstalledUnit, type LineSpec,
} from '../../engine/index';
import { pathFor } from '../../engine/world/macro';
import { money, num } from '../format';
import { useStore, type ProjectDraft } from '../store';
import { Panel } from './Panel';
import { FinanceSlider } from './FacilityPanels';

const UNIT: Record<string, string> = { bu: 'bu', buPerHr: 'bu/hr', each: '', acres: 'acres', tons: 't', tonsPerYr: 't/yr', gal: 'gal', sqft: 'sq ft' };
const capText = (component: ComponentId, qty: number) => {
  const u = COMPONENTS[component].unit;
  return u === 'each' ? (qty === 1 ? '1' : num(qty, 2)) : `${num(qty)} ${UNIT[u]}`;
};

/** Components a site of this kind is built from. */
export function kindComponents(kind: FacilityKind): ComponentId[] {
  if (kind === 'elevator') return (Object.keys(COMPONENTS) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].division === 'GRAIN');
  return (Object.keys(TYPICAL_SITE[kind]) as ComponentId[]).filter((id) => id !== 'site').concat(kind === 'energy' ? ['cardtrol'] : []);
}

/** Plain-language pros and cons of a maker against the typical one. */
export function makerTraits(l: MakerLine): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  if (l.price <= 0.97) pros.push('Lower price'); else if (l.price >= 1.04) cons.push('Premium price');
  if (l.durability <= 0.95) pros.push('Lasts longer'); else if (l.durability >= 1.03) cons.push('Wears faster');
  if (l.upkeep <= 0.97) pros.push('Cheaper upkeep'); else if (l.upkeep >= 1.02) cons.push('Costlier upkeep');
  if (l.leadMonths <= 1) pros.push('Quick delivery'); else if (l.leadMonths >= 3) cons.push(`${l.leadMonths}-month lead time`);
  if ((l.capacity ?? 1) > 1) pros.push(`+${Math.round(((l.capacity ?? 1) - 1) * 100)}% rated output`);
  if ((l.fuelUse ?? 1) < 1) pros.push('Burns less fuel');
  return { pros, cons };
}

const Traits = ({ l }: { l: MakerLine }) => {
  const t = makerTraits(l);
  return (
    <span className="flex flex-wrap gap-1">
      {t.pros.map((x) => <span key={x} className="rounded bg-[#e3eed7] px-1.5 text-xs text-field">{x}</span>)}
      {t.cons.map((x) => <span key={x} className="rounded bg-[#f6e3da] px-1.5 text-xs text-rust">{x}</span>)}
      {!t.pros.length && !t.cons.length && <span className="text-xs text-stone-500">Middle of the road</span>}
    </span>
  );
};

const condTone = (c: number) => (c < 35 ? 'text-rust font-semibold' : c < 60 ? 'text-[#8a6d1a]' : '');

/** Every unit at a site, with what can be done to it. */
export function SiteDetail({ f }: { f: Facility }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const fict = game.setup.fictionalizeBrands;
  const year = yearOf(game.clock.monthIndex);
  const acres = siteAcres(f);
  const used = footprintAcres(f.units);
  const warnings = designWarnings(f.kind, f.components, {});
  const nbv = (u: InstalledUnit) => {
    const a = game.coop.assets.find((x) => x.id === u.assetId);
    return a ? a.cost - a.accumDep : null;
  };
  const busy = new Set(game.coop.projects.flatMap((p) => (p.lines ?? []).filter((l) => !l.done && l.unitId !== undefined).map((l) => l.unitId!)));
  const groups = [...new Set(f.units.map((u) => u.component))].sort((a, b) => kindComponents(f.kind).indexOf(a) - kindComponents(f.kind).indexOf(b));
  const plan = (extra: LineSpec[] = []) => {
    const base: ProjectDraft = draft?.facilityId === f.id ? draft : { facilityId: f.id, townId: f.townId, kind: f.kind, lines: [] };
    setDraft({ ...base, lines: [...base.lines, ...extra] });
  };
  return (
    <Panel title={`${f.name}: what is there`} right={<button className="btn btn-primary py-0" onClick={() => plan()}>Plan a project here</button>}>
      <div className="mb-2 flex flex-wrap gap-4 text-sm">
        <span>Site founded {f.builtYear}</span>
        <span>Land {num(acres, 1)} acres, {num(Math.max(0, acres - used), 1)} free</span>
        <span>Overall condition <b className={condTone(f.condition)}>{Math.round(f.condition)}</b></span>
      </div>
      {warnings.length > 0 && <ul className="mb-2 list-disc pl-5 text-sm text-[#8a6d1a]">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <table className="data">
        <thead><tr><th>Unit</th><th>Maker</th><th className="r">Built</th><th className="r">Capacity</th><th className="r">Condition</th><th className="r">Book value</th><th></th></tr></thead>
        <tbody>
          {groups.map((c) => (
            <Fragment key={c}>
              <tr><td colSpan={7} className="bg-stone-50 text-xs font-semibold uppercase text-stone-500">{COMPONENTS[c].label}</td></tr>
              {f.units.filter((u) => u.component === c).map((u, i) => {
                const m = modelOf(u.modelId);
                const v = nbv(u);
                const life = COMPONENTS[c].lifeYears;
                return (
                  <tr key={u.id}>
                    <td>{c === 'site' ? 'Land' : `${m.label}${f.units.filter((x) => x.component === c).length > 1 ? ` #${i + 1}` : ''}`}{u.rebuilds ? <span className="ml-1 text-xs text-stone-500">(rebuilt {u.rebuilds}×)</span> : null}</td>
                    <td>{u.brandId ? brandName(u.brandId, fict) : <span className="text-stone-400">—</span>}</td>
                    <td className="r">{u.builtYear}<div className="text-xs text-stone-500">{life > 0 && year - u.builtYear > life ? <span className="text-rust">past its {life}-yr life</span> : `${year - u.builtYear} yr${year - u.builtYear === 1 ? '' : 's'}`}</div></td>
                    <td className="r">{capText(c, u.qty)}</td>
                    <td className={`r ${c === 'site' ? '' : condTone(u.condition)}`}>{c === 'site' ? '' : Math.round(u.condition)}</td>
                    <td className="r">{v === null ? '' : money(v)}</td>
                    <td>
                      {c !== 'site' && (
                        <span className="flex gap-1">
                          <button className="btn py-0 text-xs" disabled={busy.has(u.id) || (u.rebuilds ?? 0) >= 2 || draft?.lines.some((l) => 'rebuildUnitId' in l && l.rebuildUnitId === u.id)}
                            title={`Rebuild for about ${money(rebuildCost(game, u))}`} onClick={() => plan([{ rebuildUnitId: u.id }])}>Rebuild</button>
                          <button className="btn py-0 text-xs text-rust" disabled={busy.has(u.id)} onClick={() => { if (window.confirm(`Take down ${m.label} (${u.builtYear}) at ${f.name}? Salvage is sold; the rest of its book value is written off.`)) command({ type: 'demolishUnit', facilityId: f.id, unitId: u.id }); }}>Take down</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-stone-500">Rebuilding re-sheets, rewires and replaces wearing parts for about 40% of new, restoring most of the condition (twice at most). Equipment past its design life wears faster and costs more to keep running.</p>
    </Panel>
  );
}

/** What a site offered for sale is made of (the same units arrive if we buy it). */
export function OfferUnits({ o }: { o: FacilityOffer }) {
  const game = useStore((s) => s.game)!;
  const units = useMemo(() => {
    let n = 1;
    return decompose(o.components, { builtYear: o.builtYear, nowYear: yearOf(game.clock.monthIndex), condition: o.condition, key: `${game.setup.gameSeed}|offer|${o.id}`, nextId: () => n++ });
  }, [game.setup.gameSeed, game.clock.monthIndex, o]);
  const fict = game.setup.fictionalizeBrands;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {units.filter((u) => u.component !== 'site').map((u) => (
        <li key={u.id}>{modelOf(u.modelId).label}{u.brandId ? ` · ${brandName(u.brandId, fict)}` : ''} · {u.builtYear} · {capText(u.component, u.qty)}{o.diligenceDone ? ` · condition ${Math.round(u.condition)}` : ''}</li>
      ))}
    </ul>
  );
}

const lineKey = (l: LineSpec, i: number) => ('land' in l ? `land-${i}` : 'rebuildUnitId' in l ? `rb-${l.rebuildUnitId}` : `${l.modelId}-${l.brandId ?? ''}-${i}`);

/** Plan a capital project from the catalog: where, what, from whom, and who manages it. */
export function ProjectPlanner({ kinds }: { kinds: FacilityKind[] }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const stored = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const [fin, setFin] = useState(0.5);
  const [cat, setCat] = useState<ComponentId | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [acres, setAcres] = useState(5);
  const fict = game.setup.fictionalizeBrands;
  const mi = game.clock.monthIndex;
  const year = yearOf(mi);
  const divisions = new Set(kinds.map((k) => KIND_DIVISION[k]));
  const draft: ProjectDraft = stored && kinds.includes(stored.kind) ? stored : { townId: game.coop.homeTownId, kind: kinds[0], lines: [] };
  const update = (d: Partial<ProjectDraft>) => setDraft({ ...draft, ...d });
  const site = draft.facilityId !== undefined ? game.coop.facilities.find((f) => f.id === draft.facilityId) : undefined;
  const sites = game.coop.facilities.filter((f) => f.status !== 'closed' && divisions.has(f.division));
  const comps = kindComponents(draft.kind).filter((id) => modelsFor(id, year).length);
  const category = cat && comps.includes(cat) ? cat : comps[0];
  const models = category ? modelsFor(category, year) : [];
  const model = models.find((m) => m.id === pick) ?? null;
  const quote = useMemo(() => quoteProject(game, { ...draft, ...(draft.facilityId === undefined ? {} : { facilityId: draft.facilityId }) }), [game, draft]);
  const add = (l: LineSpec) => update({ lines: [...draft.lines, l] });
  const firms = consultantsAvailable(game);
  const pm = draft.pmId !== undefined ? firms.find((c) => c.id === draft.pmId) : undefined;
  const fromPrice = (m: EquipmentModel) => {
    const ms = needsMaker(m) ? makersFor(m.component, year, m.id) : [];
    const prices = (ms.length ? ms : [null]).map((l) => unitPrice(pathFor(game), mi, m, l ?? { brandId: '', components: [], price: 1, durability: 1, upkeep: 1, leadMonths: 0, note: '', confidence: 'low' }));
    return Math.min(...prices);
  };
  const lineLabel = (l: LineSpec) => {
    if ('land' in l) return `${l.land} acres of land`;
    if ('rebuildUnitId' in l) {
      const u = site?.units.find((x) => x.id === l.rebuildUnitId);
      return u ? `Rebuild ${modelOf(u.modelId).label} (${u.builtYear})` : 'Rebuild';
    }
    return `${modelOf(l.modelId).label}${l.brandId ? ` · ${brandName(l.brandId, fict)}` : ''}`;
  };
  return (
    <Panel title="Plan a project" right={draft.lines.length > 0 ? <button className="btn py-0" onClick={() => setDraft(null)}>Clear plan</button> : undefined}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Where
          <select className="input mt-1 block" value={draft.facilityId ?? 'new'} onChange={(e) => {
            const v = e.target.value;
            if (v === 'new') setDraft({ townId: draft.townId, kind: draft.kind, lines: [] });
            else {
              const f = sites.find((x) => x.id === Number(v))!;
              setDraft({ facilityId: f.id, townId: f.townId, kind: f.kind, lines: [] });
            }
          }}>
            <option value="new">A new site…</option>
            {sites.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        {!site && (
          <>
            <label>Town<select className="input mt-1 block" value={draft.townId} onChange={(e) => update({ townId: Number(e.target.value) })}>{game.world.towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.railLineIds.length ? ' (rail)' : ''}{t.onHighway ? ' (highway)' : ''}</option>)}</select></label>
            {kinds.length > 1 && <label>Kind<select className="input mt-1 block" value={draft.kind} onChange={(e) => update({ kind: e.target.value as FacilityKind, lines: [] })}>{kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>}
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-stone-500">Catalog, {year}</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {comps.map((id) => <button key={id} className={`btn py-0 text-xs ${id === category ? 'btn-primary' : ''}`} onClick={() => { setCat(id); setPick(null); }}>{COMPONENTS[id].label.split(' (')[0]}</button>)}
          </div>
          <table className="data">
            <thead><tr><th>Model</th><th className="r">Size</th><th className="r">Land</th><th className="r">From</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className={pick === m.id ? 'bg-[#f1ead2]' : 'cursor-pointer'} onClick={() => { setPick(m.id); setCount(1); }}>
                  <td><button className="text-left hover:underline">{m.label}</button>{m.spec && <div className="text-xs text-stone-500">{m.spec}</div>}{m.availableTo && <div className="text-xs text-[#8a6d1a]">last offered {m.availableTo - 1}</div>}</td>
                  <td className="r">{capText(m.component, m.size)}</td>
                  <td className="r">{m.footprintAcres ? `${num(m.footprintAcres, m.footprintAcres < 1 ? 2 : 1)} ac` : ''}</td>
                  <td className="r">{money(fromPrice(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {model && <ModelMakers m={model} count={count} setCount={setCount} onAdd={(brandId) => { add({ modelId: model.id, ...(brandId ? { brandId } : {}), count }); setPick(null); }} />}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <label>Land <input className="input w-20" type="number" min={1} value={acres} onChange={(e) => setAcres(Math.max(1, Number(e.target.value)))} aria-label="Acres of land" /> acres</label>
            <button className="btn py-0" onClick={() => add({ land: acres })}>Add land</button>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-stone-500">{site ? `Project at ${site.name}` : `New ${KIND_LABEL[draft.kind].toLowerCase()} at ${game.world.towns[draft.townId]?.name}`}</div>
          {!draft.lines.length ? <p className="text-sm text-stone-500">Pick models from the catalog, or open a consultant's design. Rebuilds can be added from a site's unit list.</p> : (
            <table className="data">
              <thead><tr><th>Line</th><th className="r">Qty</th><th className="r">Cost</th><th></th></tr></thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const q = quote.lines.find((x) => x.spec === l);
                  return (
                    <tr key={lineKey(l, i)}>
                      <td>{lineLabel(l)}</td>
                      <td className="r">{'modelId' in l ? <input className="input w-16 py-0 text-right" type="number" min={1} value={l.count} aria-label="Count" onChange={(e) => update({ lines: draft.lines.map((x, j) => (j === i ? { ...l, count: Math.max(1, Math.round(Number(e.target.value))) } : x)) })} /> : ''}</td>
                      <td className="r">{q ? money(q.cost) : ''}</td>
                      <td><button className="btn py-0 text-xs" onClick={() => update({ lines: draft.lines.filter((_, j) => j !== i) })}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="mt-3 text-sm">
            <label>Project manager
              <select className="input ml-2" value={draft.pmId ?? ''} onChange={(e) => update(e.target.value ? { pmId: Number(e.target.value) } : { pmId: undefined })}>
                <option value="">None: our own people manage it</option>
                {firms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.pmFeePct * 100}% · {'★'.repeat(Math.round(c.reputation))})</option>)}
              </select>
            </label>
            {pm && <div className="mt-1 text-xs text-stone-500">{pmRecordText(game, pm)}</div>}
          </div>
          {draft.lines.length > 0 && (
            <div className="mt-3 space-y-1 rounded border border-stone-300 bg-white p-2 text-sm">
              <div>Construction <b>{money(quote.construction)}</b>{quote.pmFee > 0 && <> + management {money(quote.pmFee)}</>} = <b>{money(quote.total)}</b></div>
              <div>Permits {quote.permitMonths} month{quote.permitMonths === 1 ? '' : 's'}; finished in about {quote.months} months ({formatMonthShort(mi + quote.months)}), if nothing slips.</div>
              <div>Land: {num(quote.acresNeeded, 1)} acres needed, {num(Math.max(0, quote.acresAvailable), 1)} free.</div>
              {Object.keys(quote.capacityAdded).length > 0 && <div className="text-xs text-stone-600">Adds {(Object.keys(quote.capacityAdded) as ComponentId[]).filter((id) => id !== 'site').map((id) => `${COMPONENTS[id].label.toLowerCase()} ${capText(id, quote.capacityAdded[id]!)}`).join('; ')}.</div>}
              {quote.problems.length > 0 && <ul className="list-disc pl-5 text-rust">{quote.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
              {quote.warnings.length > 0 && <ul className="list-disc pl-5 text-[#8a6d1a]">{quote.warnings.map((p) => <li key={p}>{p}</li>)}</ul>}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <FinanceSlider value={fin} onChange={setFin} />
                <button className="btn btn-primary" disabled={quote.problems.length > 0} onClick={() => {
                  const r = command({ type: 'startProject', spec: { ...draft }, financePct: fin });
                  if (r) setDraft(null);
                }}>Approve project</button>
              </div>
              <p className="text-xs text-stone-500">Each line comes into service when it is finished. Costs and timing can run over; a good project manager narrows the surprises, a poor one widens them.</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ModelMakers({ m, count, setCount, onAdd }: { m: EquipmentModel; count: number; setCount: (n: number) => void; onAdd: (brandId?: string) => void }) {
  const game = useStore((s) => s.game)!;
  const fict = game.setup.fictionalizeBrands;
  const year = yearOf(game.clock.monthIndex);
  const makers = needsMaker(m) ? makersFor(m.component, year, m.id) : [];
  const price = (l: MakerLine) => unitPrice(pathFor(game), game.clock.monthIndex, m, l);
  return (
    <div className="mt-2 rounded border border-stone-300 bg-white p-2 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <b>{m.label}</b>
        <label className="ml-auto">How many <input className="input w-16 py-0" type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Math.round(Number(e.target.value))))} aria-label="How many" /></label>
      </div>
      {!makers.length ? <button className="btn btn-primary py-0" onClick={() => onAdd()}>Add to project</button> : (
        <table className="data">
          <thead><tr><th>Maker</th><th className="r">Each</th><th>Pros and cons</th><th></th></tr></thead>
          <tbody>
            {makers.map((l) => (
              <tr key={l.brandId}>
                <td><b>{brandName(l.brandId, fict)}</b><div className="text-xs text-stone-500">{fict ? '' : l.note}</div></td>
                <td className="r">{money(price(l))}</td>
                <td><Traits l={l} /></td>
                <td><button className="btn btn-primary py-0" onClick={() => onAdd(l.brandId)}>Add</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pmRecordText(game: GameState, c: Consultant): string {
  const r = trackRecord(game, c.id);
  return r.projects ? `Our record with them: ${r.projects} project${r.projects === 1 ? '' : 's'}, averaging ${Math.round((r.avgOverrun ?? 0) * 100)}% over budget and ${(r.avgSlip ?? 0).toFixed(1)} months late.` : 'We have not used them to manage a project before.';
}

const SPECIALTY: Record<string, string> = { grain: 'Grain', agronomy: 'Agronomy', feed: 'Feed', energy: 'Energy & retail' };

/** Firms that design sites and manage construction, and the designs we have from them. */
export function ConsultantsPanel({ kinds }: { kinds: FacilityKind[] }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const setDraft = useStore((s) => s.setDraft);
  const year = yearOf(game.clock.monthIndex);
  const divisions = new Set(kinds.map((k) => KIND_DIVISION[k]));
  const sites = game.coop.facilities.filter((f) => f.status !== 'closed' && divisions.has(f.division));
  const [target, setTarget] = useState<string>('new');
  const [townId, setTownId] = useState(game.coop.homeTownId);
  const [kind, setKind] = useState<FacilityKind>(kinds[0]);
  const firms = consultantsAvailable(game);
  const site = target === 'new' ? undefined : sites.find((f) => f.id === Number(target));
  const k = site?.kind ?? kind;
  const designs = game.coop.designs.filter((d) => kinds.includes(d.kind));
  const fict = game.setup.fictionalizeBrands;
  const firmName = (id: number) => firms.find((c) => c.id === id)?.name ?? 'A former firm';
  return (
    <div className="space-y-4">
      <Panel title="Consultants and project managers">
        <p className="mb-2 text-sm text-stone-600">
          An engineering firm can study a site's market and design what to build; it can also manage construction. Reputations are what
          the trade says, and not every firm is as good as its name. Our own record with a firm is the best guide.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
          <label>Design for
            <select className="input mt-1 block" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">A new site…</option>
              {sites.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {!site && <label>Town<select className="input mt-1 block" value={townId} onChange={(e) => setTownId(Number(e.target.value))}>{game.world.towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.railLineIds.length ? ' (rail)' : ''}</option>)}</select></label>}
          {!site && kinds.length > 1 && <label>Kind<select className="input mt-1 block" value={kind} onChange={(e) => setKind(e.target.value as FacilityKind)}>{kinds.map((x) => <option key={x} value={x}>{KIND_LABEL[x]}</option>)}</select></label>}
        </div>
        <table className="data">
          <thead><tr><th>Firm</th><th>Works in</th><th className="r">Since</th><th>Reputation</th><th className="r">Design study</th><th className="r">Manages for</th><th>Our record</th><th></th></tr></thead>
          <tbody>
            {firms.map((c) => {
              const r = trackRecord(game, c.id);
              return (
                <tr key={c.id}>
                  <td><b>{c.name}</b><div className="text-xs capitalize text-stone-500">{c.style}</div></td>
                  <td className="text-xs">{c.specialties.map((x) => SPECIALTY[x]).join(', ')}</td>
                  <td className="r">{c.founded}<div className="text-xs text-stone-500">{year - c.founded} yrs</div></td>
                  <td title="What others in the trade say">{'★'.repeat(Math.floor(c.reputation))}{c.reputation % 1 ? '½' : ''}<span className="text-stone-300">{'★'.repeat(5 - Math.ceil(c.reputation))}</span></td>
                  <td className="r">{money(designFee(game, c, k))}</td>
                  <td className="r">{(c.pmFeePct * 100).toFixed(1)}%</td>
                  <td className="text-xs">{r.projects ? `${r.projects} managed: ${Math.round((r.avgOverrun ?? 0) * 100)}% over, ${(r.avgSlip ?? 0).toFixed(1)} mo late` : r.designs ? `${r.designs} design${r.designs === 1 ? '' : 's'}` : '—'}</td>
                  <td><button className="btn py-0" onClick={() => command({ type: 'commissionDesign', consultantId: c.id, townId: site?.townId ?? townId, kind: k, ...(site ? { facilityId: site.id } : {}) })}>Commission design</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {designs.length > 0 && (
        <Panel title="Designs on hand">
          <div className="space-y-3">
            {designs.map((d) => {
              const f = d.facilityId !== undefined ? game.coop.facilities.find((x) => x.id === d.facilityId) : undefined;
              return (
                <div key={d.id} className="rounded border border-stone-300 bg-white p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{f ? f.name : `${KIND_LABEL[d.kind]} at ${game.world.towns[d.townId].name}`}</b>
                    <span className="text-stone-500">by {firmName(d.consultantId)}, {formatMonthShort(d.month)}</span>
                    <span className="ml-auto">about <b>{money(designCost(game, d))}</b></span>
                    <button className="btn btn-primary py-0" onClick={() => setDraft({
                      ...(d.facilityId !== undefined ? { facilityId: d.facilityId } : {}), townId: d.townId, kind: d.kind, designId: d.id,
                      lines: d.lines.map((l) => (l.modelId === 'land' ? { land: l.acres ?? 1 } : { modelId: l.modelId, ...(l.brandId ? { brandId: l.brandId } : {}), count: l.count })),
                    })}>Open in planner</button>
                    <button className="btn py-0" onClick={() => command({ type: 'discardDesign', designId: d.id })}>Discard</button>
                  </div>
                  <div className="mt-1 text-xs text-stone-600">Their basis: {d.basis.map((b) => `${b.label.toLowerCase()} ${num(b.value)} ${b.unit}`).join('; ')}.</div>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {d.lines.map((l, i) => <li key={i}>{l.modelId === 'land' ? `${l.acres} acres of land` : `${l.count} × ${modelOf(l.modelId).label}${l.brandId ? ` (${brandName(l.brandId, fict)})` : ''}`}</li>)}
                  </ul>
                  {d.notes.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-[#8a6d1a]">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Projects under way, line by line. */
export function ProjectsUnderWay({ facilityIds }: { facilityIds: number[] }) {
  const game = useStore((s) => s.game)!;
  const projects = game.coop.projects.filter((p) => facilityIds.includes(p.facilityId));
  if (!projects.length) return null;
  const firms = consultantsAvailable(game);
  return (
    <Panel title="Capital projects under way">
      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="text-sm">
            <div className="flex flex-wrap gap-3">
              <b>{game.coop.facilities.find((f) => f.id === p.facilityId)?.name}</b>
              <span>Budget {money(p.budget)}{p.approvedBudget && p.budget !== p.approvedBudget ? <span className={p.budget > p.approvedBudget ? 'text-rust' : 'text-field'}> (approved {money(p.approvedBudget)})</span> : null}</span>
              <span>Spent {money(p.spent)}</span>
              <span>Finishes {formatMonthShort(p.completeMonth)}</span>
              {p.pmId !== undefined && <span className="text-stone-500">Managed by {firms.find((c) => c.id === p.pmId)?.name ?? 'a consultant'}</span>}
              {p.permitMonth !== undefined && game.clock.monthIndex < p.permitMonth && <span className="text-[#8a6d1a]">Waiting on permits until {formatMonthShort(p.permitMonth)}</span>}
            </div>
            {p.lines ? (
              <table className="data mt-1">
                <tbody>
                  {p.lines.map((l, i) => (
                    <tr key={i}><td>{l.label}</td><td className="r">{money(l.budget)}</td><td className="r">{l.done ? <span className="text-field">in service</span> : formatMonthShort(l.completeMonth)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="text-xs text-stone-500">{p.label}</div>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
