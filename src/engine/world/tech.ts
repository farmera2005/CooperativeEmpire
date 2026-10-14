// Technology (DESIGN §17.3): adopt a technology for the co-op or its sites; adoption takes
// months (faster with a strong IT/innovation lead); effects apply in proportion to the sites
// covered.

import { TECH_ADDITIVE, TECHNOLOGIES, type TechDef, type TechEffectKey } from '../../data/events';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import { effect } from '../people/leaders';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { Facility, GameState, TechState } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { liquidity } from '../finance/lender';

export const emptyTech = (): TechState => ({ adopted: {}, pending: [] });

const TECH_LIFE_MONTHS = 84;

export const techById = (id: string): TechDef | undefined => TECHNOLOGIES.find((t) => t.id === id);

const sitesFor = (s: GameState, t: TechDef): Facility[] => (t.kinds ? s.coop.facilities.filter((f) => f.status === 'operating' && t.kinds!.includes(f.kind as never)) : []);

/** Sites not yet covered by a site-scoped technology (or [] for a co-op-wide one). */
export function uncoveredSites(s: GameState, t: TechDef): Facility[] {
  const covered = new Set([...(s.tech.adopted[t.id]?.sites ?? []), ...s.tech.pending.filter((p) => p.id === t.id).flatMap((p) => p.sites)]);
  return sitesFor(s, t).filter((f) => !covered.has(f.id));
}

export function techCost(s: GameState, t: TechDef): Cents {
  const n = t.kinds ? uncoveredSites(s, t).length : 1;
  return nominalCents(pathFor(s), s.clock.monthIndex, t.cost * n);
}

export function adoptTech(s: GameState, id: string): CommandMessage[] {
  const t = techById(id);
  if (!t) return [{ level: 'error', text: 'Unknown technology.' }];
  if (yearOf(s.clock.monthIndex) < t.firstYear) return [{ level: 'error', text: `${t.name} is not available until ${t.firstYear}.` }];
  const sites = uncoveredSites(s, t);
  if (t.kinds && !sites.length) return [{ level: 'error', text: 'Every qualifying site already has it.' }];
  if (!t.kinds && (s.tech.adopted[id] || s.tech.pending.some((p) => p.id === id))) return [{ level: 'error', text: 'Already adopted.' }];
  const cost = techCost(s, t);
  if (cost > liquidity(s)) return [{ level: 'error', text: `Not enough cash and line of credit for ${formatCents(cost)}.` }];
  const months = Math.max(1, Math.round(t.adoptionMonths * (1 + effect(s, 'innovation.adoption'))));
  const targets = t.kinds ? sites.map((f) => f.id) : [-1];
  const per = targets.map((_, i) => roundCents(cost / targets.length) + (i === 0 ? cost - roundCents(cost / targets.length) * targets.length : 0));
  targets.forEach((fid, i) => {
    s.coop.assets.push({ id: s.coop.nextId++, facilityId: fid, label: t.name, account: '1520', cost: per[i], accumDep: 0, lifeMonths: TECH_LIFE_MONTHS, startMonth: s.clock.monthIndex });
  });
  const lines = targets.map((fid, i) => ({ account: '1520', division: fid < 0 ? 'CORP' as const : s.coop.facilities.find((f) => f.id === fid)!.division, amount: per[i] }));
  post(s, { source: 'technology', memo: `Adopt ${t.name}`, lines: [...lines, { account: '1000', division: 'CORP', amount: -cost }] });
  s.tech = { ...s.tech, pending: [...s.tech.pending, { id, completeMonth: s.clock.monthIndex + months, sites: t.kinds ? targets : [] }] };
  return [{ level: 'info', text: `${t.name}: ${formatCents(cost)}, in service in about ${months} month${months > 1 ? 's' : ''}.` }];
}

export function stepTech(ctx: TickContext): void {
  const { state, mi } = ctx;
  const done = state.tech.pending.filter((p) => p.completeMonth <= mi);
  if (!done.length) return;
  const adopted = { ...state.tech.adopted };
  for (const p of done) {
    const cur = adopted[p.id];
    adopted[p.id] = { month: cur?.month ?? mi, sites: [...(cur?.sites ?? []), ...p.sites] };
    const t = techById(p.id)!;
    ctx.inbox({ kind: 'memo', title: `${t.name} in service`, body: `${t.description}` });
  }
  state.tech = { adopted, pending: state.tech.pending.filter((p) => p.completeMonth > mi) };
}

/**
 * Combined effect of adopted technologies on a key: a multiplier (1 = none) for most keys,
 * an addition (0 = none) for TECH_ADDITIVE keys. Site-scoped technologies count in
 * proportion to the qualifying sites covered.
 */
export function techFactor(s: GameState, key: TechEffectKey): number {
  const additive = TECH_ADDITIVE.includes(key);
  let v = additive ? 0 : 1;
  for (const [id, a] of Object.entries(s.tech.adopted)) {
    const t = techById(id);
    const x = t?.effects[key];
    if (!t || x === undefined) continue;
    let coverage = 1;
    if (t.kinds) {
      const sites = sitesFor(s, t);
      coverage = sites.length ? sites.filter((f) => a.sites.includes(f.id)).length / sites.length : 0;
    }
    if (additive) v += x * coverage;
    else v *= 1 + (x - 1) * coverage;
  }
  return v;
}

/** Coverage of a site by a site-scoped technology. */
export const siteHasTech = (s: GameState, id: string, facilityId: number): boolean => !!s.tech.adopted[id]?.sites.includes(facilityId);
