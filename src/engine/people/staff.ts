// Monthly people step (DESIGN §15.3–15.4): leaders' pay, morale, growth, retirement,
// departures and misconduct; the workforce by division (turnover, vacancies, morale);
// training & safety spending; workplace incidents.

import { moraleDrivers, quitChanceMonthly } from './team';
import { techFactor } from '../world/tech';
import { STAFF } from '../../data/grain';
import { INCIDENTS, LABOR_MARKET, MISCONDUCT, PEOPLE, ROLE_DEFS, SKILLS, STAFFING, TRAINING } from '../../data/people';
import { valueAt } from '../../data/types';
import { fiscalYearOf, fiscalYearStart, isFiscalYearEnd, monthOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import { facilityFte, isHarvestMonth } from '../facilities/facilities';
import { post } from '../ledger/ledger';
import { incomeStatement } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import type { DivisionId, Facility, GameState, Leader, WorkforceDivision } from '../types';
import { nominalCents } from '../world/macro';
import { deliverSearches } from './hiring';
import { integrationPenalty } from '../deals/deals';
import { DIVISION_ROLE, effect, holder, narrow, roleDivision, rolesNeeded } from './leaders';

export const tightness = (s: GameState): number => valueAt(LABOR_MARKET, Math.floor(s.clock.monthIndex / 12));

/** Staffed FTE at a site (level and era labor intensity applied). */
export function siteFte(s: GameState, f: Facility): number {
  return facilityFte(f) * STAFF.levelFactor.value[f.staffing.level] * valueAt(STAFF.laborIntensity, Math.floor(s.clock.monthIndex / 12));
}

/** Wage multiplier from the labor market (tight markets pay more). */
export const wageMarket = (s: GameState): number => 1 + STAFFING.wageTightness.value * (tightness(s) - 1);

/** Share of positions unfilled at a site: tight markets and below-market pay leave holes. */
export function vacancyShare(s: GameState, f: Facility): number {
  const payBonus = f.staffing.pay === 'above' ? 0.06 : f.staffing.pay === 'below' ? -0.04 : 0;
  return clamp(STAFFING.vacancyTightness.value * (tightness(s) - 1) - payBonus, 0, 0.25);
}

/** Service lost to vacancies and green crews, by division (subtracted from service utility). */
export function staffServicePenalty(s: GameState, d: DivisionId): number {
  const w = s.people.workforce[d];
  // Relative to a normal year's turnover, so a typical crew costs nothing extra.
  return (w ? w.vacancy + STAFFING.turnoverService.value * Math.max(-0.05, w.turnover - STAFFING.baseTurnover.value) : 0) + integrationPenalty(s);
}

function leaderMonth(ctx: TickContext, l: Leader): Leader | null {
  const { state, mi } = ctx;
  const rng = ctx.rng('people.leader', l.id);
  const age = ctx.year - l.birthYear;
  const x: Leader = { ...l, skills: { ...l.skills }, revealed: { ...l.revealed }, flags: { ...l.flags } };
  // Retirement: notice six months ahead.
  if (x.retiring === undefined && age >= x.retireAge - 1 && monthOf(mi) === 1) {
    x.retiring = mi + PEOPLE.retireNotice;
    ctx.inbox({ kind: 'memo', title: `${x.name} plans to retire`, body: `Our ${ROLE_DEFS[x.role].label.toLowerCase()}, ${x.name}, will retire in six months. Start a search or line up an internal successor on the People screen.` });
  }
  if (x.retiring !== undefined && mi >= x.retiring) {
    ctx.inbox({ kind: 'memo', title: `${x.name} retires`, body: `${x.name} retired after ${Math.round((mi - x.hiredMonth) / 12)} years with the co-op. The position is open.` });
    return null;
  }
  // Morale and burnout.
  const market = nominalCents(ctx.path, mi, ROLE_DEFS[x.role].salary);
  const payGap = (x.salary / market - 1) * 100;
  const d = roleDivision(x.role);
  const lean = state.coop.facilities.some((f) => f.status === 'operating' && (d === 'CORP' || f.division === d) && f.staffing.level === 'lean');
  const crunch = isHarvestMonth(mi) && (d === 'GRAIN' || x.role === 'COO');
  x.burnout = clamp(x.burnout + (lean ? 2 : 0) + (crunch ? 3 : 0) - 2, 0, 100);
  const { target } = moraleDrivers(state, x);
  x.morale = clamp(x.morale + 0.15 * (target - x.morale), 0, 100);
  x.loyalty = clamp(x.loyalty + 0.05 * (x.morale - 55), 0, 100);
  // Growth: younger, ambitious, trained and coached leaders get better; coasters slide.
  const coached = x.coachedMonth !== null && mi - x.coachedMonth < 6;
  if (x.traits.includes('coasting')) {
    if (rng.chance(0.02)) {
      const k = rng.pick(SKILLS);
      x.skills[k] = Math.max(1, x.skills[k] - 1);
    }
  } else if (age < 58 && rng.chance(TRAINING.growth[state.people.training] * x.ambition * (coached ? 2 : 1))) {
    const k = rng.pick(ROLE_DEFS[x.role].primary);
    if (x.skills[k] < 19) {
      x.skills[k] += 1;
      x.revealed[k] = [x.revealed[k][0], Math.min(20, Math.max(x.revealed[k][1], x.skills[k]))];
    }
  }
  // We learn what people are really like by working with them.
  const years = (mi - x.hiredMonth) / 12;
  if ((mi - x.hiredMonth) % 12 === 11) narrow(rng, x, Math.max(0.5, PEOPLE.revealWidth.none - PEOPLE.revealPerYear * Math.ceil(years)));
  // Quits and poaching: unhappy or underpaid strong people leave.
  const strong = Math.max(...ROLE_DEFS[x.role].primary.map((k) => x.skills[k])) >= 13;
  const pQuit = quitChanceMonthly(state, x);
  if (rng.chance(pQuit)) {
    ctx.inbox({ kind: 'alert', title: `${x.name} resigns`, body: `${x.name}, our ${ROLE_DEFS[x.role].label.toLowerCase()}, ${strong && payGap < 0 ? 'took a better-paying job with a competitor' : 'has resigned'}. The position is open.` });
    return null;
  }
  // Misconduct: an embezzler steals until caught; the CFO's skill and the audit catch it.
  if (x.flags.embezzling) {
    const theft = roundCents((x.salary * MISCONDUCT.embezzleMonthly.value) / 12);
    post(state, { source: 'office', memo: 'Office & administrative', lines: [{ account: '7620', division: 'CORP', amount: theft }, { account: '1000', division: 'CORP', amount: -theft }] });
    const auditMonth = (monthOf(mi) - state.setup.fiscalYearEndMonth + 12) % 12 === 2;
    const cfo = x.role === 'CFO' ? 0 : Math.max(0, effect(state, 'finance.forecast') * -1);
    const p = MISCONDUCT.detectMonthly.value * (1 + 2 * cfo) + (auditMonth ? MISCONDUCT.auditDetect.value : 0);
    if (rng.chance(p)) {
      const months = Math.max(1, mi - x.hiredMonth);
      const stolen = theft * months;
      const recovered = roundCents(stolen * 0.3);
      if (recovered > 0) post(state, { source: 'bond-recovery', memo: 'Fidelity bond recovery', lines: [{ account: '1000', division: 'CORP', amount: recovered }, { account: '8200', division: 'CORP', amount: -recovered }] });
      state.governance.boardConfidence = clamp(state.governance.boardConfidence + MISCONDUCT.scandalConfidence.value, 0, 100);
      ctx.inbox({ kind: 'alert', title: `Embezzlement uncovered: ${x.name}`, body: `${auditMonth ? 'The auditors' : 'Our office staff'} found that ${x.name} had been taking money: about ${formatCents(stolen)} over ${months} months. ${x.name} was fired; the fidelity bond recovers ${formatCents(recovered)}. The board is asking how this went unnoticed.` });
      return null;
    }
  }
  // A gunslinger may quietly take a speculative position.
  if (x.traits.includes('gunslinger') && !x.flags.hiddenPosition && monthOf(mi) === 6 && rng.chance(MISCONDUCT.hiddenPositionProb.value)) x.flags.hiddenPosition = true;
  return x;
}

function payLeaders(ctx: TickContext): void {
  const { state, mi } = ctx;
  const byDiv = new Map<DivisionId, number>();
  for (const l of state.people.leaders) {
    const d = roleDivision(l.role);
    byDiv.set(d, (byDiv.get(d) ?? 0) + roundCents(l.salary / 12));
  }
  // Year-end bonuses for leaders whose division (or the co-op) beat its budget.
  const fye = state.setup.fiscalYearEndMonth;
  if (isFiscalYearEnd(mi, fye) && state.coop.budget && state.coop.budget.fy === fiscalYearOf(mi, fye)) {
    const from = Math.max(state.ledger.firstMonth, fiscalYearStart(fiscalYearOf(mi, fye), fye));
    for (const l of state.people.leaders) {
      if (!l.bonusPlan) continue;
      const d = roleDivision(l.role);
      const actual = incomeStatement(state.ledger, from, mi, d === 'CORP' ? 'ALL' : d).localSavings;
      const plan = d === 'CORP' ? Object.values(state.coop.budget.lines).reduce((a, x) => a + x.localSavings, 0) : state.coop.budget.lines[d].localSavings;
      if (actual >= plan) {
        const b = roundCents(l.salary * PEOPLE.bonusPct.value);
        byDiv.set(d, (byDiv.get(d) ?? 0) + b);
        ctx.inbox({ kind: 'memo', title: `Bonus earned: ${l.name}`, body: `${l.name} beat the budget and earned a ${formatCents(b)} bonus.` });
      }
    }
  }
  const lines = [];
  let total = 0;
  for (const [d, amt] of [...byDiv.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ben = roundCents(amt * PEOPLE.benefitsRate.value);
    lines.push({ account: '7000', division: d, amount: amt }, { account: '7010', division: d, amount: ben });
    total += amt + ben;
  }
  if (total > 0) post(state, { source: 'leader-payroll', memo: 'Management salaries', lines: [...lines, { account: '1000', division: 'CORP' as DivisionId, amount: -total }] });
}

function workforce(ctx: TickContext): void {
  const { state, mi, path } = ctx;
  const rng = ctx.rng('people.workforce');
  const tight = tightness(state);
  const ops = state.coop.facilities.filter((f) => f.status === 'operating');
  const out: Partial<Record<DivisionId, WorkforceDivision>> = {};
  const lines: { account: string; division: DivisionId; amount: number }[] = [];
  const divs = [...new Set(ops.map((f) => f.division))].sort();
  for (const d of divs) {
    const sites = ops.filter((f) => f.division === d);
    const fte = sites.reduce((a, f) => a + siteFte(state, f), 0);
    if (fte <= 0) continue;
    const w = (fn: (f: Facility) => number) => sites.reduce((a, f) => a + fn(f) * siteFte(state, f), 0) / fte;
    const levelF = w((f) => STAFFING.turnoverByLevel[f.staffing.level]);
    const payF = w((f) => STAFFING.turnoverByPay[f.staffing.pay]);
    const prev = state.people.workforce[d];
    const role = DIVISION_ROLE[d];
    const people = role && holder(state, role)?.traits.includes('peoplePerson') ? 0.75 : 1;
    const tightWallet = role && holder(state, role)?.traits.includes('tightWithADollar') ? -6 : 0;
    const moraleTarget = 60 + w((f) => (f.staffing.pay === 'above' ? 6 : f.staffing.pay === 'below' ? -10 : 0) + (f.staffing.level === 'lean' ? -10 : f.staffing.level === 'full' ? 4 : 0))
      + TRAINING.morale[state.people.training] + effect(state, 'staff.morale', d) + tightWallet;
    const morale = clamp((prev?.morale ?? 60) + 0.1 * (moraleTarget - (prev?.morale ?? 60)), 0, 100);
    const annual = STAFFING.baseTurnover.value * tight * levelF * payF * (1 + effect(state, 'hr.turnover')) * people * (1 + (60 - morale) / 100);
    const departures = (fte * annual) / 12;
    const vacancy = w((f) => vacancyShare(state, f));
    out[d] = { fte, morale, turnover: (prev ? 0.9 * prev.turnover + 0.1 * annual : annual), vacancy };
    const tc = nominalCents(path, mi, (fte * TRAINING.budget[state.people.training]) / 12);
    lines.push({ account: '7630', division: d, amount: tc }, { account: '7635', division: d, amount: nominalCents(path, mi, departures * STAFFING.replacementCost.value) });
  }
  state.people.workforce = out;
  const total = lines.reduce((a, x) => a + x.amount, 0);
  if (total > 0) post(state, { source: 'workforce', memo: 'Training & safety; recruiting and turnover', lines: [...lines, { account: '1000', division: 'CORP', amount: -total }] });

  // Incidents, site by site.
  const harvest = isHarvestMonth(mi);
  const safety = (1 + effect(state, 'safety.incidents')) * techFactor(state, 'incidents');
  const rate = valueAt(INCIDENTS.ratePerFte, ctx.year);
  for (const f of ops) {
    const morale = out[f.division]?.morale ?? 60;
    const p = (siteFte(state, f) * rate) / 12 * INCIDENTS.levelFactor[f.staffing.level] * TRAINING.incidents[state.people.training] * safety
      * (harvest && f.division === 'GRAIN' ? INCIDENTS.harvestFactor.value : 1) * (1 + (60 - morale) / 200) * (1 + (100 - f.condition) / 200);
    if (!rng.chance(clamp(p, 0, 0.5))) continue;
    const serious = rng.chance(INCIDENTS.seriousShare.value);
    const cost = nominalCents(path, mi, serious ? INCIDENTS.seriousCost.value : INCIDENTS.cost.value);
    post(state, { source: 'incident', memo: `${serious ? 'Serious incident' : 'Injury'} at ${f.name}`, lines: [{ account: '7695', division: f.division, amount: cost }, { account: '1000', division: 'CORP', amount: -cost }] });
    const text = serious
      ? `A worker was badly hurt at ${f.name}. OSHA is investigating; claims, penalties and downtime will cost about ${formatCents(cost)}.`
      : `A recordable injury at ${f.name} (${formatCents(cost)} in uninsured costs and lost time).`;
    state.people.incidents = [...state.people.incidents, { monthIndex: mi, facilityId: f.id, serious, cost, text }].slice(-30);
    if (serious) {
      state.governance.boardConfidence = clamp(state.governance.boardConfidence + INCIDENTS.seriousConfidence.value, 0, 100);
      for (const m of state.members.list) if (m.status === 'active' && m.townId === f.townId) m.satisfaction = clamp(m.satisfaction + INCIDENTS.seriousSatisfaction.value, 0, 100);
      ctx.inbox({ kind: 'alert', title: `Serious accident at ${f.name}`, body: text });
    }
  }
}

export function stepPeople(ctx: TickContext): void {
  const { state, mi } = ctx;
  const p = state.people;
  p.needed = rolesNeeded(state);
  for (const line of deliverSearches(state)) ctx.inbox({ kind: 'memo', title: 'Candidates ready', body: `${line} Interview them on the People screen.` });
  p.candidates = p.candidates.filter((c) => c.expiresMonth >= mi);
  const kept: Leader[] = [];
  for (const l of p.leaders) {
    const x = leaderMonth(ctx, l);
    if (x) kept.push(x);
  }
  p.leaders = kept;
  payLeaders(ctx);
  workforce(ctx);
  // Vacant roles the co-op needs eat the GM's time.
  const vacant = p.needed.filter((r) => !holder(state, r)).length;
  state.governance.politicalCapital = Math.max(0, state.governance.politicalCapital - Math.round(vacant * PEOPLE.vacancyCapitalDrain.value));
  // Marketing: member relations nudge satisfaction.
  const drift = effect(state, 'members.satisfaction') + techFactor(state, 'satisfaction');
  if (drift !== 0) for (const m of state.members.list) if (m.status === 'active' && m.kind === 'member') m.satisfaction = clamp(m.satisfaction + drift, 0, 100);
}
