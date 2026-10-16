// Directors' demands, board confidence and the annual GM review (DESIGN §14.3–14.4).

import { marketValue } from '../world/marketPath';
import { CONFIDENCE, DEMANDS, GM_REVIEW } from '../../data/governance';
import { DIVISION_LABEL } from '../../data/supply';
import { OVERHEAD } from '../../data/tuning';
import { fiscalYearEnd, fiscalYearOf, fiscalYearStart, formatMonth } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import { covenantSet } from '../finance/covenants';
import { redemptionBudget } from '../finance/redemption';
import { post } from '../ledger/ledger';
import { balanceSheet, incomeStatement } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import type { Demand, DivisionId, GameState, GmReview, OpDivision } from '../types';
import { nominalCents } from '../world/macro';
import { farmStress } from '../supply/credit';
import { engagement } from './elections';

const memberName = (s: GameState, id: number) => s.members.list.find((m) => m.id === id)?.name ?? 'A director';

const trailing = (s: GameState, d: DivisionId, mi = s.clock.monthIndex) => incomeStatement(s.ledger, Math.max(s.ledger.firstMonth, mi - 11), mi, d);

/** Owner equity ratio on the latest fiscal-year-end balance sheet. */
function yearEndEquityRatio(s: GameState): number {
  const fye = s.setup.fiscalYearEndMonth;
  const fy = fiscalYearOf(s.clock.monthIndex, fye);
  const at = Math.max(s.ledger.firstMonth, s.clock.monthIndex === fiscalYearEnd(fy, fye) ? s.clock.monthIndex : fiscalYearEnd(fy - 1, fye));
  const bs = balanceSheet(s.ledger, at);
  return bs.totalAssets > 0 ? bs.totalEquity / bs.totalAssets : 1;
}

function demandMet(s: GameState, d: Demand): boolean {
  switch (d.kind) {
    case 'expandTown': return s.coop.facilities.some((f) => f.townId === d.townId && f.status !== 'closed') || s.coop.projects.some((p) => s.coop.facilities.find((f) => f.id === p.facilityId)?.townId === d.townId);
    case 'redemptionBudget': return redemptionBudget(s) >= d.target;
    case 'cashPatronage': {
      const last = s.coop.equityProgram.history[s.coop.equityProgram.history.length - 1];
      if (!last || last.monthIndex < d.createdMonth) return false;
      const alloc = last.cash + last.qualified + last.nonqualified;
      return alloc > 0 && last.cash / alloc >= d.target;
    }
    case 'equityRatio': return yearEndEquityRatio(s) >= d.target;
    case 'growDivision': return trailing(s, d.division!).sales >= d.target;
    case 'fixDivision': return trailing(s, d.division!).localSavings >= 0 || !s.coop.facilities.some((f) => f.division === d.division && f.status === 'operating');
  }
}

