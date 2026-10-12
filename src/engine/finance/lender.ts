// Lender (DESIGN §12, M2 scope): seasonal line with a commitment and a monthly borrowing
// base, amortizing term loans, interest, and the cash sweep. Covenants arrive in M4.

import { LENDING } from '../../data/tuning';
import { roundCents, type Cents } from '../core/money';
import { formatCents } from '../core/format';
import { balance, post } from '../ledger/ledger';
import { balanceSheet } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import type { FinanceState, GameState, TermLoan } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { marketValue } from '../world/marketPath';
import { grainCapacity } from '../facilities/facilities';

export function lineRate(state: GameState, mi = state.clock.monthIndex): number {
  const spread = LENDING.spreadOverPrime[state.coop.lenderId]?.value ?? LENDING.spreadOverPrime['local-bank'].value;
  return marketValue(pathFor(state), 'prime', mi) + spread;
}

export const memberEquity = (state: GameState): Cents => balanceSheet(state.ledger, state.clock.monthIndex).totalEquity;

/** Borrowing base: eligible assets at advance rates plus an unsecured slice of equity. */
export function borrowingBase(state: GameState): Cents {
  const adv = LENDING.advance.value;
  const l = state.ledger;
  let hedged = 0;
  let unhedged = 0;
  for (const p of Object.values(state.coop.grain.pos)) {
    const net = Math.max(0, p.ownedBu - p.dpBu);
    const hedgedShare = net > 0 ? Math.min(1, p.shortBu / net) : 1;
    hedged += p.book * hedgedShare;
    unhedged += p.book * (1 - hedgedShare);
  }
  const other = balance(l, '1210') + balance(l, '1220') + balance(l, '1230') + balance(l, '1240');
  const base = adv.receivables * Math.max(0, balance(l, '1100') + balance(l, '1150'))
    + adv.hedgedGrain * hedged + adv.unhedgedGrain * unhedged + adv.otherInventory * other
    + adv.marginDeposits * Math.max(0, balance(l, '1310'))
    + LENDING.unsecuredEquityShare.value * Math.max(0, memberEquity(state));
  return Math.max(0, roundCents(base));
}

export function lineDrawn(state: GameState): Cents {
  return -balance(state.ledger, '2000');
}

/** Cash plus undrawn line the co-op could spend right now. */
export function liquidity(state: GameState): Cents {
  const f = state.coop.finance;
  const avail = Math.min(f.lineCommitment, borrowingBase(state)) - lineDrawn(state);
  return balance(state.ledger, '1000') + Math.max(0, avail);
}

export function defaultCommitment(state: GameState): Cents {
  return roundCents(Math.max(0, memberEquity(state)) * LENDING.defaultCommitmentEquityMultiple.value);
}

/** Line the lender offers at renewal: equity-based floor or enough to carry a full house of grain. */
export function renewalCommitment(state: GameState): Cents {
  const path = pathFor(state);
  const mi = state.clock.monthIndex;
  let need = 0;
  for (const f of state.coop.facilities) {
    if (f.status === 'closed') continue;
    const cap = grainCapacity(f.components);
    need += (cap.storageBu + cap.pileBu) * marketValue(path, 'soybeans', mi) * 0.5 + (cap.storageBu + cap.pileBu) * marketValue(path, 'corn', mi) * 0.5;
  }
  const want = Math.max(defaultCommitment(state), roundCents(need * LENDING.inventoryFinanceShare.value * 100));
  return Math.min(want, maxCommitment(state));
}

export function maxCommitment(state: GameState): Cents {
  return roundCents(Math.max(0, memberEquity(state)) * LENDING.maxCommitmentEquityMultiple.value);
}

export function emptyFinance(): FinanceState {
  return { lineCommitment: 0, borrowingBase: 0, lineAvailable: 0, overLimit: false, termLoans: [], nextLoanId: 1, lastLineRate: 0 };
}

