// Private companies (D-149). An investor-owned grain and farm-supply business: farmers are its
// customers, not members; owners put up capital (account 3050) and earn dividends; it pays
// corporate income tax on all of its income; it banks with a commercial lender and earns no
// patronage from regional co-ops. A controlling owner runs it without a board; a family company
// that hires its CEO has a small owners' board that reviews them.

import { PATRONAGE } from '../../data/finance';
import { PRIVATE } from '../../data/private';
import { fiscalYearEnd, fiscalYearOf, fiscalYearStart, formatMonth } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import { computeTax } from '../finance/tax';
import { closeFiscalYear, post } from '../ledger/ledger';
import { balanceSheet, incomeStatement } from '../ledger/statements';
import { recordAnnualReport } from '../reports/annual';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { GameState, PrivateCo } from '../types';

export { isPrivate, ownerRun, regularCustomers } from './kind';
import { isPrivate, ownerRun } from './kind';

export const emptyPrivateCo = (playerStake: number, ownerName: string): PrivateCo => ({
  playerStake, ownerName, payout: PRIVATE.dividendPayout.value, pending: null, dividends: [], nol: [],
});

/** The fiscal year closes: corporate income tax on all of the year's income; the rest is retained. */
export function closePrivateYear(ctx: TickContext): void {
  const { state, mi } = ctx;
  const pc = state.privateCo;
  if (!pc) return;
  const fye = state.setup.fiscalYearEndMonth;
  const fy = fiscalYearOf(mi, fye);
  const from = Math.max(state.ledger.firstMonth, fiscalYearStart(fy, fye));
  const is = incomeStatement(state.ledger, from, fiscalYearEnd(fy, fye));
  // No patronage deduction: a C corporation is taxed on everything it earns (D-149).
  const t = computeTax({ fy, savingsBeforeTax: is.savingsBeforeTax, qualifiedAllocations: 0, nqRedeemed: 0, deduction: 0, nol: pc.nol });
  pc.nol = t.nol;
  if (t.tax > 0) post(state, { source: 'tax-accrual', memo: `Corporate income tax, fiscal ${fy}`, lines: [{ account: '9000', division: 'CORP', amount: t.tax }, { account: '2170', division: 'CORP', amount: -t.tax }] });
  recordAnnualReport(ctx, fy);
  closeFiscalYear(state, '3400');
  for (const m of state.members.list) m.ytd = {};
  for (const k of Object.keys(state.coop.patronageStats) as (keyof typeof state.coop.patronageStats)[]) state.coop.patronageStats[k] = { member: 0, nonmember: 0 };
  const afterTax = is.savingsBeforeTax - t.tax;
  pc.pending = { fy, afterTax, closedMonth: mi, declared: null };
  ctx.inbox({
    kind: 'memo', title: `Fiscal ${fy} closed`,
    body: `The books for fiscal ${fy} are closed. Income before tax ${formatCents(is.savingsBeforeTax)}; corporate income tax ${formatCents(t.tax)}${t.nolUsed > 0 ? ` after ${formatCents(t.nolUsed)} of losses carried forward` : ''}; net income ${formatCents(afterTax)}, retained in the company. ${afterTax > 0 ? `A dividend of ${Math.round(pc.payout * 100)}% of net income is declared in ${formatMonth(mi + PATRONAGE.voteMonthsAfterFye)}, after the audit.` : 'There is no dividend for a year without profit.'}`,
  });
}

