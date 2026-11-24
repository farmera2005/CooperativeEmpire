// Renaming the co-op (D-146). The name is in the articles of incorporation, so a change goes to
// the board and then to the members, who must adopt it by the same supermajority as a bylaw
// amendment. Once adopted the co-op files the amendment and pays for new signs, truck lettering,
// scale tickets and stationery at every site.

import { NAME_CHANGE } from '../../data/governance';
import { formatMonth } from '../core/calendar';
import { formatCents } from '../core/format';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { GameState } from '../types';
import { nominalCents, pathFor } from '../world/macro';

const err = (text: string): CommandMessage[] => [{ level: 'error', text }];

/** Check a proposed name; returns an error, or nothing when the board can take it up. */
export function checkNameChange(s: GameState, raw: string): CommandMessage[] {
  const name = raw.trim().replace(/\s+/g, ' ');
  const [lo, hi] = NAME_CHANGE.length;
  if (name.length < lo || name.length > hi) return err(`A name runs ${lo} to ${hi} characters.`);
  if (name.toLowerCase() === s.coop.name.toLowerCase()) return err('That is already the co-op\'s name.');
  if (s.competitors.some((c) => c.status === 'active' && c.name.toLowerCase() === name.toLowerCase())) return err('Another business in the territory already uses that name.');
  const last = s.coop.formerNames?.[s.coop.formerNames.length - 1];
  if (last && s.clock.monthIndex - last.untilMonth < NAME_CHANGE.minMonthsBetween) return err(`The co-op was renamed in ${formatMonth(last.untilMonth)}; members will not take up another name change until ${formatMonth(last.untilMonth + NAME_CHANGE.minMonthsBetween)}.`);
  if (s.governance.memberVotes.some((v) => v.kind === 'name' && !v.result)) return err('A name change is already before the members.');
  return [];
}

/** What renaming would cost now (nominal cents): the filing and new signs at every site. */
export function nameChangeCost(s: GameState, mi = s.clock.monthIndex): number {
  const sites = s.coop.facilities.filter((f) => f.status !== 'closed').length;
  return nominalCents(pathFor(s), mi, NAME_CHANGE.filingCost2024.value + NAME_CHANGE.perSite2024.value * sites);
}

/** The members adopted the new name: file it, pay for the change, and use it everywhere. */
export function renameCoop(ctx: TickContext, newName: string): string {
  return renameNow(ctx.state, newName, ctx.mi);
}

/** Rename now (the members adopted it, or a private company's owner decided: D-149). */
export function renameNow(state: GameState, newName: string, mi = state.clock.monthIndex): string {
  const old = state.coop.name;
  const sites = state.coop.facilities.filter((f) => f.status !== 'closed').length;
  const path = pathFor(state);
  const filing = nominalCents(path, mi, NAME_CHANGE.filingCost2024.value);
  const signs = nominalCents(path, mi, NAME_CHANGE.perSite2024.value * sites);
  post(state, {
    source: 'rename', memo: `Name change: ${old} to ${newName}`,
    lines: [{ account: '7600', division: 'CORP' as const, amount: filing }, { account: '7690', division: 'CORP' as const, amount: signs }, { account: '1000', division: 'CORP' as const, amount: -(filing + signs) }].filter((l) => l.amount !== 0),
  });
  state.coop.formerNames = [...(state.coop.formerNames ?? []), { name: old, untilMonth: mi }];
  state.coop.name = newName;
  state.setup = { ...state.setup, coopName: newName };
  // Career mode: the contract and the current job carry the new name.
  const c = state.career;
  if (c?.status === 'employed' && c.contract) {
    c.contract = { ...c.contract, coopName: newName };
    const st = c.stints[c.stints.length - 1];
    if (st && st.toMonth === null) st.coopName = newName;
    c.log = [...c.log, { monthIndex: mi, text: `${old} renamed ${newName}.` }].slice(-80);
  }
  return `The articles are amended: ${old} is now ${newName}. Filing ${formatCents(filing)} and new signs, lettering and stationery at ${sites} site${sites === 1 ? '' : 's'} ${formatCents(signs)}.`;
}
