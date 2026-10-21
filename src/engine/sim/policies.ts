// Scripted policies for the headless balance runner. Each returns the commands a player
// following that policy would issue this month. They grow with each milestone.

import { marketValue } from '../world/marketPath';
import { nominalCents, priceLevel } from '../world/macro';
import { DEALS } from '../../data/competition';
import { totalAcres } from '../members/generate';
import { forecastDealVote } from '../deals/vote';
import { FACILITY_COSTS } from '../../data/grain';
import { replacementCost } from '../facilities/facilities';
import { estimateProject, specComponents, type BuildSpec } from '../facilities/actions';
import { pathFor } from '../world/macro';
import { REGULATIONS, TECHNOLOGIES } from '../../data/events';
import { affectedSites, complianceCost, isCompliant, ruleActive } from '../world/regulation';
import { techCost, uncoveredSites } from '../world/tech';
import { COMMODITIES } from '../../data/grain';
import { monthOf, yearOf } from '../core/calendar';
import { grainCapacity, type Components } from '../facilities/facilities';
import { COMPONENTS, typicalSite, type ComponentId, type FacilityKind } from '../../data/facilities';
import { liquidity, memberEquity } from '../finance/lender';
import { balanceSheet } from '../ledger/statements';
import type { GameState } from '../types';
import type { Command } from './commands';
import { ROLE_DEFS } from '../../data/people';

/** Rough yearly fixed cost of running one elevator (crew base, office, utilities), 2024 $. */
const BOT_HOUSE_FIXED_2024 = 60_000;
/** Above this prime rate (%) a prudent GM finances no expansion. */
const BOT_DEAR_PRIME = 11;
/** Bushels of space per bushel-per-hour of receiving before the pit outruns the bins. */
const BOT_STORAGE_HOURS_PER_PIT = 40;
/** A manager's proposals are approved when the midpoint of their revealed skill is at least this. */
const BOT_TRUST_SKILL = 10;

export type PolicyId = 'baseline' | 'reckless' | 'conservative' | 'idle';

export type Policy = (state: GameState) => Command[];

interface Style {
  posture: 'aggressive' | 'market' | 'premium';
  hedgeRatio: number;
  financePct: number;
  /** Max purchase price as a multiple of member equity. */
  maxPriceToEquity: number;
  maxFacilities: number;
  expand: boolean;
  /** Minimum owner-equity ratio before taking on an expansion. */
  minEquityRatio: number;
  diligence: boolean;
  /** Farm-supply businesses to get into, in order, and how many sites at most. */
  supplyKinds: Exclude<FacilityKind, 'elevator'>[];
  maxSupplySites: number;
  /** Size of a new supply site relative to the typical one. */
  supplyScale: number;
  /** Adjust patronage cash and redemptions to the balance sheet each year. */
  manageEquity: boolean;
  cashPatronage: number;
  redemptionPct: number;
  /** Open-position limit (bu) the GM asks the board for; omitted = live with the board's limit. */
  positionLimit?: number;
  /** Open position sought as a share of the last twelve months' receipts (bushels). */
  positionShare?: number;
}

const STYLES: Record<Exclude<PolicyId, 'idle'>, Style> = {
  baseline: { posture: 'market', hedgeRatio: 1, financePct: 0.6, maxPriceToEquity: 2.5, maxFacilities: 3, expand: true, minEquityRatio: 0.4, diligence: true, supplyKinds: ['agronomy', 'energy', 'feedmill'], maxSupplySites: 3, supplyScale: 0.6, manageEquity: true, cashPatronage: 0.3, redemptionPct: 0.2 },
  reckless: { posture: 'aggressive', hedgeRatio: 0.2, financePct: 0.7, maxPriceToEquity: 4, maxFacilities: 8, expand: true, minEquityRatio: 0, diligence: false, supplyKinds: ['agronomy', 'energy', 'feedmill', 'station', 'farmstore'], maxSupplySites: 8, supplyScale: 2, manageEquity: false, cashPatronage: 0.5, redemptionPct: 0.4, positionLimit: 400_000, positionShare: 0.15 },
  conservative: { posture: 'premium', hedgeRatio: 1, financePct: 0.3, maxPriceToEquity: 0.8, maxFacilities: 1, expand: false, minEquityRatio: 0.5, diligence: true, supplyKinds: ['agronomy'], maxSupplySites: 1, supplyScale: 0.5, manageEquity: true, cashPatronage: 0.25, redemptionPct: 0.15 },
};

