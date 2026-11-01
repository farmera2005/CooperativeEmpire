// The farm economy around the co-op (D-132). Everything here is a pure function of the game
// seed, the market path and the year, so nothing new is stored in the save:
//  - the local crop: a territory-wide weather shock on top of the region's yields, a shock per
//    county, and now and then a disaster (hail, a dry pocket, flooding, a derecho) in one county
//  - planting: corn and soybean acres answer to the soybean:corn price ratio
//  - input demand: nitrogen rates answer to the fertilizer:corn price ratio, P&K and crop
//    protection to farm income; livestock herds follow their profitability a year earlier
//  - the size of the crop, which sets how much carry and basis recovery storage earns
//  - a farm income index and local stress for credit losses

import { CROP_SIZE, ECONOMY_REPORTS, INPUT_DEMAND, LIVESTOCK_CYCLE, LOCAL_CROP, LOCAL_STRESS, PLANTING } from '../../data/economy';
import type { TickContext } from '../sim/context';
import type { Commodity } from '../../data/grain';
import type { SeriesId } from '../../data/markets';
import { monthOf, toMonthIndex, yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import { stream } from '../core/rng';
import type { GameState } from '../types';
import { annualAverage, marketValue, type MarketPath } from './marketPath';
import { pathFor } from './macro';

const YIELD: Record<Commodity, SeriesId> = { corn: 'yieldCorn', soybeans: 'yieldSoy', wheat: 'yieldWheat' };

export type DisasterKind = 'hail' | 'dry pocket' | 'flooding' | 'derecho';

export interface LocalCrop {
  year: number;
  /** Territory-wide yield factor against the region. */
  territory: number;
  /** Yield factor by county id (territory × county × any disaster). */
  county: Record<number, number>;
  disaster: { countyId: number; kind: DisasterKind; cut: number } | null;
}

const cropCache = new Map<string, LocalCrop>();

/** The year's local crop against the region's: deterministic from the seed. */
export function localCrop(state: GameState, year: number): LocalCrop {
  const key = `${state.setup.gameSeed}|${year}|${state.world.counties.length}`;
  const hit = cropCache.get(key);
  if (hit) return hit;
  const rng = stream(state.setup.gameSeed, toMonthIndex(year, 1), 'economy.localCrop');
  const territory = Math.max(LOCAL_CROP.floor, 1 + LOCAL_CROP.territorySd.value * rng.normal());
  const county: Record<number, number> = {};
  for (const c of [...state.world.counties].sort((a, b) => a.id - b.id)) county[c.id] = 1 + LOCAL_CROP.countySd.value * rng.normal();
  let disaster: LocalCrop['disaster'] = null;
  if (state.world.counties.length && rng.chance(LOCAL_CROP.disasterProb.value)) {
    const c = rng.pick([...state.world.counties].sort((a, b) => a.id - b.id));
    const [lo, hi] = LOCAL_CROP.disasterCut.value;
    disaster = { countyId: c.id, kind: rng.pick(['hail', 'dry pocket', 'flooding', 'derecho'] as const), cut: rng.range(lo, hi) };
  }
  for (const id of Object.keys(county)) {
    const cut = disaster && disaster.countyId === Number(id) ? disaster.cut : 0;
    county[Number(id)] = Math.max(LOCAL_CROP.floor, territory * county[Number(id)] * (1 - cut));
  }
  const out = { year, territory, county, disaster };
  if (cropCache.size > 400) cropCache.clear();
  cropCache.set(key, out);
  return out;
}

/** Yield factor for farms in a town in a crop year. */
export function townYieldFactor(state: GameState, year: number, townId: number): number {
  const t = state.world.towns[townId];
  return t ? localCrop(state, year).county[t.countyId] ?? 1 : 1;
}

/** Acre-weighted yield factor over the territory's farms (what the co-op sees overall). */
export function territoryYieldFactor(state: GameState, year: number): number {
  let w = 0;
  let a = 0;
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const acres = (m.acres.corn + m.acres.soybeans + m.acres.wheat) * m.weight;
    w += acres;
    a += acres * townYieldFactor(state, year, m.townId);
  }
  return w > 0 ? a / w : localCrop(state, year).territory;
}

