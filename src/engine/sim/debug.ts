// Debug mode (D-105): testing tools for a game created with `setup.debugMode`. They go through
// the same command path as everything else, so they stay deterministic and replayable, and
// money still moves only by journal entry (against a debug equity account, so results and
// patronage are not distorted). A normal game refuses them.

import { PEOPLE, ROLE_DEFS, SKILLS, type Role } from '../../data/people';
import { clamp } from '../core/math';
import { formatCents } from '../core/format';
import { stream } from '../core/rng';
import { post } from '../ledger/ledger';
import { generateLeader } from '../people/leaders';
import type { Cents } from '../core/money';
import type { GameState } from '../types';
import type { CommandMessage } from './commands';
import type { TickContext } from './context';

export type DebugAction =
  | { kind: 'addCash'; amount: Cents }
  | { kind: 'setConfidence'; value: number }
  | { kind: 'setSatisfaction'; value: number }
  | { kind: 'resetLender' }
  | { kind: 'revealLeaders' }
  | { kind: 'hireLeader'; role: Role; skill: number }
  | { kind: 'setNoGameOver'; on: boolean };

const err = (text: string): CommandMessage[] => [{ level: 'error', text }];
const info = (text: string): CommandMessage[] => [{ level: 'info', text: `Debug: ${text}` }];

export function applyDebug(s: GameState, a: DebugAction): CommandMessage[] {
  if (!s.setup.debugMode) return err('Debug tools are only available in a game created in debug mode.');
  switch (a.kind) {
    case 'addCash': {
      const amount = Math.round(a.amount);
      if (!amount) return err('Enter an amount.');
      post(s, { source: 'debug', memo: `Debug ${amount > 0 ? 'cash added' : 'cash removed'}`, lines: [{ account: '1000', division: 'CORP', amount }, { account: '3950', division: 'CORP', amount: -amount }] });
      return info(`${amount > 0 ? 'added' : 'removed'} ${formatCents(Math.abs(amount))} of cash.`);
    }
    case 'setConfidence':
      s.governance = { ...s.governance, boardConfidence: clamp(a.value, 0, 100), pip: a.value < 50 && s.governance.pip };
      return info(`board confidence set to ${Math.round(clamp(a.value, 0, 100))}.`);
    case 'setSatisfaction':
      for (const m of s.members.list) if (m.status === 'active') m.satisfaction = clamp(a.value, 0, 100);
      return info(`every active member's satisfaction set to ${Math.round(clamp(a.value, 0, 100))}.`);
    case 'resetLender':
      s.coop.finance = { ...s.coop.finance, status: 'standard', riskSpread: 0, breachQuarters: 0, okQuarters: 0, overLimit: false };
      return info('lender standing reset to standard.');
    case 'revealLeaders': {
      const reveal = (l: { skills: Record<string, number>; revealed: Record<string, [number, number]> }) => {
        for (const k of SKILLS) l.revealed[k] = [l.skills[k], l.skills[k]];
      };
      for (const l of s.people.leaders) reveal(l);
      for (const c of s.people.candidates) reveal(c.leader);
      return info('true skills of leaders and candidates revealed.');
    }
    case 'hireLeader': {
      if (!ROLE_DEFS[a.role]) return err('Unknown role.');
      const skill = clamp(Math.round(a.skill), 1, 20);
      const rng = stream(s.setup.gameSeed, s.clock.monthIndex, 'debug.hire', s.people.nextId);
      const l = generateLeader(s, rng, s.people.nextId++, { role: a.role, quality: skill, sd: 0, ageRange: [40, 50], revealWidth: PEOPLE.revealWidth.references, salaryFactor: 1 });
      for (const k of SKILLS) {
        l.skills[k] = skill;
        l.revealed[k] = [skill, skill];
      }
      l.traits = [];
      s.people.leaders = [...s.people.leaders.filter((x) => x.role !== a.role), l];
      return info(`${l.name} placed as ${ROLE_DEFS[a.role].label.toLowerCase()} with skill ${skill} in everything.`);
    }
    case 'setNoGameOver':
      s.setup = { ...s.setup, debugNoGameOver: a.on };
      return info(a.on ? 'firing and liquidation will be cancelled.' : 'firing and liquidation end the game again.');
  }
}

/**
 * With "no game over" on, cancel a firing or liquidation at month end and put the co-op back
 * in a state that does not end the game again next month. Selling the co-op still ends it.
 */
export function suppressGameOver(ctx: TickContext): void {
  const { state, mi } = ctx;
  const o = state.outcome;
  if (!o || !state.setup.debugMode || !state.setup.debugNoGameOver || o.kind === 'absorbed') return;
  state.outcome = null;
  if (o.kind === 'fired') state.governance = { ...state.governance, boardConfidence: 50, pip: false };
  else state.coop.finance = { ...state.coop.finance, status: 'specialCredit', breachQuarters: 0 };
  state.inbox.push({ id: state.nextInboxId++, monthIndex: mi, read: false, kind: 'alert', title: `Debug: game over cancelled (${o.kind})`, body: `${o.text}\n\nDebug mode's "no game over" is on, so play continues.` });
}