function scripted(style: Style): Policy {
  return (state) => {
    const cmds: Command[] = [];
    const pol = state.coop.grainPolicy;
    if (pol.posture !== style.posture || pol.hedgeRatio !== style.hedgeRatio) cmds.push({ type: 'setGrainPolicy', policy: { posture: style.posture, hedgeRatio: style.hedgeRatio } });
    // A speculating GM asks the board each spring for room to carry big open positions (D-099).
    // The room grows with the business: a share of last year's receipts, so a bigger co-op speculates as
    // heavily for its size as a small one (D-113).
    if (style.positionLimit && monthOf(state.clock.monthIndex) === 4) {
      const receipts = state.coop.grain.reports.slice(-12).reduce((a, r) => a + COMMODITIES.reduce((b, c) => b + r.byCommodity[c].receivedBu, 0), 0);
      const wanted = Math.max(style.positionLimit, Math.round((receipts * (style.positionShare ?? 0)) / 10_000) * 10_000);
      if (pol.positionLimit.corn < wanted) cmds.push({ type: 'setGrainPolicy', policy: { positionLimit: { corn: wanted, soybeans: wanted, wheat: Math.round(wanted / 4) } } });
    }
    const equity = memberEquity(state);
    const owned = state.coop.facilities.filter((f) => f.status !== 'closed' && f.kind === 'elevator');
    const bs = balanceSheet(state.ledger, state.clock.monthIndex);
    const eqRatio = bs.totalAssets > 0 ? bs.totalEquity / bs.totalAssets : 1;
    // A prudent GM grows only from strength: standard lender standing, a profitable last year,
    // and borrowing that isn't dear (D-096).
    const lastFy = state.coop.equityProgram.history[state.coop.equityProgram.history.length - 1];
    const dearMoney = style.manageEquity && marketValue(pathFor(state), 'prime', state.clock.monthIndex) > BOT_DEAR_PRIME;
    const healthy = state.coop.finance.status === 'standard' && (!lastFy || lastFy.savingsBeforeTax > 0) && !dearMoney;
    // What an offer really costs: a worn house needs renovating soon after purchase.
    const trueCost = (o: (typeof state.coop.offers)[number]) => o.price + (((o.conditionEstimate[0] + o.conditionEstimate[1]) / 2) < 50 ? replacementCost(pathFor(state), state.clock.monthIndex, o.components) * FACILITY_COSTS.renovateCostShare.value : 0);

    // Buy an affordable elevator: first one any time, more when strong.
    if (owned.length < style.maxFacilities && (owned.length === 0 || (style.expand && (healthy || !style.manageEquity) && eqRatio >= style.minEquityRatio && monthOf(state.clock.monthIndex) === 2))) {
      const affordable = state.coop.offers
        .filter((o) => o.kind === 'elevator' && o.price <= Math.max(0, equity) * style.maxPriceToEquity && o.price * (1 - style.financePct) <= liquidity(state) * 0.8)
        .sort((a, b) => trueCost(a) / grainCapacity(a.components).storageBu - trueCost(b) / grainCapacity(b.components).storageBu);
      // A prudent GM sizes the house to the grain around it: estimated yearly profit, so a house
      // too small to carry its fixed costs and one too big to fill both score poorly (D-096).
      const draw = (townId: number) => state.members.list.reduce((a, m) => a + (m.status === 'active' && (state.world.distances[townId]?.[m.townId] ?? Infinity) <= 15 ? totalAcres(m) * marketValue(pathFor(state), 'yieldCorn', state.clock.monthIndex) * 0.35 * m.weight : 0), 0);
      const score = (o: (typeof affordable)[number]) => yearlyProfit2024(state, grainCapacity(o.components).storageBu, draw(o.townId), trueCost(o));
      // The lender's line (about five times equity) must carry a reasonable fill of grain; buying
      // swaps cash for plant, so equity is unchanged. With nothing that fits, a co-op with no
      // house still buys its best option.
      const fits = affordable.filter((o) => grainCapacity(o.components).storageBu * 0.4 * marketValue(pathFor(state), 'corn', state.clock.monthIndex) * 100 <= Math.max(0, equity) * 5);
      const pool = fits.length || owned.length ? fits : affordable;
      const pick = style.manageEquity ? [...pool].sort((a, b) => score(b) - score(a) || a.id - b.id)[0] : affordable[0];
      // With no house yet and only poor ones for sale, build one sized to the grain around the
      // best town (D-096). It earns nothing while it goes up, so it must clearly beat buying.
      const build = owned.length === 0 && style.manageEquity ? planElevator(state, equity * style.maxPriceToEquity, liquidity(state) * 0.8, style.financePct) : null;
      // A new house earns nothing for most of a year while it goes up.
      if (build && (!pick || build.profit - BOT_HOUSE_FIXED_2024 > score(pick))) {
        cmds.push({ type: 'buildElevator', townId: build.townId, spec: build.spec, financePct: style.financePct });
      } else if (pick) {
        if (style.diligence && !pick.diligenceDone) cmds.push({ type: 'dueDiligence', offerId: pick.id });
        else cmds.push({ type: 'buyFacility', offerId: pick.id, financePct: style.financePct });
      }
    }

    // Each July: fix last harvest's bottlenecks; renovate worn sites.
    if (monthOf(state.clock.monthIndex) === 7) {
      for (const f of owned) {
        if (f.status !== 'operating' || state.coop.projects.some((p) => p.facilityId === f.id)) continue;
        // Renovate while still healthy enough for the lender to finance it.
        if (f.condition < (style.manageEquity ? 45 : 35)) {
          cmds.push({ type: 'renovateFacility', facilityId: f.id, financePct: style.financePct });
          continue;
        }
        if (!style.expand || eqRatio < style.minEquityRatio) continue;
        const cap = grainCapacity(f.components);
        // Last 12 months' receipts at this site vs its capacity (turns).
        const received = state.coop.grain.reports.slice(-12).reduce((a, r) => a + COMMODITIES.reduce((b, c) => b + r.byCommodity[c].receivedBu + r.byCommodity[c].turnedAwayBu, 0), 0) / Math.max(1, owned.length);
        const turns = received / Math.max(1, cap.storageBu + cap.pileBu);
        // Faster receiving only helps while there is room to put the grain; once the pit
        // outruns the bins, lines mean the house is full.
        const pitFitsBins = cap.receiveBuHr < (cap.storageBu + cap.pileBu) / BOT_STORAGE_HOURS_PER_PIT;
        if (f.grain.waitMemory > 1.5 && pitFitsBins) {
          cmds.push({ type: 'upgradeFacility', facilityId: f.id, components: { receiving: Math.round(cap.receiveBuHr * 0.5 / 500) * 500 }, financePct: style.financePct });
        } else if ((turns > 3.5 || f.grain.waitMemory > 1.5) && !dearMoney) {
          cmds.push({ type: 'upgradeFacility', facilityId: f.id, components: { 'storage-steel': Math.round(cap.storageBu * 0.4 / 10_000) * 10_000 }, financePct: style.financePct });
        }
      }
    }
    // Each March, once the elevator is established: get into the next farm-supply business,
    // buying a dealer that's for sale or building a modest site in the home town.
    const supply = state.coop.facilities.filter((f) => f.status !== 'closed' && f.kind !== 'elevator');
    const established = owned.some((f) => state.clock.monthIndex - f.acquiredMonth >= 12);
    const supplyRoom = Math.max(0, equity) * (style.manageEquity ? 0.3 : 1);
    if (monthOf(state.clock.monthIndex) === 3 && established && (healthy || !style.manageEquity) && supply.length < style.maxSupplySites && eqRatio >= style.minEquityRatio && !state.coop.projects.length) {
      const next = style.supplyKinds.find((k) => !supply.some((f) => f.kind === k)) ?? style.supplyKinds[supply.length % style.supplyKinds.length];
      const offer = state.coop.offers.find((o) => o.kind === next && o.price * (1 - style.financePct) <= Math.min(liquidity(state) * 0.6, supplyRoom));
      if (offer) cmds.push(style.diligence && !offer.diligenceDone ? { type: 'dueDiligence', offerId: offer.id } : { type: 'buyFacility', offerId: offer.id, financePct: style.financePct });
      else {
        const comps: Components = {};
        for (const [id, q] of Object.entries(typicalSite(next, yearOf(state.clock.monthIndex)))) comps[id as ComponentId] = COMPONENTS[id as ComponentId].unit === 'each' || id === 'site' ? Math.max(1, Math.round((q ?? 0) * style.supplyScale)) : Math.round((q ?? 0) * style.supplyScale);
        const town = owned[0]?.townId ?? state.coop.homeTownId;
        if (estimateProject(state, town, comps).cost * (1 - style.financePct) <= supplyRoom) cmds.push({ type: 'buildFacility', kind: next, townId: town, components: comps, financePct: style.financePct });
      }
    }
    // Each September, after the books close: set the patronage mix and redemption budget
    // from the balance sheet. A thin co-op keeps cash patronage at the legal minimum.
    // Fill the leadership roles the co-op has grown into: search at market pay, interview,
    // hire the strongest on paper.
    for (const role of state.people.needed) {
      if (state.people.leaders.some((l) => l.role === role)) continue;
      const cands = state.people.candidates.filter((c) => c.leader.role === role);
      if (!cands.length) {
        if (!state.people.searches.some((x) => x.role === role)) cmds.push({ type: 'startSearch', role, band: 'at' });
        continue;
      }
      const pending = cands.find((c) => !c.interviewed);
      if (pending) {
        cmds.push({ type: 'interview', candidateId: pending.id });
        continue;
      }
      const score = (c: (typeof cands)[number]) => ROLE_DEFS[role].primary.reduce((a, k) => a + (c.leader.revealed[k][0] + c.leader.revealed[k][1]) / 2, 0);
      const best = [...cands].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
      cmds.push({ type: 'hire', candidateId: best.id });
    }

    // A sensible GM answers the board's open demands where the balance sheet allows.
    const open = state.governance.demands.filter((d) => d.status === 'open');
    if (monthOf(state.clock.monthIndex) === 9) {
      const thin = style.manageEquity && eqRatio < style.minEquityRatio;
      const wantsCash = open.some((d) => d.kind === 'cashPatronage');
      const wantsEquity = open.some((d) => d.kind === 'equityRatio');
      const cash = thin || wantsEquity ? 0.2 : wantsCash ? Math.max(0.4, style.cashPatronage) : style.cashPatronage;
      const ep = state.coop.equityProgram;
      // A prudent co-op keeps part of each year's savings as an unallocated reserve against bad years.
      const reserve = style.manageEquity ? (thin ? 0.15 : 0.1) : 0;
      const pool = { cash, qualified: Math.round((1 - cash - reserve) * 100) / 100, nonqualified: 0, unallocated: reserve };
      const cur = ep.proposal.pools.ALL;
      if (cur.cash !== pool.cash || cur.unallocated !== pool.unallocated) cmds.push({ type: 'setPatronageProposal', proposal: { ...ep.proposal, pools: { ALL: pool } } });
      // Stop revolving equity well before the covenant floor, not after (D-096).
      const cushion = style.manageEquity && eqRatio < style.minEquityRatio + 0.1;
      const pct = thin || cushion || wantsEquity ? 0 : style.redemptionPct;
      const red = open.find((d) => d.kind === 'redemptionBudget');
      // Only a well-capitalized co-op humors a director who wants more redemptions; the extra lapses with the demand.
      // …and never revolves more than the co-op retained last year, or equity shrinks.
      const retained = lastFy ? lastFy.qualified + lastFy.nonqualified : 0;
      const fixed = red && healthy && eqRatio >= style.minEquityRatio + 0.15 ? Math.min(red.target, style.manageEquity ? Math.round(retained * 0.5) : red.target) : 0;
      if (ep.redemption.budgetPctOfSavings !== pct || ep.redemption.budgetFixed !== fixed) cmds.push({ type: 'setRedemptionPolicy', policy: { ...ep.redemption, budgetPctOfSavings: pct, budgetFixed: fixed } });
    }
    if (style.manageEquity) cmds.push(...consolidate(state, healthy));
    // Managers' proposals (D-104): a prudent GM backs a manager whose record shows at least
    // average skill in the area of the call, and declines the rest.
    if (style.manageEquity) {
      for (const item of state.inbox) {
        const c = item.choice;
        if (!c || c.chosen || !c.handler.startsWith('mgr.')) continue;
        const l = state.people.leaders.find((x) => x.id === c.data?.leaderId);
        const skill = c.handler.endsWith('staffing') || c.handler.endsWith('offseason') ? 'operations' : c.handler.endsWith('credit') ? 'finance' : c.handler.endsWith('toll') ? 'sales' : 'merchandising';
        const [lo, hi] = l ? l.revealed[skill] : [0, 0];
        cmds.push({ type: 'chooseOption', inboxId: item.id, optionId: (lo + hi) / 2 >= BOT_TRUST_SKILL ? 'approve' : 'decline' });
      }
    }
    if (style.manageEquity) {
      // Meet new rules before the deadline, one site a month, while cash allows.
      let room = liquidity(state) * 0.5;
      for (const r of REGULATIONS) {
        if (!ruleActive(state, r.id) || r.compliancePerSite <= 0) continue;
        const f = affectedSites(state, r).find((x) => !isCompliant(state, r, x));
        const cost = complianceCost(state, r);
        if (f && cost <= room) {
          cmds.push({ type: 'comply', ruleId: r.id, facilityId: f.id });
          room -= cost;
          break;
        }
      }
      // Adopt proven, inexpensive technology a few years after it appears.
      const year = yearOf(state.clock.monthIndex);
      const assets = bs.totalAssets;
      const tech = TECHNOLOGIES.find((t) => year >= t.firstYear + 4 && (t.kinds ? uncoveredSites(state, t).length > 0 : !state.tech.adopted[t.id] && !state.tech.pending.some((p) => p.id === t.id)) && techCost(state, t) <= Math.min(room, assets * 0.02));
      if (tech) cmds.push({ type: 'adoptTech', techId: tech.id });
    }
    return cmds;
  };
}

