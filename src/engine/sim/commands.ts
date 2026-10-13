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
import type { GameState, GrainPolicy, PatronageProposal, PayPosition, RedemptionPolicy, StaffLevel, SupplyPolicy } from '../types';
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
  | { type: 'setBudget'; salesGrowthPct?: number; costGrowthPct?: number; capex?: number };

export interface CommandMessage {
  level: 'info' | 'warning' | 'error';
  text: string;
}

export interface CommandResult {
  state: GameState;
  ok: boolean;
  messages: CommandMessage[];
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

const structuredCloneProposal = (p: PatronageProposal): PatronageProposal => ({
  ...p, basis: { ...p.basis }, pools: Object.fromEntries(Object.entries(p.pools).map(([k, v]) => [k, { ...v }])),
});

export function applyCommand(state: GameState, cmd: Command): CommandResult {
  const s = cloneState(state);
  s.clock.commandsThisMonth += 1;
  const messages = run(s, cmd);
  if (messages.some((m) => m.level === 'error')) return { state, ok: false, messages };
  return { state: s, ok: true, messages };
}
