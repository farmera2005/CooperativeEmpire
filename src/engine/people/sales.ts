// Sales force (D-109). The GM sets how many salespeople each business unit carries. They raise
// farmers' preference for us — with diminishing returns as coverage of the division's
// prospects fills in — scaled by the division manager's sales skill, and they recruit members.
// Their pay, benefits and expenses post monthly to the division.

import { PEOPLE, SALES_FORCE } from '../../data/people';
import { STAFF } from '../../data/grain';
import { DIVISION_CONFIG } from '../../data/supply';
import { clamp } from '../core/math';
import { roundCents } from '../core/money';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { GameState, OpDivision } from '../types';
import { nominalCents } from '../world/macro';
import { DIVISION_ROLE, effectiveSkill } from './leaders';

const S = SALES_FORCE;
export const SALES_DIVISIONS: OpDivision[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];

export const salesStaff = (s: GameState, d: OpDivision): number => s.coop.salesForce?.[d] ?? 0;

/**
 * The division's prospects (D-114): active farms within reach of one of its sites, and for feed
 * only those with livestock. A rep calls on growers who can buy from us, not the whole territory.
 */
function prospects(s: GameState, d: OpDivision): number {
  const reach = d === 'GRAIN' ? null : DIVISION_CONFIG[d].reachMiles;
  const towns = [...new Set(s.coop.facilities.filter((f) => f.division === d && f.status === 'operating').map((f) => f.townId))].sort((a, b) => a - b);
  const dist = s.world.distances;
  let n = 0;
  for (const m of s.members.list) {
    if (m.status !== 'active') continue;
    if (d === 'FEED' && m.livestock.hogs + m.livestock.dairy + m.livestock.beefCows + m.livestock.cattleOnFeed <= 0) continue;
    if (reach !== null && !towns.some((t) => dist[m.townId][t] <= reach)) continue;
    n++;
  }
  return n;
}

/** Coverage: how many reps there are per the prospects one rep can serve. */
export function salesCoverage(s: GameState, d: OpDivision): number {
  return (salesStaff(s, d) * S.customersPerRep.value) / Math.max(1, prospects(s, d));
}

/** Gain in farmers' preference for this division, in service-quality units. */
export function salesBoost(s: GameState, d: OpDivision): number {
  const reps = salesStaff(s, d);
  if (reps <= 0 || !s.coop.facilities.some((f) => f.division === d && f.status === 'operating')) return 0;
  const role = DIVISION_ROLE[d];
  const skill = role ? effectiveSkill(s, role, 'sales') : PEOPLE.baseSkill.value;
  const factor = clamp(1 + S.skillFactorPerPoint.value * (skill - 10), 0.5, 1.5);
  return S.maxBoost.value * (1 - Math.exp(-salesCoverage(s, d))) * factor;
}

/** Annual cost of the division's sales force (nominal cents). */
export function salesCost(s: GameState, d: OpDivision, path: TickContext['path'], mi: number): number {
  const reps = salesStaff(s, d);
  if (reps <= 0) return 0;
  return nominalCents(path, mi, reps * (S.wage2024.value[d] * (1 + STAFF.benefitsRate.value) + S.expense2024.value));
}

export function setSalesStaff(s: GameState, d: OpDivision, count: number): CommandMessage[] {
  if (!SALES_DIVISIONS.includes(d)) return [{ level: 'error', text: 'Unknown business unit.' }];
  const n = Math.round(count);
  if (!(n >= 0 && n <= S.maxReps)) return [{ level: 'error', text: `Between 0 and ${S.maxReps} salespeople.` }];
  s.coop.salesForce = { ...s.coop.salesForce, [d]: n };
  return [{ level: 'info', text: `${d[0]}${d.slice(1).toLowerCase()} sales force set to ${n}.` }];
}

/** Monthly pay, benefits and expenses. */
export function stepSalesForce(ctx: TickContext): void {
  const { state, path, mi } = ctx;
  for (const d of SALES_DIVISIONS) {
    const reps = salesStaff(state, d);
    if (reps <= 0) continue;
    const wages = nominalCents(path, mi, (reps * S.wage2024.value[d]) / 12);
    const benefits = roundCents(wages * STAFF.benefitsRate.value);
    const expense = nominalCents(path, mi, (reps * S.expense2024.value) / 12);
    post(state, {
      source: 'sales-force', memo: `${d} sales force (${reps})`,
      lines: [
        { account: '7000', division: d, amount: wages },
        { account: '7010', division: d, amount: benefits },
        { account: '7690', division: d, amount: expense },
        { account: '1000', division: d, amount: -(wages + benefits + expense) },
      ],
    });
  }
}
