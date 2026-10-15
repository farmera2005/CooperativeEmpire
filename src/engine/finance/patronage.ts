// Fiscal year close, patronage distribution and Subchapter T tax (DESIGN §10.4, §11).
//
// Cycle (months after fiscal year end F):
//   F    close: split savings into patronage-sourced (by division, member share of business)
//        and non-patronage; snapshot each member's patronage bases; accrue estimated tax
//        using the standing proposal; close income to 3900.
//   F+2  audit finished; the proposal goes to the board.
//   F+3  board vote: the proposal in force is applied. Tax is trued up against 3900, and
//        3900 is distributed to cash patronage payable (2150), qualified (3200) and
//        nonqualified (3300) equity by vintage, and unallocated retained earnings (3400).
//   F+4  annual meeting: cash patronage, redemptions and income tax are paid.

import { addGrievance } from '../members/grievances';
import { PATRONAGE } from '../../data/finance';
import { QUALIFIED_MIN_CASH_PCT } from '../../data/law';
import { DIVISION_LABEL, LINES, type LineId } from '../../data/supply';
import { valueAt } from '../../data/types';
import { fiscalYearEnd, fiscalYearOf, fiscalYearStart, formatMonth } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { allocateCents, roundCents, type Cents } from '../core/money';
import { balance, closeFiscalYear, post } from '../ledger/ledger';
import { incomeStatement } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import {
  OP_DIVISIONS, type DistributionSummary, type FiscalDivision, type FiscalResult, type GameState, type OpDivision,
  type PatronageBasis, type PatronageProposal, type PoolSplit,
} from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { computeTax, productionDeductionRate } from './tax';
import { runRedemptions } from './redemption';
import { addAgendaItem } from '../governance/votes';

export function lineDivision(line: string): OpDivision | null {
  if (line.startsWith('GRAIN_')) return 'GRAIN';
  return (LINES[line as LineId]?.division as OpDivision | undefined) ?? null;
}

/** Bases each division offers in the proposal builder. */
export const BASES_FOR: Record<OpDivision, PatronageBasis[]> = {
  GRAIN: ['units', 'sales', 'margin'], AGRONOMY: ['sales', 'margin'], FEED: ['sales', 'margin'], ENERGY: ['sales', 'margin'], RETAIL: ['sales', 'margin'],
};

const nonOperating = (byAccount: Record<string, Cents>): Cents => (byAccount['8050'] ?? 0) + (byAccount['8200'] ?? 0) + (byAccount['8300'] ?? 0);

/** Split the fiscal year's savings into patronage-sourced (by division) and non-patronage. */
export function computeFiscalResult(state: GameState, fy: number): FiscalResult {
  const fye = state.setup.fiscalYearEndMonth;
  const from = Math.max(fiscalYearStart(fy, fye), state.ledger.firstMonth);
  const to = fiscalYearEnd(fy, fye);
  const l = state.ledger;
  const all = incomeStatement(l, from, to, 'ALL');
  const corp = incomeStatement(l, from, to, 'CORP');
  const corpOperating = corp.savingsBeforeTax - nonOperating(corp.byAccount);
  const divs = OP_DIVISIONS.map((d) => ({ d, is: incomeStatement(l, from, to, d) }));
  const grossTotal = divs.reduce((s, x) => s + Math.max(0, x.is.grossRevenue), 0);
  const corpShares = allocateCents(corpOperating, divs.map((x) => (grossTotal > 0 ? Math.max(0, x.is.grossRevenue) : x.d === 'GRAIN' ? 1 : 0)));
  let ps = 0;
  const divisions: FiscalDivision[] = divs.map((x, i) => {
    const operating = x.is.savingsBeforeTax - nonOperating(x.is.byAccount) + corpShares[i];
    const st = state.coop.patronageStats[x.d];
    const tot = st.member + st.nonmember;
    const memberShare = tot > 0 ? st.member / tot : 1;
    const patronageSourced = roundCents(operating * memberShare);
    ps += patronageSourced;
    return { division: x.d, operating, grossRevenue: x.is.grossRevenue, memberShare, patronageSourced };
  });

  // Patronage bases: each member's business this year, by division and basis.
  const fyLines = state.coop.equityProgram.fyLines;
  const weight = (line: string, basis: PatronageBasis): number => {
    const st = fyLines[line];
    if (basis === 'units' || !st || st.units <= 0) return basis === 'units' ? 1 : st && st.units > 0 ? st.revenue / st.units : 0;
    if (basis === 'margin' && !line.startsWith('GRAIN_')) return Math.max(0, (st.revenue - st.cogs) / st.units);
    if (basis === 'margin') return 1;
    return st.revenue / st.units;
  };
  const members = state.members.list.filter((m) => m.kind === 'member' && Object.keys(m.ytd).length > 0).sort((a, b) => a.id - b.id);
  const bases: Record<string, number[]> = {};
  for (const d of OP_DIVISIONS) for (const b of BASES_FOR[d]) bases[`${d}:${b}`] = new Array(members.length).fill(0);
  members.forEach((m, i) => {
    for (const line of Object.keys(m.ytd).sort()) {
      const d = lineDivision(line);
      if (!d) continue;
      for (const b of BASES_FOR[d]) bases[`${d}:${b}`][i] += m.ytd[line] * weight(line, b);
    }
  });
  for (const k of Object.keys(bases)) if (bases[k].every((v) => v === 0)) delete bases[k];

  const grainFeed = divs.filter((x) => x.d === 'GRAIN' || x.d === 'FEED').reduce((s, x) => s + Math.max(0, x.is.grossRevenue), 0);
  return {
    fy, closedMonth: to, savingsBeforeTax: all.savingsBeforeTax, estimatedTax: 0, nonPatronage: all.savingsBeforeTax - ps, divisions, bases,
    memberIds: members.map((m) => m.id), wages: all.byAccount['7000'] ?? 0, qualifyingShare: grossTotal > 0 ? grainFeed / grossTotal : 0,
    nqRedeemed: state.coop.equityProgram.nqRedeemedFY, status: 'audit',
  };
}

