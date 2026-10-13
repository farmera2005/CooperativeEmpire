// Annual budget and capital plan (DESIGN §3.2): drafted three months before fiscal year end
// from the trailing twelve months, adjusted by the player, approved a month before year end.

import { BUDGET } from '../../data/finance';
import { fiscalYearOf, fiscalYearStart, monthOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents, type Cents } from '../core/money';
import { activityFor, incomeStatement } from '../ledger/statements';
import { splitKey } from '../ledger/coa';
import type { TickContext } from '../sim/context';
import { DIVISIONS, type Budget, type BudgetLine, type DivisionId, type GameState } from '../types';
import { marketValue } from '../world/marketPath';
import { pathFor } from '../world/macro';
import { addAgendaItem } from '../governance/votes';

const FIXED_ASSET_ACCOUNTS = new Set(['1500', '1510', '1520', '1530', '1540']);

export function draftBudget(state: GameState, fy: number, salesGrowthPct?: number, costGrowthPct?: number, capex?: Cents): Budget {
  const mi = state.clock.monthIndex;
  const from = Math.max(state.ledger.firstMonth, mi - 11);
  const months = mi - from + 1;
  const path = pathFor(state);
  const inflation = (marketValue(path, 'cpi', mi) / marketValue(path, 'cpi', mi - 12) - 1) * 100;
  const sg = salesGrowthPct ?? Math.round(inflation * 10) / 10;
  const cg = costGrowthPct ?? Math.round(inflation * 10) / 10;
  const scale = 12 / Math.max(1, months);
  const lines = {} as Record<DivisionId, BudgetLine>;
  for (const d of DIVISIONS) {
    const is = incomeStatement(state.ledger, from, mi, d);
    const up = (v: Cents, g: number) => roundCents(v * scale * (1 + g / 100));
    const sales = up(is.sales, sg);
    const grossMargin = up(is.grossMargin, sg);
    const serviceIncome = up(is.serviceIncome, sg);
    const opex = up(is.totalOpex, cg);
    const interest = up(is.interestNet, 0);
    lines[d] = { sales, grossMargin, serviceIncome, opex, interest, localSavings: grossMargin + serviceIncome - opex - interest };
  }
  return { fy, approved: false, salesGrowthPct: sg, costGrowthPct: cg, capex: capex ?? 0, lines };
}

export function stepBudget(ctx: TickContext): void {
  const { state } = ctx;
  const fye = state.setup.fiscalYearEndMonth;
  const nextFy = fiscalYearOf(ctx.mi, fye) + 1;
  const draftMonth = ((fye - 1 - BUDGET.draftMonthsBeforeFye + 12) % 12) + 1;
  const approveMonth = ((fye - 1 - BUDGET.approveMonthsBeforeFye + 12) % 12) + 1;
  const b = state.coop.budget;
  if (ctx.mi - state.coop.foundedMonth < 6) return;
  if (monthOf(ctx.mi) === draftMonth && (!b || b.fy < nextFy)) {
    const prevCapex = b?.capex ?? 0;
    state.coop.budget = draftBudget(state, nextFy, undefined, undefined, prevCapex);
    const tot = state.coop.budget.lines;
    const ls = DIVISIONS.reduce((s, d) => s + tot[d].localSavings, 0);
    ctx.inbox({ kind: 'memo', title: `Draft budget for fiscal ${nextFy}`, body: `The CFO drafted next year's budget from the last twelve months: local savings of ${formatCents(ls)}, sales growth ${state.coop.budget.salesGrowthPct}%, cost growth ${state.coop.budget.costGrowthPct}%. Adjust the assumptions and the capital budget on the Financials screen before the board approves it.` });
  }
  // The draft goes on the agenda a month before the approval meeting.
  const submitMonth = ((approveMonth - 2 + 12) % 12) + 1;
  if (monthOf(ctx.mi) === submitMonth && state.coop.budget && state.coop.budget.fy === nextFy && !state.coop.budget.approved && !state.governance.agenda.some((i) => i.type === 'budget')) {
    addAgendaItem(state, { type: 'budget', title: `Fiscal ${nextFy} operating and capital budget`, submittedMonth: ctx.mi, source: 'system' });
  }
}

export interface BudgetComparison {
  fy: number;
  elapsedMonths: number;
  rows: { division: DivisionId; budget: BudgetLine; actual: BudgetLine }[];
  capex: Cents;
  capexSpent: Cents;
}

/** Fiscal-year-to-date actuals against the full-year budget. */
export function budgetVsActual(state: GameState): BudgetComparison | null {
  const b = state.coop.budget;
  const mi = state.clock.monthIndex;
  const fye = state.setup.fiscalYearEndMonth;
  if (!b || b.fy !== fiscalYearOf(mi, fye)) return null;
  const from = Math.max(fiscalYearStart(b.fy, fye), state.ledger.firstMonth);
  const rows = DIVISIONS.map((d) => {
    const is = incomeStatement(state.ledger, from, mi, d);
    return {
      division: d, budget: b.lines[d],
      actual: { sales: is.sales, grossMargin: is.grossMargin, serviceIncome: is.serviceIncome, opex: is.totalOpex, interest: is.interestNet, localSavings: is.localSavings },
    };
  });
  return { fy: b.fy, elapsedMonths: mi - fiscalYearStart(b.fy, fye) + 1, rows, capex: b.capex, capexSpent: capexThisYear(state) };
}

/** Net additions to property and construction in progress this fiscal year. */
export function capexThisYear(state: GameState): Cents {
  const mi = state.clock.monthIndex;
  const fye = state.setup.fiscalYearEndMonth;
  const from = Math.max(fiscalYearStart(fiscalYearOf(mi, fye), fye), state.ledger.firstMonth);
  const act = activityFor(state.ledger, from, mi);
  let add = 0;
  for (const k in act) if (FIXED_ASSET_ACCOUNTS.has(splitKey(k)[0])) add += act[k];
  return Math.max(0, add);
}
