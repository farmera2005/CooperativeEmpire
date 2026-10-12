// advanceMonth: the monthly tick (DESIGN §3.3). Steps not yet built are listed in order
// as comments so each milestone slots its systems into the right place.

import { fiscalYearOf, formatMonth, isFiscalYearEnd } from '../core/calendar';
import { formatCents } from '../core/format';
import { postOverhead } from '../corp/overhead';
import { stepLender } from '../finance/lender';
import { stepDepreciation, stepFacilityCosts, stepProjects } from '../facilities/facilities';
import { stepGrain } from '../grain/operate';
import { stepJoining } from '../members/joining';
import { stepMarketplace } from './marketplace';
import { checkInvariants } from '../ledger/invariants';
import { closeFiscalYear, openMonth } from '../ledger/ledger';
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
  kind: 'history' | 'fiscalYearEnd' | 'invariant' | 'gameOver' | 'alert';
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
  for (const id of stepHistory(ctx)) interrupts.push({ kind: 'history', text: id });
  // 6. tech/regulation availability — M7
  // 7. facilities: construction, marketplace
  stepProjects(ctx);
  stepMarketplace(ctx);
  // 8. people — M6
  // 9. member demographics
  demographicsMonthly(ctx);
  stepJoining(ctx);
  // 10–13. competitor prices, demand, share of wallet and divisions (grain; others in M3)
  stepGrain(ctx);
  // 14. cross-division effects — M3
  // 15. working capital: facility and corporate overhead
  stepFacilityCosts(ctx);
  postOverhead(ctx);
  // 16. valuation happens inside the grain step; 17. depreciation
  stepDepreciation(ctx);
  // 18. regional/lender patronage — M4
  // 19. treasury: loans, line interest, borrowing base, sweep
  stepLender(ctx);
  // 20. random events — M7
  // 21–22. close + invariants
  const errors = checkInvariants(w);
  if (errors.length) {
    if (opts.strictInvariants !== false) throw new InvariantError(errors);
    interrupts.push({ kind: 'invariant', text: errors.join('; ') });
  }
  // 23. quarter-end covenants — M4
  // 24. annual cycle
  if (isFiscalYearEnd(ctx.mi, w.setup.fiscalYearEndMonth)) {
    const fy = fiscalYearOf(ctx.mi, w.setup.fiscalYearEndMonth);
    const savings = closeFiscalYear(w, '3400');
    for (const m of w.members.list) m.ytd = {};
    ctx.inbox({
      kind: 'memo', title: `Fiscal ${fy} closed`,
      body: `The books for fiscal ${fy} are closed. Net savings of ${formatCents(savings)} were transferred to unallocated retained earnings. (Patronage distribution arrives in Milestone 4.)`,
    });
    interrupts.push({ kind: 'fiscalYearEnd', text: `FY${fy}` });
  }
  // 25–27. governance, competitor strategy, leader notes — M5–M7
  // 28. scorecard + history
  const snap = snapshot(w);
  w.history.push(snap);
  if (w.inbox.length > INBOX_LIMIT) w.inbox = w.inbox.slice(w.inbox.length - INBOX_LIMIT);
  // 29. loss conditions — M4/M5
  for (const item of w.inbox) if (item.monthIndex === ctx.mi && item.kind === 'alert') interrupts.push({ kind: 'alert', text: item.title });

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
    if (r.interrupts.some((x) => x.kind === 'invariant' || x.kind === 'gameOver' || (x.kind === 'history' && cfg.history) || (x.kind === 'fiscalYearEnd' && cfg.fiscalYearEnd) || (x.kind === 'alert' && cfg.alerts))) break;
    if (s.outcome) break;
  }
  return out;
}
