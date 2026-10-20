// Loan covenants and the breach path (DESIGN §12). Tested at each fiscal year end once the
// co-op borrows (D-047: year-end, not quarterly, because a grain co-op's balance sheet
// balloons with harvest inventory every fall). A breach puts the co-op on watch; continued breaches bring a waiver
// (fee and spread), then special credit (restrictions on cash patronage, redemptions and
// capital spending, plus a lender-appointed consultant), then forced action (game over).
// Compliant quarters walk the status back up one step at a time.

import { COVENANTS, lenderKind } from '../../data/finance';
import { isFiscalYearEnd } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents } from '../core/money';
import { post } from '../ledger/ledger';
import { ratios } from '../ledger/ratios';
import type { TickContext } from '../sim/context';
import type { CovenantResult, CovenantTest, GameState, LenderStatus } from '../types';
import { nominalCents } from '../world/macro';
import { brandLabel, memberEquity, termOutLine, totalDebt } from './lender';
import { LENDING } from '../../data/tuning';

const ORDER: LenderStatus[] = ['standard', 'watch', 'waiver', 'specialCredit', 'forcedAction'];
export const STATUS_LABEL: Record<LenderStatus, string> = {
  standard: 'In good standing', watch: 'Watch list', waiver: 'Operating under a waiver', specialCredit: 'Special credit', forcedAction: 'Forced action',
};

export function covenantSet(state: GameState) {
  return COVENANTS.byKind[lenderKind(state.coop.lenderId)].value;
}

export function testCovenants(state: GameState): CovenantTest {
  const r = ratios(state);
  const c = covenantSet(state);
  const res = (id: CovenantResult['id'], label: string, value: number, limit: number, kind: 'min' | 'max'): CovenantResult => ({
    id, label, value, limit, kind, ok: kind === 'min' ? value >= limit : value <= limit,
  });
  const results: CovenantResult[] = [
    res('currentRatio', 'Current ratio', r.currentRatio, c.minCurrentRatio, 'min'),
    res('equityRatio', 'Owner equity / total assets', r.ownerEquityPct, c.minEquityRatio, 'min'),
    res('termDebtToFixed', 'Term debt / net fixed assets', r.termDebtToNetFixed, c.maxTermDebtToFixed, 'max'),
    res('debtService', 'Debt service coverage', r.debtServiceCoverage, c.minDebtService, 'min'),
  ];
  return { monthIndex: state.clock.monthIndex, results, breached: results.some((x) => !x.ok), equity: memberEquity(state) };
}

const SPREAD: Record<LenderStatus, () => number> = {
  standard: () => 0,
  watch: () => COVENANTS.watchSpread.value,
  waiver: () => COVENANTS.waiverSpread.value,
  specialCredit: () => COVENANTS.specialSpread.value,
  forcedAction: () => COVENANTS.specialSpread.value,
};

export const capexRestricted = (state: GameState): boolean => state.coop.finance.status === 'specialCredit' || state.coop.finance.status === 'forcedAction';

