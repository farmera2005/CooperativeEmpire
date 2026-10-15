// The guided first year (M8): steps that tick off from the game itself, or when the player
// opens the screen a step points to. UI-only: it reads GameState and never changes it.

import type { GameState } from '../engine/index';
import type { Tab } from './store';

export interface GuideStep {
  id: string;
  title: string;
  text: string;
  tab: Tab;
  /** Done when this holds, or (if `visit`) once the player opens the tab. */
  done?: (s: GameState) => boolean;
  visit?: boolean;
}

const startMi = (s: GameState) => s.clock.startMonth;

export const GUIDE: GuideStep[] = [
  { id: 'memo', title: 'Read the founding memo', text: 'The organizing meeting left you a memo: your capital, your members, and your lender. Open the inbox and read it.', tab: 'inbox', done: (s) => s.inbox.length > 0 && s.inbox[0].read },
  { id: 'elevator', title: 'Get an elevator', text: 'A grain co-op starts with a house. On the Grain screen, buy one that is for sale or build one. Size it to the grain around it: overhead is fixed, and an empty house loses money.', tab: 'grain', done: (s) => s.coop.facilities.some((f) => f.kind === 'elevator') },
  { id: 'policy', title: 'Set how you buy grain', text: 'On the Grain screen, Policies: bid at the market, above it (more bushels, thinner margins) or below. Hedge what you own; the board sets limits on open positions.', tab: 'grain', visit: true },
  { id: 'month', title: 'End your first month', text: 'Press "End month" (or E). Each month the co-op buys and sells, pays its people and books the results. "Advance until attention" (A) runs until something needs you.', tab: 'dashboard', done: (s) => s.clock.monthIndex > startMi(s) },
  { id: 'board', title: 'Meet your board', text: 'Big decisions go to the directors. In the Board Room see who they are, what they want, and how votes are likely to go. You can lobby them before a vote.', tab: 'board', visit: true },
  { id: 'members', title: 'Know your members', text: 'Members are your owners and customers. Satisfied members bring more business and vote with you; the "why?" link explains their mood.', tab: 'members', visit: true },
  { id: 'harvest', title: 'Get through your first harvest', text: 'October and November bring most of the year\'s grain. Long waits at the scale cost goodwill; watch the Grain screen.', tab: 'grain', done: (s) => s.history.some((h) => h.monthIndex > startMi(s) && h.grainBu > 0 && (h.monthIndex % 12 === 9 || h.monthIndex % 12 === 10)) },
  { id: 'close', title: 'Close your first fiscal year', text: 'At fiscal year end the books close and the auditors start. The Financials screen shows the year by division.', tab: 'financials', done: (s) => s.reports.length > 0 },
  { id: 'patronage', title: 'Return the savings to members', text: 'After the audit the board votes the patronage plan: cash now, equity retained for later. Members count on the refund; the lender wants equity kept. Set it on Equity & Patronage.', tab: 'equity', done: (s) => s.coop.equityProgram.history.length > 0 },
  { id: 'report', title: 'Read your first annual report', text: 'Your report to the members, with the Scorecard of how the co-op measures up. From here, you are on your own. The Glossary (G) explains any term.', tab: 'reports', visit: true },
];

export function guideProgress(s: GameState, visited: Tab[]): { step: GuideStep | null; index: number; done: Set<string> } {
  const done = new Set(GUIDE.filter((g) => (g.done ? g.done(s) : false) || (g.visit && visited.includes(g.tab))).map((g) => g.id));
  const index = GUIDE.findIndex((g) => !done.has(g.id));
  return { step: index >= 0 ? GUIDE[index] : null, index, done };
}
