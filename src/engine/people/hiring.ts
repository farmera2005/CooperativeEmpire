// Hiring pipeline (DESIGN §15.3): external search, internal promotion, poaching;
// interviews and reference checks narrow what we know; hire, fire, coach, bonus, raise.

import { LABOR_MARKET, MISCONDUCT, PEOPLE, POLITICAL_CAPITAL_COSTS, ROLE_DEFS, SEARCH, type Role } from '../../data/people';
import { valueAt } from '../../data/types';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents } from '../core/money';
import { stream } from '../core/rng';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { Candidate, GameState, Leader } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { effect, generateLeader, holder, marketSalary, narrow, roleDivision } from './leaders';

type Msgs = CommandMessage[];
const err = (text: string): Msgs => [{ level: 'error', text }];
const info = (text: string): Msgs => [{ level: 'info', text }];

const rngFor = (s: GameState, name: string, entity: number) => stream(s.setup.gameSeed, s.clock.monthIndex, name, entity);

/** Candidate quality from the labor market, our HR, pay band and home-town size. */
export function searchQuality(s: GameState, band: 'at' | 'above'): number {
  const tight = valueAt(LABOR_MARKET, yearOf(s.clock.monthIndex));
  const town = s.world.towns[s.coop.homeTownId];
  return SEARCH.meanSkill.value + SEARCH.payBand[band].quality - 1.5 * (tight - 1) - 10 * effect(s, 'hr.turnover') + (town.population > 5000 ? 0.5 : 0);
}

