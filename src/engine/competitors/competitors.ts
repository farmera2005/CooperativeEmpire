// Competitors (M2: static grain elevators) and the marketplace of facilities for sale.

import { brandName, brandsAvailable, getBrand } from '../../data/brands';
import { COMPETITORS, ELEVATOR_SIZES, MARKETPLACE } from '../../data/grain';
import { SURNAMES } from '../../data/names';
import { LOADOUT_COMPONENTS, COMPONENTS, typicalSite, type ComponentId, type FacilityKind, type LoadoutType } from '../../data/facilities';
import { SUPPLY_COMPETITORS, SUPPLY_DIVISIONS, type SupplyDivision } from '../../data/supply';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import type { Rng } from '../core/rng';
import type { Competitor, CompetitorSite, FacilityOffer, GameState, Town } from '../types';
import { nominalCents } from '../world/macro';
import type { MarketPath } from '../world/marketPath';
import type { Components } from '../facilities/facilities';
import { competitorSiteKey, siteUnits, usedValueOfUnits } from '../facilities/valuation';

function rangeAt(table: { year: number; value: number[] }[], year: number): [number, number] {
  let lo = table[0];
  let hi = table[table.length - 1];
  for (const p of table) if (p.year <= year) lo = p;
  for (const p of [...table].reverse()) if (p.year >= year) hi = p;
  if (lo === hi) return [lo.value[0], lo.value[1]];
  const t = (year - lo.year) / (hi.year - lo.year);
  return [lo.value[0] + (hi.value[0] - lo.value[0]) * t, lo.value[1] + (hi.value[1] - lo.value[1]) * t];
}

const roundTo = (x: number, step: number) => Math.max(step, Math.round(x / step) * step);

export function eraElevator(rng: Rng, year: number, scale = 1): Omit<CompetitorSite, 'id' | 'townId' | 'loadout' | 'builtYear' | 'condition'> {
  const [s0, s1] = rangeAt(ELEVATOR_SIZES.storageBu, year);
  const [r0, r1] = rangeAt(ELEVATOR_SIZES.receiveBuHr, year);
  const [d0, d1] = rangeAt(ELEVATOR_SIZES.dryBuHr, year);
  const u = rng.next();
  return {
    storageBu: roundTo((s0 + (s1 - s0) * u) * scale, 10_000),
    receiveBuHr: roundTo((r0 + (r1 - r0) * (0.5 * u + 0.5 * rng.next())) * scale, 500),
    dryBuHr: roundTo((d0 + (d1 - d0) * (0.5 * u + 0.5 * rng.next())) * scale, 100),
  };
}

function loadoutFor(rng: Rng, kind: Competitor['kind'], town: Town, state: GameState, year: number): LoadoutType {
  const lines = town.railLineIds.map((id) => state.world.rail[id]).filter((r) => r.status === 'active');
  if (!lines.length) return 'truck';
  const main = lines.some((r) => r.kind === 'mainline');
  const options = LOADOUT_COMPONENTS.map((id) => COMPONENTS[id])
    .filter((c) => c.availableFrom <= year - 3 && (c.requires !== 'mainline' || main))
    .map((c) => c.loadout!);
  if (kind === 'national') return options[options.length - 1] ?? 'single';
  if (kind === 'coop') return rng.pick(options.slice(0, Math.min(options.length, 3)));
  return rng.chance(0.7) ? 'single' : 'truck';
}

export function generateCompetitors(state: GameState, rng: Rng, year: number): Competitor[] {
  const out: Competitor[] = [];
  const nationals = brandsAvailable('grainBuyer', year, state.world.regionId).filter((b) => ['cargill', 'adm', 'andersons', 'continental-grain', 'bunge', 'cgb'].includes(b.id));
  const shares = COMPETITORS.kindShares.value;
  let nextId = 1;
  for (const town of state.world.towns) {
    const p = town.isCountySeat ? COMPETITORS.elevatorProbSeat.value : COMPETITORS.elevatorProbTown.value;
    if (!rng.chance(p)) continue;
    const onMain = town.railLineIds.some((id) => state.world.rail[id]?.kind === 'mainline');
    let kind: Competitor['kind'] = rng.next() < shares.independent / (shares.independent + shares.coop) ? 'independent' : 'coop';
    if (onMain && town.isCountySeat && nationals.length && rng.chance(shares.national * 3)) kind = 'national';
    const brand = kind === 'national' ? rng.pick(nationals) : undefined;
    const name = kind === 'national' ? brand!.name
      : kind === 'coop' ? `${town.name} Farmers ${rng.pick(['Co-op', 'Elevator Co-op', 'Grain Co-op', 'Union'])}`
      : rng.chance(0.5) ? `${rng.pick(SURNAMES)} Grain Co.` : `${town.name} Grain & Feed`;
    const builtYear = year - rng.int(5, kind === 'independent' ? 55 : 35);
    const site: CompetitorSite = {
      id: 1, townId: town.id, ...eraElevator(rng, year, kind === 'national' ? COMPETITORS.sizeScale.value.national : kind === 'coop' ? COMPETITORS.sizeScale.value.coop : COMPETITORS.sizeScale.value.independent),
      loadout: loadoutFor(rng, kind, town, state, year), builtYear, condition: Math.round(rng.range(40, 92)),
    };
    out.push({
      id: nextId++, name, kind, ...(brand ? { brandId: brand.id } : {}), sites: [site],
      posture: Math.round(rng.normal(0, COMPETITORS.postureSd.value) * 1000) / 1000,
      service: clamp(rng.normal(kind === 'national' ? 0.2 : 0, COMPETITORS.serviceSd.value), -1, 1),
      status: 'active', ownerAge: rng.int(kind === 'independent' ? 45 : 35, kind === 'independent' ? 78 : 60), volumeYtd: 0,
    });
  }
  return out;
}

