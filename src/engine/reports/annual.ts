// Annual report (DESIGN §18): the year's results recorded at fiscal year end, before the books
// close (ledger detail is kept only two years). Patronage for the year is joined later from the
// equity history, once the board votes it.

import { fiscalYearStart } from '../core/calendar';
import { totalDebt } from '../finance/lender';
import { averageSatisfaction } from '../governance/review';
import { ratios } from '../ledger/ratios';
import { balanceSheet, incomeStatement } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import { OP_DIVISIONS, type AnnualReport, type GameState } from '../types';

/** Inbox titles that mark the co-op's own milestones (not routine memos). */
const HIGHLIGHT = /closes|formed|in service|completed|Explosion|Fire at|shut down|recall|elected|New rule|joins|sells|Lawsuit resolved|fires the|hired|Merger/i;

export function recordAnnualReport(ctx: TickContext, fy: number): AnnualReport {
  const { state, mi } = ctx;
  const from = fiscalYearStart(fy, state.setup.fiscalYearEndMonth);
  const is = incomeStatement(state.ledger, from, mi);
  const bs = balanceSheet(state.ledger, mi);
  const r = ratios(state);
  const months = state.history.filter((h) => h.monthIndex >= from && h.monthIndex <= mi);
  const name = (id: number) => state.members.list.find((m) => m.id === id)?.name ?? 'a director';
  const inYear = state.inbox.filter((i) => i.monthIndex >= from && i.monthIndex <= mi);
  const report: AnnualReport = {
    fy, closedMonth: mi, coopName: state.coop.name,
    sales: is.sales, grossRevenue: is.grossRevenue, totalOpex: is.totalOpex, interestNet: is.interestNet, patronageIncome: is.patronageIncome, savingsBeforeTax: is.savingsBeforeTax,
    divisions: OP_DIVISIONS.map((d) => {
      const x = incomeStatement(state.ledger, from, mi, d);
      return { division: d, sales: x.sales, grossRevenue: x.grossRevenue, localSavings: x.localSavings };
    }).filter((x) => x.sales !== 0 || x.grossRevenue !== 0),
    totalAssets: bs.totalAssets, totalEquity: bs.totalEquity, totalDebt: totalDebt(state), workingCapital: r.workingCapital,
    currentRatio: r.currentRatio, ownerEquityPct: r.ownerEquityPct,
    activeMembers: state.members.list.filter((m) => m.status === 'active' && m.kind === 'member').length,
    activeFarms: state.members.list.filter((m) => m.status === 'active').length,
    avgSatisfaction: averageSatisfaction(state),
    grainBu: months.reduce((a, h) => a + h.grainBu, 0),
    facilities: state.coop.facilities.filter((f) => f.status !== 'closed').length,
    lenderStatus: state.coop.finance.status,
    boardConfidence: state.governance.boardConfidence,
    chair: name(state.governance.directors.find((d) => d.office === 'chair')?.memberId ?? -1),
    directors: state.governance.directors.map((d) => name(d.memberId)),
    highlights: inYear.filter((i) => (i.kind === 'memo' || i.kind === 'alert') && HIGHLIGHT.test(i.title)).map((i) => i.title).slice(0, 12),
    news: inYear.filter((i) => i.kind === 'history').map((i) => i.title).slice(0, 8),
  };
  state.reports = [...state.reports, report];
  return report;
}

/** The patronage the board distributed for a fiscal year, if any. */
export const distributionFor = (s: GameState, fy: number) => s.coop.equityProgram.history.find((h) => h.fy === fy) ?? null;
