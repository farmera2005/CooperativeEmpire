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
import type { GameState, Member } from '../types';
import { subscribeStock } from './demographics';

const M = MEMBERSHIP;

/** The business lines the co-op is in now: grain if an elevator runs, and each open farm-supply division. */
export function offeredLines(s: GameState): Set<string> {
  const out = new Set<string>();
  for (const f of s.coop.facilities) {
    if (f.status !== 'operating') continue;
    if (f.division === 'GRAIN') ['GRAIN_CORN', 'GRAIN_SOY', 'GRAIN_WHEAT'].forEach((k) => out.add(k));
    else if (f.division !== 'RETAIL' && f.division !== 'CORP') out.add(f.division);
  }
  return out;
}

/**
 * Average share of a farm's business that comes to us, over the lines it actually buys or sells
 * and that we offer (D-117): a crop farm with no livestock is not counted against us for feed,
 * and a hog farm is not marked down because we have no feed mill.
 */
export function businessShare(m: Member, offered?: Set<string>): number {
  const crop = m.acres.corn + m.acres.soybeans + m.acres.wheat + m.acres.other;
  const head = m.livestock.hogs + m.livestock.dairy + m.livestock.beefCows + m.livestock.cattleOnFeed;
  const uses: Record<string, boolean> = {
    GRAIN_CORN: m.acres.corn > 0, GRAIN_SOY: m.acres.soybeans > 0, GRAIN_WHEAT: m.acres.wheat > 0,
    AGRONOMY: crop > 0, FEED: head > 0, ENERGY: true,
  };
  let sum = 0;
  let n = 0;
  for (const k of Object.keys(uses).sort()) {
    if (!uses[k] || (offered && !offered.has(k))) continue;
    sum += m.share[k] ?? 0;
    n++;
  }
  return n ? sum / n : 0;
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
  const offered = offeredLines(state);
  let joined = 0;
  let left = 0;
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const share = businessShare(m, offered);
    if (m.kind === 'nonmember') {
      if (m.satisfaction < M.joinSatisfactionMin.value || share < M.joinShareMin.value) continue;
      // The refund a customer forgoes grows with the business they already do with us (D-117).
      const stake = clamp(share / M.joinShareRef.value, 0, M.maxShareFactor);
      if (rng.chance(M.joinBase.value * stake * joinAppeal(m.satisfaction, refund, recruiting))) {
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