/** The region's trend yield for a crop year, fitted to the years before it. */
export function trendYield(path: MarketPath, c: Commodity, year: number): number {
  const n = CROP_SIZE.trendYears;
  const ys: number[] = [];
  const vs: number[] = [];
  for (let y = year - n; y < year; y++) {
    ys.push(y);
    vs.push(annualAverage(path, YIELD[c], y));
  }
  const mx = ys.reduce((a, b) => a + b, 0) / n;
  const my = vs.reduce((a, b) => a + b, 0) / n;
  const den = ys.reduce((a, y) => a + (y - mx) ** 2, 0);
  const slope = den ? ys.reduce((a, y, i) => a + (y - mx) * (vs[i] - my), 0) / den : 0;
  return my + slope * (year - mx);
}

/** The region's crop against trend for a crop year (0.1 = 10% above). */
export function regionalCropDev(path: MarketPath, c: Commodity, year: number): number {
  const tr = trendYield(path, c, year);
  return tr > 0 ? annualAverage(path, YIELD[c], year) / tr - 1 : 0;
}

/** Crop year a month's marketing belongs to: the harvest just gathered (September on) or last year's. */
export const cropYearOf = (mi: number): number => (monthOf(mi) >= 9 ? yearOf(mi) : yearOf(mi) - 1);

/** The local crop against trend for the marketing year of month mi (regional × territory). */
export function localCropDev(state: GameState, c: Commodity, mi: number): number {
  const y = cropYearOf(mi);
  return (1 + regionalCropDev(pathFor(state), c, y)) * localCrop(state, y).territory - 1;
}

/** Ratio of two series this month against its average over the 10 years before. */
function ratioToNorm(path: MarketPath, a: SeriesId, b: SeriesId, mi: number): number {
  const r = (m: number) => marketValue(path, a, m) / Math.max(1e-9, marketValue(path, b, m));
  let s = 0;
  let n = 0;
  for (let k = 12; k <= 120; k += 3) {
    const v = r(mi - k);
    if (Number.isFinite(v)) { s += v; n++; }
  }
  const norm = n ? s / n : r(mi);
  return r(mi) / norm;
}

/** Soybean:corn price ratio this month and its 10-year norm. */
export function soyCornRatio(path: MarketPath, mi: number): { now: number; norm: number } {
  const r = (m: number) => marketValue(path, 'soybeans', m) / marketValue(path, 'corn', m);
  let s = 0;
  let n = 0;
  for (let k = 12; k <= 120; k += 3) { s += r(mi - k); n++; }
  return { now: r(mi), norm: s / n };
}

/** Shift in corn's share of corn+soybean acres at planting this year (negative = toward soybeans). */
export function plantingShift(path: MarketPath, year: number): number {
  const { now, norm } = soyCornRatio(path, toMonthIndex(year, 1));
  return clamp(PLANTING.cornShareSlope.value * (now - norm), -PLANTING.maxShift, PLANTING.maxShift);
}

/** Real net farm income against its 10-year average (1 = normal). */
export function nationalIncomeIndex(path: MarketPath, mi: number): number {
  const real = (m: number) => marketValue(path, 'netFarmIncome', m) / marketValue(path, 'cpi', m);
  let s = 0;
  for (let k = 1; k <= 10; k++) s += real(mi - 12 * k);
  return real(mi) / (s / 10);
}

/** Local farm income index: national income moved by the local crop against the region's. */
export function farmIncomeIndex(state: GameState, mi: number): number {
  const local = localCrop(state, cropYearOf(mi)).territory;
  return Math.max(0.2, nationalIncomeIndex(pathFor(state), mi) * (1 + 0.8 * (local - 1)));
}

/** Extra farm stress from a short local crop (added to national stress for credit losses). */
export function localStress(state: GameState, mi: number): number {
  return Math.max(0, 1 - LOCAL_STRESS.tolerance.value - territoryYieldFactor(state, cropYearOf(mi))) * LOCAL_STRESS.perShortfall.value;
}

export interface InputDemand {
  nRate: number;
  pk: number;
  cropProtection: number;
  herds: { hogs: number; dairy: number; beefCows: number; cattleOnFeed: number };
}

