// Installed units (D-129): each bin, leg, dryer, tank, truck and building at a site, with its
// maker, year, condition and capacity. A facility's capacity (`components`) and condition are
// derived from its units by syncFacility; every change to units goes through here.

import { COMPONENTS, midCost, type ComponentId } from '../../data/facilities';
import { MAKER_LINES, MODELS, TYPICAL_MAKER, type EquipmentModel, type MakerLine } from '../../data/equipment';
import { getBrand } from '../../data/brands';
import { yearOf } from '../core/calendar';
import { makeRng } from '../core/rng';
import { roundCents, type Cents } from '../core/money';
import type { Facility, InstalledUnit } from '../types';
import { constructionLevel } from '../world/macro';
import type { MarketPath } from '../world/marketPath';

type Components = Partial<Record<ComponentId, number>>;

const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

/** A catalog model, or a stand-in for a legacy unit of odd size. */
export function modelOf(modelId: string): EquipmentModel {
  const m = MODEL_BY_ID.get(modelId);
  if (m) return m;
  const component = (modelId.startsWith('legacy:') ? modelId.slice(7) : 'site') as ComponentId;
  return { id: modelId, component, label: COMPONENTS[component]?.label ?? modelId, size: 1, availableFrom: 1900, footprintAcres: 0, confidence: 'low' };
}

const isOffered = (from: number, to: number | undefined, year: number) => from <= year && (to === undefined || year < to);

/** Models of a component that can be ordered new in `year`, smallest first. */
export function modelsFor(component: ComponentId, year: number): EquipmentModel[] {
  return MODELS.filter((m) => m.component === component && isOffered(m.availableFrom, m.availableTo, year)).sort((a, b) => a.size - b.size || a.id.localeCompare(b.id));
}

/** Years a maker line is on the market: its own years, within the brand's. */
function lineYears(l: MakerLine): [number, number | undefined] {
  const b = getBrand(l.brandId);
  const from = Math.max(l.from ?? 0, b?.availableFrom ?? 0);
  const ends = [l.to, b?.availableTo].filter((x): x is number => x !== undefined);
  return [from, ends.length ? Math.min(...ends) : undefined];
}

/** Makers selling a component (or one model of it) in `year`, by brand id. */
export function makersFor(component: ComponentId, year: number, modelId?: string): MakerLine[] {
  return MAKER_LINES.filter((l) => l.components.includes(component) && isOffered(...lineYears(l), year) && (!modelId || !l.models || l.models.includes(modelId)))
    .sort((a, b) => a.brandId.localeCompare(b.brandId));
}

/** The maker line behind a unit (typical traits when it has none or the line is unknown). */
export function makerOf(brandId: string | undefined, component: ComponentId): MakerLine {
  if (!brandId) return TYPICAL_MAKER;
  return MAKER_LINES.find((l) => l.brandId === brandId && l.components.includes(component)) ?? TYPICAL_MAKER;
}

/** Whether a model needs a maker chosen. */
export const needsMaker = (m: EquipmentModel): boolean => !m.generic && MAKER_LINES.some((l) => l.components.includes(m.component));

/** Price of one new unit in 2024 dollars as built in `year`. */
export function unitPrice2024(m: EquipmentModel, maker: MakerLine, year: number): number {
  return midCost(m.component, year) * m.size * (m.costFactor ?? 1) * maker.price;
}

/** Price of one new unit in nominal cents in month mi. */
export function unitPrice(path: MarketPath, mi: number, m: EquipmentModel, maker: MakerLine): Cents {
  return roundCents(unitPrice2024(m, maker, yearOf(mi)) * constructionLevel(path, mi) * 100);
}

/** Capacity one unit of a model adds with this maker's rating. */
export const unitCapacity = (m: EquipmentModel, maker: MakerLine): number => m.size * (maker.capacity ?? 1);

/** What an installed unit would cost new today, 2024 $ (replacement value weights). */
export function unitValue2024(u: InstalledUnit, year?: number): number {
  const m = modelOf(u.modelId);
  return midCost(u.component, year ?? u.builtYear) * u.qty * (m.costFactor ?? 1) * makerOf(u.brandId, u.component).price;
}

/** Replacement cost of a set of units in nominal cents in month mi. */
export function unitsReplacementCost(path: MarketPath, mi: number, units: InstalledUnit[]): Cents {
  const y = yearOf(mi);
  return roundCents(units.reduce((a, u) => a + unitValue2024(u, y), 0) * constructionLevel(path, mi) * 100);
}

/** Recompute a facility's capacity and condition from its units. */
export function syncFacility(f: Facility): void {
  const comps: Components = {};
  let w = 0;
  let c = 0;
  for (const u of f.units) {
    comps[u.component] = (comps[u.component] ?? 0) + u.qty;
    const v = u.component === 'site' ? 0 : unitValue2024(u);
    w += v;
    c += v * u.condition;
  }
  for (const id of Object.keys(comps) as ComponentId[]) comps[id] = Math.round(comps[id]! * 100) / 100;
  f.components = comps;
  if (w > 0) f.condition = c / w;
}

