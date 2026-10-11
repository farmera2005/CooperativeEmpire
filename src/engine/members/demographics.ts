// Member demographics and farm structure (DESIGN §7.3).
// Monthly: deaths. January: retirements, structural exits/consolidation, livestock trends,
// crop mix, size classes, record pruning.

import { REGIONS, SPECIES, type RegionDef } from '../../data/regions/eccb';
import { DEMOGRAPHICS, SETUP } from '../../data/tuning';
import { valueAt } from '../../data/types';
import { interpTable } from '../core/math';
import type { Rng } from '../core/rng';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { Member } from '../types';
import { nominalCents } from '../world/macro';
import { marketValue } from '../world/marketPath';
import { cropSplit, farmAcres, newFarmRecord, sizeClassOf, totalAcres } from './generate';

const monthlyMortality = (age: number): number => {
  const q = Math.min(1, DEMOGRAPHICS.mortalityA.value * Math.exp(DEMOGRAPHICS.mortalityB.value * age));
  return 1 - Math.pow(1 - q, 1 / 12);
};

export const isActiveFarm = (m: Member): boolean => m.status === 'active';

export function demographicsMonthly(ctx: TickContext): void {
  const { state } = ctx;
  const region = REGIONS[state.world.regionId];
  const rng = ctx.rng('members.death');
  const list = state.members.list;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const m = list[i];
    if (m.status !== 'active') continue;
    if (rng.next() < monthlyMortality(ctx.year - m.birthYear)) exitFarm(ctx, region, m, 'death', rng);
  }
  if (ctx.month === 1) januaryPass(ctx, region);
}

/** Remove a farm operator: successor takes over, or the land goes to neighbors. */
export function exitFarm(ctx: TickContext, region: RegionDef, m: Member, reason: 'death' | 'retire' | 'sell', rng: Rng): void {
  const { state } = ctx;
  m.status = reason === 'death' ? 'deceased' : 'retired';
  m.exitMonth = ctx.mi;
  const acresTotal = totalAcres(m);
  const hasSuccessor = acresTotal > 0 && rng.chance(DEMOGRAPHICS.successorProb.value);
  if (hasSuccessor) {
    const [a0, a1] = DEMOGRAPHICS.successorAge.value;
    const heir = newFarmRecord({
      rng, id: state.members.nextId++, region, year: ctx.year, monthIndex: ctx.mi,
      town: state.world.towns[m.townId], kind: m.kind, birthYear: ctx.year - rng.int(a0, a1), acresTotal, surname: m.name.split(' ').slice(1).join(' '),
    });
    heir.acres = { ...m.acres };
    heir.livestock = { ...m.livestock };
    heir.loyalty = Math.max(0, m.loyalty - 0.05 + 0.1 * rng.normal());
    heir.satisfaction = m.satisfaction;
    heir.relationship = { ...m.relationship };
    heir.successorOf = m.id;
    state.members.list.push(heir);
    if (heir.kind === 'member') {
      const parentStock = state.equity.commonStock[m.id] ?? 0;
      if (reason === 'death' && parentStock > 0) {
        // The estate's membership stock passes to the heir: a subledger transfer only.
        state.equity.commonStock[heir.id] = parentStock;
        delete state.equity.commonStock[m.id];
      } else subscribeStock(ctx, heir);
    }
  } else if (acresTotal > 0) {
    distributeAcres(ctx, m, rng);
  }
  for (const c of Object.keys(m.acres) as (keyof Member['acres'])[]) m.acres[c] = 0;
  for (const sp of SPECIES) m.livestock[sp] = 0;

  // Membership stock: a deceased member's estate is paid out at par; retirees keep theirs
  // until the equity program (M4) redeems it.
  const stock = state.equity.commonStock[m.id] ?? 0;
  if (reason === 'death' && stock > 0) {
    post(state, {
      source: 'estate-stock', memo: `Redeem membership stock, estate of ${m.name}`,
      lines: [{ account: '3000', division: 'CORP', amount: stock, memberId: m.id }, { account: '1000', division: 'CORP', amount: -stock }],
    });
    delete state.equity.commonStock[m.id];
  }
  if (m.isDirector) replaceDirector(ctx, m, rng);
}