/** How much inputs farmers buy this month against normal, from prices and farm income. */
export function inputDemand(state: GameState, mi: number): InputDemand {
  const path = pathFor(state);
  const ind = INPUT_DEMAND;
  const nRatio = ratioToNorm(path, 'anhydrous', 'corn', mi);
  const income = farmIncomeIndex(state, mi);
  const lag = mi - LIVESTOCK_CYCLE.lagMonths;
  const herd = (series: SeriesId, p: { elasticity: number; bound: number }) =>
    clamp(1 + p.elasticity * (ratioToNorm(path, series, 'corn', lag) - 1), 1 - p.bound, 1 + p.bound);
  return {
    nRate: clamp(nRatio ** ind.nElasticity.value, ind.nBounds[0], ind.nBounds[1]),
    pk: clamp(income ** ind.pkElasticity.value, ind.pkBounds[0], ind.pkBounds[1]),
    cropProtection: clamp(income ** ind.cpElasticity.value, ind.cpBounds[0], ind.cpBounds[1]),
    herds: {
      hogs: herd('hogs', LIVESTOCK_CYCLE.hogs.value),
      dairy: herd('milk', LIVESTOCK_CYCLE.dairy.value),
      beefCows: herd('cattle', LIVESTOCK_CYCLE.beefCows.value),
      cattleOnFeed: herd('cattle', LIVESTOCK_CYCLE.cattleOnFeed.value),
    },
  };
}

/** Seasonal basis swing multiplier for the marketing year: big crops swing wider. */
export function basisSeasonFactor(state: GameState, c: Commodity, mi: number): number {
  const [lo, hi] = CROP_SIZE.basisBounds;
  return clamp(1 + CROP_SIZE.basisSeasonSlope.value * localCropDev(state, c, mi), lo, hi);
}

/** Futures carry multiplier for the marketing year: the region's crop against trend. */
export function carryFactor(path: MarketPath, c: Commodity, mi: number): number {
  const [lo, hi] = CROP_SIZE.carryBounds;
  return clamp(1 + CROP_SIZE.carrySlope.value * regionalCropDev(path, c, cropYearOf(mi)), lo, hi);
}

/** Local elevator margin multiplier for the marketing year: big crops widen it, short ones compress it. */
export function marginFactor(state: GameState, c: Commodity, mi: number): number {
  const [lo, hi] = CROP_SIZE.marginBounds;
  return clamp(1 + CROP_SIZE.marginSlope.value * localCropDev(state, c, mi), lo, hi);
}

const pctText = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

/** Reports on the farm economy in the inbox: planting in March, crop conditions in July, the harvest in November. */
export function stepFarmEconomyReports(ctx: TickContext): void {
  const { state, mi, path } = ctx;
  const month = monthOf(mi);
  const year = yearOf(mi);
  if (month === ECONOMY_REPORTS.planting) {
    const shift = plantingShift(path, year);
    const { now, norm } = soyCornRatio(path, toMonthIndex(year, 1));
    const inp = inputDemand(state, mi);
    const lean = Math.abs(shift) < 0.02 ? 'about the usual mix of corn and soybeans' : shift > 0 ? `${Math.round(shift * 100)} points more of their row-crop acres in corn than usual` : `${Math.round(-shift * 100)} points more in soybeans than usual`;
    const notes = [
      `With soybeans at ${now.toFixed(2)} times the corn price (the ten-year norm is ${norm.toFixed(2)}), farmers plan ${lean}.`,
      Math.abs(inp.nRate - 1) >= 0.03 ? `Nitrogen is ${inp.nRate < 1 ? 'dear' : 'cheap'} against corn, so rates will run about ${pctText(inp.nRate - 1)} against normal.` : '',
      Math.abs(inp.pk - 1) >= 0.05 ? (inp.pk < 1 ? `Money is tight on farms: expect phosphorus and potash sales about ${pctText(inp.pk - 1)} as farmers skip a year.` : `Farms are flush: phosphorus and potash should run about ${pctText(inp.pk - 1)} as farmers catch up.`) : '',
    ].filter(Boolean);
    ctx.inbox({ kind: 'news', title: `Planting outlook ${year}`, body: notes.join(' ') });
  }
  if (month === ECONOMY_REPORTS.conditions) {
    const lc = localCrop(state, year);
    const rng = ctx.rng('economy.conditions');
    const est = (1 + regionalCropDev(path, 'corn', year)) * lc.territory * (1 + LOCAL_CROP.julyEstimateSd.value * rng.normal()) - 1;
    const county = lc.disaster ? state.world.counties.find((c) => c.id === lc.disaster!.countyId)?.name : undefined;
    const what = { hail: 'Hail tore through', 'dry pocket': 'A dry pocket has burned up', flooding: 'Flooding drowned out', derecho: 'A derecho flattened' } as const;
    ctx.inbox({
      kind: Math.abs(est) > 0.1 || lc.disaster ? 'alert' : 'news', title: `Crop conditions, July ${year}`,
      body: `Scouts put the territory's corn at roughly ${pctText(est)} against trend.${lc.disaster && county ? ` ${what[lc.disaster.kind]} fields in ${county} County; yields there could be down ${Math.round(lc.disaster.cut * 100)}% or more.` : ''} ${est < -0.08 ? 'A short crop means fewer bushels, tight basis and little to store.' : est > 0.08 ? 'A big crop means full bins, a wide harvest basis and good storage earnings.' : ''}`.trim(),
    });
  }
  if (month === ECONOMY_REPORTS.harvest) {
    const local = localCropDev(state, 'corn', mi);
    const lc = localCrop(state, year);
    const vals = Object.entries(lc.county).map(([id, f]) => ({ name: state.world.counties.find((c) => c.id === Number(id))?.name ?? '', f })).sort((a, b) => a.f - b.f);
    const lo = vals[0];
    const hi = vals[vals.length - 1];
    ctx.inbox({
      kind: 'news', title: `Harvest report ${year}`,
      body: `Corn in our territory came in ${pctText(local)} against trend (the region ${pctText(regionalCropDev(path, 'corn', year))}).${vals.length > 1 ? ` Best: ${hi.name} County; worst: ${lo.name} County.` : ''} ${local > 0.05 ? 'Expect a wide harvest basis, a good carry and strong storage earnings, with a wider margin on what we buy.' : local < -0.05 ? 'Expect thin receipts, a narrow basis, little carry and tight margins as elevators compete for bushels.' : 'A normal year for storage and margins.'}`,
    });
  }
}