export function competitorName(state: GameState, c: Competitor): string {
  return c.brandId ? brandName(c.brandId, state.setup.fictionalizeBrands) : c.name;
}

/** Components of an existing elevator described by a competitor site. */
export function siteComponents(site: CompetitorSite): Components {
  if (site.components) return { ...site.components };
  const comps: Components = { site: Math.round(5 + site.storageBu / 100_000), receiving: site.receiveBuHr, dryer: site.dryBuHr, 'truck-scale': 1 };
  // What the main house was built of in its day: wood cribs before the mid-1950s, slipform
  // concrete into the 1970s, steel after (D-130); later annexes are steel.
  const [main, share]: [ComponentId, number] = site.builtYear < 1955 ? ['storage-wood', 0.7] : site.builtYear < 1976 ? ['storage-concrete', 0.6] : site.builtYear < 1990 ? ['storage-concrete', 0.25] : ['storage-steel', 1];
  if (main === 'storage-steel') comps['storage-steel'] = site.storageBu;
  else {
    comps[main] = roundTo(site.storageBu * share, 1000);
    comps['storage-steel'] = site.storageBu - (comps[main] ?? 0);
  }
  const lo = LOADOUT_COMPONENTS.find((id) => COMPONENTS[id].loadout === site.loadout);
  if (lo) comps[lo as ComponentId] = 1;
  return comps;
}

/** What a competitor's site is worth, nominal cents: its units at modern-equivalent cost, depreciated (D-130). */
export function siteValue(state: GameState, path: MarketPath, mi: number, comp: Competitor, site: CompetitorSite): number {
  return usedValueOfUnits(path, mi, site.units ?? siteUnits(state, siteComponents(site), site.builtYear, site.condition, competitorSiteKey(comp.id, site.id)));
}

export function makeOffer(state: GameState, path: MarketPath, rng: Rng, comp: Competitor, site: CompetitorSite, mi: number, year: number): FacilityOffer {
  const comps = siteComponents(site);
  const [d0, d1] = MARKETPLACE.discount.value;
  void year;
  const price = roundCents(siteValue(state, path, mi, comp, site) * rng.range(d0, d1));
  const err = () => rng.int(3, 15);
  const [e0, e1] = MARKETPLACE.envLiabilityCost.value;
  return {
    id: state.coop.nextId++, competitorId: comp.id, townId: site.townId, kind: site.kind ?? 'elevator',
    sellerName: comp.kind === 'independent' ? `${comp.name} (owner retiring)` : competitorName(state, comp),
    components: comps, unitsKey: competitorSiteKey(comp.id, site.id), ...(site.units ? { units: site.units.map((u) => ({ ...u })) } : {}), builtYear: site.builtYear, condition: site.condition,
    conditionEstimate: [clamp(site.condition - err(), 5, 100), clamp(site.condition + err(), 5, 100)],
    price, expiresMonth: mi + MARKETPLACE.offerMonths, diligenceDone: false,
    envLiability: rng.chance(MARKETPLACE.envLiabilityProb.value) ? nominalCents(path, mi, rng.range(e0, e1)) : 0, envFound: false,
  };
}

/** Offers from retiring independents. Older owners are more likely to sell. */
export function generateOffers(state: GameState, path: MarketPath, rng: Rng, count: number, mi: number, year: number, preferTownId?: number): void {
  const offered = new Set(state.coop.offers.map((o) => o.competitorId));
  for (let i = 0; i < count; i++) {
    const pool = state.competitors.filter((c) => c.status === 'active' && c.kind === 'independent' && !offered.has(c.id) && c.sites.length && (c.sites[0].arrivalYear ?? 0) <= year);
    if (!pool.length) return;
    const home = preferTownId !== undefined && i === 0 ? pool.find((c) => c.sites[0].townId === preferTownId && (c.sites[0].kind ?? 'elevator') === 'elevator') : undefined;
    const comp = home ?? rng.weighted(pool, (c) => Math.max(1, c.ownerAge - 45) ** 2);
    offered.add(comp.id);
    state.coop.offers.push(makeOffer(state, path, rng, comp, comp.sites[0], mi, year));
  }
}

