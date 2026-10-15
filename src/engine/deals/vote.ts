// Member votes on mergers and on selling the co-op (D-081). One appeal function drives both
// the vote itself and the forecast shown before the deal goes to the board, so the player sees
// why members lean the way they do.

import { MERGER_VOTE as V } from '../../data/competition';
import { bd, type Breakdown } from '../core/breakdown';
import { clamp } from '../core/math';
import { expectedReferendum } from '../governance/elections';
import { balanceSheet } from '../ledger/statements';
import { makeContext } from '../sim/context';
import { farmStress } from '../supply/credit';
import type { Deal, DealPartner, DealTerms, GameState } from '../types';

export interface DealVoteForecast {
  /** Our members' expected yes share, turnout, and what is needed. */
  expectedYes: number;
  turnout: number;
  threshold: number;
  /** The partner's members (mergers). */
  theirExpectedYes?: number;
  appeal: number;
  factors: Breakdown[];
  /** Figures are our pre-diligence estimates. */
  basedOnEstimates: boolean;
}

/** Appeal of a deal to our members, with its parts. `p` is what the members are shown. */
export function dealAppeal(s: GameState, d: Deal, terms: DealTerms, p: DealPartner): { appeal: number; factors: Breakdown[] } {
  const f: Breakdown[] = [];
  const add = (key: string, label: string, v: number) => {
    if (Math.abs(v) >= 0.005) f.push(bd(key, label, v, undefined, undefined, 'score'));
  };
  const mi = s.clock.monthIndex;
  const stress = farmStress(makeContext(s));
  if (d.kind === 'buyout') {
    const equity = Math.max(1, balanceSheet(s.ledger, mi).totalEquity);
    add('price', 'Price against member equity', (terms.price ?? 0) / equity - 1.15);
    add('trouble', 'Fear for the co-op under its lender', s.coop.finance.status === 'standard' ? 0 : 0.15);
    add('hardTimes', 'Hard times on the farm', V.hardTimes.value * stress);
  } else {
    const ourSites = s.coop.facilities.filter((x) => x.status === 'operating');
    add('board', 'The board recommends it', V.boardRecommends.value);
    add('health', `${d.partnerName}'s financial health`, V.partnerHealth.value * clamp((p.strength - 45) / 35, -1, 1));
    add('scale', 'A bigger co-op: better prices and service', V.scale.value * clamp(p.sites / Math.max(1, ourSites.length), 0, 1));
    const leverage = p.debt / Math.max(1, p.fairValue + p.workingCapital);
    add('leverage', 'Taking on their debt', -V.leverage.value * clamp((leverage - 0.45) / 0.35, 0, 1));
    add('seats', 'Board seats given up', -V.perSeat.value * Math.max(0, terms.partnerSeats - 1));
    add('name', 'Losing our name', terms.name.trim() && terms.name.trim() !== s.coop.name ? -V.rename.value : 0);
    add('diligence', 'Audited figures at the information meetings', d.diligence ? V.diligence.value : 0);
    const partner = s.competitors.find((c) => c.id === d.partnerId);
    const near = partner?.sites.some((site) => ourSites.some((o) => (s.world.distances[o.townId]?.[site.townId] ?? Infinity) <= V.distanceMiles)) ?? true;
    add('distance', 'A partner from outside our trade area', near ? 0 : -V.distance.value);
    add('hardTimes', 'Hard times make consolidation look sensible', V.hardTimes.value * stress);
  }
  add('trust', 'Members\' trust in management (board confidence)', V.trust.value * (s.governance.boardConfidence - 50));
  return { appeal: f.reduce((a, x) => a + x.value, 0), factors: f };
}

/** Partner members' expected yes share (before noise). */
export function theirYes(s: GameState, d: Deal, terms: DealTerms): number {
  const bs = balanceSheet(s.ledger, s.clock.monthIndex);
  const ourStrength = bs.totalAssets > 0 && bs.totalEquity / bs.totalAssets > 0.4 ? 0.05 : -0.05;
  return clamp(V.theirBase.value + (50 - d.truth.strength) / 150 + V.theirPerSeat.value * terms.partnerSeats + ourStrength + (terms.name.trim() !== s.coop.name ? 0.03 : 0), 0, 1);
}

export function forecastDealVote(s: GameState, d: Deal, terms: DealTerms): DealVoteForecast {
  const shown = d.diligence ? d.truth : d.estimate;
  const { appeal, factors } = dealAppeal(s, d, terms, shown);
  const e = expectedReferendum(s, appeal);
  return {
    expectedYes: e.yesShare, turnout: e.turnout, threshold: s.governance.bylaws.supermajority, appeal, factors,
    ...(d.kind === 'merger' ? { theirExpectedYes: theirYes(s, { ...d, truth: shown }, terms) } : {}),
    basedOnEstimates: !d.diligence && d.kind === 'merger',
  };
}

