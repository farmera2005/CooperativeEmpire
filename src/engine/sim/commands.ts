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
import type { GameState, GrainPolicy, PayPosition, StaffLevel, SupplyPolicy } from '../types';
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
  | { type: 'prepayTermLoan'; loanId: number; amount: number };

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
  }
}

export function applyCommand(state: GameState, cmd: Command): CommandResult {
  const s = cloneState(state);
  s.clock.commandsThisMonth += 1;
  const messages = run(s, cmd);
  if (messages.some((m) => m.level === 'error')) return { state, ok: false, messages };
  return { state: s, ok: true, messages };
}
