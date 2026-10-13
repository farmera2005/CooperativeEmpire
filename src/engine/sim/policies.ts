// Scripted policies for the headless balance runner. Each returns the commands a player
// following that policy would issue this month. They grow with each milestone.

import { COMMODITIES } from '../../data/grain';
import { monthOf } from '../core/calendar';
import { grainCapacity, type Components } from '../facilities/facilities';
import { COMPONENTS, TYPICAL_SITE, type ComponentId, type FacilityKind } from '../../data/facilities';
import { liquidity, memberEquity } from '../finance/lender';
import { balanceSheet } from '../ledger/statements';
import type { GameState } from '../types';
import type { Command } from './commands';

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
}

const STYLES: Record<Exclude<PolicyId, 'idle'>, Style> = {
  baseline: { posture: 'market', hedgeRatio: 1, financePct: 0.6, maxPriceToEquity: 2.5, maxFacilities: 3, expand: true, minEquityRatio: 0.4, diligence: true, supplyKinds: ['agronomy', 'energy', 'feedmill'], maxSupplySites: 3, supplyScale: 0.6, manageEquity: true, cashPatronage: 0.3, redemptionPct: 0.2 },
  reckless: { posture: 'aggressive', hedgeRatio: 0.2, financePct: 0.7, maxPriceToEquity: 4, maxFacilities: 8, expand: true, minEquityRatio: 0, diligence: false, supplyKinds: ['agronomy', 'energy', 'feedmill', 'station', 'farmstore'], maxSupplySites: 8, supplyScale: 1.2, manageEquity: false, cashPatronage: 0.5, redemptionPct: 0.4 },
  conservative: { posture: 'premium', hedgeRatio: 1, financePct: 0.3, maxPriceToEquity: 0.8, maxFacilities: 1, expand: false, minEquityRatio: 0.5, diligence: true, supplyKinds: ['agronomy'], maxSupplySites: 1, supplyScale: 0.5, manageEquity: true, cashPatronage: 0.25, redemptionPct: 0.15 },
};

function scripted(style: Style): Policy {
  return (state) => {
    const cmds: Command[] = [];
    const pol = state.coop.grainPolicy;
    if (pol.posture !== style.posture || pol.hedgeRatio !== style.hedgeRatio) cmds.push({ type: 'setGrainPolicy', policy: { posture: style.posture, hedgeRatio: style.hedgeRatio } });
    const equity = memberEquity(state);
    const owned = state.coop.facilities.filter((f) => f.status !== 'closed' && f.kind === 'elevator');
    const bs = balanceSheet(state.ledger, state.clock.monthIndex);
    const eqRatio = bs.totalAssets > 0 ? bs.totalEquity / bs.totalAssets : 1;

    // Buy an affordable elevator: first one any time, more when strong.
    if (owned.length < style.maxFacilities && (owned.length === 0 || (style.expand && eqRatio >= style.minEquityRatio && monthOf(state.clock.monthIndex) === 2))) {
      const affordable = state.coop.offers
        .filter((o) => o.kind === 'elevator' && o.price <= Math.max(0, equity) * style.maxPriceToEquity && o.price * (1 - style.financePct) <= liquidity(state) * 0.8)
        .sort((a, b) => a.price / grainCapacity(a.components).storageBu - b.price / grainCapacity(b.components).storageBu);
      const pick = affordable[0];
      if (pick) {
        if (style.diligence && !pick.diligenceDone) cmds.push({ type: 'dueDiligence', offerId: pick.id });
        else cmds.push({ type: 'buyFacility', offerId: pick.id, financePct: style.financePct });
      }
    }

    // Each July: fix last harvest's bottlenecks; renovate worn sites.
    if (monthOf(state.clock.monthIndex) === 7) {
      for (const f of owned) {
        if (f.status !== 'operating' || state.coop.projects.some((p) => p.facilityId === f.id)) continue;
        if (f.condition < 35) {
          cmds.push({ type: 'renovateFacility', facilityId: f.id, financePct: style.financePct });
          continue;
        }
        if (!style.expand || eqRatio < style.minEquityRatio) continue;
        const cap = grainCapacity(f.components);
        // Last 12 months' receipts at this site vs its capacity (turns).
        const received = state.coop.grain.reports.slice(-12).reduce((a, r) => a + COMMODITIES.reduce((b, c) => b + r.byCommodity[c].receivedBu + r.byCommodity[c].turnedAwayBu, 0), 0) / Math.max(1, owned.length);
        const turns = received / Math.max(1, cap.storageBu + cap.pileBu);
        if (f.grain.waitMemory > 1.5) {
          cmds.push({ type: 'upgradeFacility', facilityId: f.id, components: { receiving: Math.round(cap.receiveBuHr * 0.5 / 500) * 500 }, financePct: style.financePct });
        } else if (turns > 3.5) {
          cmds.push({ type: 'upgradeFacility', facilityId: f.id, components: { 'storage-steel': Math.round(cap.storageBu * 0.4 / 10_000) * 10_000 }, financePct: style.financePct });
        }
      }
    }
    // Each March, once the elevator is established: get into the next farm-supply business,
    // buying a dealer that's for sale or building a modest site in the home town.
    const supply = state.coop.facilities.filter((f) => f.status !== 'closed' && f.kind !== 'elevator');
    const established = owned.some((f) => state.clock.monthIndex - f.acquiredMonth >= 12);
    if (monthOf(state.clock.monthIndex) === 3 && established && supply.length < style.maxSupplySites && eqRatio >= style.minEquityRatio && !state.coop.projects.length) {
      const next = style.supplyKinds.find((k) => !supply.some((f) => f.kind === k)) ?? style.supplyKinds[supply.length % style.supplyKinds.length];
      const offer = state.coop.offers.find((o) => o.kind === next && o.price * (1 - style.financePct) <= liquidity(state) * 0.6);
      if (offer) cmds.push(style.diligence && !offer.diligenceDone ? { type: 'dueDiligence', offerId: offer.id } : { type: 'buyFacility', offerId: offer.id, financePct: style.financePct });
      else {
        const comps: Components = {};
        for (const [id, q] of Object.entries(TYPICAL_SITE[next])) comps[id as ComponentId] = COMPONENTS[id as ComponentId].unit === 'each' || id === 'site' ? Math.max(1, Math.round((q ?? 0) * style.supplyScale)) : Math.round((q ?? 0) * style.supplyScale);
        const town = owned[0]?.townId ?? state.coop.homeTownId;
        cmds.push({ type: 'buildFacility', kind: next, townId: town, components: comps, financePct: style.financePct });
      }
    }
    // Each September, after the books close: set the patronage mix and redemption budget
    // from the balance sheet. A thin co-op keeps cash patronage at the legal minimum.
    if (monthOf(state.clock.monthIndex) === 9) {
      const thin = style.manageEquity && eqRatio < style.minEquityRatio;
      const cash = thin ? 0.2 : style.cashPatronage;
      const ep = state.coop.equityProgram;
      if (ep.proposal.pools.ALL.cash !== cash) cmds.push({ type: 'setPatronageProposal', proposal: { ...ep.proposal, pools: { ALL: { cash, qualified: 1 - cash, nonqualified: 0, unallocated: 0 } } } });
      const pct = thin ? 0 : style.redemptionPct;
      if (ep.redemption.budgetPctOfSavings !== pct) cmds.push({ type: 'setRedemptionPolicy', policy: { ...ep.redemption, budgetPctOfSavings: pct } });
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
