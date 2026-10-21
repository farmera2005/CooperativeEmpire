// Grain division monthly operation (DESIGN §9.1).
//
// Order within the month:
//   1. prices; futures marked to market and carry credited on existing hedges
//   2. each farm's marketings this month (harvest + on-farm sales) and share of wallet
//   3. four weekly sub-steps per elevator: ship, receive against leg/dryer/space limits,
//      waits, breakdowns, turned-away bushels
//   4. purchases, delayed price, open storage, drying, shrink; farmers selling stored grain
//   5. sales by best route (rail or truck), freight, handling shrink, pile loss
//   6. hedges rebalanced, inventory and DP liability marked to market, margin deposits
//   7. fees, bond, report and margin breakdown

import { salesBoost } from '../people/sales';
import { formatCents } from '../core/format';
import { GOV_STORAGE } from '../../data/grain';
import { addGrievance } from '../members/grievances';
import { GRIEVANCES } from '../../data/tuning';
import { expectedRefundRate } from '../finance/selectors';
import { techFactor } from '../world/tech';
import {
  BU_PER_CAR, COMMODITIES, DRYING, FARM_HAUL_PER_MILE, FARM_YIELD_SD, FARMER_MARKETING, FEED_CORN_PER_HEAD, FEES,
  FACILITY_COSTS, HARVEST_CALENDAR, HEDGING, MAX_HAUL_MILES, ON_FARM_LARGE_BONUS, ON_FARM_SELL_SCHEDULE, ON_FARM_STORAGE,
  ON_FARM_WHEAT_FACTOR, ON_FARM_WHEAT_SCHEDULE, OPERATIONS, POSTURE_BID, RAIL_CARS_PER_MONTH, SATISFACTION, SHARE_MODEL,
  SHRINK, SHUTTLE_TRAIN_BU, WET_FALL_SHIFT, BASIS_NOISE_PERSISTENCE, BASIS_NOISE_SD, type Commodity,
} from '../../data/grain';
import type { SeriesId } from '../../data/markets';
import { valueAt } from '../../data/types';
import { CROSS_DIVISION } from '../../data/supply';
import { bd, type Breakdown } from '../core/breakdown';
import { monthOf, yearOf } from '../core/calendar';
import { hash128 } from '../core/rng';
import { roundCents } from '../core/money';
import { clamp } from '../core/math';
import { post } from '../ledger/ledger';
import { borrowingBase, lineDrawn, lineRate } from '../finance/lender';
import { addFyLine } from '../finance/defaults';
import { effect, holder } from '../people/leaders';
import { staffServicePenalty } from '../people/staff';
import { MISCONDUCT } from '../../data/people';
import { breakdownRisk, grainCapacity, isHarvestMonth, postBreakdownRepair } from '../facilities/facilities';
import type { TickContext } from '../sim/context';
import type { CommodityPosition, Facility, GameState, GrainCommodityMonth, GrainMonthReport, Member } from '../types';
import type { LoadoutType } from '../../data/facilities';
import { marketValue } from '../world/marketPath';
import {
  basisAppreciationNext, bestTruckSale, carryPerMonth, futuresPrice, grainCostIndex, localBasis, priceRatio, railSale, type SaleOption,
} from './prices';

export const GRAIN_LINE: Record<Commodity, string> = { corn: 'GRAIN_CORN', soybeans: 'GRAIN_SOY', wheat: 'GRAIN_WHEAT' };
const YIELD_SERIES: Record<Commodity, SeriesId> = { corn: 'yieldCorn', soybeans: 'yieldSoy', wheat: 'yieldWheat' };
const REPORT_HISTORY = 36;
const SUPPLY_KEYS = ['AGRONOMY', 'FEED', 'ENERGY'];
const HOURS_PER_WEEK = 24 * 7;

/** Share of a licensed house filled with government grain this year. */
export const govOccupancy = (year: number): number => valueAt(GOV_STORAGE.occupancy, year);

export function emptyPosition(): CommodityPosition {
  return { ownedBu: 0, book: 0, dpBu: 0, dpLiability: 0, openStorageBu: 0, shortBu: 0, lastFutures: 0 };
}

/** Fixed per-farm yield factor (deterministic from member id). */
function farmYieldFactor(id: number): number {
  const [a, b] = hash128(`yield|${id}`);
  const u1 = (a + 1) / 4294967297;
  const u2 = (b + 1) / 4294967297;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0.6, 1 + FARM_YIELD_SD.value * z);
}

/** Share of a crop harvested this month, with wet-fall delays. */
function harvestShare(c: Commodity, month: number, wetFall: boolean): number {
  const cal = HARVEST_CALENDAR[c].slice();
  if (wetFall && c !== 'wheat') {
    const s = WET_FALL_SHIFT.value;
    const oct = cal[9] * s.octToNov;
    cal[9] -= oct;
    cal[10] += oct;
    const nov = cal[10] * s.novToDec;
    cal[10] -= nov;
    cal[11] += nov;
  }
  return cal[month - 1];
}

function isCropHarvestMonth(c: Commodity, month: number): boolean {
  return HARVEST_CALENDAR[c][month - 1] > 0 || (c !== 'wheat' && month === 12);
}

interface Supplier {
  ours: { facility: Facility; dist: number }[];
  comps: { posture: number; service: number; dist: number }[];
}

function suppliersByTown(state: GameState, maxHaul: number): Supplier[] {
  const out: Supplier[] = state.world.towns.map(() => ({ ours: [], comps: [] }));
  const d = state.world.distances;
  for (const t of state.world.towns) {
    for (const f of state.coop.facilities) {
      if (f.status !== 'operating' || f.kind !== 'elevator') continue;
      const dist = d[t.id][f.townId];
      if (dist <= maxHaul) out[t.id].ours.push({ facility: f, dist });
    }
    for (const c of state.competitors) {
      if (c.status !== 'active') continue;
      for (const s of c.sites) {
        if ((s.division ?? 'GRAIN') !== 'GRAIN') continue;
        const dist = d[t.id][s.townId];
        if (dist <= maxHaul) out[t.id].comps.push({ posture: c.posture, service: c.service, dist });
      }
    }
  }
  return out;
}

