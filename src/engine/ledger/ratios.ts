// Financial ratios a co-op CFO and lender watch (DESIGN §6.1).

import type { Cents } from '../core/money';
import type { GameState } from '../types';
import { activityFor, balanceSheet, incomeStatement } from './statements';
import { splitKey } from './coa';

export interface Ratios {
  workingCapital: Cents;
  currentRatio: number;
  ownerEquityPct: number;
  localLeverage: number;
  termDebtToNetFixed: number;
  debtServiceCoverage: number;
  returnOnLocalEquity: number;
  netFixedAssets: Cents;
  termDebt: Cents;
}

const sumLines = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

export function ratios(state: GameState): Ratios {
  const mi = state.clock.monthIndex;
  const bs = balanceSheet(state.ledger, mi);
  const ca = sumLines(bs.currentAssets);
  const cl = sumLines(bs.currentLiabilities);
  const invest = sumLines(bs.investments);
  const netFixed = sumLines(bs.fixedAssets);
  const termDebt = state.coop.finance.termLoans.reduce((a, l) => a + l.balance, 0);
  const localEquity = bs.totalEquity - invest;
  const from = Math.max(state.ledger.firstMonth, mi - 11);
  const ttm = incomeStatement(state.ledger, from, mi);
  // Term debt service over the trailing year: principal + interest on term loans.
  const act = activityFor(state.ledger, from, mi);
  let principalPaid = 0;
  for (const k in act) if (splitKey(k)[0] === '2300' && act[k] > 0) principalPaid += act[k];
  const termInterest = state.coop.finance.termLoans.reduce((a, l) => a + (l.balance * l.ratePct) / 100, 0);
  const service = principalPaid + termInterest;
  const cashAvail = ttm.netSavings + ttm.opex.depreciation + termInterest;
  return {
    workingCapital: ca - cl,
    currentRatio: cl > 0 ? ca / cl : Infinity,
    ownerEquityPct: bs.totalAssets > 0 ? bs.totalEquity / bs.totalAssets : 0,
    localLeverage: localEquity > 0 ? bs.totalLiabilities / localEquity : Infinity,
    termDebtToNetFixed: netFixed > 0 ? termDebt / netFixed : 0,
    debtServiceCoverage: service > 0 ? cashAvail / service : Infinity,
    returnOnLocalEquity: localEquity > 0 ? ttm.localSavings / localEquity : 0,
    netFixedAssets: netFixed,
    termDebt,
  };
}
