// advanceMonth: the monthly tick (DESIGN §3.3). Steps not yet built are listed in order
// as comments so each milestone slots its systems into the right place.

import { stepScenario } from './scenarios';
import { stepTech } from '../world/tech';
import { stepRegulation } from '../world/regulation';
import { stepChoices, stepHistoryChoices, stepRandomEvents } from '../world/events';
import { formatMonth, isFiscalYearEnd } from '../core/calendar';
import { formatCents } from '../core/format';
import { postOverhead } from '../corp/overhead';
import { stepLender, stepLenderPatronage, stepLenderSuccession, sweep } from '../finance/lender';
import { stepBudget } from '../finance/budget';
import { stepCovenants } from '../finance/covenants';
import { closeFiscalYearCycle, stepEquityCycle } from '../finance/patronage';
import { stepRegionalAnnual, stepRegionalPurchases } from '../finance/regionals';
import { holdBoardMeeting } from '../governance/votes';
import { stepPeople } from '../people/staff';
import { stepNotes } from '../people/notes';
import { stepProposals } from '../people/proposals';
import { stepSalesForce } from '../people/sales';
import { stepTeam } from '../people/team';
import { stepLivestock } from '../supply/livestock';
import { suppressGameOver } from './debug';
import { stepCompetitors } from '../competitors/ai';
import { stepDeals } from '../deals/deals';
import { stepBoardRelations } from '../governance/review';
import { stepAnnualMeeting, stepMemberDemocracy } from '../governance/elections';
import { stepDepreciation, stepFacilityCosts, stepProjects } from '../facilities/facilities';
import { stepGrain } from '../grain/operate';
import { stepSupply } from '../supply/operate';
import { stepCapperVolstead } from './capperVolstead';
import { stepJoining } from '../members/joining';
import { stepMarketplace } from './marketplace';
import { checkInvariants } from '../ledger/invariants';
import { balance, openMonth } from '../ledger/ledger';
import { demographicsMonthly } from '../members/demographics';
import type { GameState } from '../types';
import { cloneState } from './clone';
import { applyCommand, type Command } from './commands';
import { makeContext } from './context';
import { snapshot } from './snapshot';
import { refreshMarkets, stepHistory, stepWeather } from './steps';

/** Fiscal years of journal detail kept besides the current one (D-007). */
export const RETAIN_DETAIL_YEARS = 2;
const INBOX_LIMIT = 400;

export interface Interrupt {
  kind: 'history' | 'fiscalYearEnd' | 'invariant' | 'gameOver' | 'alert' | 'decision';
  text: string;
}

export interface MonthSummary {
  monthIndex: number;
  lines: string[];
  netSavings: number;
  cashChange: number;
}

export interface TickResult {
  state: GameState;
  summary: MonthSummary;
  interrupts: Interrupt[];
}

export class InvariantError extends Error {
  constructor(public errors: string[]) {
    super(`Ledger invariants failed: ${errors.join('; ')}`);
  }
}

export interface AdvanceOptions {
  /** Throw on invariant failure (tests, headless runner). Default true. */
  strictInvariants?: boolean;
}