/** A director may raise an item from a pet issue; it becomes a demand with a deadline. */
function raiseDemands(ctx: TickContext): void {
  const { state } = ctx;
  const g = state.governance;
  const open = g.demands.filter((d) => d.status === 'open');
  if (open.length >= DEMANDS.maxOpen || ctx.mi - state.coop.foundedMonth < 12) return;
  const rng = ctx.rng('governance.demands');
  for (const dir of [...g.directors].sort((a, b) => a.memberId - b.memberId)) {
    if (!rng.chance(DEMANDS.raiseProb.value)) continue;
    if (g.demands.some((d) => d.directorId === dir.memberId && d.status === 'open')) continue;
    // Hometown service is everyone's background concern; it becomes a demand only for a
    // co-op big enough to expand, and less often than a director's signature issue.
    const signature = dir.petIssues.filter((p) => p.kind !== 'hometown');
    const canExpand = state.coop.facilities.filter((f) => f.status === 'operating').length >= 2;
    const pet = signature.length && (!canExpand || rng.chance(0.7)) ? rng.pick(signature) : dir.petIssues[0];
    if (!pet || (pet.kind === 'hometown' && !canExpand)) continue;
    const who = memberName(state, dir.memberId);
    const deadline = ctx.mi + DEMANDS.deadlineMonths;
    const base = { id: g.nextItemId++, directorId: dir.memberId, createdMonth: ctx.mi, deadlineMonth: deadline, status: 'open' as const };
    let d: Demand | null = null;
    switch (pet.kind) {
      case 'hometown': {
        const t = pet.townId ?? 0;
        if (state.coop.facilities.some((f) => f.townId === t && f.status !== 'closed')) break;
        d = { ...base, deadlineMonth: ctx.mi + DEMANDS.expandDeadlineMonths, kind: 'expandTown', townId: t, target: 1, text: `${who} wants the co-op to serve ${state.world.towns[t].name}: open or buy a facility there by ${formatMonth(deadline)}.` };
        break;
      }
      case 'redemption': {
        const cur = redemptionBudget(state);
        const target = Math.max(roundCents(cur * 1.5), nominalCents(ctx.path, ctx.mi, 25_000));
        d = { ...base, kind: 'redemptionBudget', target, text: `${who} wants retired members paid out: a redemption budget of at least ${formatCents(target)} by ${formatMonth(deadline)}.` };
        break;
      }
      case 'patronageCash':
        d = { ...base, kind: 'cashPatronage', target: 0.4, text: `${who} wants at least 40% of the next patronage paid in cash.` };
        break;
      case 'conservative': {
        // Only a thin balance sheet worries a conservative director enough to make a demand.
        if (yearEndEquityRatio(state) >= 0.5) break;
        const target = Math.max(covenantSet(state).minEquityRatio + 0.1, Math.min(0.6, yearEndEquityRatio(state) + 0.03));
        d = { ...base, kind: 'equityRatio', target, text: `${who} wants the balance sheet strengthened: owner equity of ${Math.round(target * 100)}% of assets at a fiscal year end by ${formatMonth(deadline)}.` };
        break;
      }
      case 'division': {
        const div = pet.division as OpDivision;
        const ts = trailing(state, div);
        if (pet.favor && ts.sales > 0) d = { ...base, kind: 'growDivision', division: div, target: roundCents(ts.sales * 1.1), text: `${who} wants ${DIVISION_LABEL[div].toLowerCase()} sales up 10% (to ${formatCents(roundCents(ts.sales * 1.1))} a year) by ${formatMonth(deadline)}.` };
        if (!pet.favor && ts.localSavings < 0) d = { ...base, kind: 'fixDivision', division: div, target: 0, text: `${who} wants ${DIVISION_LABEL[div].toLowerCase()} to stop losing money, or be closed, by ${formatMonth(deadline)}.` };
        break;
      }
      default: break;
    }
    if (!d || open.some((x) => x.kind === d!.kind && x.townId === d!.townId && x.division === d!.division)) continue;
    g.demands = [...g.demands, d];
    ctx.inbox({ kind: 'memo', title: 'A director raises an item', body: `${d.text} The board added it to your goals.` });
    return;
  }
}

function checkDemands(ctx: TickContext): void {
  const { state } = ctx;
  const g = state.governance;
  g.demands = g.demands.map((d) => {
    if (d.status !== 'open') return d;
    const met = demandMet(state, d);
    if (!met && ctx.mi < d.deadlineMonth) return d;
    const dir = g.directors.find((x) => x.memberId === d.directorId);
    if (dir) dir.loyaltyToGM = clamp(dir.loyaltyToGM + (met ? 8 : -10), 0, 100);
    g.boardConfidence = clamp(g.boardConfidence + (met ? CONFIDENCE.demandMet.value : CONFIDENCE.demandMissed.value), 0, 100);
    ctx.inbox({ kind: met ? 'memo' : 'alert', title: met ? 'Director\'s goal met' : 'Director\'s goal missed', body: `${d.text.split(':')[0].split(' by ')[0]} — ${met ? 'done. The director is pleased.' : 'the deadline passed. The director is unhappy and the board noticed.'}` });
    return { ...d, status: met ? 'met' as const : 'missed' as const };
  }).filter((d) => d.status === 'open' || ctx.mi - d.deadlineMonth < 36);
}