/** Monthly: declare the dividend after the audit, pay it and the income tax the month after. */
export function stepPrivateEquity(ctx: TickContext): void {
  const { state, mi } = ctx;
  const pc = state.privateCo;
  if (!pc?.pending) return;
  const p = pc.pending;
  const since = mi - p.closedMonth;
  if (since === PATRONAGE.voteMonthsAfterFye && p.declared === null) {
    // Owners take no dividend while the lender is worried about the company.
    const standing = !PRIVATE.dividendNeedsStanding || state.coop.finance.status === 'standard';
    const amount = standing && p.afterTax > 0 ? roundCents(p.afterTax * clamp(pc.payout, 0, 1)) : 0;
    p.declared = amount;
    if (amount > 0) post(state, { source: 'dividend-declared', memo: `Dividend declared, fiscal ${p.fy}`, lines: [{ account: '3400', division: 'CORP', amount }, { account: '2155', division: 'CORP', amount: -amount }] });
    ctx.inbox({ kind: 'memo', title: amount > 0 ? `Dividend declared: ${formatCents(amount)}` : 'No dividend this year', body: amount > 0 ? `The owners declared a dividend of ${formatCents(amount)}, ${Math.round(pc.payout * 100)}% of fiscal ${p.fy} net income, payable next month.` : p.afterTax > 0 ? 'The lender has the company on its watch list, so the owners take no dividend this year.' : `Fiscal ${p.fy} had no profit to pay out.` });
  }
  if (since >= PATRONAGE.payMonthsAfterFye) {
    const due = p.declared ?? 0;
    if (due > 0) post(state, { source: 'dividend-paid', memo: 'Dividend paid to the owners', lines: [{ account: '2155', division: 'CORP', amount: due }, { account: '1000', division: 'CORP', amount: -due }] });
    const tax = -balanceOf(state, '2170');
    if (tax > 0) post(state, { source: 'tax-paid', memo: 'Corporate income tax paid', lines: [{ account: '2170', division: 'CORP', amount: tax }, { account: '1000', division: 'CORP', amount: -tax }] });
    const toPlayer = roundCents(due * pc.playerStake);
    pc.dividends = [...pc.dividends, { fy: p.fy, monthIndex: mi, total: due, toPlayer }].slice(-40);
    // Career mode: the player's share of the dividend is theirs.
    const c = state.career;
    if (c && toPlayer > 0) {
      c.earnings += toPlayer;
      const st = c.stints[c.stints.length - 1];
      if (st && st.toMonth === null) st.earnings += toPlayer;
    }
    pc.pending = null;
    if (due > 0 || tax > 0) ctx.inbox({ kind: 'memo', title: 'Dividend and taxes paid', body: `Paid the owners ${formatCents(due)}${pc.playerStake > 0 ? ` (your ${Math.round(pc.playerStake * 100)}%: ${formatCents(toPlayer)})` : ''} and corporate income tax of ${formatCents(tax)}.` });
  }
}

const balanceOf = (s: GameState, acct: string): Cents => {
  let v = 0;
  for (const k in s.ledger.balances) if (k.split('|')[0] === acct) v += s.ledger.balances[k];
  return v;
};

/** The owner sets the dividend payout (0–100% of net income). */
export function setDividendPolicy(s: GameState, payout: number): CommandMessage[] {
  if (!isPrivate(s) || !s.privateCo) return [{ level: 'error', text: 'Only a private company pays dividends.' }];
  if (!ownerRun(s)) return [{ level: 'error', text: `${s.privateCo.ownerName} set the dividend policy; the CEO can only recommend.` }];
  if (!(payout >= 0 && payout <= 1)) return [{ level: 'error', text: 'The payout is 0–100% of net income.' }];
  s.privateCo = { ...s.privateCo, payout: Math.round(payout * 100) / 100 };
  return [{ level: 'info', text: `Dividends: ${Math.round(payout * 100)}% of net income.` }];
}

/** Book equity now (what a sale and phantom equity are measured against). */
export const bookEquity = (s: GameState): Cents => balanceSheet(s.ledger, s.clock.monthIndex).totalEquity;

/** A hired CEO's phantom equity now: their share of the growth in book equity this term. */
export function phantomValue(s: GameState): Cents {
  const ph = s.privateCo?.phantom;
  return ph ? roundCents(ph.pct * Math.max(0, bookEquity(s) - ph.baseEquity)) : 0;
}

/** Pay the CEO's phantom equity (compensation expense) and start a new measuring base. */
export function payPhantom(s: GameState, why: string): Cents {
  const pc = s.privateCo;
  const ph = pc?.phantom;
  const c = s.career;
  if (!pc || !ph) return 0;
  const value = phantomValue(s);
  if (value > 0) {
    post(s, { source: 'phantom-equity', memo: `CEO phantom equity: ${why}`, lines: [{ account: '7000', division: 'CORP', amount: value }, { account: '1000', division: 'CORP', amount: -value }] });
    if (c) {
      c.earnings += value;
      const st = c.stints[c.stints.length - 1];
      if (st) st.earnings += value;
    }
  }
  pc.phantom = { ...ph, baseEquity: bookEquity(s), sinceMonth: s.clock.monthIndex };
  return value;
}