function distributeAcres(ctx: TickContext, from: Member, rng: Rng): void {
  const list = ctx.state.members.list;
  const cand = list.filter((x) => x.status === 'active' && x.districtId === from.districtId && x.id !== from.id);
  if (!cand.length) return;
  const k = Math.min(cand.length, rng.int(DEMOGRAPHICS.acreRecipients[0], DEMOGRAPHICS.acreRecipients[1]));
  const chosen: Member[] = [];
  for (let i = 0; i < k; i++) {
    const pick = rng.weighted(cand.filter((c) => !chosen.includes(c)), (c) => (totalAcres(c) + 50) * (ctx.year - c.birthYear < 65 ? 1 : 0.3));
    chosen.push(pick);
  }
  const shares = chosen.map(() => rng.range(0.5, 1.5));
  const tot = shares.reduce((a, b) => a + b, 0);
  for (const c of Object.keys(from.acres) as (keyof Member['acres'])[]) {
    let left = from.acres[c];
    chosen.forEach((r, i) => {
      const give = i === chosen.length - 1 ? left : Math.round((from.acres[c] * shares[i]) / tot);
      r.acres[c] += give;
      left -= give;
    });
  }
}

function replaceDirector(ctx: TickContext, gone: Member, rng: Rng): void {
  const gov = ctx.state.governance;
  const seat = gov.directors.find((d) => d.memberId === gone.id);
  if (!seat) return;
  gone.isDirector = false;
  const pool = ctx.state.members.list.filter(
    (x) => x.status === 'active' && x.kind === 'member' && !x.isDirector && (seat.districtId === null || x.districtId === seat.districtId),
  );
  if (!pool.length) {
    gov.directors = gov.directors.filter((d) => d !== seat);
    return;
  }
  const pick = rng.weighted(pool, (p) => totalAcres(p) * (ctx.year - p.birthYear < 70 ? 1 : 0.1));
  pick.isDirector = true;
  seat.memberId = pick.id;
  seat.tenureYears = 0;
  ctx.inbox({ kind: 'memo', title: `Board vacancy filled: ${pick.name}`, body: `The board appointed ${pick.name} to fill the seat left by ${gone.name} until the next annual election.` });
}

