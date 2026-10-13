// Player commands (DESIGN §18.2). Each is applied by applyCommand, purely and
// deterministically. The list grows milestone by milestone.

import { formatCents } from '../core/format';
import {
  buildElevator, buildFacility, buyOffer, closeFacility, dueDiligence, renovateFacility, setFacilityStatus, setStaffing, upgradeFacility,
  type BuildSpec,
} from '../facilities/actions';
import type { Components } from '../facilities/facilities';
import { maxCommitment } from '../finance/lender';
import { post } from '../ledger/ledger';
import { balance } from '../ledger/ledger';
import { BOARD_RECONSIDER_MONTHS, POLITICAL_CAPITAL, VOTE_MODEL } from '../../data/governance';
import { formatMonth } from '../core/calendar';
import { boardGate } from '../governance/proposals';
import { addAgendaItem } from '../governance/votes';
import type { BylawChange, GameState, GrainPolicy, PatronageProposal, PayPosition, RedemptionPolicy, StaffLevel, SupplyPolicy } from '../types';
import type { RegionalCategory } from '../../data/finance';
import { validateProposal } from '../finance/patronage';
import { setAffiliation } from '../finance/regionals';
import { brandLabel, switchLender, termOutLine } from '../finance/lender';
import { covenantSet } from '../finance/covenants';
import { draftBudget } from '../finance/budget';
import { fiscalYearOf } from '../core/calendar';
import type { FacilityKind } from '../../data/facilities';
import type { SupplyDivision } from '../../data/supply';
import { cloneState } from './clone';

export type Command =
  | { type: 'markInboxRead'; id: number }
  | { type: 'markAllInboxRead' }
  | { type: 'renameCoop'; name: string }
  | { type: 'dueDiligence'; offerId: number }
  | { type: 'buyFacility'; offerId: number; financePct: number }
  | { type: 'buildElevator'; townId: number; spec: BuildSpec; financePct: number }
  | { type: 'buildFacility'; kind: Exclude<FacilityKind, 'elevator'>; townId: number; components: Components; financePct: number }
  | { type: 'setSupplyPolicy'; division: SupplyDivision; policy: Partial<SupplyPolicy> }
  | { type: 'upgradeFacility'; facilityId: number; components: Components; financePct: number }
  | { type: 'renovateFacility'; facilityId: number; financePct: number }
  | { type: 'mothballFacility'; facilityId: number }
  | { type: 'reopenFacility'; facilityId: number }
  | { type: 'closeFacility'; facilityId: number }
  | { type: 'setStaffing'; facilityId: number; level: StaffLevel; pay: PayPosition }
  | { type: 'setGrainPolicy'; policy: Partial<GrainPolicy> }
  | { type: 'setLineCommitment'; amount: number }
  | { type: 'prepayTermLoan'; loanId: number; amount: number }
  | { type: 'setPatronageProposal'; proposal: PatronageProposal }
  | { type: 'setRedemptionPolicy'; policy: RedemptionPolicy }
  | { type: 'setAffiliation'; category: RegionalCategory; regionalId: string | null }
  | { type: 'switchLender'; lenderId: string }
  | { type: 'termOutLine' }
  | { type: 'setBudget'; salesGrowthPct?: number; costGrowthPct?: number; capex?: number }
  | { type: 'lobbyDirector'; itemId: number; directorId: number }
  | { type: 'tableItem'; itemId: number }
  | { type: 'withdrawItem'; itemId: number }
  | { type: 'proposeBylaw'; change: BylawChange }
  | { type: 'endorseIncumbents'; on: boolean };

export interface CommandMessage {
  level: 'info' | 'warning' | 'error';
  text: string;
}

export interface CommandResult {
  state: GameState;
  ok: boolean;
  messages: CommandMessage[];
}

/**
 * Apply a command to a working copy. GM actions that need the board (DESIGN §14.3) go on
 * the agenda instead, unless `boardApproved` (the board is executing its decision).
 */