export function advanceMonth(state: GameState, decisions: Command[] = [], opts: AdvanceOptions = {}): TickResult {
  if (state.outcome) throw new Error('Game is over');
  let s = state;
  for (const d of decisions) s = applyCommand(s, d).state;

  const w = cloneState(s);
  const before = w.history[w.history.length - 1];
  // 1. clock
  w.clock.monthIndex += 1;
  w.clock.commandsThisMonth = 0;
  openMonth(w, RETAIN_DETAIL_YEARS);
  const ctx = makeContext(w);
  const interrupts: Interrupt[] = [];

  // 2–4. world: macro, weather, markets
  refreshMarkets(w);
  stepWeather(ctx);
  // 5. scheduled historical events
  const fired = stepHistory(ctx);
  for (const id of fired) interrupts.push({ kind: 'history', text: id });
  stepHistoryChoices(ctx, fired);
  // 6. technology coming into service; regulations, compliance costs and fines
  stepTech(ctx);
  stepRegulation(ctx);
  // 7. facilities: construction, marketplace
  stepProjects(ctx);
  stepMarketplace(ctx);
  // 8. people: leaders, hiring, workforce, incidents
  stepPeople(ctx);
  stepTeam(ctx);
  // 9. member demographics
  demographicsMonthly(ctx);
  stepJoining(ctx);
  // 10–13. competitor prices, demand, share of wallet and divisions (grain; others in M3)
  stepGrain(ctx);
  stepSupply(ctx);
  stepLivestock(ctx);
  stepCapperVolstead(ctx);
  // 14. cross-division effects — M3
  // 15. working capital: facility and corporate overhead
  stepFacilityCosts(ctx);
  stepSalesForce(ctx);
  postOverhead(ctx);
  // 16. valuation happens inside the grain step; 17. depreciation
  stepDepreciation(ctx);
  // 13b. purchases from regional co-ops
  stepRegionalPurchases(ctx);
  // 18. annual meeting payments, regional and lender patronage, lender succession
  stepEquityCycle(ctx);
  stepLenderSuccession(ctx);
  stepRegionalAnnual(ctx);
  stepLenderPatronage(ctx);
  // 19. treasury: loans, line interest, borrowing base, sweep
  stepLender(ctx);
  // 20. random events; decisions past their deadline take the default
  stepRandomEvents(ctx);
  stepChoices(ctx);
  // 24. annual cycle: fiscal year close, budget
  if (isFiscalYearEnd(ctx.mi, w.setup.fiscalYearEndMonth)) {
    const r = closeFiscalYearCycle(ctx);
    interrupts.push({ kind: 'fiscalYearEnd', text: `FY${r.fy}` });
  }
  stepBudget(ctx);
  // 26. competitors move; deals advance (closings post entries, so before invariants)
  stepCompetitors(ctx);
  stepDeals(ctx);
  // 25. governance: board meeting, directors' goals and the GM review, annual meeting, petitions
  holdBoardMeeting(ctx);
  stepBoardRelations(ctx);
  stepAnnualMeeting(ctx);
  stepMemberDemocracy(ctx);
  // 23. year-end covenants and the lender's reaction
  stepCovenants(ctx);
  if (balance(w.ledger, '1000') < 0) sweep(ctx);
  // 21–22. close + invariants
  const errors = checkInvariants(w);
  if (errors.length) {
    if (opts.strictInvariants !== false) throw new InvariantError(errors);
    interrupts.push({ kind: 'invariant', text: errors.join('; ') });
  }
  // 26. competitor strategy, deals. 27. leaders' notes
  stepNotes(ctx);
  // Managers bring proposals for their business units; earlier ones are reviewed (D-104).
  stepProposals(ctx);
  // 28. scorecard + history
  const snap = snapshot(w);
  w.history.push(snap);
  if (w.inbox.length > INBOX_LIMIT) w.inbox = w.inbox.slice(w.inbox.length - INBOX_LIMIT);
  // 29. loss conditions (the lender's forced action; governance in M5); debug mode may cancel them
  suppressGameOver(ctx);
  if (w.outcome) interrupts.push({ kind: 'gameOver', text: w.outcome.text });
  stepScenario(ctx);
  for (const item of w.inbox) if (item.monthIndex === ctx.mi && item.kind === 'alert') interrupts.push({ kind: 'alert', text: item.title });
  for (const item of w.inbox) if (item.monthIndex === ctx.mi && item.choice && !item.choice.chosen) interrupts.push({ kind: 'decision', text: item.body });

  ctx.summary.unshift(`${formatMonth(ctx.mi)}: cash ${formatCents(snap.cash)}, ${snap.activeMembers} active members.`);
  return {
    state: w,
    summary: { monthIndex: ctx.mi, lines: ctx.summary, netSavings: snap.netSavingsMonth, cashChange: snap.cash - (before?.cash ?? 0) },
    interrupts,
  };
}

export interface InterruptConfig {
  history: boolean;
  fiscalYearEnd: boolean;
  alerts: boolean;
}

export const DEFAULT_INTERRUPTS: InterruptConfig = { history: true, fiscalYearEnd: true, alerts: true };

/** Advance until an interrupt the player cares about fires, or maxMonths pass. */
export function advanceUntilAttention(state: GameState, cfg: InterruptConfig, maxMonths: number): TickResult[] {
  const out: TickResult[] = [];
  let s = state;
  for (let i = 0; i < maxMonths; i++) {
    const r = advanceMonth(s);
    out.push(r);
    s = r.state;
    if (r.interrupts.some((x) => x.kind === 'invariant' || x.kind === 'gameOver' || (x.kind === 'history' && cfg.history) || (x.kind === 'fiscalYearEnd' && cfg.fiscalYearEnd) || (x.kind === 'alert' && cfg.alerts) || x.kind === 'decision')) break;
    if (s.outcome) break;
  }
  return out;
}