export function validateProposal(p: PatronageProposal): string[] {
  const errs: string[] = [];
  const keys = p.pooling === 'single' ? ['ALL'] : ['ALL', ...OP_DIVISIONS];
  for (const k of keys) {
    const s = p.pools[k];
    if (!s) {
      if (k === 'ALL') errs.push('The proposal needs a default split.');
      continue;
    }
    const sum = s.cash + s.qualified + s.nonqualified + s.unallocated;
    if ([s.cash, s.qualified, s.nonqualified, s.unallocated].some((v) => v < 0 || v > 1)) errs.push(`${poolLabel(k)}: shares must be between 0% and 100%.`);
    if (Math.abs(sum - 1) > 1e-6) errs.push(`${poolLabel(k)}: shares add to ${Math.round(sum * 100)}%, not 100%.`);
    if (s.qualified > 0 && s.cash < QUALIFIED_MIN_CASH_PCT * (s.cash + s.qualified) - 1e-9) {
      errs.push(`${poolLabel(k)}: a qualified allocation must pay at least ${QUALIFIED_MIN_CASH_PCT * 100}% of the qualified refund in cash (cash ${Math.round(s.cash * 100)}% of ${Math.round((s.cash + s.qualified) * 100)}%).`);
    }
  }
  for (const d of OP_DIVISIONS) if (!BASES_FOR[d].includes(p.basis[d])) errs.push(`${DIVISION_LABEL[d]}: basis ${p.basis[d]} is not allowed.`);
  if (p.passDeduction < 0 || p.passDeduction > 1) errs.push('Deduction pass-through must be between 0% and 100%.');
  return errs;
}

export const poolLabel = (k: string): string => (k === 'ALL' ? 'All business' : DIVISION_LABEL[k as OpDivision] ?? k);

export interface Pool {
  key: string;
  label: string;
  patronageSourced: Cents;
  bases: number[];
  split: PoolSplit;
}

/** Restrict a split to the 20% cash minimum (lender special-credit restriction). */
function restrictSplit(s: PoolSplit): PoolSplit {
  const refund = s.cash + s.qualified;
  const minCash = QUALIFIED_MIN_CASH_PCT * refund;
  if (s.cash <= minCash) return s;
  return { ...s, cash: minCash, qualified: refund - minCash };
}