export function stepCovenants(ctx: TickContext): void {
  const { state } = ctx;
  const fin = state.coop.finance;
  // Consultant under special credit.
  if (fin.status === 'specialCredit') {
    const fee = nominalCents(ctx.path, ctx.mi, COVENANTS.consultantMonthly.value);
    post(state, { source: 'lender-consultant', memo: 'Lender-appointed consultant', lines: [{ account: '7600', division: 'CORP', amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
  }
  // Balance-sheet covenants are measured on the audited fiscal-year-end statements.
  if (!isFiscalYearEnd(ctx.mi, state.setup.fiscalYearEndMonth)) return;
  // No tests in the first year or while the co-op owes nothing.
  if (ctx.mi - state.coop.foundedMonth < 12 || totalDebt(state) <= 0) {
    fin.lastTest = null;
    return;
  }
  const test = testCovenants(state);
  const prev = fin.lastTest;
  fin.lastTest = test;
  const lender = brandLabel(state.coop.lenderId);
  const failed = test.results.filter((x) => !x.ok).map((x) => `${x.label} ${fmt(x)} (limit ${x.kind === 'min' ? '≥' : '≤'} ${fmtLimit(x)})`).join('; ');
  const move = (to: LenderStatus, title: string, body: string) => {
    fin.status = to;
    fin.riskSpread = SPREAD[to]();
    fin.breachQuarters = 0;
    fin.okQuarters = 0;
    ctx.inbox({ kind: 'alert', title, body });
  };
  if (test.breached) {
    fin.okQuarters = 0;
    fin.breachQuarters += 1;
    // The lender's first remedy for thin working capital: term out part of the line.
    const cr = test.results.find((x) => x.id === 'currentRatio')!;
    if (!cr.ok && fin.status !== 'specialCredit') {
      const c = covenantSet(state);
      const amt = termOutLine(state, c.minCurrentRatio + 0.15, c.maxTermDebtToFixed);
      if (amt > 0) ctx.inbox({ kind: 'memo', title: 'Line of credit termed out', body: `To restore working capital, ${lender} converted ${formatCents(amt)} of our seasonal line into a ${LENDING.termLoanMonths.value / 12}-year term loan.` });
    }
    // Distress: debt service not covered, or equity below covenant and still shrinking.
    const dsc = test.results.find((x) => x.id === 'debtService')!;
    const eqr = test.results.find((x) => x.id === 'equityRatio')!;
    const [k0, k1] = COVENANTS.crunchYears;
    const crunch = ctx.year >= k0 && ctx.year <= k1 && eqr.value < COVENANTS.crunchDistressEquity.value;
    const deep = eqr.value < COVENANTS.deepBreachEquity.value;
    const distress = dsc.value < 1 || (!eqr.ok && (!prev || test.equity < prev.equity)) || crunch || deep;
    if (fin.status === 'standard' && crunch) {
      move('specialCredit', 'Credit crunch: loans moved to special credit', `Credit markets have frozen and our equity is thin (${failed}). ${lender} moved our loans straight to its special credit group. Cash patronage is limited to the legal minimum, redemptions stop, capital projects need consent, and a consultant bills us monthly. If we are still this thin at the next year end, the lender will act.`);
    } else if (fin.status === 'standard') {
      move('watch', 'Loan covenant breached: lender watch list', `${lender} reports that we are out of compliance: ${failed}. We are on the watch list and pay ${COVENANTS.watchSpread.value} points more on the line. If we are still out of compliance at next year end we will need a formal waiver.`);
    } else if (fin.status === 'watch' && crunch) {
      move('specialCredit', 'Credit crunch: loans moved to special credit', `With credit markets frozen and our equity thin (${failed}), ${lender} skipped the waiver and moved our loans to its special credit group. Cash patronage is limited to the legal minimum, redemptions stop, capital projects need consent, and a consultant bills us monthly.`);
    } else if (fin.status === 'watch' && deep) {
      move('specialCredit', 'Loans transferred to special credit', `Our equity has fallen far below the covenant (${failed}). ${lender} skipped the waiver and moved our loans to its special credit group: cash patronage is limited to the legal minimum, redemptions stop, capital projects need consent, and a consultant bills us monthly. If we are still this thin at the next year end, the lender will act.`);
    } else if (fin.status === 'watch' && fin.breachQuarters >= COVENANTS.quartersToEscalate) {
      const fee = roundCents(fin.lineCommitment * COVENANTS.waiverFee.value);
      if (fee > 0) post(state, { source: 'covenant-waiver', memo: 'Covenant waiver fee', lines: [{ account: '7600', division: 'CORP', amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
      move('waiver', 'Covenant waiver granted, at a price', `We remain out of compliance (${failed}). ${lender} granted a waiver for a fee of ${formatCents(fee)} and raised our spread to ${COVENANTS.waiverSpread.value} points. If we don't get back into compliance, the loan goes to special credit.`);
    } else if (fin.status === 'waiver' && fin.breachQuarters >= COVENANTS.quartersToEscalate) {
      move('specialCredit', 'Loans transferred to special credit', `${lender} has moved our loans to its special credit group (${failed}). Until we recover: cash patronage is limited to the legal minimum, equity redemptions stop, new capital projects need the lender's consent (refused for now), the line will not grow, and a lender-appointed consultant bills us monthly.`);
    } else if (fin.status === 'specialCredit' && (fin.breachQuarters >= COVENANTS.quartersToForce || crunch) && distress) {
      move('forcedAction', 'The lender forces action', `${lender} has lost patience. It is calling the loans and requiring the board to sell or merge the cooperative.`);
      state.outcome = { kind: 'liquidated', monthIndex: ctx.mi, text: `After a year in special credit without recovering covenant compliance, ${lender} called the loans and forced the board to sell the cooperative's assets. Your tenure as general manager is over.` };
    }
    return;
  }
  fin.breachQuarters = 0;
  fin.okQuarters += 1;
  const i = ORDER.indexOf(fin.status);
  if (i > 0 && fin.status !== 'forcedAction' && fin.okQuarters >= COVENANTS.quartersToRecover) {
    const to = ORDER[i - 1];
    fin.status = to;
    fin.riskSpread = SPREAD[to]();
    fin.okQuarters = 0;
    ctx.inbox({ kind: 'memo', title: 'Lender standing improves', body: `A year in compliance: ${lender} moved us to "${STATUS_LABEL[to]}".` });
  }
}

const fmt = (x: CovenantResult) => (x.id === 'equityRatio' ? `${(x.value * 100).toFixed(1)}%` : Number.isFinite(x.value) ? x.value.toFixed(2) : 'n/a');
const fmtLimit = (x: CovenantResult) => (x.id === 'equityRatio' ? `${(x.limit * 100).toFixed(0)}%` : x.limit.toFixed(2));
