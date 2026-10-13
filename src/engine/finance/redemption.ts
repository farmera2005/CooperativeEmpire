// Equity redemption (DESIGN §11.5): an annual budget consumed by an ordered list of plans.
// Order within a plan: vintage, then member id. Nonqualified redemptions are deductible in
// the year paid.

import { REDEMPTION } from '../../data/finance';
import { yearOf } from '../core/calendar';
import { allocateCents, roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { GameState, Member, RedemptionSummary } from '../types';
import { liquidity } from './lender';

type Ledger = { q: Cents; nq: Cents; cash: Cents; discount: Cents };

/** Redeem `amount` of one member's vintage, taking qualified and nonqualified pro rata. */
function redeemVintage(state: GameState, memberId: number, fy: number, amount: Cents, discountPct: number, acc: Ledger): Cents {
  const v = state.equity.allocated[memberId];
  const cur = v?.[fy];
  if (!cur) return 0;
  const held = cur[0] + cur[1];
  const take = Math.min(amount, held);
  if (take <= 0) return 0;
  const q = held > 0 ? roundCents((take * cur[0]) / held) : 0;
  const nq = take - q;
  v[fy] = [cur[0] - q, cur[1] - nq];
  if (v[fy][0] === 0 && v[fy][1] === 0) delete v[fy];
  if (Object.keys(v).length === 0) delete state.equity.allocated[memberId];
  const discount = roundCents(take * discountPct);
  acc.q += q;
  acc.nq += nq;
  acc.cash += take - discount;
  acc.discount += discount;
  return take - discount;
}

function memberTotal(state: GameState, id: number): Cents {
  const v = state.equity.allocated[id];
  if (!v) return 0;
  let t = 0;
  for (const fy in v) t += v[fy][0] + v[fy][1];
  return t;
}

/** Redeem a member's whole balance (oldest vintage first) within the remaining budget. */
function redeemMember(state: GameState, m: Member, budget: Cents, discountPct: number, acc: Ledger): Cents {
  const v = state.equity.allocated[m.id];
  if (!v) return 0;
  let paid = 0;
  for (const fy of Object.keys(v).map(Number).sort((a, b) => a - b)) {
    const cur = v[fy];
    if (!cur) continue;
    const full = cur[0] + cur[1];
    const affordable = Math.floor((budget - paid) / Math.max(1e-9, 1 - discountPct));
    const take = Math.min(full, Math.max(0, affordable));
    if (take <= 0) break;
    paid += redeemVintage(state, m.id, fy, take, discountPct, acc);
  }
  return paid;
}

export function redemptionBudget(state: GameState): Cents {
  const pol = state.coop.equityProgram.redemption;
  const last = state.coop.equityProgram.history[state.coop.equityProgram.history.length - 1];
  const savings = last ? Math.max(0, last.savingsBeforeTax - last.tax) : 0;
  return Math.max(0, pol.budgetFixed + roundCents(savings * pol.budgetPctOfSavings));
}

export function runRedemptions(ctx: TickContext): RedemptionSummary {
  const { state } = ctx;
  const out: RedemptionSummary = { estate: 0, age: 0, revolving: 0, pool: 0, base: 0, discount: 0, nonqualified: 0, total: 0, budget: 0 };
  const status = state.coop.finance.status;
  let budget = redemptionBudget(state);
  if (status === 'specialCredit' || status === 'forcedAction') budget = 0;
  // The board won't borrow beyond half of what the line has left to redeem equity.
  budget = Math.min(budget, Math.max(0, roundCents(liquidity(state) * 0.5)));
  out.budget = budget;
  if (budget <= 0) return out;
  const acc: Ledger = { q: 0, nq: 0, cash: 0, discount: 0 };
  const year = yearOf(ctx.mi);
  const holders = () => state.members.list.filter((m) => state.equity.allocated[m.id]).sort((a, b) => a.id - b.id);
  let left = budget;

  for (const plan of state.coop.equityProgram.redemption.plans) {
    if (left <= 0) break;
    const before = acc.cash;
    switch (plan.kind) {
      case 'estate':
        for (const m of holders()) {
          if (m.status !== 'deceased' || left <= 0) continue;
          left -= redeemMember(state, m, left, plan.discountPct, acc);
        }
        out.estate += acc.cash - before;
        break;
      case 'ageOfPatron':
        for (const m of holders()) {
          if (m.status === 'deceased' || year - m.birthYear < plan.age || left <= 0) continue;
          left -= redeemMember(state, m, left, 0, acc);
        }
        out.age += acc.cash - before;
        break;
      case 'revolving': {
        const vintages = new Set<number>();
        for (const id in state.equity.allocated) for (const fy in state.equity.allocated[id]) vintages.add(Number(fy));
        for (const fy of [...vintages].sort((a, b) => a - b)) {
          if (left <= 0) break;
          const hs = holders().filter((m) => state.equity.allocated[m.id]?.[fy]);
          const amts = hs.map((m) => state.equity.allocated[m.id][fy][0] + state.equity.allocated[m.id][fy][1]);
          const total = amts.reduce((s, a) => s + a, 0);
          const parts = total <= left ? amts : allocateCents(left, amts);
          hs.forEach((m, i) => (left -= redeemVintage(state, m.id, fy, parts[i], 0, acc)));
        }
        out.revolving += acc.cash - before;
        break;
      }
      case 'percentagePool': {
        const entries: { id: number; fy: number; amt: Cents }[] = [];
        for (const m of holders()) for (const fy of Object.keys(state.equity.allocated[m.id]).map(Number).sort((a, b) => a - b)) {
          const c = state.equity.allocated[m.id][fy];
          entries.push({ id: m.id, fy, amt: c[0] + c[1] });
        }
        const total = entries.reduce((s, e) => s + e.amt, 0);
        if (total <= 0) break;
        const parts = total <= left ? entries.map((e) => e.amt) : allocateCents(left, entries.map((e) => e.amt));
        entries.forEach((e, i) => (left -= redeemVintage(state, e.id, e.fy, parts[i], 0, acc)));
        out.pool += acc.cash - before;
        break;
      }
      case 'baseCapital': {
        // Target: each member holds equity in proportion to their recent business.
        const hs = state.members.list.filter((m) => m.kind === 'member').sort((a, b) => a.id - b.id);
        const recent = (m: Member) => m.patronage.slice(-REDEMPTION.baseCapitalYears).reduce((s, p) => s + p.cents, 0);
        const totalRecent = hs.reduce((s, m) => s + recent(m), 0);
        let totalHeld = 0;
        for (const id in state.equity.allocated) totalHeld += memberTotal(state, Number(id));
        if (totalRecent <= 0 || totalHeld <= 0) break;
        const excess = hs.map((m) => Math.max(0, memberTotal(state, m.id) - (totalHeld * recent(m)) / totalRecent));
        const sumEx = excess.reduce((s, e) => s + e, 0);
        if (sumEx <= 0) break;
        const parts = allocateCents(Math.min(left, roundCents(sumEx)), excess);
        hs.forEach((m, i) => {
          if (parts[i] > 0) left -= redeemMember(state, m, parts[i], 0, acc);
        });
        out.base += acc.cash - before;
        break;
      }
    }
  }
  if (acc.q + acc.nq > 0) {
    post(state, {
      source: 'redemption', memo: 'Equity redemptions',
      lines: [
        { account: '3200', division: 'CORP', amount: acc.q },
        { account: '3300', division: 'CORP', amount: acc.nq },
        { account: '1000', division: 'CORP', amount: -acc.cash },
        { account: '3400', division: 'CORP', amount: -acc.discount },
      ],
    });
  }
  state.coop.equityProgram.nqRedeemedFY += acc.nq;
  out.discount = acc.discount;
  out.nonqualified = acc.nq;
  out.total = acc.cash;
  return out;
}
