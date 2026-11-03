// CCC sugar loans (D-135). Processors pledge refined sugar in store to the USDA Commodity
// Credit Corporation for nonrecourse loans at the loan rate. They are cheaper than the seasonal
// line, so the co-op draws on them first when it needs cash and repays them as the sugar sells;
// what the market will not pay above the loan rate is forfeited (see the sales step).

import { SUGAR_FINANCE } from '../../data/sugar';
import { LENDING } from '../../data/tuning';
import { valueAt } from '../../data/types';
import { monthOf, yearOf } from '../core/calendar';
import { roundCents } from '../core/money';
import { lineDrawn } from '../finance/lender';
import { balance, post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { GameState } from '../types';
import { nominalCents } from '../world/macro';
import { marketValue } from '../world/marketPath';

/** Loan rate ($/cwt) for the crop in store this month; 0 when there is no program. */
export function cccLoanRate(state: GameState): number {
  const mi = state.clock.monthIndex;
  const cropYear = monthOf(mi) >= 9 ? yearOf(mi) : yearOf(mi) - 1;
  return valueAt(SUGAR_FINANCE.loanRate, cropYear);
}

/** Most the CCC will lend on the sugar in store (cents). */
export const cccCapacity = (state: GameState): number => roundCents(state.coop.sugar.sugarCwt * cccLoanRate(state) * 100);

/** Monthly, after the month's operating cash flows and before the line sweep. */
export function stepCccLoans(ctx: TickContext): void {
  const { state, mi, path } = ctx;
  const book = state.coop.sugar;
  const held = book.cccLoan ?? 0;
  const cap = cccCapacity(state);
  if (held <= 0 && cap <= 0) return;
  const lines: { account: string; division: 'SUGAR'; amount: number }[] = [];
  if (held > 0) {
    const interest = roundCents((held * (marketValue(path, 'tbill', mi) + SUGAR_FINANCE.cccSpread.value)) / 100 / 12);
    if (interest > 0) lines.push({ account: '8000', division: 'SUGAR', amount: interest }, { account: '1000', division: 'SUGAR', amount: -interest });
  }
  const cash = balance(state.ledger, '1000') - lines.reduce((a, l) => a + (l.account === '1000' ? -l.amount : 0), 0);
  const buffer = nominalCents(path, mi, LENDING.cashBuffer.value);
  let change: number;
  if (held > cap) change = cap - held; // sugar sold: the loan on it is repaid
  else {
    // Cover a shortfall and replace line borrowing, as far as the sugar allows; repay from spare cash.
    const need = Math.max(0, buffer - cash) + lineDrawn(state);
    change = need > 0 ? Math.min(cap - held, need) : -Math.min(held, Math.max(0, cash - buffer));
  }
  if (change !== 0) lines.push({ account: '1000', division: 'SUGAR', amount: change }, { account: '2050', division: 'SUGAR', amount: -change });
  if (lines.length) post(state, { source: 'ccc-loan', memo: change > 0 ? 'CCC sugar loan' : change < 0 ? 'Repay CCC sugar loan' : 'Interest on CCC sugar loans', lines });
  book.cccLoan = held + change;
  if (book.report && book.report.monthIndex === mi) book.report.cccLoan = book.cccLoan;
}
