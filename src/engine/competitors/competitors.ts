// Competitors (M2: static grain elevators) and the marketplace of facilities for sale.

import { brandName, brandsAvailable } from '../../data/brands';
import { COMPETITORS, ELEVATOR_SIZES, MARKETPLACE } from '../../data/grain';
import { SURNAMES } from '../../data/names';
import type { ComponentId, LoadoutType } from '../../data/facilities';
import { LOADOUT_COMPONENTS, COMPONENTS } from '../../data/facilities';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import type { Rng } from '../core/rng';
import type { Competitor, CompetitorSite, FacilityOffer, GameState, Town } from '../types';
import { nominalCents } from '../world/macro';
import type { MarketPath } from '../world/marketPath';
import { replacementCost, type Components } from '../facilities/facilities';

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
  const comps: Components = { site: Math.round(5 + site.storageBu / 100_000), receiving: site.receiveBuHr, dryer: site.dryBuHr, 'truck-scale': 1 };
  if (site.builtYear < 1955) {
    comps['storage-wood'] = roundTo(site.storageBu * 0.7, 1000);
    comps['storage-steel'] = site.storageBu - (comps['storage-wood'] ?? 0);
  } else {
    comps['storage-concrete'] = roundTo(site.storageBu * 0.6, 1000);
    comps['storage-steel'] = site.storageBu - (comps['storage-concrete'] ?? 0);
  }
  const lo = LOADOUT_COMPONENTS.find((id) => COMPONENTS[id].loadout === site.loadout);
  if (lo) comps[lo as ComponentId] = 1;
  return comps;
}

/** Depreciated replacement value of a used facility. */
export function usedValue(path: MarketPath, mi: number, comps: Components, age: number, condition: number): number {
  return replacementCost(path, mi, comps) * Math.max(0.25, 1 - age / 50) * (0.5 + condition / 200);
}

export function makeOffer(state: GameState, path: MarketPath, rng: Rng, comp: Competitor, site: CompetitorSite, mi: number, year: number): FacilityOffer {
  const comps = siteComponents(site);
  const [d0, d1] = MARKETPLACE.discount.value;
  const price = roundCents(usedValue(path, mi, comps, year - site.builtYear, site.condition) * rng.range(d0, d1));
  const err = () => rng.int(3, 15);
  const [e0, e1] = MARKETPLACE.envLiabilityCost.value;
  return {
    id: state.coop.nextId++, competitorId: comp.id, townId: site.townId,
    sellerName: comp.kind === 'independent' ? `${comp.name} (owner retiring)` : competitorName(state, comp),
    components: comps, builtYear: site.builtYear, condition: site.condition,
    conditionEstimate: [clamp(site.condition - err(), 5, 100), clamp(site.condition + err(), 5, 100)],
    price, expiresMonth: mi + MARKETPLACE.offerMonths, diligenceDone: false,
    envLiability: rng.chance(MARKETPLACE.envLiabilityProb.value) ? nominalCents(path, mi, rng.range(e0, e1)) : 0, envFound: false,
  };
}

/** Offers from retiring independents. Older owners are more likely to sell. */
export function generateOffers(state: GameState, path: MarketPath, rng: Rng, count: number, mi: number, year: number, preferTownId?: number): void {
  const offered = new Set(state.coop.offers.map((o) => o.competitorId));
  for (let i = 0; i < count; i++) {
    const pool = state.competitors.filter((c) => c.status === 'active' && c.kind === 'independent' && !offered.has(c.id) && c.sites.length);
    if (!pool.length) return;
    const home = preferTownId !== undefined && i === 0 ? pool.find((c) => c.sites[0].townId === preferTownId) : undefined;
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