export function runCommand(s: GameState, cmd: Command, boardApproved = false): CommandMessage[] {
  if (!boardApproved) {
    const gate = boardGate(s, cmd);
    if (gate) {
      const dup = s.governance.agenda.some((i) => i.type === gate.type && JSON.stringify(i.command) === JSON.stringify(cmd));
      if (dup) return [{ level: 'info', text: 'That is already on the board\'s agenda.' }];
      const key = JSON.stringify(cmd);
      const recent = s.governance.votes.find((v) => v.commandKey === key && !v.passed && s.clock.monthIndex - v.monthIndex < BOARD_RECONSIDER_MONTHS);
      if (recent) return [{ level: 'error', text: `The board turned this down in ${formatMonth(recent.monthIndex)} and won't reconsider it for ${BOARD_RECONSIDER_MONTHS} months. Change the proposal or wait.` }];
      // Check the action is possible before taking it to the board.
      const trial = cloneState(s);
      const trialMsgs = run(trial, cmd);
      if (trialMsgs.some((m) => m.level === 'error')) return trialMsgs;
      // A revised policy proposal replaces the pending one rather than stacking a second.
      const replaces = s.governance.agenda.find((i) => i.source === 'gm' && sameSubject(i.command as Command | undefined, cmd));
      if (replaces) s.governance.agenda = s.governance.agenda.filter((i) => i !== replaces);
      addAgendaItem(s, { type: gate.type, title: gate.title, submittedMonth: s.clock.monthIndex, command: cmd, source: 'gm', ...(cmd.type === 'proposeBylaw' ? { bylaw: cmd.change } : {}) });
      return [{ level: 'info', text: `"${gate.title}" ${replaces ? 'replaces the pending proposal and ' : ''}goes to the board at next month's meeting.` }];
    }
  }
  return run(s, cmd);
}

/** Two proposals about the same policy (one supersedes the other on the agenda). */
function sameSubject(a: Command | undefined, b: Command): boolean {
  if (!a || a.type !== b.type) return false;
  switch (b.type) {
    case 'setGrainPolicy':
    case 'setRedemptionPolicy':
    case 'setLineCommitment':
    case 'switchLender':
      return true;
    case 'setAffiliation': return (a as typeof b).category === b.category;
    case 'setSupplyPolicy': return (a as typeof b).division === b.division;
    case 'proposeBylaw': return (a as typeof b).change.field === b.change.field;
    default: return false;
  }
}