export function startSearch(s: GameState, role: Role, band: 'at' | 'above'): Msgs {
  if (s.people.searches.some((x) => x.role === role)) return err('A search for that role is already under way.');
  const fee = roundCents(marketSalary(s, role) * SEARCH.payBand[band].pay * SEARCH.feePct.value);
  const rng = rngFor(s, 'people.search', s.people.nextId);
  const months = rng.int(SEARCH.months[0], SEARCH.months[1]);
  s.people.searches = [...s.people.searches, { id: s.people.nextId++, role, band, readyMonth: s.clock.monthIndex + months }];
  post(s, { source: 'search-fee', memo: `Search for a ${ROLE_DEFS[role].label.toLowerCase()}`, lines: [{ account: '7635', division: roleDivision(role), amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
  return info(`Search firm retained for ${formatCents(fee)}. Candidates in about ${months} months.`);
}

function addCandidate(s: GameState, c: Omit<Candidate, 'id'>): void {
  s.people.candidates = [...s.people.candidates, { ...c, id: s.people.nextId++ }];
}

/** Searches that finish this month produce candidates. */
export function deliverSearches(s: GameState): string[] {
  const out: string[] = [];
  const mi = s.clock.monthIndex;
  const ready = s.people.searches.filter((x) => x.readyMonth <= mi);
  s.people.searches = s.people.searches.filter((x) => x.readyMonth > mi);
  for (const sr of ready) {
    const rng = rngFor(s, 'people.candidates', sr.id);
    const q = searchQuality(s, sr.band);
    for (let i = 0; i < SEARCH.candidates; i++) {
      const leader = generateLeader(s, rng, s.people.nextId++, { role: sr.role, quality: q, sd: SEARCH.sd.value, ageRange: [32, 60], revealWidth: PEOPLE.revealWidth.none, salaryFactor: SEARCH.payBand[sr.band].pay });
      if (rng.chance(MISCONDUCT.embezzleProb.value)) leader.flags.embezzling = true;
      addCandidate(s, { leader, source: 'search', expiresMonth: mi + SEARCH.candidateValidMonths, interviewed: false, referenced: false, signing: 0 });
    }
    out.push(`The search firm presented ${SEARCH.candidates} candidates for ${ROLE_DEFS[sr.role].label.toLowerCase()}.`);
  }
  return out;
}

export function listInternal(s: GameState, role: Role): Msgs {
  const mi = s.clock.monthIndex;
  const last = s.people.internalListed[role];
  if (last !== undefined && mi - last < 6) return err('You reviewed internal candidates for that role recently.');
  if (!s.coop.facilities.some((f) => f.status === 'operating')) return err('There is no staff yet to promote from.');
  s.people.internalListed = { ...s.people.internalListed, [role]: mi };
  const rng = rngFor(s, 'people.internal', ROLE_DEFS[role].salary + mi);
  const n = rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    // Our own people: we know them well already.
    const leader = generateLeader(s, rng, s.people.nextId++, { role, quality: SEARCH.internalMeanSkill.value + 0.5 * rng.normal(), sd: 2, ageRange: [28, 55], revealWidth: PEOPLE.revealWidth.interview, salaryFactor: SEARCH.internalPay });
    addCandidate(s, { leader, source: 'internal', expiresMonth: mi + SEARCH.candidateValidMonths, interviewed: true, referenced: true, signing: 0 });
  }
  return info(`${n} internal candidate${n > 1 ? 's' : ''} for ${ROLE_DEFS[role].label.toLowerCase()}.`);
}

export function poach(s: GameState, role: Role): Msgs {
  const comp = s.competitors.filter((c) => c.status === 'active' && c.sites.length).sort((a, b) => b.sites.length - a.sites.length || a.id - b.id)[0];
  if (!comp) return err('No competitor has anyone worth poaching.');
  if (s.people.candidates.some((c) => c.source === 'poach' && c.leader.role === role)) return err('You are already talking to someone at a competitor.');
  const rng = rngFor(s, 'people.poach', comp.id * 100 + ROLE_DEFS[role].salary);
  const leader = generateLeader(s, rng, s.people.nextId++, { role, quality: searchQuality(s, 'above') + SEARCH.poachSkillBonus.value, sd: 1.8, ageRange: [35, 58], revealWidth: PEOPLE.revealWidth.interview, salaryFactor: SEARCH.poachPay });
  addCandidate(s, { leader, source: 'poach', competitorId: comp.id, expiresMonth: s.clock.monthIndex + 2, interviewed: true, referenced: false, signing: roundCents(leader.salary * SEARCH.poachSigningPct) });
  return info(`${leader.name} at ${comp.name} would talk, for ${formatCents(leader.salary)} a year and a signing bonus.`);
}

export function interview(s: GameState, id: number): Msgs {
  const c = s.people.candidates.find((x) => x.id === id);
  if (!c) return err('That candidate is no longer available.');
  if (c.interviewed) return info('Already interviewed.');
  if (s.governance.politicalCapital < POLITICAL_CAPITAL_COSTS.interview) return err('You have no time left this month for interviews.');
  s.governance.politicalCapital -= POLITICAL_CAPITAL_COSTS.interview;
  const leader = { ...c.leader, revealed: { ...c.leader.revealed } };
  narrow(rngFor(s, 'people.interview', id), leader, PEOPLE.revealWidth.interview);
  s.people.candidates = s.people.candidates.map((x) => (x.id === id ? { ...x, leader, interviewed: true } : x));
  return info(`Interviewed ${leader.name}.`);
}

export function checkReferences(s: GameState, id: number): Msgs {
  const c = s.people.candidates.find((x) => x.id === id);
  if (!c) return err('That candidate is no longer available.');
  if (c.referenced) return info('References already checked.');
  const cost = nominalCents(pathFor(s), s.clock.monthIndex, SEARCH.referenceCost);
  post(s, { source: 'references', memo: `Reference checks: ${c.leader.name}`, lines: [{ account: '7635', division: roleDivision(c.leader.role), amount: cost }, { account: '1000', division: 'CORP', amount: -cost }] });
  const leader = { ...c.leader, revealed: { ...c.leader.revealed } };
  narrow(rngFor(s, 'people.references', id), leader, PEOPLE.revealWidth.references);
  const note = leader.flags.embezzling ? 'Former employers are oddly vague about why the candidate left.' : leader.traits.includes('gunslinger') ? 'A former boss says the candidate "likes to have a view on the market."' : 'References are solid.';
  s.people.candidates = s.people.candidates.map((x) => (x.id === id ? { ...x, leader, referenced: true, interviewed: true, referenceNote: note } : x));
  return info(`${leader.name}: ${note}`);
}

function severance(s: GameState, l: Leader): void {
  const pay = roundCents((l.salary * PEOPLE.severanceMonths) / 12);
  post(s, { source: 'severance', memo: `Severance: ${l.name}`, lines: [{ account: '7000', division: roleDivision(l.role), amount: pay }, { account: '1000', division: 'CORP', amount: -pay }] });
}

export function hire(s: GameState, id: number): Msgs {
  const c = s.people.candidates.find((x) => x.id === id);
  if (!c) return err('That candidate is no longer available.');
  const cur = holder(s, c.leader.role);
  const msgs: Msgs = [];
  if (cur) {
    severance(s, cur);
    s.people.leaders = s.people.leaders.filter((l) => l !== cur);
    msgs.push({ level: 'info', text: `${cur.name} was let go with ${PEOPLE.severanceMonths} months' severance.` });
  }
  const l: Leader = { ...c.leader, hiredMonth: s.clock.monthIndex, morale: 70 };
  s.people.leaders = [...s.people.leaders, l];
  // The other candidates for the role move on.
  s.people.candidates = s.people.candidates.filter((x) => x.leader.role !== l.role);
  if (c.signing > 0) post(s, { source: 'signing', memo: `Signing bonus: ${l.name}`, lines: [{ account: '7635', division: roleDivision(l.role), amount: c.signing }, { account: '1000', division: 'CORP', amount: -c.signing }] });
  if (c.source === 'poach' && c.competitorId !== undefined) {
    // The competitor answers by bidding harder for a while.
    s.competitors = s.competitors.map((x) => (x.id === c.competitorId ? { ...x, posture: x.posture + SEARCH.poachRetaliation.value } : x));
    msgs.push({ level: 'warning', text: 'The competitor is not pleased and will bid harder against us.' });
  }
  msgs.push({ level: 'info', text: `${l.name} is our new ${ROLE_DEFS[l.role].label.toLowerCase()} at ${formatCents(l.salary)} a year.` });
  return msgs;
}

export function fire(s: GameState, leaderId: number): Msgs {
  const l = s.people.leaders.find((x) => x.id === leaderId);
  if (!l) return err('Unknown leader.');
  severance(s, l);
  s.people.leaders = s.people.leaders.filter((x) => x !== l);
  return info(`${l.name} was let go with ${PEOPLE.severanceMonths} months' severance.`);
}

export function coach(s: GameState, leaderId: number): Msgs {
  const l = s.people.leaders.find((x) => x.id === leaderId);
  if (!l) return err('Unknown leader.');
  if (l.coachedMonth !== null && s.clock.monthIndex - l.coachedMonth < 6) return err('You coached them recently; give it time.');
  if (s.governance.politicalCapital < POLITICAL_CAPITAL_COSTS.coach) return err('You have no time left this month.');
  s.governance.politicalCapital -= POLITICAL_CAPITAL_COSTS.coach;
  s.people.leaders = s.people.leaders.map((x) => (x.id === l.id ? { ...x, coachedMonth: s.clock.monthIndex, morale: Math.min(100, x.morale + 5), loyalty: Math.min(100, x.loyalty + 3) } : x));
  return info(`You spent time with ${l.name}. Expect faster growth over the next six months.`);
}

export function setBonusPlan(s: GameState, leaderId: number, on: boolean): Msgs {
  const l = s.people.leaders.find((x) => x.id === leaderId);
  if (!l) return err('Unknown leader.');
  s.people.leaders = s.people.leaders.map((x) => (x.id === l.id ? { ...x, bonusPlan: on, morale: Math.min(100, x.morale + (on ? 5 : -5)) } : x));
  return info(on ? `${l.name} is on a bonus plan: ${Math.round(PEOPLE.bonusPct.value * 100)}% of salary when the division beats its budget.` : 'Bonus plan ended.');
}

export function giveRaise(s: GameState, leaderId: number): Msgs {
  const l = s.people.leaders.find((x) => x.id === leaderId);
  if (!l) return err('Unknown leader.');
  const salary = roundCents(l.salary * (1 + PEOPLE.raisePct));
  s.people.leaders = s.people.leaders.map((x) => (x.id === l.id ? { ...x, salary, morale: Math.min(100, x.morale + 8), loyalty: Math.min(100, x.loyalty + 5) } : x));
  return info(`${l.name}'s salary is now ${formatCents(salary)}.`);
}
