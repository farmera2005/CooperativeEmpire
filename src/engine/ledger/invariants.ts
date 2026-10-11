// Accounting invariants checked every month (DESIGN §22.1).

import { splitKey } from './coa';
import { activityFor, balanceSheet, cashFlow } from './statements';
import type { GameState } from '../types';

export function checkInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const l = state.ledger;
  const mi = state.clock.monthIndex;

  // 1. Trial balance: all balances sum to zero.
  let tb = 0;
  for (const k in l.balances) tb += l.balances[k];
  if (tb !== 0) errors.push(`Trial balance off by ${tb} cents`);

  // 2. Assets = liabilities + equity (including current-year savings).
  const bs = balanceSheet(l, mi);
  if (bs.totalAssets !== bs.totalLiabilities + bs.totalEquity) {
    errors.push(`A != L + E: ${bs.totalAssets} vs ${bs.totalLiabilities + bs.totalEquity}`);
  }

  // 3. Cash flow for the month reconciles to the change in cash.
  const cf = cashFlow(l, mi, mi);
  const act = activityFor(l, mi, mi, true);
  let dCash = 0;
  for (const k in act) if (splitKey(k)[0] === '1000') dCash += act[k];
  if (cf.netChange !== dCash) errors.push(`Cash flow ${cf.netChange} != change in cash ${dCash}`);

  // 4. Equity subledger ties to the general ledger.
  const tie = (acct: string, sub: Record<number, number>) => {
    let gl = 0;
    for (const k in l.balances) if (splitKey(k)[0] === acct) gl -= l.balances[k];
    let sl = 0;
    for (const id in sub) sl += sub[id];
    if (gl !== sl) errors.push(`Subledger ${acct}: GL ${gl} != subledger ${sl}`);
  };
  tie('3000', state.equity.commonStock);
  tie('3100', state.equity.preferredStock);
  let q = 0;
  let nq = 0;
  for (const id in state.equity.allocated) {
    const v = state.equity.allocated[id];
    for (const fy in v) {
      q += v[fy][0];
      nq += v[fy][1];
    }
  }
  let glQ = 0;
  let glNq = 0;
  for (const k in l.balances) {
    const acct = splitKey(k)[0];
    if (acct === '3200') glQ -= l.balances[k];
    if (acct === '3300') glNq -= l.balances[k];
  }
  if (q !== glQ) errors.push(`Qualified equity subledger ${q} != GL ${glQ}`);
  if (nq !== glNq) errors.push(`Nonqualified equity subledger ${nq} != GL ${glNq}`);

  return errors;
}