export const POLICIES: Record<PolicyId, Policy> = {
  baseline: scripted(STYLES.baseline),
  reckless: scripted(STYLES.reckless),
  conservative: scripted(STYLES.conservative),
  idle: () => [],
};

/**
 * Consolidation, as real co-ops did when handling margins fell (D-087): hear out sound
 * neighbors who approach us, seek a merger after two weak years, set terms the members will
 * pass, and never sell out to a buyer.
 */
function consolidate(state: GameState, healthy: boolean): Command[] {
  const cmds: Command[] = [];
  // Studies and diligence cost the same whatever the co-op's size; a small co-op can't afford
  // to chase deals it may walk away from (D-096).
  const mi = state.clock.monthIndex;
  const dealCost = nominalCents(pathFor(state), mi, DEALS.studyCost.value + DEALS.diligenceCost.value);
  const canAfford = dealCost <= 0.05 * Math.max(0, balanceSheet(state.ledger, mi).totalEquity);
  const open = state.deals.filter((d) => d.stage !== 'closed' && d.stage !== 'dead');
  for (const d of open) {
    // Merge from strength, with a sound co-op in the same business; a weak partner's plants
    // bring more cost than business.
    const partner = state.competitors.find((c) => c.id === d.partnerId);
    // A sound grain co-op is worth joining whether we are strong (growth) or struggling (survival).
    const sound = d.kind === 'merger' && healthy && canAfford && d.estimate.strength >= 50 && (partner?.sites[0]?.division ?? 'GRAIN') === 'GRAIN';
    if (d.stage === 'proposed' && d.incoming) cmds.push({ type: 'respondDeal', dealId: d.id, accept: sound });
    if (d.stage !== 'terms' || d.kind !== 'merger') continue;
    if (d.diligence && d.truth.strength < 40) {
      cmds.push({ type: 'abandonDeal', dealId: d.id });
      continue;
    }
    if (!d.diligence && liquidity(state) > 0) {
      cmds.push({ type: 'dealDiligence', dealId: d.id });
      continue;
    }
    // Offer the partner enough seats for their members, if ours still pass it.
    let terms = { name: state.coop.name, partnerSeats: 1 };
    for (let seats = 1; seats <= 3; seats++) {
      const f = forecastDealVote(state, d, { ...terms, partnerSeats: seats });
      terms = { ...terms, partnerSeats: seats };
      if ((f.theirExpectedYes ?? 1) >= 0.7) break;
    }
    const f = forecastDealVote(state, d, terms);
    if (f.expectedYes >= f.threshold + 0.03 && (f.theirExpectedYes ?? 1) >= 0.69) cmds.push({ type: 'submitDeal', dealId: d.id, terms });
    else cmds.push({ type: 'abandonDeal', dealId: d.id });
  }
  // Two weak years in a row: look for a sound neighbor to combine with (each March).
  const h = state.coop.equityProgram.history;
  const weak = h.length >= 2 && h.slice(-2).every((x) => x.savingsBeforeTax <= 0 || !healthy);
  // A rescue merger is worth its study fee whatever the co-op's size.
  if (monthOf(state.clock.monthIndex) === 3 && weak && !open.length && !state.deals.some((d) => state.clock.monthIndex - d.startedMonth < 24)) {
    const ours = state.coop.facilities.filter((f) => f.status !== 'closed');
    const near = (townId: number) => ours.some((f) => (state.world.distances[f.townId]?.[townId] ?? Infinity) <= 30);
    const partner = state.competitors
      .filter((c) => c.kind === 'coop' && c.status === 'active' && (c.strength ?? 50) >= 45 && (c.sites[0]?.division ?? 'GRAIN') === 'GRAIN' && c.sites.some((x) => near(x.townId)))
      .sort((a, b) => (b.strength ?? 50) - (a.strength ?? 50) || a.id - b.id)[0];
    if (partner) cmds.push({ type: 'proposeMerger', partnerId: partner.id });
  }
  return cmds;
}

