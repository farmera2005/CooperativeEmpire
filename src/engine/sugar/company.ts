// The investor-owned sugar company in the territory (D-133). It runs a factory and a couple of
// piling stations; some years into the game it decides to get out of beet sugar and offers the
// plants to the growers — the way most U.S. beet factories became grower-owned — and closes
// the factory if no one buys it. The company and its people are fictional.

import { SUGAR, SUGAR_COMPANY } from '../../data/sugar';
import { typicalSite } from '../../data/facilities';
import { formatMonth, monthOf, toMonthIndex, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents } from '../core/money';
import { stream } from '../core/rng';
import { facilityName } from '../facilities/actions';
import { siteUnits, usedValueOfUnits } from '../facilities/valuation';
import type { TickContext } from '../sim/context';
import { contractBeets } from './operate';
import type { FacilityOffer, GameState, SugarCompany } from '../types';
import { pathFor } from '../world/macro';

/** Row-crop acres (weighted) within a distance of a town. */
function rowCropsNear(state: GameState, townId: number, miles: number): number {
  const d = state.world.distances[townId];
  let a = 0;
  for (const m of state.members.list) if (m.status === 'active' && d[m.townId] <= miles) a += (m.acres.corn + m.acres.soybeans) * m.weight;
  return a;
}

/** Place the company in the beet country of the territory: the factory where row crops are thickest. */
export function generateSugarCompany(state: GameState, fromMonth: number): SugarCompany | null {
  const towns = state.world.towns;
  if (towns.length < 3) return null;
  const rng = stream(state.setup.gameSeed, -1, 'sugar.company');
  const reach = SUGAR.reachMiles.value;
  const scored = towns.map((t) => ({ id: t.id, acres: rowCropsNear(state, t.id, reach) })).sort((a, b) => b.acres - a.acres || a.id - b.id);
  const factory = rng.pick(scored.slice(0, 3));
  const [lo, hi] = SUGAR_COMPANY.stationMiles;
  const dist = state.world.distances[factory.id];
  const stations: number[] = [];
  const candidates = scored.filter((t) => t.id !== factory.id && dist[t.id] >= lo && dist[t.id] <= hi);
  for (const t of candidates) {
    if (stations.length >= SUGAR_COMPANY.stations) break;
    // Spread the stations out rather than bunching them.
    if (stations.every((s) => state.world.distances[s][t.id] >= lo)) stations.push(t.id);
  }
  const [y0, y1] = SUGAR_COMPANY.builtYear;
  const [a0, a1] = SUGAR_COMPANY.saleAfterYears;
  return {
    name: rng.pick(SUGAR_COMPANY.names), factoryTownId: factory.id, stationTownIds: stations,
    // Companies decide after a campaign's books close: the plants are offered in October, so a
    // buyer can sign growers in February.
    builtYear: rng.int(y0, y1), saleMonth: Math.max(fromMonth + 1, toMonthIndex(yearOf(fromMonth) + rng.int(a0, a1), 10)), status: 'operating', offerIds: [],
  };
}

const ownsFactoryAt = (state: GameState, townId: number) =>
  state.coop.facilities.some((f) => f.kind === 'sugarfactory' && f.townId === townId && f.status !== 'closed');

/** Monthly: the sale, and the factory's closing if no one buys it. */
export function stepSugarCompany(ctx: TickContext): void {
  const { state, mi } = ctx;
  const co = state.coop.sugar.company;
  if (!co) return;
  if (co.status === 'operating' && mi >= co.saleMonth) {
    const path = pathFor(state);
    const rng = ctx.rng('sugar.company.sale');
    const [p0, p1] = SUGAR_COMPANY.priceShare.value;
    const [c0, c1] = SUGAR_COMPANY.condition;
    const deadline = mi + SUGAR_COMPANY.offerMonths;
    const year = yearOf(mi);
    const sites: { townId: number; kind: 'sugarfactory' | 'beetstation' }[] = [{ townId: co.factoryTownId, kind: 'sugarfactory' }, ...co.stationTownIds.map((t) => ({ townId: t, kind: 'beetstation' as const }))];
    const lines: string[] = [];
    for (const s of sites) {
      // The plants were modernized over the years; they stand at what a site built then would hold.
      const builtYear = Math.max(co.builtYear, year - rng.int(15, 35));
      const components = typicalSite(s.kind, builtYear);
      const condition = Math.round(rng.range(c0, c1));
      const key = `sugarco|${s.kind}|${s.townId}`;
      const units = siteUnits(state, components, builtYear, condition, key);
      const price = roundCents(usedValueOfUnits(path, mi, units) * rng.range(p0, p1));
      const offer: FacilityOffer = {
        id: state.coop.nextId++, kind: s.kind, competitorId: null, townId: s.townId, sellerName: co.name,
        components, unitsKey: key, units: units.map((u) => ({ ...u })), builtYear, condition,
        conditionEstimate: [Math.max(5, condition - rng.int(4, 14)), Math.min(100, condition + rng.int(4, 14))],
        price, expiresMonth: deadline, diligenceDone: false, envLiability: 0, envFound: false,
      };
      state.coop.offers.push(offer);
      co.offerIds.push(offer.id);
      lines.push(`• ${facilityName(state.world.towns[s.townId].name, s.kind)}: ${formatCents(price)}`);
    }
    co.status = 'forSale';
    co.deadline = deadline;
    ctx.inbox({
      kind: 'alert', title: `${co.name} will sell its beet factory to growers — or close it`,
      body: `${co.name} has decided to leave the beet sugar business. It offers its factory and receiving stations to the growers' co-op at well under what they would cost to build; if no one buys the factory by ${formatMonth(deadline)} it will close, and growers here lose their beet market.\n\n${lines.join('\n')}\n\nGrower-owned factories pay growers for their beets at delivery and return the rest of the margin as patronage on tons delivered. Offers are on the Sugar screen; a factory needs its stations, pilers and pile ground to take in a crop.`,
    });
    return;
  }
  if (co.status !== 'forSale') return;
  if (ownsFactoryAt(state, co.factoryTownId)) {
    co.status = 'sold';
    // Contracts for this year's crop come with the plants.
    const m = monthOf(mi);
    if (m > 2 && m < SUGAR.harvest.prepileMonth && !state.coop.sugar.campaign) contractBeets(ctx);
    ctx.inbox({ kind: 'memo', title: `We own the ${state.world.towns[co.factoryTownId].name} beet factory`, body: `${co.name} has handed the factory over. Beet contracts for next year's crop are signed in February; set the acres and the payment share on the Sugar screen. Unless you set a target, we contract what the factory and stations can handle.` });
    return;
  }
  if (mi > (co.deadline ?? co.saleMonth)) {
    co.status = 'closed';
    const ids = new Set(co.offerIds);
    state.coop.offers = state.coop.offers.filter((o) => !ids.has(o.id));
    ctx.inbox({ kind: 'alert', title: `${co.name} closes its ${state.world.towns[co.factoryTownId].name} factory`, body: `No buyer came forward and the factory has sliced its last beets. Growers here lose their sugar beet contracts; a new factory would cost far more than this one did.` });
  }
}
