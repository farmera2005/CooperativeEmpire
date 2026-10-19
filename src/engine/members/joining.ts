// Membership grows and shrinks with how well the co-op serves its customers (D-108). Non-member
// customers who do real business with us join when they are satisfied and expect a patronage
// refund worth having; members who are unhappy and have taken their business elsewhere resign,
// and the co-op redeems their membership stock at par.

import { SALES_FORCE } from '../../data/people';
import { MEMBERSHIP } from '../../data/tuning';
import { SALES_DIVISIONS, salesBoost } from '../people/sales';
import { clamp } from '../core/math';
import { expectedRefundRate } from '../finance/selectors';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { Member } from '../types';
import { subscribeStock } from './demographics';

const M = MEMBERSHIP;

/** Average share of a farm's business that comes to us, across the lines it buys or sells. */
export function businessShare(m: Member): number {
  const shares = Object.values(m.share);
  return shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
}

/** How attractive joining is to a customer: satisfaction and the refund they expect (0..maxAppeal). */
export function joinAppeal(satisfaction: number, refundRate: number, recruiting = 0): number {
  return clamp((satisfaction - 50) / 20 + 1 + M.refundAppealPerPoint.value * refundRate * 100 + recruiting, 0, M.maxAppeal);
}

export function stepJoining(ctx: TickContext): void {
  const { state, mi } = ctx;
  const rng = ctx.rng('members.join');
  const refund = expectedRefundRate(state);
  // Salespeople recruit members as they call on customers (D-109).
  const recruiting = SALES_FORCE.joinBoost.value * Math.max(0, ...SALES_DIVISIONS.map((d) => salesBoost(state, d)));
  const directors = new Set(state.governance.directors.map((d) => d.memberId));
  let joined = 0;
  let left = 0;
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const share = businessShare(m);
    if (m.kind === 'nonmember') {
      if (m.satisfaction < M.joinSatisfactionMin.value || share < M.joinShareMin.value) continue;
      if (rng.chance(M.joinBase.value * joinAppeal(m.satisfaction, refund, recruiting))) {
        m.kind = 'member';
        subscribeStock(ctx, m);
        joined++;
      }
    } else if (m.kind === 'member' && !directors.has(m.id)) {
      if (m.satisfaction >= M.leaveSatisfactionBelow.value || share >= M.leaveShareBelow.value) continue;
      const push = clamp((M.leaveSatisfactionBelow.value - m.satisfaction) / 10, 0, 3);
      if (!rng.chance(M.leaveBase.value * push)) continue;
      m.kind = 'nonmember';
      left++;
      const stock = state.equity.commonStock[m.id] ?? 0;
      if (stock > 0) {
        delete state.equity.commonStock[m.id];
        post(state, {
          source: 'member-resigns', memo: `Membership stock redeemed: ${m.name} resigned`,
          lines: [{ account: '3000', division: 'CORP', amount: stock, memberId: m.id }, { account: '1000', division: 'CORP', amount: -stock }],
        });
      }
    }
  }
  const flow = state.members.flow ?? [];
  state.members.flow = [...flow, { monthIndex: mi, joined, left }].slice(-24);
  if (left >= 3) ctx.summary.push(`${left} members resigned their membership this month.`);
}