/** Level monthly payment for an amortizing loan. */
export function loanPayment(principal: Cents, annualRatePct: number, months: number): Cents {
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return roundCents(principal / months);
  return roundCents((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export function createTermLoan(state: GameState, principal: Cents, purpose: string): TermLoan | null {
  if (principal <= 0) return null;
  const f = state.coop.finance;
  const rate = lineRate(state) + LENDING.termSpread.value;
  const months = LENDING.termLoanMonths.value;
  const loan: TermLoan = { id: f.nextLoanId++, purpose, principal, balance: principal, ratePct: rate, payment: loanPayment(principal, rate, months), startMonth: state.clock.monthIndex, months };
  f.termLoans.push(loan);
  post(state, {
    source: 'term-loan', memo: `Term loan: ${purpose}`,
    lines: [{ account: '1000', division: 'CORP', amount: principal }, { account: '2300', division: 'CORP', amount: -principal }],
  });
  return loan;
}

/** Monthly: interest and principal on term loans, line interest, borrowing base, sweep. */
export function stepLender(ctx: TickContext): void {
  const { state } = ctx;
  const fin = state.coop.finance;
  // Annual renewal of the seasonal line each September, ahead of harvest.
  if (ctx.month === LENDING.renewalMonth) {
    const offer = renewalCommitment(state);
    if (offer !== fin.lineCommitment) {
      ctx.inbox({ kind: 'memo', title: 'Seasonal line renewed', body: `The lender renewed the seasonal line at ${formatCents(offer)} (was ${formatCents(fin.lineCommitment)}), sized to our storage and member equity.` });
      fin.lineCommitment = offer;
    }
  }

  // Term loans (rates fixed at origination).
  for (const loan of fin.termLoans) {
    if (loan.balance <= 0) continue;
    const interest = roundCents((loan.balance * loan.ratePct) / 100 / 12);
    const principal = Math.min(loan.balance, Math.max(0, loan.payment - interest));
    loan.balance -= principal;
    post(state, {
      source: 'term-loan-payment', memo: `Term loan payment: ${loan.purpose}`,
      lines: [
        { account: '8000', division: 'CORP', amount: interest },
        { account: '2300', division: 'CORP', amount: principal },
        { account: '1000', division: 'CORP', amount: -(interest + principal) },
      ],
    });
  }
  fin.termLoans = fin.termLoans.filter((l) => l.balance > 0);

  // Line interest on the opening balance.
  const drawn = lineDrawn(state);
  const rate = lineRate(state) + (fin.overLimit ? LENDING.overLimitPenalty.value : 0);
  fin.lastLineRate = rate;
  if (drawn > 0) {
    const interest = roundCents((drawn * rate) / 100 / 12);
    post(state, {
      source: 'line-interest', memo: 'Interest on seasonal line of credit',
      lines: [{ account: '8000', division: 'CORP', amount: interest }, { account: '1000', division: 'CORP', amount: -interest }],
    });
  }
  sweep(ctx);
}

/** Cover negative cash from the line; repay from cash above the buffer. */
export function sweep(ctx: TickContext): void {
  const { state } = ctx;
  const fin = state.coop.finance;
  const cash = balance(state.ledger, '1000');
  const line = lineDrawn(state);
  const buffer = nominalCents(ctx.path, ctx.mi, LENDING.cashBuffer.value);
  if (cash < 0) {
    post(state, {
      source: 'line-draw', memo: 'Draw on seasonal line of credit',
      lines: [{ account: '1000', division: 'CORP', amount: -cash }, { account: '2000', division: 'CORP', amount: cash }],
    });
  } else if (line > 0 && cash > buffer) {
    const pay = Math.min(line, cash - buffer);
    post(state, {
      source: 'line-repay', memo: 'Repay seasonal line of credit',
      lines: [{ account: '2000', division: 'CORP', amount: pay }, { account: '1000', division: 'CORP', amount: -pay }],
    });
  }
  fin.borrowingBase = borrowingBase(state);
  const limit = Math.min(fin.lineCommitment, fin.borrowingBase);
  fin.lineAvailable = Math.max(0, limit - lineDrawn(state));
  const over = lineDrawn(state) > limit;
  if (over && !fin.overLimit) {
    ctx.inbox({
      kind: 'alert', title: 'Line of credit over limit',
      body: `The seasonal line is drawn to ${formatCents(lineDrawn(state))} against a limit of ${formatCents(limit)} (commitment ${formatCents(fin.lineCommitment)}, borrowing base ${formatCents(fin.borrowingBase)}). The lender is charging a ${LENDING.overLimitPenalty.value}-point penalty rate until we are back inside the limit. Sell inventory, slow capital spending, or ask for a larger commitment.`,
    });
  }
  if (!over && fin.overLimit) ctx.inbox({ kind: 'memo', title: 'Line of credit back within limit', body: 'The penalty rate no longer applies.' });
  fin.overLimit = over;
}