export function buildPools(r: FiscalResult, p: PatronageProposal, restricted = false): Pool[] {
  const n = r.memberIds.length;
  const basisOf = (d: OpDivision): number[] => {
    const b = p.pooling === 'single' && p.basis[d] === 'units' ? 'sales' : p.basis[d];
    return r.bases[`${d}:${b}`] ?? new Array(n).fill(0);
  };
  const split = (k: string) => {
    const s = p.pools[k] ?? p.pools.ALL;
    return restricted ? restrictSplit(s) : s;
  };
  if (p.pooling === 'single') {
    const bases = new Array(n).fill(0);
    for (const d of r.divisions) basisOf(d.division).forEach((v, i) => (bases[i] += v));
    return [{ key: 'ALL', label: poolLabel('ALL'), patronageSourced: r.divisions.reduce((s, d) => s + d.patronageSourced, 0), bases, split: split('ALL') }];
  }
  return r.divisions
    .filter((d) => d.patronageSourced !== 0)
    .map((d) => ({ key: d.division, label: poolLabel(d.division), patronageSourced: d.patronageSourced, bases: basisOf(d.division), split: split(d.division) }));
}

export interface DistributionPlan {
  summary: DistributionSummary;
  memberIds: number[];
  cash: Cents[];
  qualified: Cents[];
  nonqualified: Cents[];
  /** Allocated equity cancelled to absorb a loss (chargeAllocated). */
  charged: Cents[];
  newCarryforward: Cents;
  nol: { fy: number; amount: Cents; expires: number }[];
  memberTaxRate: number;
}

const isRestricted = (state: GameState) => state.coop.finance.status === 'specialCredit' || state.coop.finance.status === 'forcedAction';

/** Plan the distribution of a closed fiscal year under a proposal. Pure: used for previews and for the vote. */
export function planDistribution(state: GameState, r: FiscalResult, p: PatronageProposal): DistributionPlan {
  const restricted = isRestricted(state);
  const pools = buildPools(r, p, restricted);
  const n = r.memberIds.length;
  const cash = new Array<Cents>(n).fill(0);
  const qualified = new Array<Cents>(n).fill(0);
  const nonqualified = new Array<Cents>(n).fill(0);
  const charged = new Array<Cents>(n).fill(0);
  const ep = state.coop.equityProgram;

  // Net losses against gains (when chosen), then recover any carried-forward loss.
  let amounts = pools.map((x) => x.patronageSourced);
  if (p.lossTreatment === 'netAgainstPools') {
    const neg = -amounts.filter((a) => a < 0).reduce((s, a) => s + a, 0);
    const pos = amounts.filter((a) => a > 0).reduce((s, a) => s + a, 0);
    if (neg > 0 && pos > 0) {
      const offset = Math.min(neg, pos);
      const posCut = allocateCents(offset, amounts.map((a) => Math.max(0, a)));
      const negCut = allocateCents(offset, amounts.map((a) => Math.max(0, -a)));
      amounts = amounts.map((a, i) => a - posCut[i] + negCut[i]);
    }
  }
  const positive = amounts.reduce((s, a) => s + Math.max(0, a), 0);
  const cfUsed = Math.min(ep.lossCarryforward, positive);
  if (cfUsed > 0) {
    const cut = allocateCents(cfUsed, amounts.map((a) => Math.max(0, a)));
    amounts = amounts.map((a, i) => a - cut[i]);
  }

  const minAlloc = nominalCents(pathFor(state), r.closedMonth, PATRONAGE.minAllocation.value);
  let poolUnallocated = 0;
  let loss = 0;
  let deMinimis = 0;
  pools.forEach((pool, pi) => {
    const amt = amounts[pi];
    if (amt < 0) {
      loss += -amt;
      if (p.lossTreatment === 'chargeAllocated') {
        const parts = allocateCents(-amt, pool.bases);
        parts.forEach((c, i) => {
          if (c <= 0) return;
          const held = heldEquity(state, r.memberIds[i]) - charged[i];
          charged[i] += Math.min(c, Math.max(0, held));
        });
      }
      return;
    }
    if (amt === 0 || pool.bases.every((b) => b <= 0)) {
      poolUnallocated += amt;
      return;
    }
    const parts = allocateCents(amt, pool.bases);
    const s = pool.split;
    parts.forEach((a, i) => {
      if (a <= 0) return;
      const c = roundCents(a * s.cash);
      const q = roundCents(a * s.qualified);
      const nq = roundCents(a * s.nonqualified);
      const un = a - c - q - nq;
      if (c + q + nq < minAlloc) {
        deMinimis += a;
        return;
      }
      cash[i] += c;
      qualified[i] += q;
      nonqualified[i] += nq;
      poolUnallocated += un;
    });
  });

  const sum = (xs: Cents[]) => xs.reduce((s, v) => s + v, 0);
  const totCash = sum(cash);
  const totQ = sum(qualified);
  const totNq = sum(nonqualified);
  const chargedTotal = sum(charged);

  // Production deduction (DPAD / 199A(g)), part of which may be passed to members.
  const rate = productionDeductionRate(r.fy);
  const qpai = Math.max(0, r.savingsBeforeTax) * r.qualifyingShare;
  const deduction = rate.pct > 0 ? roundCents(Math.min(rate.pct * qpai, rate.wageLimit * Math.max(0, r.wages))) : 0;
  const passed = roundCents(deduction * clamp(p.passDeduction, 0, 1));
  const tax = computeTax({ fy: r.fy, savingsBeforeTax: r.savingsBeforeTax, qualifiedAllocations: totCash + totQ, nqRedeemed: r.nqRedeemed, deduction: deduction - passed, nol: ep.nol });

  const memberTaxRate = valueAt(PATRONAGE.memberTaxRate, r.fy);
  let patrons = 0;
  let taxOverCheck = 0;
  for (let i = 0; i < n; i++) {
    if (cash[i] + qualified[i] + nonqualified[i] <= 0) continue;
    patrons++;
    if (cash[i] < memberTaxRate * (cash[i] + qualified[i])) taxOverCheck++;
  }
  const newCarryforward = ep.lossCarryforward - cfUsed + (p.lossTreatment === 'carryForward' ? loss : 0);
  const summary: DistributionSummary = {
    fy: r.fy, monthIndex: state.clock.monthIndex, savingsBeforeTax: r.savingsBeforeTax,
    patronageSourced: r.savingsBeforeTax - r.nonPatronage, nonPatronage: r.nonPatronage,
    cash: totCash, qualified: totQ, nonqualified: totNq, unallocated: poolUnallocated + deMinimis || 0,
    loss: p.lossTreatment === 'chargeAllocated' ? chargedTotal : loss, lossTreatment: p.lossTreatment, carryforwardUsed: cfUsed,
    tax: tax.tax, taxable: tax.taxable, deduction, deductionPassed: passed, nolUsed: tax.nolUsed,
    patrons, taxOverCheck, proposal: p, restricted,
  };
  return { summary, memberIds: r.memberIds, cash, qualified, nonqualified, charged, newCarryforward, nol: tax.nol, memberTaxRate };
}