export interface FarmEconomyYear {
  year: number;
  regionalCorn: number;
  territory: number;
  disaster: { county: string; kind: DisasterKind; cut: number } | null;
  plantingShift: number;
  incomeIndex: number;
}

export interface FarmEconomyView {
  /** The marketing year the grain figures refer to. */
  cropYear: number;
  localCorn: number;
  regionalCorn: number;
  soyCorn: { now: number; norm: number };
  nToCorn: number;
  demand: InputDemand;
  incomeIndex: number;
  stress: { national: number; local: number };
  grain: { basisSwing: number; carry: number; margin: number };
  years: FarmEconomyYear[];
}

/** Everything the Farm economy panel shows, for this month and the years played. */
export function farmEconomyView(state: GameState, maxYears = 12): FarmEconomyView {
  const mi = state.clock.monthIndex;
  const path = pathFor(state);
  const cy = cropYearOf(mi);
  const first = Math.max(yearOf(mi) - maxYears + 1, Math.min(yearOf(mi), state.setup.startYear));
  const years: FarmEconomyYear[] = [];
  for (let y = first; y <= yearOf(mi); y++) {
    const lc = localCrop(state, y);
    // The year's own crop is known only once it is harvested.
    const harvested = y < yearOf(mi) || monthOf(mi) >= 10;
    years.push({
      year: y, regionalCorn: harvested ? regionalCropDev(path, 'corn', y) : NaN, territory: harvested ? lc.territory - 1 : NaN,
      disaster: lc.disaster && (y < yearOf(mi) || monthOf(mi) >= 7) ? { county: state.world.counties.find((c) => c.id === lc.disaster!.countyId)?.name ?? '', kind: lc.disaster.kind, cut: lc.disaster.cut } : null,
      plantingShift: plantingShift(path, y), incomeIndex: farmIncomeIndex(state, toMonthIndex(y, 6) > mi ? mi : toMonthIndex(y, 6)),
    });
  }
  const national = Math.max(0, 0.85 - nationalIncomeIndex(path, mi));
  return {
    cropYear: cy, localCorn: localCropDev(state, 'corn', mi), regionalCorn: regionalCropDev(path, 'corn', cy),
    soyCorn: soyCornRatio(path, mi), nToCorn: ratioToNorm(path, 'anhydrous', 'corn', mi), demand: inputDemand(state, mi),
    incomeIndex: farmIncomeIndex(state, mi), stress: { national, local: localStress(state, mi) },
    grain: { basisSwing: basisSeasonFactor(state, 'corn', mi), carry: carryFactor(path, 'corn', mi), margin: marginFactor(state, 'corn', mi) },
    years,
  };
}