/** Wear or damage across a site's units (fires, storms, explosions), weighted to `component` if given. */
export function damageUnits(f: Facility, points: number, component?: ComponentId): void {
  for (const u of f.units) {
    if (u.component === 'site') continue;
    const hit = component && u.component !== component ? points * 0.3 : points;
    u.condition = Math.max(5, u.condition - hit);
  }
  syncFacility(f);
}

/** Ground the units take, acres. */
export const footprintAcres = (units: InstalledUnit[]): number =>
  units.reduce((a, u) => {
    if (u.component === 'site') return a;
    const m = modelOf(u.modelId);
    return a + (m.size > 0 && MODEL_BY_ID.has(u.modelId) ? m.footprintAcres * (u.qty / m.size) : legacyFootprint(u));
  }, 0);

/** Acres a legacy unit takes: as the nearest-sized model would. */
function legacyFootprint(u: InstalledUnit): number {
  const ms = MODELS.filter((m) => m.component === u.component);
  if (!ms.length) return 0;
  const near = [...ms].sort((a, b) => Math.abs(a.size - u.qty) - Math.abs(b.size - u.qty))[0];
  return near.footprintAcres * (u.qty / near.size);
}

/** Acres of land at the site. */
export const siteAcres = (f: Pick<Facility, 'units'>): number => f.units.filter((u) => u.component === 'site').reduce((a, u) => a + u.qty, 0);

/** Short description: "Behlen 48 ft bin, 1978 · 30,000 bu". */
export function unitLabel(u: InstalledUnit, brandName: (id: string) => string): string {
  const m = modelOf(u.modelId);
  const who = u.brandId ? `${brandName(u.brandId)} ` : '';
  return `${who}${m.label}`.trim();
}

/** The model a decomposition uses for `qty` of a component in `year`: the era's most common size that fits. */
function modelForDecomposition(component: ComponentId, qty: number, year: number): EquipmentModel | null {
  let options = modelsFor(component, year);
  // Before the catalog's first year for a component, use its earliest models.
  if (!options.length) {
    const all = MODELS.filter((m) => m.component === component);
    if (!all.length) return null;
    const first = Math.min(...all.map((m) => m.availableFrom));
    options = all.filter((m) => m.availableFrom === first);
    // After the last year, its latest models.
    if (first <= year) {
      const last = Math.max(...all.map((m) => m.availableFrom));
      options = all.filter((m) => m.availableFrom === last);
    }
  }
  // The largest that still leaves at least two units of anything bigger than a few units' worth.
  const fits = options.filter((m) => m.size <= qty);
  if (!fits.length) return options[0];
  const sized = fits.filter((m) => qty / m.size >= 2);
  return (sized.length ? sized : fits)[(sized.length ? sized : fits).length - 1];
}

/**
 * Split a facility described by component totals into units, for sites bought, merged, or
 * carried over from older saves. Deterministic for a key. Long-lived structures date from the
 * site's founding; shorter-lived equipment has been replaced since, so it is newer. Unit
 * conditions spread around `condition` by age.
 */
export function decompose(
  components: Components, opts: { builtYear: number; nowYear: number; condition: number; key: string; nextId: () => number },
): InstalledUnit[] {
  const rng = makeRng(`units|${opts.key}`);
  const out: InstalledUnit[] = [];
  const ids = (Object.keys(components) as ComponentId[]).filter((id) => (components[id] ?? 0) > 0).sort();
  for (const component of ids) {
    const qty = components[component]!;
    if (component === 'site') {
      out.push({ id: opts.nextId(), modelId: 'land', component, qty, builtYear: opts.builtYear, condition: 100 });
      continue;
    }
    const def = COMPONENTS[component];
    const age = opts.nowYear - opts.builtYear;
    // Equipment that wears out within the site's life has been replaced at least once.
    const year = def.lifeYears > 0 && age > def.lifeYears * 0.8
      ? Math.max(opts.builtYear, opts.nowYear - Math.round(def.lifeYears * (0.3 + 0.5 * rng.next())))
      : opts.builtYear;
    const model = modelForDecomposition(component, qty, year);
    const n = def.unit === 'each' ? Math.max(1, Math.round(qty)) : model ? Math.max(1, Math.round(qty / model.size)) : 1;
    const makers = makersFor(component, year, model?.id);
    const brandId = model && !model.generic && makers.length ? rng.pick(makers).brandId : undefined;
    let left = qty;
    for (let i = 0; i < n; i++) {
      const q = i === n - 1 ? left : Math.round((qty / n) * 100) / 100;
      left -= q;
      const unitAge = opts.nowYear - year;
      const cond = Math.max(5, Math.min(100, opts.condition + (age - unitAge) * 0.6 + (rng.next() - 0.5) * 10));
      out.push({
        id: opts.nextId(), modelId: model ? model.id : `legacy:${component}`,
        ...(brandId ? { brandId } : {}), component, qty: q, builtYear: year, condition: Math.round(cond * 10) / 10,
      });
    }
  }
  return out;
}