function run(s: GameState, cmd: Command): CommandMessage[] {
  switch (cmd.type) {
    case 'markInboxRead': {
      const item = s.inbox.find((i) => i.id === cmd.id);
      if (item) item.read = true;
      return [];
    }
    case 'markAllInboxRead':
      for (const i of s.inbox) i.read = true;
      return [];
    case 'renameCoop': {
      const name = cmd.name.trim();
      if (!name) return [{ level: 'error', text: 'Name cannot be empty.' }];
      s.coop.name = name;
      return [];
    }
    case 'dueDiligence': return dueDiligence(s, cmd.offerId);
    case 'buyFacility': return buyOffer(s, cmd.offerId, cmd.financePct);
    case 'buildElevator': return buildElevator(s, cmd.townId, cmd.spec, cmd.financePct);
    case 'buildFacility': return buildFacility(s, cmd.kind, cmd.townId, cmd.components, cmd.financePct);
    case 'setSupplyPolicy': {
      const p = { ...s.coop.supplyPolicy[cmd.division], ...cmd.policy };
      p.summerFillPct = Math.max(0, Math.min(1, p.summerFillPct));
      p.winterFillPct = Math.max(0, Math.min(1, p.winterFillPct));
      s.coop.supplyPolicy[cmd.division] = p;
      return [];
    }
    case 'upgradeFacility': return upgradeFacility(s, cmd.facilityId, cmd.components, cmd.financePct);
    case 'renovateFacility': return renovateFacility(s, cmd.facilityId, cmd.financePct);
    case 'mothballFacility': return setFacilityStatus(s, cmd.facilityId, 'mothballed');
    case 'reopenFacility': return setFacilityStatus(s, cmd.facilityId, 'operating');
    case 'closeFacility': return closeFacility(s, cmd.facilityId);
    case 'setStaffing': return setStaffing(s, cmd.facilityId, cmd.level, cmd.pay);
    case 'setGrainPolicy': {
      const p = { ...s.coop.grainPolicy, ...cmd.policy };
      p.hedgeRatio = Math.max(0, Math.min(1.5, p.hedgeRatio));
      p.storageFee = Math.max(0, Math.min(3, p.storageFee));
      p.dryingFee = Math.max(0, Math.min(3, p.dryingFee));
      s.coop.grainPolicy = p;
      return [];
    }
    case 'setLineCommitment': {
      const max = maxCommitment(s);
      const amt = Math.max(0, Math.min(max, Math.round(cmd.amount)));
      s.coop.finance.lineCommitment = amt;
      return amt < cmd.amount ? [{ level: 'warning', text: `The lender capped the commitment at ${formatCents(max)} (a multiple of member equity).` }] : [{ level: 'info', text: `Seasonal line commitment set to ${formatCents(amt)}.` }];
    }
    case 'prepayTermLoan': {
      const loan = s.coop.finance.termLoans.find((l) => l.id === cmd.loanId);
      if (!loan) return [{ level: 'error', text: 'Unknown loan.' }];
      const amt = Math.max(0, Math.min(loan.balance, Math.round(cmd.amount), balance(s.ledger, '1000')));
      if (amt <= 0) return [{ level: 'error', text: 'No cash available to prepay.' }];
      loan.balance -= amt;
      post(s, { source: 'term-loan-prepay', memo: `Prepay term loan: ${loan.purpose}`, lines: [{ account: '2300', division: 'CORP', amount: amt }, { account: '1000', division: 'CORP', amount: -amt }] });
      s.coop.finance.termLoans = s.coop.finance.termLoans.filter((l) => l.balance > 0);
      return [{ level: 'info', text: `Prepaid ${formatCents(amt)}.` }];
    }
    case 'setPatronageProposal': {
      const errs = validateProposal(cmd.proposal);
      if (errs.length) return errs.map((text) => ({ level: 'error' as const, text }));
      s.coop.equityProgram.proposal = structuredCloneProposal(cmd.proposal);
      return [{ level: 'info', text: 'Patronage plan updated. The board votes the plan in force when the proposal comes due.' }];
    }
    case 'setRedemptionPolicy': {
      const p = cmd.policy;
      if (p.budgetFixed < 0 || p.budgetPctOfSavings < 0 || p.budgetPctOfSavings > 1) return [{ level: 'error', text: 'The redemption budget must be positive and at most 100% of savings.' }];
      if (p.plans.some((x) => x.kind === 'ageOfPatron' && (x.age < 60 || x.age > 80))) return [{ level: 'error', text: 'Age of patron must be between 60 and 80.' }];
      if (p.plans.some((x) => x.kind === 'estate' && (x.discountPct < 0 || x.discountPct > 0.5))) return [{ level: 'error', text: 'Estate discount must be between 0% and 50%.' }];
      s.coop.equityProgram.redemption = { budgetFixed: Math.round(p.budgetFixed), budgetPctOfSavings: p.budgetPctOfSavings, plans: p.plans.map((x) => ({ ...x })) };
      return [{ level: 'info', text: 'Redemption program updated.' }];
    }
    case 'setAffiliation': {
      const e = setAffiliation(s, cmd.category, cmd.regionalId, true);
      return e ? [{ level: 'error', text: e }] : [{ level: 'info', text: 'Affiliation changed.' }];
    }
    case 'switchLender': {
      const e = switchLender(s, cmd.lenderId);
      return e ? [{ level: 'error', text: e }] : [{ level: 'info', text: `Our borrowing moved to ${brandLabel(cmd.lenderId)}.` }];
    }
    case 'termOutLine': {
      const c = covenantSet(s);
      const amt = termOutLine(s, c.minCurrentRatio + 0.25, c.maxTermDebtToFixed);
      return amt > 0 ? [{ level: 'info', text: `${brandLabel(s.coop.lenderId)} converted ${formatCents(amt)} of the line into a term loan.` }] : [{ level: 'error', text: 'The lender sees no need (or no room under the term-debt covenant) to term out the line.' }];
    }
    case 'lobbyDirector':
    case 'tableItem':
    case 'withdrawItem':
    case 'proposeBylaw':
    case 'endorseIncumbents':
      return governanceCommand(s, cmd);
    case 'setBudget': {
      const fye = s.setup.fiscalYearEndMonth;
      const b = s.coop.budget;
      if (!b || b.fy <= fiscalYearOf(s.clock.monthIndex, fye) && b.approved) {
        if (cmd.capex === undefined || !b) return [{ level: 'error', text: 'The budget for this year is already approved; next year\'s is drafted three months before year end.' }];
        b.capex = Math.max(0, Math.round(cmd.capex));
        return [{ level: 'info', text: `Capital budget set to ${formatCents(b.capex)}.` }];
      }
      const nb = draftBudget(s, b.fy, cmd.salesGrowthPct ?? b.salesGrowthPct, cmd.costGrowthPct ?? b.costGrowthPct, cmd.capex !== undefined ? Math.max(0, Math.round(cmd.capex)) : b.capex);
      nb.approved = b.approved;
      s.coop.budget = nb;
      return [{ level: 'info', text: 'Budget updated.' }];
    }
  }
}

