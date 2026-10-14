// Competitor AI (DESIGN §16), quarterly. Each competitor has a strength score standing in
// for its finances (D-012). Strong ones invest or start price wars where we are winning;
// weak ones fail (their sites come up for sale), merge with each other, or approach us.
// Nationals follow history: shuttle loaders on main lines from the mid-1990s, ethanol plants
// after the renewable fuel standard.

import { COMPETITOR_AI, ETHANOL } from '../../data/competition';
import { COMPONENTS } from '../../data/facilities';
import { yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { farmStress } from '../supply/credit';
import type { TickContext } from '../sim/context';
import type { Competitor, Destination, GameState } from '../types';
import { competitorName, makeOffer } from './competitors';
import { proposeIncomingMerger } from '../deals/deals';

const isGrain = (c: Competitor) => c.sites.some((s) => (s.division ?? 'GRAIN') === 'GRAIN');

function milesBetween(s: GameState, a: number, b: number): number {
  return s.world.distances[a]?.[b] ?? Infinity;
}

/** Are we taking business near this competitor? (Any of our sites within reach of theirs.) */
function contested(s: GameState, c: Competitor): boolean {
  return c.sites.some((site) => s.coop.facilities.some((f) => f.status === 'operating' && f.division === (site.division ?? 'GRAIN') && milesBetween(s, f.townId, site.townId) <= 15));
}

export function stepCompetitors(ctx: TickContext): void {
  const { state, mi } = ctx;
  const year = yearOf(mi);
  if (ctx.month % 3 !== 0) {
    endWars(ctx);
    return;
  }
  const rng = ctx.rng('competitors.ai');
  const stress = farmStress(ctx);
  const ai = COMPETITOR_AI;
  const active = state.competitors.filter((c) => c.status === 'active' && c.sites.length && (c.sites[0].arrivalYear ?? 0) <= year);
  for (const c of active) {
    c.strength ??= rng.int(ai.initial[0], ai.initial[1]);
    const war = c.war && c.war.until > mi ? ai.priceWarCost.value : 0;
    c.strength = clamp(c.strength + ai.reversion.value * (ai.equilibrium.value - c.strength) - ai.stressDrag.value * stress - war + rng.normal(0, ai.noise.value), 0, 100);
  }
  for (const c of active) {
    if (c.status !== 'active') continue;
    const st = c.strength ?? 50;
    // Failure: the bank closes them; their plants come up for sale at distressed prices.
    if (st < ai.failBelow.value && c.kind !== 'national') {
      c.status = 'failed';
      c.lastMove = 'failed';
      for (const site of c.sites) {
        const o = makeOffer(state, ctx.path, rng, c, site, mi, year);
        o.price = Math.round(o.price * rng.range(ai.distressDiscount[0], ai.distressDiscount[1]));
        o.sellerName = `${competitorName(state, c)} (in receivership)`;
        state.coop.offers.push(o);
      }
      ctx.inbox({ kind: 'news', title: `${competitorName(state, c)} closes its doors`, body: `${competitorName(state, c)} has failed. Its lender is selling its ${c.sites.length > 1 ? 'facilities' : 'facility'} at distressed prices; see the Buy or build tabs.` });
      continue;
    }
    // A weak co-op near us may propose a merger.
    if (c.kind === 'coop' && st < ai.approachBelow.value && rng.chance(ai.approachProb.value) && nearUs(state, c, ai.approachMiles) && !state.deals.some((d) => d.partnerId === c.id && d.stage !== 'closed' && d.stage !== 'dead')) {
      proposeIncomingMerger(ctx, c);
      continue;
    }
    // Two weak neighbouring co-ops merge with each other.
    if (c.kind === 'coop' && st < ai.mergeBelow.value && rng.chance(ai.mergeProb.value)) {
      // Only co-ops in the same business combine: posture is $/bu for grain but percent of
      // price for farm supply, so one competitor must not span both.
      const partner = active.find((x) => x !== c && x.status === 'active' && x.kind === 'coop' && (x.strength ?? 50) < ai.mergeBelow.value + 10
        && isGrain(x) === isGrain(c) && (x.sites[0].division ?? 'GRAIN') === (c.sites[0].division ?? 'GRAIN')
        && x.sites.some((a) => c.sites.some((b) => milesBetween(state, a.townId, b.townId) <= ai.mergeMiles)));
      if (partner) {
        c.sites = [...c.sites, ...partner.sites.map((site, i) => ({ ...site, id: c.sites.length + i + 1 }))];
        c.name = `${c.name.replace(/ (Co-op|Elevator Co-op|Grain Co-op|Union|Farmers .*)$/, '')}–${state.world.towns[partner.sites[0].townId].name} Cooperative`;
        c.strength = clamp((st + (partner.strength ?? 50)) / 2 + 10, 0, 100);
        c.service = Math.max(c.service, partner.service);
        partner.status = 'sold';
        partner.lastMove = `merged into ${c.name}`;
        c.lastMove = 'merged';
        ctx.inbox({ kind: 'news', title: 'Neighboring co-ops merge', body: `${partner.name} has merged with a neighboring co-op to form ${c.name}, with ${c.sites.length} locations.` });
        continue;
      }
    }
    // A strong competitor where we are winning starts a price war.
    if (st > 55 && !c.war && contested(state, c) && rng.chance(ai.priceWarProb.value)) {
      const bump = isGrain(c) ? ai.priceWarGrain.value : ai.priceWarSupply.value;
      c.posture += bump;
      c.war = { until: mi + 3 * ai.priceWarQuarters, bump };
      c.lastMove = 'price war';
      const town = state.world.towns[c.sites[0].townId].name;
      ctx.inbox({ kind: 'alert', title: `${competitorName(state, c)} starts a price war`, body: `${competitorName(state, c)} in ${town} is ${isGrain(c) ? 'bidding over the market for grain' : 'cutting prices'} to win back customers from us. Expect it to last about a year.` });
      continue;
    }
    // Strong competitors invest: more storage and better service.
    if (st > ai.investAbove.value && rng.chance(ai.investProb.value)) {
      const site = c.sites[0];
      if ((site.division ?? 'GRAIN') === 'GRAIN') site.storageBu = Math.round(site.storageBu * (1 + ai.investStorage.value) / 10_000) * 10_000;
      c.service = clamp(c.service + 0.1, -1, 1);
      c.strength = st - 8;
      c.lastMove = 'expanded';
      ctx.inbox({ kind: 'news', title: `${competitorName(state, c)} expands`, body: `${competitorName(state, c)} is adding capacity and service in ${state.world.towns[site.townId].name}.` });
    }
  }
  if (ctx.month === 12) {
    shuttleBuildOut(ctx, ctx.rng('competitors.shuttle'));
    ethanolBuildOut(ctx, ctx.rng('competitors.ethanol'));
  }
}

function endWars(ctx: TickContext): void {
  for (const c of ctx.state.competitors) {
    if (c.war && c.war.until <= ctx.mi) {
      c.posture -= c.war.bump;
      delete c.war;
    }
  }
}

function nearUs(s: GameState, c: Competitor, miles: number): boolean {
  return c.sites.some((site) => s.coop.facilities.some((f) => f.status !== 'closed' && milesBetween(s, f.townId, site.townId) <= miles));
}

/** Nationals and strong co-ops put shuttle loaders on main-line sites from the mid-1990s. */
function shuttleBuildOut(ctx: TickContext, rng: Rng): void {
  const { state } = ctx;
  if (ctx.year < COMPETITOR_AI.shuttleFrom || ctx.year < (COMPONENTS['loadout-shuttle']?.availableFrom ?? 9999)) return;
  for (const c of state.competitors) {
    if (c.status !== 'active' || (c.kind !== 'national' && (c.strength ?? 0) < 65)) continue;
    for (const site of c.sites) {
      if ((site.division ?? 'GRAIN') !== 'GRAIN' || site.loadout === 'shuttle') continue;
      const onMain = state.world.towns[site.townId].railLineIds.some((id) => state.world.rail[id]?.kind === 'mainline' && state.world.rail[id].status === 'active');
      if (!onMain || !rng.chance(COMPETITOR_AI.shuttleProb.value)) continue;
      site.loadout = 'shuttle';
      site.storageBu = Math.max(site.storageBu, 1_500_000);
      site.receiveBuHr = Math.max(site.receiveBuHr, 40_000);
      c.service = clamp(c.service + 0.15, -1, 1);
      c.lastMove = 'shuttle loader';
      ctx.inbox({ kind: 'news', title: `${competitorName(state, c)} builds a shuttle loader`, body: `${competitorName(state, c)} is building a 110-car shuttle loader at ${state.world.towns[site.townId].name}. It will pay more for grain than single-car shippers can.` });
    }
  }
}

/** After the renewable fuel standard, ethanol plants go up in county seats on main lines. */
function ethanolBuildOut(ctx: TickContext, rng: Rng): void {
  const { state, year } = ctx;
  if (!state.firedEvents.some((e) => e.id === 'rfs-2005') || year > ETHANOL.buildTo) return;
  const existing = state.world.destinations.filter((d) => d.kind === 'ethanol');
  if (existing.length >= ETHANOL.maxPlants) return;
  const towns = state.world.towns.filter((t) => t.isCountySeat && t.railLineIds.some((id) => state.world.rail[id]?.kind === 'mainline') && !existing.some((d) => d.name.includes(t.name)));
  for (const t of towns) {
    if (existing.length >= ETHANOL.maxPlants || !rng.chance(ETHANOL.plantProb.value)) continue;
    const d: Destination = { id: state.world.destinations.length, name: `${t.name} ethanol plant`, kind: 'ethanol', commodities: ['corn'], x: t.x, y: t.y, milesFromEdge: 0 };
    // Copy-on-write: world arrays are shared with earlier states.
    state.world = { ...state.world, destinations: [...state.world.destinations, d] };
    existing.push(d);
    ctx.inbox({ kind: 'news', title: `Ethanol plant opens at ${t.name}`, body: `A 50-million-gallon ethanol plant at ${t.name} is buying corn at a premium. Corn basis near the plant will strengthen; elevators close by can truck to it.` });
  }
}
