// Monthly marketplace and competitor upkeep (M2: static competitors).

import { MARKETPLACE } from '../../data/grain';
import { generateOffers } from '../competitors/competitors';
import type { TickContext } from './context';

export function stepMarketplace(ctx: TickContext): void {
  const { state, mi, month, year } = ctx;
  const expired = state.coop.offers.filter((o) => o.expiresMonth < mi);
  if (expired.length) state.coop.offers = state.coop.offers.filter((o) => o.expiresMonth >= mi);
  if (month === 1) {
    for (const c of state.competitors) c.ownerAge += 1;
    const rng = ctx.rng('marketplace.offers');
    const [lo, hi] = MARKETPLACE.offersPerYear.value;
    const before = state.coop.offers.length;
    generateOffers(state, ctx.path, rng, rng.int(lo, hi), mi, year);
    const added = state.coop.offers.slice(before);
    for (const o of added) {
      ctx.inbox({ kind: 'memo', title: `Elevator for sale in ${state.world.towns[o.townId].name}`, body: `${o.sellerName} is offering the ${state.world.towns[o.townId].name} elevator. See Grain → Buy or build.` });
    }
  }
}
