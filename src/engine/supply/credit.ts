// Customer credit (DESIGN §9.2): receivables by age, collections, finance charges, bad debt.

import { CREDIT } from '../../data/supply';
import { roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { DivisionId, ReceivablesBook, SupplyBook, SupplyPolicy } from '../types';
import { marketValue } from '../world/marketPath';

export const arTotal = (ar: ReceivablesBook): Cents => ar.current + ar.past30 + ar.past60 + ar.past90 + ar.harvest;

/** Farm income stress: 0 normally, rising when real net farm income falls below its 10-year average. */
export function farmStress(ctx: TickContext): number {
  const { path, mi } = ctx;
  const real = (m: number) => marketValue(path, 'netFarmIncome', m) / marketValue(path, 'cpi', m);
  let s = 0;
  for (let k = 1; k <= 10; k++) s += real(mi - 12 * k);
  return Math.max(0, 0.85 - real(mi) / (s / 10));
}

/**
 * Age receivables one month, collect, charge interest on past-due balances, write off old
 * accounts against the allowance and top the allowance up to its target.
 * Returns bad debt expense recognized.
 */
export function stepCredit(ctx: TickContext, division: DivisionId, book: SupplyBook, policy: SupplyPolicy): Cents {
  const { state, month } = ctx;
  const ar = book.ar;
  const r = CREDIT.collectRate.value[policy.credit];
  // Collections, oldest first at lower rates.
  const collect = (bal: Cents, rate: number) => roundCents(bal * rate);
  const cCur = collect(ar.current, r);
  const ag = CREDIT.agingCollect.value;
  const c30 = collect(ar.past30, r * ag.past30);
  const c60 = collect(ar.past60, r * ag.past60);
  const c90 = collect(ar.past90, r * ag.past90);
  const harvestDue = month >= 10 && month <= 12;
  const cHar = harvestDue ? collect(ar.harvest, CREDIT.harvestCollect.value) : 0;
  const collected = cCur + c30 + c60 + c90 + cHar;
  const next: ReceivablesBook = {
    current: 0,
    past30: ar.current - cCur,
    past60: ar.past30 - c30,
    past90: ar.past60 - c60 + ar.past90 - c90,
    harvest: ar.harvest - cHar,
  };
  // Unpaid harvest balances go past due in January.
  if (month === 1 && next.harvest > 0) {
    next.past30 += next.harvest;
    next.harvest = 0;
  }
  // Finance charges on past-due balances.
  const prime = marketValue(ctx.path, 'prime', ctx.mi);
  const pastDue = next.past30 + next.past60 + next.past90;
  const fc = roundCents((pastDue * (prime + CREDIT.financeChargeSpread.value)) / 100 / 12);
  next.past30 += fc;
  // Write off a slice of the oldest accounts.
  const writeOff = roundCents(next.past90 * CREDIT.writeOffMonthly.value);
  next.past90 -= writeOff;
  book.ar = next;
  const lines = [];
  if (collected > 0) lines.push({ account: '1000', division, amount: collected }, { account: '1100', division, amount: -collected });
  if (fc > 0) lines.push({ account: '1100', division, amount: fc }, { account: '6000', division, amount: -fc });
  if (writeOff > 0) lines.push({ account: '1150', division, amount: writeOff }, { account: '1100', division, amount: -writeOff });
  if (lines.length) post(state, { source: 'credit', memo: 'Collections, finance charges and write-offs', lines });
  book.allowance -= writeOff;

  // Allowance target and bad debt expense.
  const stress = farmStress(ctx);
  const rate = CREDIT.lossRate.value[policy.credit] * (1 + CREDIT.stressMultiplier.value * stress);
  const target = roundCents(next.past90 * CREDIT.allowancePast90.value + next.past60 * CREDIT.allowancePast60.value + (next.current + next.past30 + next.harvest) * rate);
  const expense = target - book.allowance;
  if (expense !== 0) {
    post(state, { source: 'bad-debt', memo: expense > 0 ? 'Provision for bad debts' : 'Release of bad-debt allowance', lines: [{ account: '7500', division, amount: expense }, { account: '1150', division, amount: -expense }] });
    book.allowance = target;
  }
  return expense;
}
