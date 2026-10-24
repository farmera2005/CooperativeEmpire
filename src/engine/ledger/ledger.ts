// Double-entry posting. The only way balances change.

import type { Cents } from '../core/money';
import { fiscalYearOf } from '../core/calendar';
import { ACCOUNT_BY_ID, isIncomeAccount, key, splitKey } from './coa';
import type { DivisionId, GameState, JournalEntry, JournalLine, LedgerState, MonthLedger } from '../types';

export function emptyLedger(firstMonth: number): LedgerState {
  return { balances: {}, months: [newMonth(firstMonth)], nextEntryId: 1, firstMonth };
}

function newMonth(monthIndex: number): MonthLedger {
  return { monthIndex, activity: {}, closing: {}, entries: [], byFacility: {} };
}

export function currentMonthLedger(l: LedgerState): MonthLedger {
  return l.months[l.months.length - 1];
}

export interface PostInput {
  source: string;
  memo: string;
  lines: JournalLine[];
  closing?: boolean;
}

export class LedgerError extends Error {}

/** Post a balanced journal entry into the current month. Mutates the working-copy ledger. */
export function post(state: GameState, input: PostInput): JournalEntry {
  const l = state.ledger;
  const lines = input.lines.filter((ln) => ln.amount !== 0);
  let total = 0;
  for (const ln of lines) {
    if (!Number.isInteger(ln.amount)) throw new LedgerError(`Non-integer cents in ${input.source}: ${ln.amount}`);
    if (!ACCOUNT_BY_ID[ln.account]) throw new LedgerError(`Unknown account ${ln.account} in ${input.source}`);
    total += ln.amount;
  }
  if (total !== 0) throw new LedgerError(`Unbalanced entry ${input.source}: off by ${total}`);
  const month = currentMonthLedger(l);
  if (month.monthIndex !== state.clock.monthIndex) throw new LedgerError('Ledger month out of sync with clock');
  const entry: JournalEntry = {
    id: l.nextEntryId++,
    monthIndex: state.clock.monthIndex,
    source: input.source,
    memo: input.memo,
    ...(input.closing ? { closing: true } : {}),
    lines,
  };
  const bucket = input.closing ? month.closing : month.activity;
  for (const ln of lines) {
    const k = key(ln.account, ln.division);
    l.balances[k] = (l.balances[k] ?? 0) + ln.amount;
    bucket[k] = (bucket[k] ?? 0) + ln.amount;
    if (ln.facilityId !== undefined && !input.closing) {
      const fk = `${ln.account}|${ln.facilityId}`;
      const byF = (month.byFacility ??= {});
      byF[fk] = (byF[fk] ?? 0) + ln.amount;
    }
  }
  month.entries?.push(entry);
  return entry;
}

/** Convenience for a two-line entry: debit one account, credit another. */
export function post2(
  state: GameState,
  source: string,
  memo: string,
  debit: { account: string; division: DivisionId },
  credit: { account: string; division: DivisionId },
  amount: Cents,
): void {
  if (amount === 0) return;
  post(state, {
    source,
    memo,
    lines: [
      { account: debit.account, division: debit.division, amount },
      { account: credit.account, division: credit.division, amount: -amount },
    ],
  });
}

/** Balance of an account (all divisions unless one is given), debit-positive. */
export function balance(l: LedgerState, account: string, division?: DivisionId): Cents {
  if (division) return l.balances[key(account, division)] ?? 0;
  let t = 0;
  for (const k in l.balances) if (splitKey(k)[0] === account) t += l.balances[k];
  return t;
}

/** Open the ledger month for the new clock month and trim old detail (D-007). */
export function openMonth(state: GameState, retainFiscalYears: number): void {
  const l = state.ledger;
  l.months = l.months.slice(); // shallow copy; older MonthLedgers are never mutated again
  l.months.push(newMonth(state.clock.monthIndex));
  const fye = state.setup.fiscalYearEndMonth;
  const keepFrom = fiscalYearOf(state.clock.monthIndex, fye) - retainFiscalYears;
  for (let i = 0; i < l.months.length - 1; i++) {
    const m = l.months[i];
    if (m.entries && fiscalYearOf(m.monthIndex, fye) < keepFrom) l.months[i] = { ...m, entries: null };
  }
}

/**
 * Close revenue and expense accounts into 3900 (net savings to be distributed) at fiscal
 * year end. Distribution out of 3900 happens when the board votes the patronage (M4); until
 * then the FYE close moves the balance straight to unallocated retained earnings.
 */
export function closeFiscalYear(state: GameState, toAccount: '3900' | '3400'): Cents {
  const l = state.ledger;
  const lines: JournalLine[] = [];
  let net = 0;
  const keys = Object.keys(l.balances).sort();
  for (const k of keys) {
    const [acct, div] = splitKey(k);
    if (!isIncomeAccount(acct)) continue;
    const bal = l.balances[k];
    if (bal === 0) continue;
    lines.push({ account: acct, division: div as DivisionId, amount: -bal });
    net += bal;
  }
  if (lines.length === 0) return 0;
  // net is debit-positive sum of income accounts; savings = -net.
  lines.push({ account: toAccount, division: 'CORP', amount: net });
  post(state, { source: 'fye-close', memo: 'Close fiscal year income and expense', lines, closing: true });
  return -net;
}
