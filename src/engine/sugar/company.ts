// The investor-owned sugar company in the territory (D-133). It runs a factory and a couple of
// piling stations; some years into the game it decides to get out of beet sugar and offers the
// plants to the growers — the way most U.S. beet factories became grower-owned — and closes
// the factory if no one buys it. The company and its people are fictional.

import { SUGAR, SUGAR_COMPANY, SUGAR_SALES } from '../../data/sugar';
import { typicalSite } from '../../data/facilities';
import { formatMonth, monthOf, toMonthIndex, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents } from '../core/money';
import { stream, type Rng } from '../core/rng';
import { siteUnits, usedValueOfUnits } from '../facilities/valuation';
import type { TickContext } from '../sim/context';
import { contractBeets, issueBeetShares, takeOverCampaign } from './operate';
import { buyOffer, facilityName } from '../facilities/actions';
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
export function generateSugarCompany(state: GameState, fromMonth: number, factoryTownId?: number): SugarCompany | null {
  const towns = state.world.towns;
  if (towns.length < 3) return null;
  const rng = stream(state.setup.gameSeed, -1, 'sugar.company');
  const reach = SUGAR.reachMiles.value;
  const scored = towns.map((t) => ({ id: t.id, acres: rowCropsNear(state, t.id, reach) })).sort((a, b) => b.acres - a.acres || a.id - b.id);
  const picked = rng.pick(scored.slice(0, 3));
  // A sugar co-op founded at game start buys the factory in its home town.
  const factory = factoryTownId !== undefined ? scored.find((t) => t.id === factoryTownId) ?? picked : picked;
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

/** Put the company's factory and stations up for sale until `deadline`; returns a line per site. */
function offerPlants(state: GameState, co: SugarCompany, mi: number, deadline: number, rng: Rng): string[] {
  const path = pathFor(state);
  const [p0, p1] = SUGAR_COMPANY.priceShare.value;
  const [c0, c1] = SUGAR_COMPANY.condition;
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
  return lines;
}

/** The company's retail brand and its grocers come with its factory (D-141). */
function acquireBrand(state: GameState): void {
  state.coop.sugar.brand = Math.max(state.coop.sugar.brand ?? 0, SUGAR_SALES.acquiredBrand.value);
}

const ownsFactoryAt = (state: GameState, townId: number) =>
  state.coop.facilities.some((f) => f.kind === 'sugarfactory' && f.townId === townId && f.status !== 'closed');

/** Monthly: the sale, and the factory's closing if no one buys it. */
export function stepSugarCompany(ctx: TickContext): void {
  const { state, mi } = ctx;
  const co = state.coop.sugar.company;
  if (!co) return;
  if (co.status === 'operating' && mi >= co.saleMonth) {
    const deadline = mi + SUGAR_COMPANY.offerMonths;
    const lines = offerPlants(state, co, mi, deadline, ctx.rng('sugar.company.sale'));
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
    acquireBrand(state);
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

/** Founding beet shares: committed growers take this share of a rotation's acres. */
const FOUNDING_SHARE_OF_ROTATION = 0.8;

/**
 * A sugar growers' co-op at game start (D-134): the growers organize to buy the territory's
 * investor-owned beet factory and its stations, as Red River Valley growers bought American
 * Crystal in 1973. Founding members within reach subscribe beet shares that cover the part of
 * the price the lender will not finance, plus working cash; the lender finances the rest.
 * Returns a summary for the founding memo, or null if the factory could not be bought (the
 * plants then stay on offer for the usual year).
 */
export function foundSugarCooperative(state: GameState, financePct: number): string | null {
  const co = state.coop.sugar.company;
  if (!co) return null;
  const mi = state.clock.monthIndex;
  const rng = stream(state.setup.gameSeed, -1, 'sugar.founding');
  const deadline = mi + SUGAR_COMPANY.offerMonths;
  offerPlants(state, co, mi, deadline, rng);
  co.status = 'forSale';
  co.deadline = deadline;
  co.saleMonth = mi;
  const offers = state.coop.offers.filter((o) => co.offerIds.includes(o.id));
  const price = offers.reduce((a, o) => a + o.price, 0);
  // Growers near the plants put up the equity.
  const towns = [co.factoryTownId, ...co.stationTownIds];
  const dist = state.world.distances;
  const growers = state.members.list.filter((m) => m.status === 'active' && m.kind === 'member' && towns.some((t) => dist[m.townId][t] <= SUGAR.reachMiles.value));
  const per = growers.map((m) => ({ m, shares: Math.floor((m.acres.corn + m.acres.soybeans) * SUGAR.maxRotationShare.value * FOUNDING_SHARE_OF_ROTATION) }));
  const total = per.reduce((a, g) => a + g.shares * g.m.weight, 0);
  const need = (price * (1 - financePct + SUGAR_COMPANY.foundingWorkingCash.value)) / 100;
  let shareText = '';
  if (total > 0) {
    const pricePerShare = Math.max(10, Math.ceil(need / total / 5) * 5);
    const r = issueBeetShares(state, per, pricePerShare, Math.round(total));
    shareText = `${Math.round(r.growers)} growers bought ${Math.round(r.sold).toLocaleString('en-US')} beet shares at $${pricePerShare} (one for each acre they will grow), raising ${formatCents(r.raised)}.`;
  }
  const bought: string[] = [];
  const order = [...offers].sort((a, b) => Number(b.kind === 'sugarfactory') - Number(a.kind === 'sugarfactory') || a.id - b.id);
  for (const o of order) {
    const res = buyOffer(state, o.id, financePct);
    if (res.some((x) => x.level === 'error')) {
      if (o.kind === 'sugarfactory') break;
      continue;
    }
    bought.push(`• ${facilityName(state.world.towns[o.townId].name, o.kind)}: ${formatCents(o.price)}`);
  }
  if (!ownsFactoryAt(state, co.factoryTownId)) return null;
  co.status = 'sold';
  acquireBrand(state);
  state.coop.sugarPolicy = { ...state.coop.sugarPolicy, paymentBasis: 'proceeds', growerShare: SUGAR.foundingGrowerShare };
  // The campaign under way comes with the factory: beets in the piles and sugar in the silos.
  const factory = state.coop.facilities.find((f) => f.kind === 'sugarfactory' && f.townId === co.factoryTownId)!;
  const inventory = takeOverCampaign(state, factory);
  const rest = new Set(co.offerIds);
  state.coop.offers = state.coop.offers.filter((o) => !rest.has(o.id));
  return `The growers organized to buy ${co.name}'s beet sugar business when the company decided to sell. ${shareText}\n\nBought, with ${Math.round(financePct * 100)}% financed by a term loan:\n${bought.join('\n')}${inventory > 0 ? `\n\nThe ${state.clock.monthIndex % 12 < 6 ? 'campaign under way' : 'inventory'} came with the factory: beets still in the piles and sugar in the silos, ${formatCents(inventory)} carried on the seasonal line.` : ''}\n\nBeet contracts are signed in February and the crop comes in from September. See the Sugar beets screen (U).`;
}
