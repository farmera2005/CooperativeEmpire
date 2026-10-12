// Scripted policies for the headless balance runner. Each returns the commands a player
// following that policy would issue this month. They grow with each milestone.

import { COMMODITIES } from '../../data/grain';
import { monthOf } from '../core/calendar';
import { grainCapacity } from '../facilities/facilities';
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
}

const STYLES: Record<Exclude<PolicyId, 'idle'>, Style> = {
  baseline: { posture: 'market', hedgeRatio: 1, financePct: 0.6, maxPriceToEquity: 2.5, maxFacilities: 3, expand: true, minEquityRatio: 0.4, diligence: true },
  reckless: { posture: 'aggressive', hedgeRatio: 0.2, financePct: 0.7, maxPriceToEquity: 4, maxFacilities: 8, expand: true, minEquityRatio: 0, diligence: false },
  conservative: { posture: 'premium', hedgeRatio: 1, financePct: 0.3, maxPriceToEquity: 0.8, maxFacilities: 1, expand: false, minEquityRatio: 0.5, diligence: true },
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
        .filter((o) => o.price <= Math.max(0, equity) * style.maxPriceToEquity && o.price * (1 - style.financePct) <= liquidity(state) * 0.8)
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
    return cmds;
  };
}

export const POLICIES: Record<PolicyId, Policy> = {
  baseline: scripted(STYLES.baseline),
  reckless: scripted(STYLES.reckless),
  conservative: scripted(STYLES.conservative),
  idle: () => [],
};