/** Ensure there is an independent elevator in the home town so the founding offer exists. */
export function ensureHomeIndependent(state: GameState, rng: Rng, year: number): void {
  const home = state.coop.homeTownId;
  if (state.competitors.some((c) => c.kind === 'independent' && c.sites.some((s) => s.townId === home))) return;
  const town = state.world.towns[home];
  const id = Math.max(0, ...state.competitors.map((c) => c.id)) + 1;
  state.competitors.push({
    id, name: `${rng.pick(SURNAMES)} Grain Co.`, kind: 'independent',
    sites: [{ id: 1, townId: home, ...eraElevator(rng, year, COMPETITORS.sizeScale.value.independent * 0.8), loadout: loadoutFor(rng, 'independent', town, state, year), builtYear: year - rng.int(20, 50), condition: Math.round(rng.range(45, 80)) }],
    posture: 0, service: 0, status: 'active', ownerAge: rng.int(66, 76), volumeYtd: 0,
  });
}

const SUPPLY_KIND: Record<SupplyDivision, FacilityKind[]> = { AGRONOMY: ['agronomy'], FEED: ['feedmill'], ENERGY: ['energy'], RETAIL: ['station', 'farmstore'] };
const SUPPLY_NAMES: Record<FacilityKind, string[]> = {
  elevator: [],
  agronomy: ['{s} Fertilizer & Chemical', '{t} Ag Service', '{s} Farm Supply'],
  feedmill: ['{s} Feed Mill', '{t} Feed & Seed'],
  energy: ['{s} Oil Co.', '{t} Propane', '{s} Fuel Service'],
  station: ['{s} Service Station', '{t} Gas & Go', '{s} Mobil-style Station'],
  farmstore: ['{s} Hardware', '{t} Farm & Home'],
};

/** Typical site components for a supply competitor, scaled. */
function scaledSite(kind: Exclude<FacilityKind, 'elevator'>, scale: number, year: number): Components {
  const base = typicalSite(kind, year);
  const out: Components = {};
  for (const id of Object.keys(base) as ComponentId[]) {
    const q = base[id] ?? 0;
    out[id] = COMPONENTS[id].unit === 'each' || id === 'site' ? Math.max(1, Math.round(q * scale)) : Math.round((q * scale) / 100) * 100;
  }
  return out;
}

/** Local dealers in each supply division, plus real chains that open in county seats over the years. */
export function generateSupplyCompetitors(state: GameState, rng: Rng, year: number): void {
  let nextId = Math.max(0, ...state.competitors.map((c) => c.id)) + 1;
  for (const division of SUPPLY_DIVISIONS) {
    const cfg = SUPPLY_COMPETITORS[division];
    for (const town of state.world.towns) {
      for (const kind of SUPPLY_KIND[division]) {
        if (kind === 'farmstore' && !town.isCountySeat && town.population < 1500) continue;
        if (!rng.chance(town.isCountySeat ? cfg.probSeat : cfg.probTown)) continue;
        const coop = division !== 'RETAIL' && rng.chance(0.35);
        const pattern = rng.pick(SUPPLY_NAMES[kind]);
        const name = coop ? `${town.name} Farmers ${division === 'ENERGY' ? 'Oil Co-op' : division === 'FEED' ? 'Feed Co-op' : 'Supply Co-op'}` : pattern.replace('{s}', rng.pick(SURNAMES)).replace('{t}', town.name);
        const scale = rng.range(0.5, 1.2);
        state.competitors.push({
          id: nextId++, name, kind: coop ? 'coop' : 'independent',
          sites: [{ id: 1, townId: town.id, division, kind, components: scaledSite(kind as Exclude<FacilityKind, 'elevator'>, scale, year), storageBu: 0, receiveBuHr: 0, dryBuHr: 0, loadout: 'truck', builtYear: year - rng.int(5, 40), condition: Math.round(rng.range(40, 90)) }],
          posture: Math.round(rng.normal(0, 1.2) * 10) / 10, service: clamp(rng.normal(0, COMPETITORS.serviceSd.value), -1, 1),
          status: 'active', ownerAge: rng.int(40, 76), volumeYtd: 0,
        });
      }
    }
  }
  for (const ch of SUPPLY_COMPETITORS.chains) {
    const brand = getBrand(ch.brandId);
    if (!brand) continue;
    for (const town of state.world.towns.filter((t) => t.isCountySeat)) {
      if (!rng.chance(ch.prob)) continue;
      const arrival = Math.max(year + 1, rng.int(ch.from, ch.to));
      if (arrival > ch.to && year > ch.to) continue;
      const kind = ch.kind as Exclude<FacilityKind, 'elevator'>;
      state.competitors.push({
        id: nextId++, name: brand.name, kind: 'national', brandId: brand.id,
        sites: [{ id: 1, townId: town.id, division: ch.division, kind, components: scaledSite(kind, 1.5, arrival), storageBu: 0, receiveBuHr: 0, dryBuHr: 0, loadout: 'truck', builtYear: arrival, condition: 95, arrivalYear: year >= ch.from ? Math.min(arrival, year) : arrival }],
        // Chains compete on price and convenience.
        posture: 1.5, service: 0.2, status: 'active', ownerAge: 50, volumeYtd: 0,
      });
    }
  }
}
