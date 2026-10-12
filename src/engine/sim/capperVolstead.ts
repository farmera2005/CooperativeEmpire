// Capper-Volstead: a farmer co-op may not do more business with non-members than with members.

import { formatCents } from '../core/format';
import type { GameState } from '../types';
import type { TickContext } from './context';

export function capperVolsteadRatio(state: GameState): { member: number; nonmember: number; ratio: number } {
  let member = 0;
  let nonmember = 0;
  for (const v of Object.values(state.coop.patronageStats)) {
    member += v.member;
    nonmember += v.nonmember;
  }
  return { member, nonmember, ratio: member > 0 ? nonmember / member : nonmember > 0 ? Infinity : 0 };
}

/** Warn when fiscal-year non-member business passes member business (checked each quarter). */
export function stepCapperVolstead(ctx: TickContext): void {
  if (ctx.month % 3 !== 0) return;
  const cv = capperVolsteadRatio(ctx.state);
  if (cv.member > 0 && cv.nonmember > cv.member) {
    ctx.inbox({
      kind: 'alert', title: 'Non-member business exceeds member business',
      body: `So far this fiscal year the co-op has done ${formatCents(cv.nonmember)} of business with non-members against ${formatCents(cv.member)} with members. Counsel warns that a farmer cooperative that does more non-member than member business risks its Capper-Volstead protection. Sign up more members, or rely less on retail and non-member trade.`,
    });
  }
}