function januaryPass(ctx: TickContext, region: RegionDef): void {
  const { state, year } = ctx;
  const rng = ctx.rng('members.january');
  const list = state.members.list;

  // Retirements.
  const retireTable = DEMOGRAPHICS.retirement.value;
  for (const m of list.slice()) {
    if (m.status !== 'active') continue;
    if (rng.chance(interpTable(retireTable, year - m.birthYear))) exitFarm(ctx, region, m, 'retire', rng);
  }

  // Structural consolidation toward the era's mean farm size.
  const active = list.filter(isActiveFarm);
  const acres = active.reduce((s, m) => s + totalAcres(m) * m.weight, 0);
  const farms = active.reduce((s, m) => s + m.weight, 0);
  const target = acres / valueAt(region.meanFarmAcres, year);
  const stress = incomeStress(ctx);
  let extra = Math.max(0, Math.min(farms - target, DEMOGRAPHICS.maxStructuralExitRate.value * farms));
  extra += stress * DEMOGRAPHICS.stressExitRate.value * farms;
  let toExit = Math.round(extra);
  const pool = active.slice();
  while (toExit-- > 0 && pool.length > 1) {
    const m = rng.weighted(pool, (x) => (1 / (totalAcres(x) + 40)) * (1 + Math.max(0, year - x.birthYear - 50) / 10));
    pool.splice(pool.indexOf(m), 1);
    exitFarm(ctx, region, m, 'sell', rng);
  }
  // Young entrants keep the farm count near the structural target (carved from the largest farms).
  const memberShare = active.filter((m) => m.kind === 'member').length / Math.max(1, active.length);
  if (farms < target) {
    const n = Math.round(Math.min(target - farms, DEMOGRAPHICS.entrantRate.value * farms));
    const bySize = list.filter(isActiveFarm).sort((p, q) => totalAcres(q) - totalAcres(p) || p.id - q.id);
    for (let i = 0; i < n && i < bySize.length; i++) {
      const donor = bySize[i];
      const size = Math.min(farmAcres(rng, region, year), Math.round(totalAcres(donor) * 0.3));
      if (size < 40) continue;
      const town = state.world.towns[donor.townId];
      const kind = rng.chance(memberShare) ? 'member' : 'nonmember';
      const entrant = newFarmRecord({ rng, id: state.members.nextId++, region, year, monthIndex: ctx.mi, town, kind, birthYear: year - rng.int(24, 35), acresTotal: size });
      const ratio = 1 - size / Math.max(1, totalAcres(donor));
      for (const c of Object.keys(donor.acres) as (keyof Member['acres'])[]) donor.acres[c] = Math.round(donor.acres[c] * ratio);
      list.push(entrant);
      if (kind === 'member') subscribeStock(ctx, entrant);
    }
  }

  // Crop mix, size class, urban creep.
  const creep = 1 - region.farmlandLossPerYear.value;
  for (const m of list) {
    if (m.status !== 'active') continue;
    const tot = Math.round(totalAcres(m) * creep);
    m.acres = cropSplit(rng, tot, region, year);
    m.sizeClass = sizeClassOf(tot, region);
  }

  // Livestock structure: match the era's share of farms with each enterprise and herd size.
  const act = list.filter(isActiveFarm);
  for (const def of region.livestock) {
    const sp = def.species;
    const targetShare = valueAt(def.farmShare, year);
    const withSp = act.filter((m) => m.livestock[sp] > 0);
    const excess = withSp.length - Math.round(targetShare * act.length);
    if (excess > 0) {
      withSp.sort((p, q) => p.livestock[sp] - q.livestock[sp] || p.id - q.id);
      for (let i = 0; i < excess; i++) {
        // Smallest herds exit first, with some randomness.
        const idx = Math.min(withSp.length - 1, Math.floor(rng.next() ** 2 * withSp.length));
        withSp[idx].livestock[sp] = 0;
        withSp.splice(idx, 1);
      }
    }
    const remaining = act.filter((m) => m.livestock[sp] > 0);
    if (remaining.length) {
      const avg = remaining.reduce((s, m) => s + m.livestock[sp], 0) / remaining.length;
      const ratio = valueAt(def.headPerFarm, year) / avg;
      for (const m of remaining) m.livestock[sp] = Math.max(1, Math.round(m.livestock[sp] * ratio));
    }
  }

  // Prune long-gone records that hold no equity.
  const cutoff = ctx.mi - DEMOGRAPHICS.pruneAfterMonths;
  const eq = state.equity;
  state.members.list = list.filter(
    (m) => m.status === 'active' || (m.exitMonth ?? ctx.mi) > cutoff || (eq.commonStock[m.id] ?? 0) > 0 || (eq.preferredStock[m.id] ?? 0) > 0 || !!eq.allocated[m.id] || m.isDirector,
  );
}

/** 0 in normal times; positive when real net farm income is well below its recent average. */
function incomeStress(ctx: TickContext): number {
  const mi = ctx.mi;
  const now = marketValue(ctx.path, 'netFarmIncome', mi) / marketValue(ctx.path, 'cpi', mi);
  let s = 0;
  for (let k = 1; k <= 10; k++) s += marketValue(ctx.path, 'netFarmIncome', mi - 12 * k) / marketValue(ctx.path, 'cpi', mi - 12 * k);
  const ratio = now / (s / 10);
  return Math.max(0, 0.85 - ratio);
}

/** A new member buys membership stock at par. */
export function subscribeStock(ctx: TickContext, m: Member): void {
  const par = nominalCents(ctx.path, ctx.mi, SETUP.membershipStockPar.value);
  if (par <= 0) return;
  ctx.state.equity.commonStock[m.id] = (ctx.state.equity.commonStock[m.id] ?? 0) + par;
  post(ctx.state, {
    source: 'member-stock', memo: `Membership stock, ${m.name}`,
    lines: [{ account: '1000', division: 'CORP', amount: par }, { account: '3000', division: 'CORP', amount: -par, memberId: m.id }],
  });
}
