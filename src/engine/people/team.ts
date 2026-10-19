// Managing the leadership team (D-110). The morale target and the chance of leaving are computed
// here — the monthly step and the People screen use the same functions, so what the GM sees is
// what drives the people. Team-wide actions: pay everyone at market, bonus plans for all, a
// yearly leadership retreat, time off for the burned-out, and a standing January policy.

import { PEOPLE, POLITICAL_CAPITAL_COSTS, ROLE_DEFS, TEAM, TRAINING } from '../../data/people';
import { monthOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { GameState, Leader } from '../types';
import { nominalCents, pathFor } from '../world/macro';

const err = (text: string): CommandMessage[] => [{ level: 'error', text }];
const info = (text: string): CommandMessage[] => [{ level: 'info', text }];

const marketPay = (s: GameState, l: Leader): number => nominalCents(pathFor(s), s.clock.monthIndex, ROLE_DEFS[l.role].salary);

/** Pay against market, in percent (negative = underpaid). */
export const payGapPct = (s: GameState, l: Leader): number => (l.salary / marketPay(s, l) - 1) * 100;

export interface MoraleDriver {
  label: string;
  points: number;
}

/** What a leader's morale is heading toward, and why. */
export function moraleDrivers(s: GameState, l: Leader): { target: number; drivers: MoraleDriver[] } {
  const mi = s.clock.monthIndex;
  const drivers: MoraleDriver[] = [
    { label: 'Baseline', points: 60 },
    { label: 'Pay against market', points: clamp(payGapPct(s, l), -20, 15) },
    { label: 'Bonus plan', points: l.bonusPlan ? 5 : 0 },
    { label: 'Training budget', points: TRAINING.morale[s.people.training] },
    { label: 'Burnout', points: -l.burnout / 3 },
    { label: 'Coaching (6 months)', points: l.coachedMonth !== null && mi - l.coachedMonth < 6 ? 5 : 0 },
    { label: 'Leadership retreat (12 months)', points: s.people.retreatMonth !== undefined && mi - s.people.retreatMonth < TEAM.retreatMonths ? TEAM.retreatMorale.value : 0 },
  ];
  return { target: drivers.reduce((a, d) => a + d.points, 0), drivers };
}

/** Monthly chance the leader quits: low morale, underpaid strength, low loyalty. */
export function quitChanceMonthly(s: GameState, l: Leader): number {
  const strong = Math.max(...ROLE_DEFS[l.role].primary.map((k) => l.skills[k])) >= 13;
  const gap = payGapPct(s, l);
  return 0.002 + 0.012 * Math.max(0, (45 - l.morale) / 45) + (strong && gap < -5 ? 0.006 : 0) + 0.004 * Math.max(0, (40 - l.loyalty) / 40);
}

/** Yearly chance of leaving and its band. */
export function flightRisk(s: GameState, l: Leader): { annual: number; level: 'low' | 'watch' | 'high' } {
  const annual = 1 - Math.pow(1 - quitChanceMonthly(s, l), 12);
  return { annual, level: annual >= TEAM.flightRiskHigh.value ? 'high' : annual >= TEAM.flightRiskWatch.value ? 'watch' : 'low' };
}

// ---------- Commands ----------

export function payTeamToMarket(s: GameState): CommandMessage[] {
  let n = 0;
  let added = 0;
  s.people.leaders = s.people.leaders.map((l) => {
    const market = marketPay(s, l);
    if (l.salary >= market) return l;
    n++;
    added += market - l.salary;
    return { ...l, salary: roundCents(market), morale: Math.min(100, l.morale + 4), loyalty: Math.min(100, l.loyalty + 3) };
  });
  return n ? info(`${n} leader${n > 1 ? 's' : ''} brought up to market pay, adding ${formatCents(added)} a year.`) : info('Everyone is already paid at or above market.');
}

export function setTeamBonusPlans(s: GameState, on: boolean): CommandMessage[] {
  if (!s.people.leaders.length) return err('There is no leadership team yet.');
  s.people.leaders = s.people.leaders.map((l) => (l.bonusPlan === on ? l : { ...l, bonusPlan: on, morale: clamp(l.morale + (on ? 5 : -5), 0, 100) }));
  return info(on ? `Everyone is on a bonus plan: ${Math.round(PEOPLE.bonusPct.value * 100)}% of salary when their division beats its budget.` : 'Bonus plans ended.');
}

export function holdRetreat(s: GameState): CommandMessage[] {
  const n = s.people.leaders.length;
  if (!n) return err('There is no leadership team yet.');
  const mi = s.clock.monthIndex;
  if (s.people.retreatMonth !== undefined && mi - s.people.retreatMonth < TEAM.retreatMonths) return err('The team had a retreat within the year.');
  if (s.governance.politicalCapital < POLITICAL_CAPITAL_COSTS.coach) return err('You have no time left this month.');
  const cost = nominalCents(pathFor(s), mi, TEAM.retreatCost2024.value * n);
  s.governance.politicalCapital -= POLITICAL_CAPITAL_COSTS.coach;
  post(s, { source: 'retreat', memo: 'Leadership team retreat', lines: [{ account: '7630', division: 'CORP', amount: cost }, { account: '1000', division: 'CORP', amount: -cost }] });
  s.people.retreatMonth = mi;
  s.people.leaders = s.people.leaders.map((l) => ({ ...l, morale: Math.min(100, l.morale + TEAM.retreatMorale.value / 2), loyalty: Math.min(100, l.loyalty + 2) }));
  return info(`Leadership retreat held for ${formatCents(cost)}. Morale is lifted for the coming year.`);
}

export function giveTimeOff(s: GameState, leaderId: number): CommandMessage[] {
  const l = s.people.leaders.find((x) => x.id === leaderId);
  if (!l) return err('Unknown leader.');
  if (l.burnout < 20) return err(`${l.name} is not burned out.`);
  s.people.leaders = s.people.leaders.map((x) => (x.id === l.id ? { ...x, burnout: Math.max(0, x.burnout - TEAM.timeOffBurnout.value), morale: Math.min(100, x.morale + TEAM.timeOffMorale.value) } : x));
  return info(`${l.name} takes some time off and comes back rested.`);
}

export function setTeamPolicy(s: GameState, policy: { autoPayMarket: boolean; autoBonus: boolean }): CommandMessage[] {
  s.people.teamPolicy = { ...policy };
  return info(policy.autoPayMarket || policy.autoBonus ? 'Team policy set: it applies every January.' : 'Team policy off.');
}

// ---------- Monthly ----------

/** January: apply the standing team policy. Every month: warn once when someone becomes a flight risk. */
export function stepTeam(ctx: TickContext): void {
  const { state, mi } = ctx;
  const pol = state.people.teamPolicy;
  if (pol && monthOf(mi) === 1) {
    if (pol.autoPayMarket) payTeamToMarket(state);
    if (pol.autoBonus && state.people.leaders.some((l) => !l.bonusPlan)) setTeamBonusPlans(state, true);
  }
  state.people.leaders = state.people.leaders.map((l) => {
    const risk = flightRisk(state, l);
    if (risk.level !== 'high') return l.flags.riskWarned !== undefined && risk.level === 'low' ? { ...l, flags: { ...l.flags, riskWarned: undefined } } : l;
    if (l.flags.riskWarned !== undefined) return l;
    const { drivers } = moraleDrivers(state, l);
    const worst = drivers.filter((d) => d.points < 0).sort((a, b) => a.points - b.points)[0];
    ctx.inbox({ kind: 'alert', title: `${l.name} may leave`, body: `Our ${ROLE_DEFS[l.role].label.toLowerCase()} has about a ${Math.round(risk.annual * 100)}% chance of leaving in the next year. Morale ${Math.round(l.morale)}${worst ? `; the biggest drag is ${worst.label.toLowerCase()} (${Math.round(worst.points)})` : ''}. A raise, a bonus plan, coaching, time off or a team retreat can help (People screen).` });
    return { ...l, flags: { ...l.flags, riskWarned: mi } };
  });
}
