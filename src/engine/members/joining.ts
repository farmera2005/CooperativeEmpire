// Non-member customers who do steady business and are satisfied join the co-op.

import { SATISFACTION } from '../../data/grain';
import type { TickContext } from '../sim/context';
import { subscribeStock } from './demographics';

export function stepJoining(ctx: TickContext): void {
  const rng = ctx.rng('members.join');
  for (const m of ctx.state.members.list) {
    if (m.kind !== 'nonmember' || m.status !== 'active' || m.satisfaction < 60) continue;
    const shares = Object.values(m.share);
    const avg = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
    if (avg < 0.3) continue;
    if (rng.chance(SATISFACTION.joinProb.value)) {
      m.kind = 'member';
      subscribeStock(ctx, m);
    }
  }
}