/** Monthly confidence drift: lender standing, member satisfaction, pull toward the last review. */
function driftConfidence(ctx: TickContext): void {
  const { state } = ctx;
  const g = state.governance;
  const avg = averageSatisfaction(state);
  const last = g.reviews[g.reviews.length - 1];
  const target = last?.score ?? CONFIDENCE.start;
  const drift = (CONFIDENCE.lenderStatus[state.coop.finance.status] ?? 0) + CONFIDENCE.satisfaction.value * (avg - 50) + CONFIDENCE.reversion.value * (target - g.boardConfidence);
  g.boardConfidence = clamp(g.boardConfidence + drift, 0, 100);
}

/** Members' satisfaction, weighted by how much of their business they do with us. */
export function averageSatisfaction(s: GameState): number {
  let sat = 0;
  let w = 0;
  for (const m of s.members.list) if (m.kind === 'member' && m.status === 'active') {
    const e = 0.1 + engagement(m);
    sat += m.satisfaction * m.weight * e;
    w += m.weight * e;
  }
  return w > 0 ? sat / w : 50;
}

/** The annual GM review, after the audit and the patronage vote. */
export function gmReview(ctx: TickContext, fy: number): GmReview {
  const { state } = ctx;
  const g = state.governance;
  const fye = state.setup.fiscalYearEndMonth;
  const from = Math.max(state.ledger.firstMonth, fiscalYearStart(fy, fye));
  const to = fiscalYearEnd(fy, fye);
  const is = incomeStatement(state.ledger, from, to);
  const bs = balanceSheet(state.ledger, to);
  const equity = Math.max(1, bs.totalEquity);
  const notes: string[] = [];
  const b = state.coop.budget && state.coop.budget.fy === fy ? state.coop.budget : null;
  // Budget: local savings against plan.
  // Directors are farmers: in a bad farm economy they grade on a curve.
  const ratePain = clamp((marketValue(ctx.path, 'prime', ctx.mi) - GM_REVIEW.ratePainFrom.value) / 10, 0, 1);
  const curve = clamp(GM_REVIEW.hardTimesCurve.value * Math.max(farmStress(ctx), ratePain), 0, 20);
  let budget = 55;
  if (b) {
    const planned = Object.values(b.lines).reduce((a, x) => a + x.localSavings, 0);
    const scale = Math.max(Math.abs(planned), equity * 0.03);
    budget = clamp(50 + curve + (25 * (is.localSavings - planned)) / scale, 10, 95);
    notes.push(`Local savings ${formatCents(is.localSavings)} against a budget of ${formatCents(planned)}`);
  }
  const roe = is.savingsBeforeTax / equity;
  const savings = clamp(50 + curve + 400 * roe, 0, 100);
  notes.push(bs.totalEquity > 0 ? `Savings before tax were ${(roe * 100).toFixed(1)}% of member equity` : `Savings before tax were ${formatCents(is.savingsBeforeTax)}, and member equity is gone`);
  const lender = ({ standard: 80, watch: 50, waiver: 30, specialCredit: 10, forcedAction: 0 } as Record<string, number>)[state.coop.finance.status];
  const sat = averageSatisfaction(state);
  // Patrons' satisfaction usually sits in the 40s; score it against that norm.
  const members = clamp(2 * sat - 40, 0, 100);
  const loyalty = g.directors.length ? g.directors.reduce((a, d) => a + d.loyaltyToGM, 0) / g.directors.length : 50;
  const yearAgo = ctx.mi - 12;
  const closed = g.demands.filter((d) => d.status !== 'open' && d.deadlineMonth >= yearAgo);
  const met = closed.filter((d) => d.status === 'met' || demandMet(state, d)).length;
  const demands = closed.length ? (100 * met) / closed.length : 60;
  const recent = g.votes.filter((v) => v.monthIndex >= yearAgo);
  const votes = recent.length ? (100 * recent.filter((v) => v.passed).length) / recent.length : 60;
  const c = { budget, savings, lender, members, demands, votes, loyalty };
  const w = GM_REVIEW.weights;
  const score = Math.round(Object.entries(c).reduce((a, [k, v]) => a + w[k as keyof typeof w] * v, 0));
  g.boardConfidence = clamp((1 - GM_REVIEW.reviewWeight) * g.boardConfidence + GM_REVIEW.reviewWeight * score, 0, 100);
  // Bonus.
  const members0 = state.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
  const salary = nominalCents(ctx.path, ctx.mi, OVERHEAD.gmSalaryBase.value + OVERHEAD.gmSalaryPerMember.value * members0 + OVERHEAD.gmSalaryPerLocation.value * state.coop.facilities.filter((f) => f.status !== 'closed').length);
  const bonus = roundCents(salary * GM_REVIEW.maxBonus.value * clamp((score - 50) / 50, 0, 1));
  if (bonus > 0) post(state, { source: 'gm-bonus', memo: `General manager's bonus, fiscal ${fy}`, lines: [{ account: '7000', division: 'CORP', amount: bonus }, { account: '1000', division: 'CORP', amount: -bonus }] });
  const wasPip = g.pip;
  let fired = false;
  if (g.boardConfidence < CONFIDENCE.fireBelow && wasPip && score < CONFIDENCE.fireScoreBelow) fired = true;
  else if (g.boardConfidence < CONFIDENCE.pipBelow) g.pip = true;
  else if (g.pip && g.boardConfidence >= CONFIDENCE.pipBelow + 10) g.pip = false;
  const review: GmReview = { monthIndex: ctx.mi, fy, score, components: c, bonus, pip: g.pip, notes };
  g.reviews = [...g.reviews, review].slice(-30);
  if (fired) {
    state.outcome = { kind: 'fired', monthIndex: ctx.mi, text: `At its annual review of fiscal ${fy}, the board concluded that the co-op needs new leadership (review score ${score}, board confidence ${Math.round(g.boardConfidence)}). Your tenure as general manager is over.` };
    return review;
  }
  ctx.inbox({
    kind: g.pip && !wasPip ? 'alert' : 'memo', title: `Annual review: score ${score}`,
    body: `The board reviewed your fiscal ${fy} performance. ${notes.join('. ')}. Lender standing ${lender}/100; member satisfaction ${Math.round(sat)}; directors' goals ${Math.round(demands)}%; votes won ${Math.round(votes)}%.\n\nBoard confidence is now ${Math.round(g.boardConfidence)}.${bonus > 0 ? ` Bonus: ${formatCents(bonus)}.` : ''}${g.pip && !wasPip ? ' The board placed you on a performance improvement plan. Another weak review will end your tenure.' : ''}${wasPip && !g.pip ? ' The performance improvement plan is lifted.' : ''}`,
  });
  return review;
}

/** Monthly governance outside the meeting: demands, drift, emergency termination. */
export function stepBoardRelations(ctx: TickContext): void {
  const { state } = ctx;
  const g = state.governance;
  raiseDemands(ctx);
  checkDemands(ctx);
  driftConfidence(ctx);
  if (g.pip && g.boardConfidence < CONFIDENCE.fireAnyMeetingBelow && !state.outcome) {
    state.outcome = { kind: 'fired', monthIndex: ctx.mi, text: `With board confidence at ${Math.round(g.boardConfidence)}, a director moved to terminate the general manager, and the motion carried. Your tenure is over.` };
  }
  // Annual review, three months after year end (after the patronage vote).
  const fye = state.setup.fiscalYearEndMonth;
  const fy = fiscalYearOf(ctx.mi, fye) - 1;
  if (ctx.mi === fiscalYearEnd(fy, fye) + GM_REVIEW.monthsAfterFye && ctx.mi - state.coop.foundedMonth >= 12 && !state.outcome) gmReview(ctx, fy);
}
