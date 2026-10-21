// "Why" breakdowns (DESIGN §20) for two headline numbers that have no ledger behind them:
// board confidence and member satisfaction.

import { CONFIDENCE } from '../../data/governance';
import { POSTURE_BID, SATISFACTION } from '../../data/grain';
import { DIVISION_CONFIG, SUPPLY_DIVISIONS } from '../../data/supply';
import { bd, type Breakdown } from '../core/breakdown';
import { expectedRefundRate } from '../finance/selectors';
import type { GameState } from '../types';
import { averageSatisfaction } from './review';

export function confidenceWhy(s: GameState): Breakdown {
  const g = s.governance;
  const mi = s.clock.monthIndex;
  const avg = averageSatisfaction(s);
  const last = g.reviews[g.reviews.length - 1];
  const target = last?.score ?? CONFIDENCE.start;
  const lender = CONFIDENCE.lenderStatus[s.coop.finance.status] ?? 0;
  const sat = CONFIDENCE.satisfaction.value * (avg - 50);
  const pull = CONFIDENCE.reversion.value * (target - g.boardConfidence);
  const year = g.votes.filter((v) => mi - v.monthIndex < 12);
  const won = year.filter((v) => v.passed).length;
  const lost = year.length - won;
  const goals = g.demands.filter((d) => d.status !== 'open' && mi - d.deadlineMonth < 12);
  const met = goals.filter((d) => d.status === 'met').length;
  return bd('confidence', 'Board confidence', g.boardConfidence, [
    bd('monthly', 'Moving this month by', lender + sat + pull, [
      bd('lender', `Lender standing (${s.coop.finance.status})`, lender, undefined, undefined, 'rate'),
      bd('satisfaction', `Members' satisfaction (${Math.round(avg)} against 50)`, sat, undefined, undefined, 'rate'),
      bd('review', `Pull toward your last review score (${Math.round(target)})`, pull, undefined, undefined, 'rate'),
    ], 'Points a month; confidence also jumps with votes and directors\' goals.', 'rate'),
    bd('votes', `Votes in the last year: ${won} won, ${lost} lost`, won * CONFIDENCE.voteWon.value + lost * CONFIDENCE.voteLost.value, undefined, 'Each proposal the board turns down costs confidence.', 'rate'),
    bd('goals', `Directors' goals in the last year: ${met} met, ${goals.length - met} missed`, met * CONFIDENCE.demandMet.value + (goals.length - met) * CONFIDENCE.demandMissed.value, undefined, undefined, 'rate'),
    ...(last ? [bd('lastReview', `Last annual review (fiscal ${last.fy})`, last.score, Object.entries(last.components).map(([k, v]) => bd(`r-${k}`, k, v, undefined, undefined, 'score')), 'Your review score out of 100, by part.', 'score')] : []),
  ], `Below ${CONFIDENCE.pipBelow} the board puts you on a performance plan; below ${CONFIDENCE.fireBelow} on a plan, or ${CONFIDENCE.fireAnyMeetingBelow} at any meeting, it can fire you.`, 'score');
}

export function satisfactionWhy(s: GameState): Breakdown {
  const members = s.members.list.filter((m) => m.status === 'active' && m.kind === 'member');
  const n = Math.max(1, members.length);
  const avgLoyalty = members.reduce((a, m) => a + m.loyalty, 0) / n;
  const kinds = new Map<string, number>();
  for (const m of members) for (const gr of m.grievances) kinds.set(gr.kind, (kinds.get(gr.kind) ?? 0) + gr.severity);
  const GRIEVANCE_LABEL: Record<string, string> = { harvestWait: 'Long harvest waits and turned-away trucks', lateApplication: 'Late fertilizer and spray application', patronageTax: 'Tax on patronage bigger than the check' };
  const posture = s.coop.grainPolicy.posture;
  const wait = s.coop.facilities.filter((f) => f.kind === 'elevator' && f.status === 'operating').reduce((a, f) => Math.max(a, f.grain.waitMemory), 0);
  const refund = expectedRefundRate(s);
  return bd('satisfaction', 'Member satisfaction', averageSatisfaction(s), [
    bd('price', `Grain pricing stance: ${posture}`, SATISFACTION.pricePerDollar.value * POSTURE_BID.value[posture], undefined, 'Points members give or take for our bids against rivals\' posted bids.', 'score'),
    bd('wait', 'Remembered harvest waits (worst elevator)', -SATISFACTION.waitPerHour.value * wait + 0, undefined, `${wait.toFixed(1)} hours remembered from recent harvests.`, 'score'),
    bd('grievances', 'Grievances', -[...kinds.values()].reduce((a, v) => a + v, 0) / n * SATISFACTION.grievancePerSeverity.value + 0,
      [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => bd(`g-${k}`, GRIEVANCE_LABEL[k] ?? k, -(v / n) * SATISFACTION.grievancePerSeverity.value, undefined, undefined, 'score')),
      'Average across members; complaints fade over about two years.', 'score'),
    bd('loyalty', 'Loyalty to their co-op', SATISFACTION.loyaltyBonus.value * avgLoyalty, undefined, 'Grows with cash patronage and fair treatment.', 'score'),
    bd('refund', `Expected patronage refund (${(refund * 100).toFixed(1)}% of purchases)`, SATISFACTION.refundPerPct.value * refund * 100, undefined, 'Cash counts fully, retained equity at what members expect it to be worth. It also draws their business.', 'score'),
    ...(() => {
      const divs = SUPPLY_DIVISIONS.filter((d) => d !== 'RETAIL' && s.coop.facilities.some((f) => f.division === d && f.status === 'operating'));
      if (!divs.length) return [];
      const pts = divs.reduce((a, d) => a - SATISFACTION.supplyPricePerPct.value * DIVISION_CONFIG[d].posturePct.value[s.coop.supplyPolicy[d].posture], 0) / divs.length;
      return [bd('supply', 'Farm-supply prices against the local market', pts, undefined, 'For members who buy inputs from us; crews, salespeople and on-time application add or take points too.', 'score')];
    })(),
  ], 'Weighted by how much business each member does with us. Each month satisfaction moves toward 50 plus these influences, judged on the business members do with us.', 'score');
}