export function heldEquity(state: GameState, memberId: number): Cents {
  const v = state.equity.allocated[memberId];
  if (!v) return 0;
  let t = 0;
  for (const fy in v) t += v[fy][0] + v[fy][1];
  return t;
}

/** Cancel allocated equity newest vintage first (qualified before nonqualified). */
function cancelEquity(state: GameState, memberId: number, amount: Cents): { q: Cents; nq: Cents } {
  const v = state.equity.allocated[memberId];
  let left = amount;
  let q = 0;
  let nq = 0;
  if (!v) return { q, nq };
  const vintages = Object.keys(v).map(Number).sort((a, b) => b - a);
  for (const fy of vintages) {
    if (left <= 0) break;
    const takeQ = Math.min(left, v[fy][0]);
    left -= takeQ;
    const takeNq = Math.min(left, v[fy][1]);
    left -= takeNq;
    v[fy] = [v[fy][0] - takeQ, v[fy][1] - takeNq];
    q += takeQ;
    nq += takeNq;
    if (v[fy][0] === 0 && v[fy][1] === 0) delete v[fy];
  }
  if (Object.keys(v).length === 0) delete state.equity.allocated[memberId];
  return { q, nq };
}

/** The fiscal year closes: accrue estimated tax, close income to 3900, snapshot bases. */
export function closeFiscalYearCycle(ctx: TickContext): FiscalResult {
  const { state } = ctx;
  const ep = state.coop.equityProgram;
  const fy = fiscalYearOf(ctx.mi, state.setup.fiscalYearEndMonth);
  const result = computeFiscalResult(state, fy);
  const est = planDistribution(state, result, ep.proposal).summary.tax;
  if (est > 0) {
    post(state, { source: 'tax-accrual', memo: `Estimated income tax, fiscal ${fy}`, lines: [{ account: '9000', division: 'CORP', amount: est }, { account: '2170', division: 'CORP', amount: -est }] });
  }
  result.estimatedTax = est;
  closeFiscalYear(state, '3900');
  ep.pending = result;
  ep.nqRedeemedFY = 0;
  ep.fyLines = {};
  for (const m of state.members.list) m.ytd = {};
  for (const k of Object.keys(state.coop.patronageStats) as (keyof typeof state.coop.patronageStats)[]) state.coop.patronageStats[k] = { member: 0, nonmember: 0 };
  const ps = result.savingsBeforeTax - result.nonPatronage;
  ctx.inbox({
    kind: 'memo', title: `Fiscal ${fy} closed`,
    body: `The books for fiscal ${fy} are closed. Savings before tax: ${formatCents(result.savingsBeforeTax)} (patronage-sourced ${formatCents(ps)}, non-patronage ${formatCents(result.nonPatronage)}). Estimated income tax under the current patronage plan: ${formatCents(est)}.\n\nThe auditors start fieldwork now. The board votes the patronage distribution in ${formatMonth(ctx.mi + PATRONAGE.voteMonthsAfterFye)}; until then you can change the plan on the Equity & Patronage screen.`,
  });
  return result;
}