/** A new elevator for the town with the most member grain nearby, sized to it and to what the co-op can afford. */
function planElevator(state: GameState, maxCost: number, maxDown: number, financePct: number): { townId: number; spec: BuildSpec; cost: number; profit: number } | null {
  const mi = state.clock.monthIndex;
  const yieldBu = marketValue(pathFor(state), 'yieldCorn', mi);
  const draw = (townId: number) => state.members.list.reduce((a, m) => a + (m.status === 'active' && (state.world.distances[townId]?.[m.townId] ?? Infinity) <= 15 ? totalAcres(m) * yieldBu * 0.35 * m.weight : 0), 0);
  const towns = state.world.towns.map((t) => ({ id: t.id, d: draw(t.id) })).sort((a, b) => b.d - a.d || a.id - b.id);
  const best = towns[0];
  if (!best || best.d <= 0) return null;
  for (let storage = Math.min(3_000_000, Math.round((0.4 * best.d) / 50_000) * 50_000); storage >= 100_000; storage = Math.round((storage * 0.8) / 10_000) * 10_000) {
    const spec: BuildSpec = { storageType: 'storage-steel', storageBu: storage, receiveBuHr: Math.min(20_000, Math.max(2_000, Math.round(storage / 60 / 500) * 500)), dryBuHr: Math.max(200, Math.round(storage / 200 / 100) * 100), loadout: 'truck' };
    const est = estimateProject(state, best.id, specComponents(spec));
    if (est.problems.length) continue;
    if (est.cost <= maxCost && est.cost * (1 - financePct) <= maxDown) return { townId: best.id, spec, cost: est.cost, profit: yearlyProfit2024(state, storage, best.d, est.cost) };
  }
  return null;
}

/**
 * The bot's rough yearly profit from a house, 2024 $: volume (four turns, at most the members'
 * grain within reach) at 30¢ margin and services less 12¢ variable cost, less the house's fixed
 * cost and a 12% capital charge on what it costs (cents, nominal).
 */
function yearlyProfit2024(state: GameState, storageBu: number, drawBu: number, costCents: number): number {
  const pl = priceLevel(pathFor(state), state.clock.monthIndex);
  const volume = Math.min(storageBu * 4, drawBu);
  return volume * (0.3 - 0.12) - BOT_HOUSE_FIXED_2024 - (0.12 * costCents) / 100 / pl;
}