function governanceCommand(s: GameState, cmd: Extract<Command, { type: 'lobbyDirector' | 'tableItem' | 'withdrawItem' | 'proposeBylaw' | 'endorseIncumbents' }>): CommandMessage[] {
  const g = s.governance;
  switch (cmd.type) {
    case 'lobbyDirector': {
      const item = g.agenda.find((i) => i.id === cmd.itemId);
      if (!item) return [{ level: 'error', text: 'That item is not on the agenda.' }];
      if (!g.directors.some((d) => d.memberId === cmd.directorId)) return [{ level: 'error', text: 'Not a director.' }];
      if (item.lobbied.includes(cmd.directorId)) return [{ level: 'info', text: 'You already made your case to that director.' }];
      if (g.politicalCapital < POLITICAL_CAPITAL.lobbyCost) return [{ level: 'error', text: 'You have no political capital left this month.' }];
      g.politicalCapital -= POLITICAL_CAPITAL.lobbyCost;
      g.agenda = g.agenda.map((i) => (i.id === item.id ? { ...i, lobbied: [...i.lobbied, cmd.directorId] } : i));
      return [{ level: 'info', text: 'You made your case over coffee.' }];
    }
    case 'tableItem': {
      const item = g.agenda.find((i) => i.id === cmd.itemId);
      if (!item) return [{ level: 'error', text: 'That item is not on the agenda.' }];
      if (item.tabled >= VOTE_MODEL.maxTables) return [{ level: 'error', text: 'The board will not table it again.' }];
      g.agenda = g.agenda.map((i) => (i.id === item.id ? { ...i, tabled: i.tabled + 1, submittedMonth: s.clock.monthIndex } : i));
      return [{ level: 'info', text: 'Tabled until the following meeting.' }];
    }
    case 'withdrawItem': {
      const item = g.agenda.find((i) => i.id === cmd.itemId);
      if (!item) return [{ level: 'error', text: 'That item is not on the agenda.' }];
      if (item.source !== 'gm') return [{ level: 'error', text: 'Only your own proposals can be withdrawn.' }];
      g.agenda = g.agenda.filter((i) => i.id !== item.id);
      return [{ level: 'info', text: 'Withdrawn.' }];
    }
    case 'proposeBylaw': {
      const c = cmd.change;
      if (c.field === 'boardSize' && (c.value < 5 || c.value > 15)) return [{ level: 'error', text: 'A board has 5 to 15 directors.' }];
      if (c.field === 'termLimit' && c.value !== null && (c.value < 1 || c.value > 6)) return [{ level: 'error', text: 'Term limits run from 1 to 6 terms.' }];
      if (c.field === 'memberPetitionPct' && (c.value < 0.02 || c.value > 0.3)) return [{ level: 'error', text: 'Petition thresholds run from 2% to 30%.' }];
      if (c.field === 'capitalApproval' && (c.value < 10_000 || c.value > 5_000_000)) return [{ level: 'error', text: 'The threshold must be between $10,000 and $5,000,000 (2024 dollars).' }];
      return [];
    }
    case 'endorseIncumbents':
      g.endorse = cmd.on;
      return [{ level: 'info', text: cmd.on ? 'You will speak for the incumbents at the annual meeting.' : 'You will stay neutral in board elections.' }];
  }
}

const structuredCloneProposal = (p: PatronageProposal): PatronageProposal => ({
  ...p, basis: { ...p.basis }, pools: Object.fromEntries(Object.entries(p.pools).map(([k, v]) => [k, { ...v }])),
});

/**
 * Apply a player command. `boardApproved` skips the board (tests and scripted setups that
 * start from an already-approved decision); the UI never sets it.
 */
export function applyCommand(state: GameState, cmd: Command, opts: { boardApproved?: boolean } = {}): CommandResult {
  const s = cloneState(state);
  s.clock.commandsThisMonth += 1;
  const messages = runCommand(s, cmd, opts.boardApproved);
  if (messages.some((m) => m.level === 'error')) return { state, ok: false, messages };
  return { state: s, ok: true, messages };
}