/** Board vote: apply the standing proposal to the closed year. */
export function distributePatronage(ctx: TickContext): DistributionSummary | null {
  const { state } = ctx;
  const ep = state.coop.equityProgram;
  const r = ep.pending;
  if (!r) return null;
  const plan = planDistribution(state, r, ep.proposal);
  const sm = plan.summary;
  sm.monthIndex = ctx.mi;

  // Tax true-up against the distributable balance.
  const trueUp = sm.tax - r.estimatedTax;
  if (trueUp !== 0) {
    post(state, { source: 'tax-trueup', memo: `Income tax true-up on the final distribution, fiscal ${r.fy}`, lines: [{ account: '3900', division: 'CORP', amount: trueUp }, { account: '2170', division: 'CORP', amount: -trueUp }] });
  }
  // Charge losses against allocated equity first (subledger), then distribute 3900.
  let chargedQ = 0;
  let chargedNq = 0;
  plan.charged.forEach((c, i) => {
    if (c <= 0) return;
    const x = cancelEquity(state, plan.memberIds[i], c);
    chargedQ += x.q;
    chargedNq += x.nq;
  });
  const distributable = -balance(state.ledger, '3900');
  const toUnallocated = distributable - sm.cash - sm.qualified - sm.nonqualified + chargedQ + chargedNq;
  post(state, {
    source: 'patronage', memo: `Distribution of fiscal ${r.fy} net savings`,
    lines: [
      { account: '3900', division: 'CORP', amount: distributable },
      { account: '2150', division: 'CORP', amount: -sm.cash },
      { account: '3200', division: 'CORP', amount: chargedQ - sm.qualified },
      { account: '3300', division: 'CORP', amount: chargedNq - sm.nonqualified },
      { account: '3400', division: 'CORP', amount: -toUnallocated },
    ],
  });
  const eq = state.equity.allocated;
  const byId = new Map(state.members.list.map((m) => [m.id, m]));
  const pc = PATRONAGE;
  plan.memberIds.forEach((id, i) => {
    const q = plan.qualified[i];
    const nq = plan.nonqualified[i];
    const total = plan.cash[i] + q + nq;
    if (q > 0 || nq > 0) {
      const v = (eq[id] ??= {});
      const cur = v[r.fy] ?? [0, 0];
      v[r.fy] = [cur[0] + q, cur[1] + nq];
    }
    const m = byId.get(id);
    if (!m) return;
    if (total > 0) {
      m.patronage = [...m.patronage, { fy: r.fy, cents: total }].slice(-10);
      // Members judge the check against the tax they owe on the allocation.
      const memberTax = plan.memberTaxRate * (plan.cash[i] + q);
      const short = memberTax - plan.cash[i];
      if (short > 0 && m.status === 'active') {
        const sev = Math.round(clamp((pc.taxBillGrievance.value * short) / total, 0, 3) * 100) / 100;
        if (sev > 0.05) {
          addGrievance(m, { kind: 'patronageTax', division: 'CORP', month: ctx.mi, severity: sev });
        }
      }
      m.loyalty = clamp(m.loyalty + pc.cashLoyalty.value * (plan.cash[i] / total - pc.cashReference.value), 0, 1);
    } else if (m.status === 'active') {
      m.loyalty = clamp(m.loyalty + pc.noPatronageLoyalty.value, 0, 1);
    }
  });
  ep.lossCarryforward = plan.newCarryforward;
  ep.nol = plan.nol;
  ep.pending = null;
  ep.approved = sm;
  ep.history = [...ep.history, sm].slice(-40);
  const allocated = sm.cash + sm.qualified + sm.nonqualified;
  ctx.inbox({
    kind: 'memo', title: `Board approves fiscal ${r.fy} patronage`,
    body: allocated > 0
      ? `The board voted to allocate ${formatCents(allocated)} of patronage to ${sm.patrons} members: ${formatCents(sm.cash)} in cash (paid next month), ${formatCents(sm.qualified)} as qualified equity and ${formatCents(sm.nonqualified)} as nonqualified equity. ${formatCents(sm.unallocated)} goes to unallocated reserves. Income tax: ${formatCents(sm.tax)}.${sm.taxOverCheck ? ` ${sm.taxOverCheck} members will owe more tax on their allocation than their check pays.` : ''}${sm.restricted ? ' Under special credit, the lender limited cash patronage to the legal minimum.' : ''}`
      : `There is no patronage to allocate for fiscal ${r.fy}${sm.loss > 0 ? `; a patronage loss of ${formatCents(sm.loss)} was ${sm.lossTreatment === 'chargeAllocated' ? 'charged against members\' allocated equity' : sm.lossTreatment === 'carryForward' ? 'carried forward against future patronage' : 'absorbed by unallocated reserves'}` : ''}. Income tax: ${formatCents(sm.tax)}.`,
  });
  return sm;
}