interface FacilityFlow {
  /** Offered wet bushels this month by commodity: harvest (field-day timed) and steady. */
  harvest: Record<Commodity, number>;
  steady: Record<Commodity, number>;
  accepted: Record<Commodity, number>;
  acceptedHarvestCorn: number;
  turnedAway: Record<Commodity, number>;
  shipped: Record<Commodity, Record<string, number>>;
  maxWait: number;
  /** Volume-weighted wait (hours × bushels) to average over the month. */
  waitBu: number;
  handled: number;
}

const zero = (): Record<Commodity, number> => ({ corn: 0, soybeans: 0, wheat: 0 });

export function stepGrain(ctx: TickContext): void {
  const { state, path, mi } = ctx;
  const month = monthOf(mi);
  const year = yearOf(mi);
  const g = state.coop.grain;
  const pol = state.coop.grainPolicy;
  const idx = grainCostIndex(path, mi);
  const weather = state.world.weather;
  // People: the grain manager's merchandising and operations, and the crews' service.
  const merch = (effect(state, 'grain.basis') + techFactor(state, 'basis')) * idx;
  // Grain originators calling on farmers (D-109).
  const originators = salesBoost(state, 'GRAIN');
  const throughput = (1 + effect(state, 'grain.throughput')) * (1 - (state.people.workforce.GRAIN?.vacancy ?? 0));
  const crewPenalty = staffServicePenalty(state, 'GRAIN');
  const grainLead = holder(state, 'GRAIN');
  const operating = state.coop.facilities.filter((f) => f.status === 'operating' && f.kind === 'elevator');

  // ---- 1. prices, basis noise, futures MTM and carry on existing hedges ----
  const nrng = ctx.rng('grain.basis');
  const rho = BASIS_NOISE_PERSISTENCE.value;
  for (const c of COMMODITIES) g.basisNoise[c] = rho * (g.basisNoise[c] ?? 0) + Math.sqrt(1 - rho * rho) * BASIS_NOISE_SD.value * nrng.normal();
  const F = {} as Record<Commodity, number>;
  const local = {} as Record<Commodity, number>;
  const ourBid = {} as Record<Commodity, number>;
  const carry = {} as Record<Commodity, number>;
  for (const c of COMMODITIES) {
    F[c] = futuresPrice(path, c, mi);
    local[c] = localBasis(state, c, mi, idx);
    ourBid[c] = local[c] + POSTURE_BID.value[pol.posture] * idx;
    carry[c] = carryPerMonth(path, c, mi, idx);
  }
  const hedgeResult = zero();
  for (const c of COMMODITIES) {
    const p = g.pos[c];
    if (p.shortBu > 0 && p.lastFutures > 0) {
      const gain = roundCents(p.shortBu * (p.lastFutures - F[c] + carryPerMonth(path, c, mi - 1, grainCostIndex(path, mi - 1))) * 100);
      if (gain !== 0) {
        post(state, { source: 'grain-hedge', memo: `${c} futures: variation margin and carry`, lines: [{ account: '1310', division: 'GRAIN', amount: gain }, { account: '5000', division: 'GRAIN', amount: -gain }] });
        g.marginAccount += gain;
        hedgeResult[c] = gain;
      }
    }
  }

  // ---- 2. marketings and share of wallet ----
  const maxHaul = valueAt(MAX_HAUL_MILES, year);
  const sup = suppliersByTown(state, maxHaul);
  const flows = new Map<number, FacilityFlow>();
  for (const f of operating) flows.set(f.id, { harvest: zero(), steady: zero(), accepted: zero(), acceptedHarvestCorn: 0, turnedAway: zero(), shipped: { corn: {}, soybeans: {}, wheat: {} }, maxWait: 0, waitBu: 0, handled: 0 });
  const yields = {} as Record<Commodity, number>;
  const yieldsPrev = {} as Record<Commodity, number>;
  for (const c of COMMODITIES) {
    yields[c] = marketValue(path, YIELD_SERIES[c], mi);
    yieldsPrev[c] = marketValue(path, YIELD_SERIES[c], mi - 12);
  }
  const onFarmBase = valueAt(ON_FARM_STORAGE, year);
  const sm = SHARE_MODEL;
  const contracts = (pol.offerOpenStorage ? 1 : 0) + (pol.offerDelayedPrice ? 1 : 0) + (pol.offerForward ? 1 : 0);
  const memberOffers: { m: Member; fid: number; c: Commodity; bu: number }[] = [];
  let marketTotal = 0;
  let offeredTotal = 0;
  const priceAdv: number[] = [];
  const posture = POSTURE_BID.value[pol.posture];
  // Members count on a patronage refund like last year's (2024 $/bu, valued on corn).
  const refundBu = (expectedRefundRate(state) * (F.corn + local.corn)) / idx;
  const refundPct = expectedRefundRate(state) * 100;

  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const s = sup[m.townId];
    // Utilities in 2024 $/bu, relative to the local market bid.
    const priceW = 0.5 + m.priceSens;
    let best: { facility: Facility; u: number; price: number } | null = null;
    const grievance = m.grievances.reduce((a, gr) => a + gr.severity * (gr.division === 'GRAIN' ? 1 : CROSS_DIVISION.grievanceSpillover.value), 0);
    // Farmers who already buy inputs from us lean toward delivering grain to us (cross-division bundling).
    let bundled = 0;
    for (const k of SUPPLY_KEYS) if ((m.share[k] ?? 0) > CROSS_DIVISION.bundleThreshold) bundled++;
    const bundleBonus = sm.bundle.value * Math.sqrt(bundled);
    for (const o of s.ours) {
      const price = posture - FARM_HAUL_PER_MILE.value * o.dist;
      const service = (sm.staffingService.value[o.facility.staffing.level] - crewPenalty + originators) * sm.serviceQuality.value
        - sm.waitPerHour.value * o.facility.grain.waitMemory;
      const u = priceW * price + service + contracts * sm.contractOffered.value
        + (m.kind === 'member' ? sm.loyalty.value * m.loyalty + refundBu : 0) - sm.grievance.value * grievance + bundleBonus;
      if (!best || u > best.u) best = { facility: o.facility, u, price };
    }
    let denom = 0;
    let bestComp = -Infinity;
    // Satisfaction judges our posted bid against rivals' posted bids. Distance shapes how much
    // a farmer uses us (the share model), not whether our prices are fair (D-082).
    let bestCompBid = 0;
    for (const o of s.comps) {
      const price = o.posture - FARM_HAUL_PER_MILE.value * o.dist;
      bestComp = Math.max(bestComp, price);
      bestCompBid = Math.max(bestCompBid, o.posture);
      denom += Math.exp(sm.theta.value * (priceW * price + o.service * sm.serviceQuality.value));
    }
    const big = m.sizeClass === 'large' || m.sizeClass === 'mega';
    const outside = big ? sm.outsideOptionLarge.value : sm.outsideOption.value;
    bestComp = Math.max(bestComp, outside);
    denom += Math.exp(sm.theta.value * priceW * outside);
    const target = best ? Math.exp(sm.theta.value * best.u) / (Math.exp(sm.theta.value * best.u) + denom) : 0;

    // Volumes this month.
    const onFarm = Math.min(0.95, onFarmBase + (big ? ON_FARM_LARGE_BONUS.value : 0));
    const feedCorn = (Object.keys(FEED_CORN_PER_HEAD.value) as (keyof typeof FEED_CORN_PER_HEAD.value)[]).reduce((a, k) => a + (m.livestock[k] ?? 0) * FEED_CORN_PER_HEAD.value[k], 0);
    const yf = farmYieldFactor(m.id);
    let anyBusiness = false;
    for (const c of COMMODITIES) {
      const line = GRAIN_LINE[c];
      const prev = m.share[line] ?? 0;
      const lam = target > prev ? sm.inertiaUp.value : sm.inertiaDown.value;
      const share = prev + lam * (target - prev);
      m.share[line] = share;
      const acres = m.acres[c];
      if (acres <= 0) continue;
      const of = c === 'wheat' ? onFarm * ON_FARM_WHEAT_FACTOR.value : onFarm;
      const prodNow = acres * yields[c] * yf - (c === 'corn' ? feedCorn : 0);
      let harvestBu = 0;
      let steadyBu = 0;
      const hs = harvestShare(c, month, weather.wetFall);
      if (hs > 0) harvestBu = Math.max(0, prodNow) * hs * (1 - of);
      if (c === 'wheat') steadyBu = Math.max(0, prodNow) * of * ON_FARM_WHEAT_SCHEDULE[month - 1];
      else {
        const prod = month <= 8 ? acres * yieldsPrev[c] * yf - (c === 'corn' ? feedCorn : 0) : Math.max(0, prodNow);
        steadyBu = Math.max(0, prod) * of * ON_FARM_SELL_SCHEDULE[month - 1];
      }
      const total = (harvestBu + steadyBu) * m.weight;
      marketTotal += total;
      if (!best || total <= 0) continue;
      const toUs = total * share;
      if (toUs <= 0) continue;
      anyBusiness = true;
      const fl = flows.get(best.facility.id)!;
      fl.harvest[c] += harvestBu * m.weight * share;
      fl.steady[c] += steadyBu * m.weight * share;
      memberOffers.push({ m, fid: best.facility.id, c, bu: toUs });
      offeredTotal += toUs;
    }
    // Satisfaction: price/service experience for those who do business with us.
    if (best && anyBusiness) {
      priceAdv.push(best.price - Math.max(bestComp, -1));
      const adv = posture - bestCompBid;
      const exp = clamp(50 + SATISFACTION.pricePerDollar.value * adv - SATISFACTION.waitPerHour.value * best.facility.grain.waitMemory - SATISFACTION.grievancePerSeverity.value * grievance
        + (m.kind === 'member' ? SATISFACTION.loyaltyBonus.value * m.loyalty + SATISFACTION.refundPerPct.value * refundPct : 0), 0, 100);
      // Members who do little grain business with us form their opinion slowly.
      const share = m.share[GRAIN_LINE.corn] ?? 0;
      m.satisfaction += SATISFACTION.alpha.value * clamp(0.25 + share, 0.25, 1) * (exp - m.satisfaction);
    } else if (!SUPPLY_KEYS.some((k) => (m.share[k] ?? 0) > 0.02)) {
      // No business with us at all: opinions fade toward neutral (farm-supply customers are judged there).
      m.satisfaction += (SATISFACTION.alpha.value / 3) * (50 - m.satisfaction);
    }
  }

  // ---- 3. weekly sub-steps per elevator ----
  const op = OPERATIONS;
  const fdays = weather.fieldDays;
  const fdTot = fdays.reduce((a, b) => a + b, 0);
  const weekHarvestShare = fdays.map((d) => (fdTot > 0 ? d / fdTot : 0.25));
  const moisturePts = Math.max(0, weather.harvestMoisture - DRYING.baseMoisture.value);
  const shipPlan = new Map<number, Record<Commodity, number>>();
  const brng = ctx.rng('grain.breakdown');
  for (const f of operating) {
    const fl = flows.get(f.id)!;
    const cap = grainCapacity(f.components);
    // Government grain under storage agreement takes its share of the house (D-095).
    const space = cap.storageBu * (1 - govOccupancy(year)) + cap.pileBu;
    const shipCaps = shipCapacities(state, f, mi);
    // Monthly merchandising plan: how much owned grain to move. A merchandiser short of credit
    // (little room left on the line, or over it) sells rather than storing for carry (D-089).
    const fin = state.coop.finance;
    const limit = Math.min(fin.lineCommitment, borrowingBase(state));
    const creditTight = fin.overLimit || limit - lineDrawn(state) < limit * HEDGING.creditTightShare.value;
    const plan = zero();
    for (const c of COMMODITIES) {
      const p = g.pos[c];
      const physicalTotal = p.ownedBu + p.openStorageBu;
      const ownedHere = physicalTotal > 0 ? f.grain.bu[c] * (p.ownedBu / physicalTotal) : 0;
      if (ownedHere <= 0) continue;
      const value = F[c] + local[c];
      const holdGain = carry[c] + basisAppreciationNext(c, mi, idx) - (value * lineRate(state)) / 100 / 12;
      const thresh = HEDGING.carryAppetiteThreshold.value[pol.carryAppetite] * idx;
      const preHarvest = c === 'wheat' ? month === 5 || month === 6 : month === 8 || month === 9;
      if (holdGain < thresh || preHarvest || creditTight) plan[c] = ownedHere;
    }
    shipPlan.set(f.id, plan);
    const remainingShip = { rail: shipCaps.railBu, truck: shipCaps.truckBu };
    for (let w = 0; w < 4; w++) {
      if (isHarvestMonth(mi) && f.grain.downWeeks <= 0 && brng.chance(FACILITY_COSTS.breakdownWeekly.value * breakdownRisk(f))) {
        f.grain.downWeeks = 1;
        const bill = postBreakdownRepair(ctx, f);
        ctx.inbox({ kind: 'alert', title: `Breakdown at ${f.name}`, body: `The leg at ${f.name} is down for repairs this week. Trucks are being turned away. Emergency repairs: ${formatCents(bill)}.${f.maintenance === 'preventive' ? '' : ' A preventive maintenance program makes breakdowns much rarer.'}` });
      }
      const down = f.grain.downWeeks > 0;
      if (down) f.grain.downWeeks -= 1;
      const offered = zero();
      let offeredAll = 0;
      for (const c of COMMODITIES) {
        offered[c] = fl.harvest[c] * weekHarvestShare[w] + fl.steady[c] / 4;
        offeredAll += offered[c];
      }
      // Ship first: planned sales plus whatever harvest needs to make room.
      const used = COMMODITIES.reduce((a, c) => a + f.grain.bu[c], 0);
      let free = space - used;
      const need = Math.max(0, offeredAll - free);
      for (const c of COMMODITIES) {
        const p = g.pos[c];
        const physicalTotal = p.ownedBu + p.openStorageBu;
        const ownedHere = physicalTotal > 0 ? f.grain.bu[c] * (p.ownedBu / physicalTotal) : 0;
        let want = Math.min(ownedHere, plan[c] / 4 + (need > 0 ? need * (f.grain.bu[c] / Math.max(1, used)) : 0));
        if (want <= 0) continue;
        // Rail first if it nets better, in whole trains for a shuttle.
        const rail = shipCaps.rail ? railSale(state, c, mi, idx, shipCaps.rail) : null;
        const truck = bestTruckSale(state, c, mi, idx, state.world.towns[f.townId]);
        const order: SaleOption[] = [rail, truck].filter((x): x is SaleOption => !!x).sort((a, b) => b.netBasis - a.netBasis);
        for (const opt of order) {
          if (want <= 0) break;
          const key = opt.mode === 'truck' ? 'truck' : 'rail';
          let q = Math.min(want, remainingShip[key] / (4 - w));
          // Shuttle trains load whole: ~400,000 bu inside the railroad's window.
          if (opt.mode === 'shuttle') q = Math.floor(Math.min(ownedHere, f.grain.bu[c], remainingShip.rail) / SHUTTLE_TRAIN_BU.value) * SHUTTLE_TRAIN_BU.value;
          q = Math.min(q, ownedHere, f.grain.bu[c]);
          if (q <= 0) continue;
          remainingShip[key] -= q;
          want -= q;
          f.grain.bu[c] -= q;
          fl.shipped[c][opt.mode] = (fl.shipped[c][opt.mode] ?? 0) + q;
          fl.handled += q;
          free += q;
        }
      }
      // Receive against leg, dryer and space limits.
      const legWeek = down ? 0 : cap.receiveBuHr * throughput * op.harvestHoursPerDay.value * op.harvestDaysPerWeek.value;
      const u = legWeek > 0 ? offeredAll / legWeek : offeredAll > 0 ? 9 : 0;
      const wait = u >= 1 ? op.maxWaitHours.value : (op.waitK.value * u) / (1 - u);
      if (offeredAll > 0) {
        fl.maxWait = Math.max(fl.maxWait, wait);
        fl.waitBu += wait * offeredAll;
      }
      let legLeft = legWeek;
      for (const c of COMMODITIES) {
        if (offered[c] <= 0) continue;
        let take = Math.min(offered[c], legLeft * (offered[c] / offeredAll), Math.max(0, free));
        let wetTake = 0;
        if (c === 'corn' && moisturePts > 0) {
          // Wet harvest corn is limited by the dryer plus a few hours of wet holding.
          const wetPart = fl.harvest.corn * weekHarvestShare[w];
          const dryLimit = cap.dryBuHr * HOURS_PER_WEEK + cap.receiveBuHr * op.wetHoldingHours.value;
          wetTake = Math.max(0, Math.min(wetPart, take, dryLimit));
          const dryTake = Math.max(0, Math.min(offered[c] - wetPart, take - wetTake));
          take = wetTake + dryTake;
          fl.acceptedHarvestCorn += wetTake;
        }
        take = Math.max(0, take);
        fl.accepted[c] += take;
        fl.turnedAway[c] += offered[c] - take;
        // Physical bushels after drying water loss.
        const physical = take - wetTake * DRYING.waterLossPerPoint.value * moisturePts;
        f.grain.bu[c] += physical;
        free -= physical;
        legLeft -= take;
        fl.handled += take;
      }
    }
    f.grain.seasonMaxWait = Math.max(f.grain.seasonMaxWait, fl.maxWait);
    f.grain.seasonTurnedAway += COMMODITIES.reduce((a, c) => a + fl.turnedAway[c], 0);
    f.grain.seasonWaitBu += fl.waitBu;
    f.grain.seasonOfferedBu += COMMODITIES.reduce((a, c) => a + fl.harvest[c] + fl.steady[c], 0);
    // Grievances for farmers who deliver here: long average waits and being turned away.
    const ta = COMMODITIES.reduce((a, c) => a + fl.turnedAway[c], 0);
    const off = COMMODITIES.reduce((a, c) => a + fl.harvest[c] + fl.steady[c], 0);
    const avgWait = off > 0 ? fl.waitBu / off : 0;
    const disaster = state.eventLog.some((e) => e.facilityId === f.id && (e.id === 'dustExplosion' || e.id === 'stormDamage') && mi - e.monthIndex <= 6);
    const severity = (Math.max(0, avgWait - op.waitGrievanceHours.value) * op.grievancePerWaitHour.value + (off > 0 ? (op.grievancePerTurnedAway.value * ta) / off : 0))
      * (disaster ? GRIEVANCES.disasterFactor.value : 1);
    if (severity > 0.05) {
      const seen = new Set<number>();
      for (const mo of memberOffers) {
        if (mo.fid !== f.id || seen.has(mo.m.id)) continue;
        seen.add(mo.m.id);
        addGrievance(mo.m, { kind: 'harvestWait', division: 'GRAIN', month: mi, severity: Math.round(severity * 100) / 100 });
      }
    }
  }

  // Member YTD volumes after capacity limits, and member vs non-member business (by value).
  const stats = state.coop.patronageStats.GRAIN;
  for (const mo of memberOffers) {
    const fl = flows.get(mo.fid)!;
    const off = fl.harvest[mo.c] + fl.steady[mo.c];
    const ratio = off > 0 ? fl.accepted[mo.c] / off : 0;
    const line = GRAIN_LINE[mo.c];
    const bu = mo.bu * ratio;
    mo.m.ytd[line] = (mo.m.ytd[line] ?? 0) + bu;
    const value = roundCents(bu * (F[mo.c] + ourBid[mo.c]) * 100);
    if (mo.m.kind === 'member') stats.member += value;
    else stats.nonmember += value;
    addFyLine(state.coop.equityProgram, line, bu, value, 0);
  }

  // ---- 4–7. accounting by commodity ----
  const report = {} as Record<Commodity, GrainCommodityMonth>;
  const comp = { sales: 0, purchases: 0, cogs: 0, freight: 0, hedge: 0, revalue: 0, shrink: 0, drying: 0, storage: 0, dryingCost: 0 };
  const harvestNow = (c: Commodity) => isCropHarvestMonth(c, month);
  const osShare = pol.offerOpenStorage ? clamp(FARMER_MARKETING.openStorageBase.value + FARMER_MARKETING.openStorageCarryBoost.value * Math.max(0, carry.corn / idx), 0, 0.6) : 0;
  let marginCall = 0;
  const hrng = ctx.rng('grain.hedge');
  for (const c of COMMODITIES) {
    const p = g.pos[c];
    const weak = priceRatio(path, c, mi) < 0.85;
    const dpShare = pol.offerDelayedPrice ? FARMER_MARKETING.dpBase.value + (weak ? FARMER_MARKETING.dpWeakPriceBoost.value : 0) : 0;
    let accepted = 0;
    let acceptedHarvest = 0;
    let turnedAway = 0;
    let offered = 0;
    for (const fl of flows.values()) {
      accepted += fl.accepted[c];
      turnedAway += fl.turnedAway[c];
      offered += fl.harvest[c] + fl.steady[c];
      acceptedHarvest += c === 'corn' ? fl.acceptedHarvestCorn : 0;
    }
    const cash = F[c] + ourBid[c];
    const market = F[c] + local[c];
    // Drying and shrink on harvest corn.
    let credited = accepted;
    if (c === 'corn' && acceptedHarvest > 0 && moisturePts > 0) {
      credited = accepted - acceptedHarvest * DRYING.shrinkFactorPerPoint.value * moisturePts;
      const physicalGain = acceptedHarvest * (DRYING.shrinkFactorPerPoint.value - DRYING.waterLossPerPoint.value) * moisturePts;
      const fee = roundCents(acceptedHarvest * moisturePts * FEES.dryingPerPoint.value * pol.dryingFee * idx * 100);
      const propane = marketValue(path, 'propane', mi);
      const cost = roundCents(acceptedHarvest * moisturePts * DRYING.propaneGalPerBuPoint.value * propane * 100);
      post(state, { source: 'grain-drying', memo: 'Drying charges and dryer fuel', lines: [
        { account: '1000', division: 'GRAIN', amount: fee - cost }, { account: '6000', division: 'GRAIN', amount: -fee }, { account: '7400', division: 'GRAIN', amount: cost },
      ] });
      comp.drying += fee;
      comp.dryingCost += cost;
      if (physicalGain > 0) {
        const v = roundCents(physicalGain * market * 100);
        p.ownedBu += physicalGain;
        p.book += v;
        post(state, { source: 'grain-shrink', memo: 'Moisture shrink gain', lines: [{ account: '1200', division: 'GRAIN', amount: v }, { account: '5000', division: 'GRAIN', amount: -v }] });
        comp.shrink += v;
      }
    }
    // Delivered bushels: open storage (harvest only), delayed price, spot purchase.
    const os = harvestNow(c) ? credited * osShare : 0;
    const dp = (credited - os) * dpShare;
    const spot = credited - os - dp;
    p.openStorageBu += os;
    let purchases = 0;
    if (spot > 0) {
      const v = roundCents(spot * cash * 100);
      p.ownedBu += spot;
      p.book += v;
      purchases += v;
      post(state, { source: 'grain-purchase', memo: `${c} purchased from farmers`, lines: [{ account: '1200', division: 'GRAIN', amount: v }, { account: '1000', division: 'GRAIN', amount: -v }] });
    }
    if (dp > 0) {
      const v = roundCents(dp * cash * 100);
      p.ownedBu += dp;
      p.book += v;
      p.dpBu += dp;
      p.dpLiability += v;
      post(state, { source: 'grain-dp', memo: `${c} received on delayed price`, lines: [{ account: '1200', division: 'GRAIN', amount: v }, { account: '2110', division: 'GRAIN', amount: -v }] });
    }
    // Farmers sell from open storage and price DP outside harvest.
    if (!harvestNow(c)) {
      const rate = FARMER_MARKETING.monthlySellRate.value;
      const x = p.openStorageBu * rate;
      if (x > 0) {
        const v = roundCents(x * cash * 100);
        p.openStorageBu -= x;
        p.ownedBu += x;
        p.book += v;
        purchases += v;
        post(state, { source: 'grain-purchase', memo: `${c} bought out of open storage`, lines: [{ account: '1200', division: 'GRAIN', amount: v }, { account: '1000', division: 'GRAIN', amount: -v }] });
      }
      const y = p.dpBu * rate;
      if (y > 0) {
        const pay = roundCents((p.dpLiability * y) / p.dpBu);
        p.dpBu -= y;
        p.dpLiability -= pay;
        post(state, { source: 'grain-dp-priced', memo: `${c} delayed price contracts priced and paid`, lines: [{ account: '2110', division: 'GRAIN', amount: pay }, { account: '1000', division: 'GRAIN', amount: -pay }] });
      }
    }
    comp.purchases += purchases;

    // Sales.
    let shipped = 0;
    let sales = 0;
    let freight = 0;
    const via: Record<string, number> = {};
    for (const f of operating) {
      const fl = flows.get(f.id)!;
      for (const [mode, q] of Object.entries(fl.shipped[c])) {
        if (q <= 0) continue;
        const opt = mode === 'truck' ? bestTruckSale(state, c, mi, idx, state.world.towns[f.townId]) : railSale(state, c, mi, idx, mode as Exclude<LoadoutType, 'truck'>);
        if (!opt) continue;
        shipped += q;
        via[mode] = (via[mode] ?? 0) + q;
        sales += roundCents(q * (F[c] + opt.grossBasis + merch) * 100);
        freight += roundCents(q * opt.freight * 100);
      }
    }
    shipped = Math.min(shipped, p.ownedBu);
    if (shipped > 0) {
      const cogs = p.ownedBu > 0 ? roundCents((p.book * shipped) / p.ownedBu) : 0;
      p.ownedBu -= shipped;
      p.book -= cogs;
      post(state, { source: 'grain-sale', memo: `${c} sold`, lines: [
        { account: '1000', division: 'GRAIN', amount: sales - freight }, { account: '4000', division: 'GRAIN', amount: -sales },
        { account: '5000', division: 'GRAIN', amount: cogs + freight }, { account: '1200', division: 'GRAIN', amount: -cogs },
      ] });
      // Handling shrink on what moved through the house.
      const lossBu = Math.min(p.ownedBu, shipped * SHRINK.handlingLoss.value * techFactor(state, 'shrink'));
      const lossV = p.ownedBu > 0 ? roundCents((p.book * lossBu) / p.ownedBu) : 0;
      p.ownedBu -= lossBu;
      p.book -= lossV;
      const physTot = operating.reduce((a, f) => a + f.grain.bu[c], 0);
      for (const f of operating) if (physTot > 0) f.grain.bu[c] = Math.max(0, f.grain.bu[c] - (lossBu * f.grain.bu[c]) / physTot);
      if (lossV) post(state, { source: 'grain-shrink', memo: 'Handling shrink', lines: [{ account: '5000', division: 'GRAIN', amount: lossV }, { account: '1200', division: 'GRAIN', amount: -lossV }] });
      comp.sales += sales;
      comp.cogs += cogs;
      comp.freight += freight;
      comp.shrink -= lossV;
    }
    // Ground-pile losses in wet months.
    if (SHRINK.pileWetMonths.includes(month)) {
      let pileBu = 0;
      for (const f of operating) {
        const cap = grainCapacity(f.components);
        const total = COMMODITIES.reduce((a, k) => a + f.grain.bu[k], 0);
        const onPile = Math.max(0, total - cap.storageBu) * (total > 0 ? f.grain.bu[c] / total : 0);
        const loss = onPile * SHRINK.pileMonthlyLossWet.value;
        f.grain.bu[c] -= loss;
        pileBu += loss;
      }
      const ownedLoss = Math.min(p.ownedBu, pileBu * (p.ownedBu / Math.max(1, p.ownedBu + p.openStorageBu)));
      if (ownedLoss > 0) {
        const v = roundCents((p.book * ownedLoss) / p.ownedBu);
        p.ownedBu -= ownedLoss;
        p.book -= v;
        if (v) post(state, { source: 'grain-shrink', memo: 'Ground pile shrink and spoilage', lines: [{ account: '5000', division: 'GRAIN', amount: v }, { account: '1200', division: 'GRAIN', amount: -v }] });
        comp.shrink -= v;
      }
    }
    if (p.ownedBu < 1e-6) {
      // Close out rounding residue.
      if (p.book !== 0) post(state, { source: 'grain-residue', memo: 'Close out inventory rounding', lines: [{ account: '5000', division: 'GRAIN', amount: p.book }, { account: '1200', division: 'GRAIN', amount: -p.book }] });
      comp.cogs += p.book;
      p.ownedBu = 0;
      p.book = 0;
    }

    // Hedge rebalance.
    const net = Math.max(0, p.ownedBu - p.dpBu);
    const contract = OPERATIONS.futuresContractBu.value;
    // A disciplined hedger halves slippage; a gunslinger shades hedges and may hide a position.
    const disciplined = grainLead?.traits.includes('disciplinedHedger');
    const gunslinger = grainLead?.traits.includes('gunslinger');
    const ratio = pol.hedgeRatio * (gunslinger ? 0.9 : 1) * (grainLead?.flags.hiddenPosition ? 1 - MISCONDUCT.hiddenPositionShare.value : 1);
    let target = ratio * net * (1 + HEDGING.slippageSd.value * (disciplined ? 0.5 : 1) * hrng.normal());
    if (disciplined) target = Math.max(target, net - pol.positionLimit[c]);
    p.shortBu = Math.max(0, Math.round(target / contract) * contract);
    p.lastFutures = F[c];
    const openPos = net - p.shortBu;
    const overLimit = Math.abs(openPos) > pol.positionLimit[c];

    // Mark inventory and DP liability to market.
    const invTarget = roundCents(p.ownedBu * market * 100);
    const invAdj = invTarget - p.book;
    if (invAdj !== 0) {
      post(state, { source: 'grain-mtm', memo: `${c} inventory marked to market`, lines: [{ account: '1200', division: 'GRAIN', amount: invAdj }, { account: '5000', division: 'GRAIN', amount: -invAdj }] });
      p.book = invTarget;
      comp.revalue += invAdj;
    }
    const dpTarget = roundCents(p.dpBu * cash * 100);
    const dpAdj = dpTarget - p.dpLiability;
    if (dpAdj !== 0) {
      post(state, { source: 'grain-mtm', memo: `${c} delayed-price liability marked to market`, lines: [{ account: '5000', division: 'GRAIN', amount: dpAdj }, { account: '2110', division: 'GRAIN', amount: -dpAdj }] });
      p.dpLiability = dpTarget;
      comp.revalue -= dpAdj;
    }
    comp.hedge += hedgeResult[c];

    // Fees.
    const storageFee = roundCents(p.openStorageBu * FEES.storagePerMonth.value * pol.storageFee * idx * 100) + roundCents(p.dpBu * FEES.dpPerMonth.value * idx * 100);
    if (storageFee > 0) {
      post(state, { source: 'grain-fees', memo: `${c} storage and DP service charges`, lines: [{ account: '1000', division: 'GRAIN', amount: storageFee }, { account: '6000', division: 'GRAIN', amount: -storageFee }] });
      comp.storage += storageFee;
    }
    const obligations = p.dpLiability + roundCents(p.openStorageBu * cash * 100);
    const bond = roundCents((obligations * FACILITY_COSTS.bondAndIndemnityRate.value) / 12);
    if (bond > 0) post(state, { source: 'grain-bond', memo: 'Warehouse bond and indemnity assessment', lines: [{ account: '7300', division: 'GRAIN', amount: bond }, { account: '1000', division: 'GRAIN', amount: -bond }] });

    const bestSale = Math.max(...operating.map((f) => {
      const t = bestTruckSale(state, c, mi, idx, state.world.towns[f.townId])?.netBasis ?? -Infinity;
      const caps = shipCapacities(state, f, mi);
      return Math.max(t, caps.rail ? railSale(state, c, mi, idx, caps.rail).netBasis : -Infinity);
    }), -Infinity);
    report[c] = {
      futures: F[c], localBasis: local[c], ourBid: ourBid[c], bestSaleNet: Number.isFinite(bestSale) ? bestSale : local[c], carry: carry[c],
      offeredBu: offered, receivedBu: accepted, turnedAwayBu: turnedAway, purchasedBu: spot, shippedBu: shipped, shippedVia: via,
      salesCents: sales, openPositionBu: openPos, overLimit,
    };
  }

  // Electricity for handling.
  const handled = [...flows.values()].reduce((a, fl) => a + fl.handled, 0);
  const elec = roundCents(handled * DRYING.electricityPerBu.value * idx * 100);
  if (elec > 0) post(state, { source: 'grain-utilities', memo: 'Elevator electricity', lines: [{ account: '7400', division: 'GRAIN', amount: elec }, { account: '1000', division: 'GRAIN', amount: -elec }] });

  // Margin deposits.
  let required = 0;
  for (const c of COMMODITIES) required += roundCents(g.pos[c].shortBu * F[c] * HEDGING.marginRate.value * 100);
  if (g.marginAccount < required) {
    const dep = required - g.marginAccount;
    post(state, { source: 'grain-margin', memo: 'Margin call: deposit to futures account', lines: [{ account: '1310', division: 'GRAIN', amount: dep }, { account: '1000', division: 'GRAIN', amount: -dep }] });
    g.marginAccount += dep;
    marginCall = dep;
  } else if (g.marginAccount > required * HEDGING.marginExcessTrigger.value) {
    const wd = g.marginAccount - Math.round(required * HEDGING.marginExcessTarget.value);
    post(state, { source: 'grain-margin', memo: 'Withdraw excess margin', lines: [{ account: '1000', division: 'GRAIN', amount: wd }, { account: '1310', division: 'GRAIN', amount: -wd }] });
    g.marginAccount -= wd;
  }

  // Wait memory: blend this harvest's worst wait into farmers' memory each December.
  if (month === 12) {
    for (const f of state.coop.facilities) {
      // Farmers remember the typical wait (volume-weighted) and being turned away, not one bad week.
      const avg = f.grain.seasonOfferedBu > 0 ? f.grain.seasonWaitBu / f.grain.seasonOfferedBu : 0;
      const turned = f.grain.seasonOfferedBu > 0 ? f.grain.seasonTurnedAway / f.grain.seasonOfferedBu : 0;
      const felt = avg + turned * OPERATIONS.turnedAwayWaitEquivalent.value;
      f.grain.waitMemory = (1 - OPERATIONS.waitMemoryWeight.value) * f.grain.waitMemory + OPERATIONS.waitMemoryWeight.value * felt;
      f.grain.seasonMaxWait = 0;
      f.grain.seasonTurnedAway = 0;
      f.grain.seasonWaitBu = 0;
      f.grain.seasonOfferedBu = 0;
    }
  }

  // Grievances fade.
  const decay = 1 - 1 / SHARE_MODEL.grievanceDecayMonths.value;
  for (const m of state.members.list) {
    if (!m.grievances.length) continue;
    for (const gr of m.grievances) gr.severity *= decay;
    m.grievances = m.grievances.filter((gr) => gr.severity > 0.05);
  }

  const maxWait = Math.max(0, ...[...flows.values()].map((fl) => fl.maxWait));
  // Storage paid on government grain held under federal agreement (D-095).
  const occ = govOccupancy(year);
  if (occ > 0) {
    for (const f of operating) {
      const fee = roundCents((grainCapacity(f.components).storageBu * occ * GOV_STORAGE.ratePerYear.value * idx * 100) / 12);
      if (fee <= 0) continue;
      post(state, { source: 'gov-storage', memo: `Government grain storage, ${f.name}`, lines: [{ account: '1000', division: 'GRAIN', amount: fee }, { account: '6000', division: 'GRAIN', amount: -fee }] });
      comp.storage += fee;
    }
  }

  // Matches the ledger: sales − (book cost of grain sold + freight − hedge results − revaluation − shrink).
  const gm = comp.sales - comp.cogs - comp.freight + comp.hedge + comp.revalue + comp.shrink;
  const breakdown: Breakdown = bd('grain.margin', 'Grain gross margin + service income', 0, [
    bd('sales', 'Grain sales (at destination)', comp.sales, undefined, undefined, 'cents'),
    bd('cogs', 'Carrying value of grain sold', -comp.cogs, undefined, `Farmers were paid ${'$'}${Math.round(comp.purchases / 100).toLocaleString('en-US')} for grain bought this month`, 'cents'),
    bd('freight', 'Freight to buyers', -comp.freight, undefined, undefined, 'cents'),
    bd('hedge', 'Futures results and carry', comp.hedge, undefined, 'Gains on short hedges when prices fall, plus carry earned on hedged storage', 'cents'),
    bd('revalue', 'Inventory & DP marked to market', comp.revalue, undefined, 'Change in value of owned grain at the local bid; offsets hedge results when hedged', 'cents'),
    bd('shrink', 'Shrink gain / loss', comp.shrink, undefined, undefined, 'cents'),
    bd('drying', 'Drying charges', comp.drying, undefined, undefined, 'cents'),
    bd('storage', 'Storage, DP and government storage income', comp.storage, undefined, undefined, 'cents'),
  ], 'Cost of grain sold includes the change in inventory value, so the margin shows up as grain moves and as basis and carry improve.', 'cents');
  breakdown.value = gm + comp.drying + comp.storage;
  const rep: GrainMonthReport = { monthIndex: mi, byCommodity: report, maxWaitHours: maxWait, grossMargin: breakdown, marginCall };
  g.report = rep;
  g.reports = [...g.reports, rep].slice(-REPORT_HISTORY);
  ctx.summary.push(`Grain: received ${Math.round(COMMODITIES.reduce((a, c) => a + report[c].receivedBu, 0)).toLocaleString('en-US')} bu, shipped ${Math.round(COMMODITIES.reduce((a, c) => a + report[c].shippedBu, 0)).toLocaleString('en-US')} bu.`);
  state.coop.grainStats = { marketBu: marketTotal, offeredBu: offeredTotal, priceAdvantage: priceAdv.length ? priceAdv.reduce((a, b) => a + b, 0) / priceAdv.length : 0 };
}

export interface ShipCaps {
  truckBu: number;
  railBu: number;
  rail: Exclude<ReturnType<typeof grainCapacity>['loadout'], 'truck'> | null;
}

/** Monthly shipping capacity by mode for an elevator. */
export function shipCapacities(state: GameState, f: Facility, mi: number): ShipCaps {
  const cap = grainCapacity(f.components);
  const hours = isHarvestMonth(mi) ? OPERATIONS.shipHoursPerMonth.value.harvest : OPERATIONS.shipHoursPerMonth.value.normal;
  const town = state.world.towns[f.townId];
  const onRail = town.railLineIds.some((id) => state.world.rail[id]?.status === 'active');
  const rail = cap.loadout !== 'truck' && onRail ? cap.loadout : null;
  const railBu = rail ? RAIL_CARS_PER_MONTH[rail] * BU_PER_CAR.value.corn : 0;
  return { truckBu: cap.receiveBuHr * hours, railBu, rail };
}
