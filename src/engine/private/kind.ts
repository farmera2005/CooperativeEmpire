// Which kind of business this is (D-149). Kept free of other engine modules so the people,
// governance and finance code can ask without import cycles.

import { PRIVATE } from '../../data/private';
import type { GameState, Member } from '../types';

export const isPrivate = (s: GameState): boolean => s.setup.orgType === 'private';

/** A private company the player controls: no board, no review, no one to fire them. */
export const ownerRun = (s: GameState): boolean => isPrivate(s) && (s.privateCo?.playerStake ?? 0) >= 0.5;

/** Largest share of a farm's business in any line that we hold. */
export const topShare = (m: Member): number => Object.values(m.share).reduce((a, v) => Math.max(a, v ?? 0), 0);

/**
 * Farms the business really serves: active members of a co-op; for a private company, the
 * customers who do a good part of their business with us. Sizes the GM's job and the office.
 */
export function regularCustomers(s: GameState): number {
  if (!isPrivate(s)) return s.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
  return s.members.list.filter((m) => m.status === 'active' && topShare(m) >= PRIVATE.regularCustomerShare).length;
}

/** A farm that counts as ours: a member of the co-op, or a regular customer of the private company. */
export const isOurs = (s: GameState, m: Member): boolean => (isPrivate(s) ? topShare(m) >= PRIVATE.regularCustomerShare : m.kind === 'member');
