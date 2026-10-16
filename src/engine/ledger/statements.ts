// Financial statements, derived from the ledger. Nothing here is stored in state.

import type { Cents } from '../core/money';
import { ACCOUNTS, ACCOUNT_BY_ID, type IsGroup, splitKey } from './coa';
import type { DivisionId, LedgerState } from '../types';

export type Activity = Record<string, Cents>;

/** Sum of ledger activity for months in [from, to]. */
export function activityFor(l: LedgerState, from: number, to: number, includeClosing = false): Activity {
  const out: Activity = {};
  for (const m of l.months) {
    if (m.monthIndex < from || m.monthIndex > to) continue;
    for (const k in m.activity) out[k] = (out[k] ?? 0) + m.activity[k];
    if (includeClosing) for (const k in m.closing) out[k] = (out[k] ?? 0) + m.closing[k];
  }
  return out;
}

/** Balances at the end of month `at` (debit-positive). */
export function balancesAt(l: LedgerState, at: number): Activity {
  const last = l.months[l.months.length - 1];
  if (at >= last.monthIndex) return { ...l.balances };
  return activityFor(l, l.firstMonth, at, true);
}

const sumWhere = (act: Activity, pred: (acct: string, div: string) => boolean): Cents => {
  let t = 0;
  for (const k in act) {
    const [acct, div] = splitKey(k);
    if (pred(acct, div)) t += act[k];
  }
  return t;
};

// ---------------- Income statement ----------------

export interface IncomeStatement {
  division: DivisionId | 'ALL';
  from: number;
  to: number;
  sales: Cents;
  cogs: Cents;
  grossMargin: Cents;
  serviceIncome: Cents;
  grossRevenue: Cents;
  opex: Record<'personnel' | 'depreciation' | 'repairs' | 'insurance' | 'utilities' | 'badDebt' | 'otherOpex', Cents>;
  totalOpex: Cents;
  interestNet: Cents;
  localSavings: Cents;
  patronageIncome: Cents;
  otherIncome: Cents;
  savingsBeforeTax: Cents;
  tax: Cents;
  netSavings: Cents;
  /** Amount by account for drill-down (credit-positive for revenue, debit-positive for expense). */
  byAccount: Record<string, Cents>;
}

export function incomeStatement(l: LedgerState, from: number, to: number, division: DivisionId | 'ALL' = 'ALL'): IncomeStatement {
  const act = activityFor(l, from, to, false);
  const inDiv = (d: string) => division === 'ALL' || d === division;
  // Revenue-like accounts are credit-normal: negate for display.
  const grp = (g: IsGroup, sign: 1 | -1) => sign * sumWhere(act, (acc, d) => ACCOUNT_BY_ID[acc]?.isGroup === g && inDiv(d));
  const sales = grp('sales', -1);
  const cogs = grp('cogs', 1);
  const serviceIncome = grp('serviceIncome', -1);
  const opex = {
    personnel: grp('personnel', 1),
    depreciation: grp('depreciation', 1),
    repairs: grp('repairs', 1),
    insurance: grp('insurance', 1),
    utilities: grp('utilities', 1),
    badDebt: grp('badDebt', 1),
    otherOpex: grp('otherOpex', 1),
  };
  const totalOpex = Object.values(opex).reduce((x, y) => x + y, 0);
  const interestNet = grp('interest', 1); // expense positive, income reduces it
  const grossMargin = sales - cogs;
  const grossRevenue = grossMargin + serviceIncome;
  const localSavings = grossRevenue - totalOpex - interestNet;
  const patronageIncome = grp('patronageIncome', -1);
  const otherIncome = grp('otherIncome', -1);
  const savingsBeforeTax = localSavings + patronageIncome + otherIncome;
  const tax = grp('tax', 1);
  const byAccount: Record<string, Cents> = {};
  for (const acc of ACCOUNTS) {
    if (acc.cf !== 'income') continue;
    const v = sumWhere(act, (x, d) => x === acc.id && inDiv(d));
    if (v !== 0) byAccount[acc.id] = acc.type === 'revenue' || acc.type === 'otherIncome' ? -v : v;
  }
  return {
    division, from, to, sales, cogs, grossMargin, serviceIncome, grossRevenue, opex, totalOpex, interestNet,
    localSavings, patronageIncome, otherIncome, savingsBeforeTax, tax, netSavings: savingsBeforeTax - tax, byAccount,
  };
}

/** Net savings from raw activity (credit-positive). */
export function netSavingsOf(act: Activity): Cents {
  return -sumWhere(act, (acc) => ACCOUNT_BY_ID[acc]?.cf === 'income');
}