/** Annual meeting: pay cash patronage and income tax, run the redemption program. */
export function payDistribution(ctx: TickContext): void {
  const { state } = ctx;
  const ep = state.coop.equityProgram;
  const cashDue = -balance(state.ledger, '2150');
  if (cashDue > 0) post(state, { source: 'patronage-paid', memo: 'Cash patronage checks', lines: [{ account: '2150', division: 'CORP', amount: cashDue }, { account: '1000', division: 'CORP', amount: -cashDue }] });
  const taxDue = -balance(state.ledger, '2170');
  if (taxDue > 0) post(state, { source: 'tax-paid', memo: 'Income tax paid', lines: [{ account: '2170', division: 'CORP', amount: taxDue }, { account: '1000', division: 'CORP', amount: -taxDue }] });
  const red = runRedemptions(ctx);
  if (ep.approved) {
    ep.approved.redemption = red;
    ep.history = ep.history.map((h) => (h.fy === ep.approved!.fy ? { ...h, redemption: red } : h));
  }
  ep.approved = null;
  ctx.inbox({
    kind: 'memo', title: 'Patronage checks mailed',
    body: `The co-op paid ${formatCents(cashDue)} in cash patronage${red.total > 0 ? ` and redeemed ${formatCents(red.total)} of members' equity (estates ${formatCents(red.estate)}, age ${formatCents(red.age)}, revolving ${formatCents(red.revolving)}, pool ${formatCents(red.pool)}, base capital ${formatCents(red.base)})` : ''}.${taxDue > 0 ? ` Income tax of ${formatCents(taxDue)} was paid.` : ''}`,
  });
}

/** Monthly step for the patronage calendar. */
export function stepEquityCycle(ctx: TickContext): void {
  const ep = ctx.state.coop.equityProgram;
  if (ep.pending) {
    const since = ctx.mi - ep.pending.closedMonth;
    if (since === PATRONAGE.auditMonths && ep.pending.status === 'audit') {
      ep.pending.status = 'proposal';
      ctx.inbox({ kind: 'memo', title: `Fiscal ${ep.pending.fy} audit complete`, body: `The auditors issued a clean opinion on fiscal ${ep.pending.fy}. The patronage plan is on the agenda for next month's board meeting; review it on the Equity & Patronage screen and lobby directors in the Board Room.` });
    }
    if (since === PATRONAGE.auditMonths && !ctx.state.governance.agenda.some((i) => i.type === 'patronage')) {
      addAgendaItem(ctx.state, { type: 'patronage', title: `Fiscal ${ep.pending.fy} patronage distribution`, submittedMonth: ctx.mi, source: 'system' });
    }
    // Tax law requires the distribution within 8½ months of year end.
    if (since >= 8 && ep.pending) {
      ctx.state.governance.agenda = ctx.state.governance.agenda.filter((i) => i.type !== 'patronage');
      distributePatronage(ctx);
    }
    return;
  }
  if (ep.approved && ctx.mi - ep.approved.monthIndex >= PATRONAGE.payMonthsAfterFye - PATRONAGE.voteMonthsAfterFye) payDistribution(ctx);
}
