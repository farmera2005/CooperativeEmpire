// Leaders and the skill → effect table (DESIGN §15.1–15.2). A role's effect comes from its
// holder's skill (with trait and morale adjustments). A role the co-op is too small to need
// is handled by location staff at a modest base skill. A needed role left vacant is covered
// by the GM at a lower skill, and the GM's time is drained.

import { EFFECTS, PEOPLE, ROLE_DEFS, ROLES, SKILLS, TRAITS, type EffectKey, type Role, type Skill, type TraitId } from '../../data/people';
import { yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { facilityFte } from '../facilities/facilities';
import { incomeStatement } from '../ledger/statements';
import { personName } from '../members/generate';
import type { DivisionId, GameState, Leader, PeopleState } from '../types';
import { nominalCents, pathFor, priceLevel } from '../world/macro';

export const ROLE_DIVISION: Partial<Record<Role, DivisionId>> = { GRAIN: 'GRAIN', AGRONOMY: 'AGRONOMY', FEED: 'FEED', ENERGY: 'ENERGY', RETAIL: 'RETAIL' };
export const DIVISION_ROLE: Partial<Record<DivisionId, Role>> = { GRAIN: 'GRAIN', AGRONOMY: 'AGRONOMY', FEED: 'FEED', ENERGY: 'ENERGY', RETAIL: 'RETAIL' };
export const roleDivision = (r: Role): DivisionId => ROLE_DIVISION[r] ?? 'CORP';

export function emptyPeople(): PeopleState {
  return { leaders: [], candidates: [], searches: [], nextId: 1, training: 'standard', needed: [], workforce: {}, incidents: [], notes: [], internalListed: {} };
}

export const holder = (s: GameState, role: Role): Leader | undefined => s.people.leaders.find((l) => l.role === role);

export function totalFte(s: GameState): number {
  return s.coop.facilities.filter((f) => f.status === 'operating').reduce((a, f) => a + facilityFte(f), 0);
}

/** Which roles the co-op's size calls for now. */
export function rolesNeeded(s: GameState): Role[] {
  const mi = s.clock.monthIndex;
  const year = yearOf(mi);
  const ops = s.coop.facilities.filter((f) => f.status === 'operating');
  const from = Math.max(s.ledger.firstMonth, mi - 11);
  const sales2024 = incomeStatement(s.ledger, from, mi).sales / 100 / priceLevel(pathFor(s), mi) * (12 / Math.max(1, mi - from + 1));
  const fte = totalFte(s);
  const members = s.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
  return ROLES.filter((r) => {
    const u = ROLE_DEFS[r].unlock;
    if (u.fromYear !== undefined && year < u.fromYear) return false;
    if (u.minSales2024 !== undefined && sales2024 < u.minSales2024) return false;
    if (u.minOperatingSites !== undefined && ops.length < u.minOperatingSites) return false;
    if (u.divisionSites !== undefined && ops.filter((f) => f.division === ROLE_DIVISION[r]).length < u.divisionSites) return false;
    if (u.minFte !== undefined && fte < u.minFte) return false;
    if (u.minMembers !== undefined && members < u.minMembers) return false;
    return true;
  });
}

export function traitSkill(l: Leader, skill: Skill): number {
  let v = l.skills[skill];
  for (const t of l.traits) v += TRAITS[t].skills?.[skill] ?? 0;
  return v;
}

/** The skill the co-op actually brings to a role this month. */
export function effectiveSkill(s: GameState, role: Role, skill: Skill): number {
  const l = holder(s, role);
  if (!l) return s.people.needed.includes(role) ? PEOPLE.vacantSkill.value : PEOPLE.baseSkill.value;
  const moraleAdj = clamp((l.morale - 60) / 40, -1, 1) - clamp((l.burnout - 50) / 50, 0, 1);
  return clamp(traitSkill(l, skill) + moraleAdj, 1, 22);
}

/** Value of an effect (0 at skill 10). `division` picks the division manager for division rows. */
export function effect(s: GameState, key: EffectKey, division?: DivisionId): number {
  const row = EFFECTS.find((e) => e.key === key);
  if (!row) return 0;
  const role: Role | undefined = row.role === 'division' ? (division ? DIVISION_ROLE[division] : undefined) : row.role;
  if (!role) return 0;
  const sk = effectiveSkill(s, role, row.skill);
  const coasting = holder(s, role)?.traits.includes('coasting') ? 0.8 : 1;
  return clamp(row.perPoint * (sk - 10) * coasting, row.min, row.max) + 0; // + 0 normalizes −0
}

const marketSalary = (s: GameState, role: Role) => nominalCents(pathFor(s), s.clock.monthIndex, ROLE_DEFS[role].salary);
export { marketSalary };

/** A range of width 2w that contains the truth at a random position. */
function rangeFor(rng: Rng, truth: number, width: number): [number, number] {
  const w = Math.round(2 * width);
  const lo = clamp(truth - rng.int(0, w), 1, truth);
  return [lo, clamp(lo + w, truth, 20)];
}

/** Narrow every revealed range to width 2w around the truth (never wider than it was). */
export function narrow(rng: Rng, l: Leader, width: number): void {
  for (const k of SKILLS) {
    const [lo, hi] = l.revealed[k];
    if (hi - lo <= Math.round(2 * width)) continue;
    const [nlo, nhi] = rangeFor(rng, l.skills[k], width);
    l.revealed[k] = [Math.max(lo, nlo), Math.min(hi, nhi)];
  }
}

export interface LeaderSpec {
  role: Role;
  /** Mean skill in the role's primary skills. */
  quality: number;
  sd: number;
  ageRange: [number, number];
  revealWidth: number;
  salaryFactor: number;
}

export function generateLeader(s: GameState, rng: Rng, id: number, spec: LeaderSpec): Leader {
  const year = yearOf(s.clock.monthIndex);
  const birthYear = year - rng.int(spec.ageRange[0], spec.ageRange[1]);
  const { name, female } = personName(rng, birthYear, year);
  const primary = ROLE_DEFS[spec.role].primary;
  const skills = {} as Record<Skill, number>;
  for (const k of SKILLS) {
    const mean = primary.includes(k) ? spec.quality : spec.quality - 2.5;
    skills[k] = clamp(Math.round(rng.normal(mean, spec.sd)), 1, 20);
  }
  const traits: TraitId[] = [];
  for (const [id2, t] of Object.entries(TRAITS) as [TraitId, (typeof TRAITS)[TraitId]][]) {
    if (t.roles && !t.roles.includes(spec.role)) continue;
    if (id2 === 'disciplinedHedger' && traits.includes('gunslinger')) continue;
    if (id2 === 'gunslinger' && traits.includes('disciplinedHedger')) continue;
    if (rng.chance(t.prob)) traits.push(id2);
    if (traits.length >= 2) break;
  }
  const [r0, r1] = PEOPLE.retireAgeRange;
  const age = year - birthYear;
  const retireAge = traits.includes('coasting') ? Math.max(age + 1, Math.min(r0, age + 3)) : rng.int(Math.max(r0, age + 2), Math.max(r1, age + 3));
  const revealed = {} as Record<Skill, [number, number]>;
  for (const k of SKILLS) revealed[k] = rangeFor(rng, skills[k], spec.revealWidth);
  return {
    id, name, female, birthYear, role: spec.role, skills, revealed, traits,
    salary: Math.round(marketSalary(s, spec.role) * spec.salaryFactor * rng.range(0.95, 1.08)),
    loyalty: rng.int(40, 70), ambition: rng.range(0.2, 0.9), morale: 65, burnout: 0, hiredMonth: s.clock.monthIndex, retireAge,
    bonusPlan: false, coachedMonth: null, flags: {},
  };
}
