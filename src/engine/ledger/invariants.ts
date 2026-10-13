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

  // 5. Grain positions tie to inventory, DP liability and margin accounts.
  const g = state.coop.grain;
  let book = 0;
  let dp = 0;
  for (const c of Object.keys(g.pos) as (keyof typeof g.pos)[]) {
    book += g.pos[c].book;
    dp += g.pos[c].dpLiability;
  }
  const glOf = (acct: string) => {
    let v = 0;
    for (const k in l.balances) if (splitKey(k)[0] === acct) v += l.balances[k];
    return v;
  };
  if (book !== glOf('1200')) errors.push(`Grain inventory subledger ${book} != GL ${glOf('1200')}`);
  if (dp !== -glOf('2110')) errors.push(`DP liability subledger ${dp} != GL ${-glOf('2110')}`);
  if (g.marginAccount !== glOf('1310')) errors.push(`Margin account ${g.marginAccount} != GL ${glOf('1310')}`);

  // 6. Fixed-asset register ties to property accounts; projects to construction in progress.
  const byAcct: Record<string, number> = {};
  let accum = 0;
  for (const a of state.coop.assets) {
    byAcct[a.account] = (byAcct[a.account] ?? 0) + a.cost;
    accum += a.accumDep;
  }
  for (const acct of ['1500', '1510', '1520', '1530']) if ((byAcct[acct] ?? 0) !== glOf(acct)) errors.push(`Asset register ${acct} ${byAcct[acct] ?? 0} != GL ${glOf(acct)}`);
  if (accum !== -glOf('1590')) errors.push(`Accumulated depreciation register ${accum} != GL ${-glOf('1590')}`);
  const cip = state.coop.projects.reduce((s, p) => s + p.spent, 0);
  if (cip !== glOf('1540')) errors.push(`Projects ${cip} != construction in progress ${glOf('1540')}`);

  // 7. Term loans tie to long-term debt.
  const loans = state.coop.finance.termLoans.reduce((s, x) => s + x.balance, 0);
  if (loans !== -(glOf('2300') + glOf('2200'))) errors.push(`Term loans ${loans} != GL ${-(glOf('2300') + glOf('2200'))}`);

  // 8. Supply subledgers: inventory layers, receivables, allowance, prepayments, rebates.
  const glDiv = (acct: string, div: string) => l.balances[`${acct}|${div}`] ?? 0;
  const invAcct: Record<string, string> = { AGRONOMY: '1210', FEED: '1220', ENERGY: '1230', RETAIL: '1240' };
  for (const [d, book] of Object.entries(state.coop.supply)) {
    let inv = 0;
    for (const layers of Object.values(book.inventory)) for (const x of layers ?? []) inv += x.cost;
    if (inv !== glDiv(invAcct[d], d)) errors.push(`${d} inventory layers ${inv} != GL ${glDiv(invAcct[d], d)}`);
    const ar = book.ar.current + book.ar.past30 + book.ar.past60 + book.ar.past90 + book.ar.harvest;
    if (ar !== glDiv('1100', d)) errors.push(`${d} receivables ${ar} != GL ${glDiv('1100', d)}`);
    if (book.allowance !== -glDiv('1150', d)) errors.push(`${d} allowance ${book.allowance} != GL ${-glDiv('1150', d)}`);
    if (book.prepay !== -glDiv('2130', d)) errors.push(`${d} prepayments ${book.prepay} != GL ${-glDiv('2130', d)}`);
    if (book.rebatesAccrued !== glDiv('1160', d)) errors.push(`${d} rebates ${book.rebatesAccrued} != GL ${glDiv('1160', d)}`);
  }

  // 9. Investments in other co-ops tie to regional and lender equity held.
  let inv = 0;
  for (const v of Object.values(state.coop.regional.equity)) for (const y in v) inv += v[y];
  for (const v of Object.values(state.coop.finance.lenderEquity)) for (const y in v) inv += v[y];
  if (inv !== glOf('1400')) errors.push(`Regional + lender equity ${inv} != GL ${glOf('1400')}`);

  return errors;
}
