// Regulation (DESIGN §17.4): rules switch on by date or historical event, impose a
// compliance project per affected site with a deadline, ongoing costs, fines after the
// deadline, and for some rules the shutdown of non-compliant sites. Sites built after a rule
// takes effect meet it from the start; a game that starts after a rule took effect begins in
// compliance.

import { HISTORY } from '../../data/history';
import { REGULATIONS, type RegulationDef } from '../../data/events';
import { formatMonth, toMonthIndex, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { Facility, GameState, RegulationState } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { liquidity } from '../finance/lender';
import { eventMonth } from './drift';

export const emptyRegulation = (): RegulationState => ({ active: {}, compliant: {}, shut: {} });

const key = (r: RegulationDef, f: Facility) => `${r.id}:${f.id}`;

export function affectedSites(s: GameState, r: RegulationDef): Facility[] {
  return s.coop.facilities.filter((f) => f.status !== 'closed' && r.kinds.includes(f.kind as never) && (!r.component || (f.components[r.component as keyof typeof f.components] ?? 0) > 0));
}

export function deadlineOf(s: GameState, r: RegulationDef): number | null {
  const on = s.regulation.active[r.id];
  if (on === undefined) return null;
  return r.deadline ? toMonthIndex(r.deadline[0], r.deadline[1]) : on + r.deadlineMonths;
}

/** Is a site compliant (or exempt)? */
export function isCompliant(s: GameState, r: RegulationDef, f: Facility): boolean {
  if (r.compliancePerSite <= 0) return true;
  const on = s.regulation.active[r.id];
  if (on === undefined) return true;
  // A plant built once the rule is on the books is built to it.
  return !!s.regulation.compliant[key(r, f)] || f.builtYear >= (r.fromYear ?? yearOf(on));
}

export const complianceCost = (s: GameState, r: RegulationDef) => nominalCents(pathFor(s), s.clock.monthIndex, r.compliancePerSite);

export function comply(s: GameState, ruleId: string, facilityId: number): CommandMessage[] {
  const r = REGULATIONS.find((x) => x.id === ruleId);
  const f = s.coop.facilities.find((x) => x.id === facilityId);
  if (!r || !f || s.regulation.active[r.id] === undefined) return [{ level: 'error', text: 'Nothing to comply with.' }];
  if (isCompliant(s, r, f)) return [{ level: 'info', text: `${f.name} already complies.` }];
  const cost = complianceCost(s, r);
  if (cost > liquidity(s)) return [{ level: 'error', text: `Not enough cash and line of credit for ${formatCents(cost)}.` }];
  s.coop.assets.push({ id: s.coop.nextId++, facilityId: f.id, label: `${r.label} compliance`, account: '1510', cost, accumDep: 0, lifeMonths: 240, startMonth: s.clock.monthIndex });
  post(s, { source: 'compliance', memo: `${r.label}: ${f.name}`, lines: [{ account: '1510', division: f.division, amount: cost }, { account: '1000', division: 'CORP', amount: -cost }] });
  s.regulation = { ...s.regulation, compliant: { ...s.regulation.compliant, [key(r, f)]: true } };
  if (s.regulation.shut[key(r, f)] && f.status === 'mothballed') {
    f.status = 'operating';
    const shut = { ...s.regulation.shut };
    delete shut[key(r, f)];
    s.regulation = { ...s.regulation, shut };
  }
  return [{ level: 'info', text: `${f.name} brought into compliance with the ${r.label.toLowerCase()} for ${formatCents(cost)}.` }];
}

export function ruleActive(s: GameState, id: string): boolean {
  return s.regulation.active[id] !== undefined;
}

/** Is the rule's switch-on in the past relative to the game start (grandfathered compliance)? */
function predatesStart(s: GameState, r: RegulationDef): boolean {
  if (r.fromYear !== undefined) return r.fromYear < yearOf(s.clock.startMonth) || (r.fromYear === yearOf(s.clock.startMonth));
  const ev = HISTORY.find((h) => h.id === r.eventId);
  return !!ev && eventMonth(ev.id, s.drift) < s.clock.startMonth;
}

export function stepRegulation(ctx: TickContext): void {
  const { state, mi } = ctx;
  const year = yearOf(mi);
  for (const r of REGULATIONS) {
    if (state.regulation.active[r.id] !== undefined) continue;
    const on = r.fromYear !== undefined ? year >= r.fromYear : !!r.eventId && state.firedEvents.some((e) => e.id === r.eventId) || (!!r.eventId && predatesStart(state, r));
    if (!on) continue;
    const grandfathered = predatesStart(state, r);
    const compliant = { ...state.regulation.compliant };
    if (grandfathered) for (const f of affectedSites(state, r)) compliant[key(r, f)] = true;
    state.regulation = { ...state.regulation, active: { ...state.regulation.active, [r.id]: mi }, compliant };
    if (grandfathered) continue;
    const sites = affectedSites(state, r);
    const dl = deadlineOf(state, r)!;
    if (!sites.length) continue;
    ctx.inbox({
      kind: 'alert', title: `New rule: ${r.label}`,
      body: `${r.description}${r.compliancePerSite > 0 ? ` Our affected sites: ${sites.map((f) => f.name).join(', ')}. Compliance costs about ${formatCents(complianceCost(state, r))} per site; the deadline is ${formatMonth(dl)}. After that, fines of ${formatCents(nominalCents(ctx.path, mi, r.finePerMonth))} a month per site${r.closeAfterMonths ? `, and sites still out of compliance a year later must close` : ''}. See the Operations screen.` : ' Ongoing costs are added to the affected sites.'}`,
    });
  }
  // Ongoing costs, fines and shutdowns.
  const lines: { account: string; division: Facility['division']; amount: number; facilityId?: number }[] = [];
  for (const r of REGULATIONS) {
    const on = state.regulation.active[r.id];
    if (on === undefined) continue;
    const dl = deadlineOf(state, r)!;
    for (const f of affectedSites(state, r)) {
      if (f.status !== 'operating' && !state.regulation.shut[key(r, f)]) continue;
      if (r.opexPerMonth > 0 && f.status === 'operating') lines.push({ account: '7665', division: f.division, amount: nominalCents(ctx.path, mi, r.opexPerMonth), facilityId: f.id });
      if (isCompliant(state, r, f) || mi <= dl) continue;
      if (f.status === 'operating') lines.push({ account: '7665', division: f.division, amount: nominalCents(ctx.path, mi, r.finePerMonth), facilityId: f.id });
      if (mi === dl + 1) ctx.inbox({ kind: 'alert', title: `${f.name} is out of compliance`, body: `The ${r.label.toLowerCase()} deadline has passed and ${f.name} is not in compliance. Fines run every month until it is.` });
      if (r.closeAfterMonths !== undefined && mi >= dl + r.closeAfterMonths && f.status === 'operating') {
        f.status = 'mothballed';
        state.regulation = { ...state.regulation, shut: { ...state.regulation.shut, [key(r, f)]: true } };
        ctx.inbox({ kind: 'alert', title: `${f.name} shut down by regulators`, body: `${f.name} never met the ${r.label.toLowerCase()} and has been ordered closed until it does. Bring it into compliance on the Operations screen to reopen.` });
      }
    }
  }
  const total = lines.reduce((a, l) => a + l.amount, 0);
  if (total > 0) post(state, { source: 'regulation', memo: 'Regulatory compliance costs and fines', lines: [...lines, { account: '1000', division: 'CORP', amount: -total }] });
}