// ---------------- Balance sheet ----------------

export interface BalanceSheetLine {
  account: string;
  name: string;
  amount: Cents; // natural sign: assets positive, liabilities/equity positive
}

export interface BalanceSheet {
  at: number;
  currentAssets: BalanceSheetLine[];
  investments: BalanceSheetLine[];
  fixedAssets: BalanceSheetLine[];
  /** Goodwill from buying companies, net of amortization. */
  intangibles: BalanceSheetLine[];
  currentLiabilities: BalanceSheetLine[];
  longTermLiabilities: BalanceSheetLine[];
  memberEquity: BalanceSheetLine[];
  /** Net savings not yet closed (current fiscal year to date). */
  currentYearSavings: Cents;
  totalAssets: Cents;
  totalLiabilities: Cents;
  totalEquity: Cents;
}

export function balanceSheet(l: LedgerState, at: number): BalanceSheet {
  const bal = balancesAt(l, at);
  const byAcct: Record<string, Cents> = {};
  for (const k in bal) {
    const [acct] = splitKey(k);
    byAcct[acct] = (byAcct[acct] ?? 0) + bal[k];
  }
  const groups = { currentAssets: [], investments: [], fixedAssets: [], intangibles: [], currentLiabilities: [], longTermLiabilities: [], memberEquity: [] } as Record<
    NonNullable<(typeof ACCOUNTS)[number]['bsGroup']>, BalanceSheetLine[]
  >;
  let currentYearSavings = 0;
  for (const acc of ACCOUNTS) {
    const v = byAcct[acc.id] ?? 0;
    if (acc.cf === 'income') {
      currentYearSavings -= v;
      continue;
    }
    if (!acc.bsGroup || v === 0) continue;
    const natural = acc.type === 'asset' || acc.type === 'contraAsset' ? v : -v;
    groups[acc.bsGroup].push({ account: acc.id, name: acc.name, amount: natural });
  }
  const tot = (xs: BalanceSheetLine[]) => xs.reduce((x, y) => x + y.amount, 0);
  const totalAssets = tot(groups.currentAssets) + tot(groups.investments) + tot(groups.fixedAssets) + tot(groups.intangibles);
  const totalLiabilities = tot(groups.currentLiabilities) + tot(groups.longTermLiabilities);
  const totalEquity = tot(groups.memberEquity) + currentYearSavings;
  return { at, ...groups, currentYearSavings, totalAssets, totalLiabilities, totalEquity };
}

// ---------------- Cash flow ----------------

export interface CashFlowLine {
  account: string;
  name: string;
  amount: Cents;
}

export interface CashFlowStatement {
  from: number;
  to: number;
  netSavings: Cents;
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  netOperating: Cents;
  netInvesting: Cents;
  netFinancing: Cents;
  netChange: Cents;
  beginningCash: Cents;
  endingCash: Cents;
}

/**
 * Indirect method from non-closing ledger activity. Because every non-closing entry
 * balances, Δcash = net savings − Σ Δ(non-cash balance sheet accounts) exactly.
 */
export function cashFlow(l: LedgerState, from: number, to: number): CashFlowStatement {
  const act = activityFor(l, from, to, false);
  const byAcct: Record<string, Cents> = {};
  for (const k in act) {
    const [acct] = splitKey(k);
    byAcct[acct] = (byAcct[acct] ?? 0) + act[k];
  }
  const netSavings = netSavingsOf(act);
  const operating: CashFlowLine[] = [];
  const investing: CashFlowLine[] = [];
  const financing: CashFlowLine[] = [];
  for (const acc of ACCOUNTS) {
    const v = byAcct[acc.id] ?? 0;
    if (v === 0 || acc.cf === 'income' || acc.cf === 'cash') continue;
    const line = { account: acc.id, name: acc.name, amount: -v };
    if (acc.cf === 'operating') operating.push(line);
    else if (acc.cf === 'investing') investing.push(line);
    else financing.push(line);
  }
  const tot = (xs: CashFlowLine[]) => xs.reduce((x, y) => x + y.amount, 0);
  const netOperating = netSavings + tot(operating);
  const netInvesting = tot(investing);
  const netFinancing = tot(financing);
  const beginBal = from <= l.firstMonth ? {} : balancesAt(l, from - 1);
  let beginningCash = 0;
  for (const k in beginBal) if (splitKey(k)[0] === '1000') beginningCash += beginBal[k];
  const netChange = netOperating + netInvesting + netFinancing;
  return {
    from, to, netSavings, operating, investing, financing, netOperating, netInvesting, netFinancing, netChange,
    beginningCash, endingCash: beginningCash + netChange,
  };
}
