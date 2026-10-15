// Read-only views of the co-op's equity, patronage and lending position for the UI.

import { PATRONAGE_EXPECTATION, REDEMPTION } from '../../data/finance';
import { fiscalYearEnd, fiscalYearOf } from '../core/calendar';
import { clamp } from '../core/math';
import type { Cents } from '../core/money';
import { ratios } from '../ledger/ratios';
import { balanceSheet, incomeStatement } from '../ledger/statements';
import type { DistributionSummary, GameState, Member, PatronageProposal } from '../types';
import { covenantSet } from './covenants';
import { planDistribution } from './patronage';
import { redemptionBudget } from './redemption';

export interface EquityOverview {
  byVintage: { fy: number; qualified: Cents; nonqualified: Cents }[];
  totalAllocated: Cents;
  commonStock: Cents;
  /** Equity of retired, deceased or departed members plus vintages older than the target period. */
  unfunded: Cents;
  /** Age in years of the oldest vintage still outstanding. */
  revolvingPeriod: number;
  targetPeriod: number;
  /** Share of allocated equity held by members with no business in recent years. */
  inactiveShare: number;
  holders: number;
  redemptionBudget: Cents;
}

const active = (m: Member, fy: number) => m.status === 'active' && m.patronage.some((p) => p.fy > fy - REDEMPTION.inactiveYears);

export function equityOverview(state: GameState): EquityOverview {
  const fy = fiscalYearOf(state.clock.monthIndex, state.setup.fiscalYearEndMonth);
  const byFy = new Map<number, [Cents, Cents]>();
  const byId = new Map(state.members.list.map((m) => [m.id, m]));
  let total = 0;
  let inactive = 0;
  let unfunded = 0;
  let holders = 0;
  const target = REDEMPTION.targetRevolveYears.value;
  for (const id of Object.keys(state.equity.allocated).map(Number).sort((a, b) => a - b)) {
    const v = state.equity.allocated[id];
    const m = byId.get(id);
    let held = 0;
    for (const y of Object.keys(v).map(Number)) {
      const [q, nq] = v[y];
      const cur = byFy.get(y) ?? [0, 0];
      byFy.set(y, [cur[0] + q, cur[1] + nq]);
      held += q + nq;
      if (fy - y > target) unfunded += q + nq;
    }
    if (held <= 0) continue;
    holders++;
    total += held;
    if (!m || !active(m, fy)) {
      inactive += held;
      // Count inactive holders' younger vintages too (older ones were counted above).
      for (const y of Object.keys(v).map(Number)) if (fy - y <= target) unfunded += v[y][0] + v[y][1];
    }
  }
  const byVintage = [...byFy.entries()].sort((a, b) => a[0] - b[0]).map(([y, [q, nq]]) => ({ fy: y, qualified: q, nonqualified: nq }));
  let stock = 0;
  for (const id in state.equity.commonStock) stock += state.equity.commonStock[id];
  return {
    byVintage, totalAllocated: total, commonStock: stock, unfunded,
    revolvingPeriod: byVintage.length ? fy - byVintage[0].fy : 0, targetPeriod: target,
    inactiveShare: total > 0 ? inactive / total : 0, holders, redemptionBudget: redemptionBudget(state),
  };
}

export interface DistributionPreview {
  summary: DistributionSummary;
  /** Owner equity ratio after the cash patronage and tax leave. */
  equityRatioAfter: number;
  covenantMin: number;
  cashOut: Cents;
  errors: string[];
}

/** Preview the pending fiscal year's distribution under a proposal (for the builder). */
export function previewDistribution(state: GameState, proposal: PatronageProposal, errors: string[] = []): DistributionPreview | null {
  const r = state.coop.equityProgram.pending;
  if (!r) return null;
  const plan = planDistribution(state, r, proposal);
  const bs = balanceSheet(state.ledger, state.clock.monthIndex);
  const extraTax = plan.summary.tax - r.estimatedTax;
  const cashOut = plan.summary.cash + plan.summary.tax;
  const eqAfter = bs.totalEquity - plan.summary.cash - extraTax;
  const assetsAfter = bs.totalAssets - cashOut + r.estimatedTax;
  return { summary: plan.summary, equityRatioAfter: assetsAfter > 0 ? eqAfter / assetsAfter : 0, covenantMin: covenantSet(state).minEquityRatio, cashOut, errors };
}

export interface MemberStatement {
  member: Member;
  stock: Cents;
  vintages: { fy: number; qualified: Cents; nonqualified: Cents }[];
  total: Cents;
  patronage: { fy: number; cents: Cents }[];
}

export function memberStatement(state: GameState, id: number): MemberStatement | null {
  const m = state.members.list.find((x) => x.id === id);
  if (!m) return null;
  const v = state.equity.allocated[id] ?? {};
  const vintages = Object.keys(v).map(Number).sort((a, b) => a - b).map((fy) => ({ fy, qualified: v[fy][0], nonqualified: v[fy][1] }));
  return { member: m, stock: state.equity.commonStock[id] ?? 0, vintages, total: vintages.reduce((s, x) => s + x.qualified + x.nonqualified, 0), patronage: m.patronage };
}

/** Covenant headroom now (not a test; the lender tests at fiscal year end). */
export function covenantHeadroom(state: GameState) {
  const r = ratios(state);
  const c = covenantSet(state);
  return [
    { label: 'Current ratio', value: r.currentRatio, limit: c.minCurrentRatio, kind: 'min' as const },
    { label: 'Owner equity / total assets', value: r.ownerEquityPct, limit: c.minEquityRatio, kind: 'min' as const, pct: true },
    { label: 'Term debt / net fixed assets', value: r.termDebtToNetFixed, limit: c.maxTermDebtToFixed, kind: 'max' as const },
    { label: 'Debt service coverage', value: r.debtServiceCoverage, limit: c.minDebtService, kind: 'min' as const },
  ];
}

/**
 * The patronage refund members expect, as a share of sales: last distribution's cash plus
 * discounted retained equity, over that fiscal year's sales (D-083). Zero before any distribution.
 */
export function expectedRefundRate(s: GameState): number {
  const hist = s.coop.equityProgram.history;
  const h = hist[hist.length - 1];
  if (!h) return 0;
  const fye = fiscalYearEnd(h.fy, s.setup.fiscalYearEndMonth);
  const sales = incomeStatement(s.ledger, fye - 11, fye).sales;
  if (sales <= 0) return 0;
  const valued = h.cash + PATRONAGE_EXPECTATION.retainedValue.value * (h.qualified + h.nonqualified);
  return clamp(valued / sales, 0, PATRONAGE_EXPECTATION.maxRate.value);
}
