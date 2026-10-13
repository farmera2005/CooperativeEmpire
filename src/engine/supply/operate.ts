// Farm supply divisions, monthly (DESIGN §9.2–9.6). One engine runs agronomy, feed, energy
// and retail; division-specific hooks handle application capacity, fill programs, prepay
// and rebates (agronomy), mill capacity and toll milling (feed), delivery capacity, propane
// prebuy and supplier allocation (energy), and town traffic (retail).
//
// Order per division: share of wallet → demand and sales by line → capacity limits →
// purchases, inventory relief, LCM → prepay/prebuy → credit → report.

import type { ComponentId, FacilityKind } from '../../data/facilities';
import { DRYING } from '../../data/grain';
import { REGIONS } from '../../data/regions/eccb';
import {
  AGRONOMY_DEMAND, CROSS_DIVISION, CREDIT, DIVISION_CONFIG, ENERGY_DEMAND, FEED_DEMAND, FILL, LINES, LINES_BY_DIVISION, PREPAY,
  REBATES, RETAIL_DEMAND, SUPPLY_DIVISIONS, SUPPLY_SHARE, type LineId, type SupplyDivision,
} from '../../data/supply';
import { valueAt } from '../../data/types';
import { bd } from '../core/breakdown';
import { monthOf, yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { Facility, GameState, JournalLine, Member, SupplyBook, SupplyLineMonth, SupplyMonthReport, Town } from '../types';
import { grainCostIndex } from '../grain/prices';
import { priceLevel } from '../world/macro';
import { marketValue } from '../world/marketPath';
import { layerQty, lowerOfCostOrMarket, relieve } from './inventory';
import { linePrice, seriesRatio, type LinePrice } from './prices';
import { stepCredit } from './credit';
import { addFyLine } from '../finance/defaults';

const REPORT_HISTORY = 36;
const INVENTORY_ACCOUNT: Record<SupplyDivision, string> = { AGRONOMY: '1210', FEED: '1220', ENERGY: '1230', RETAIL: '1240' };
const SERVICE_LINES: LineId[] = ['APPLICATION', 'FEED_TOLL'];

const seasonShare = (id: LineId, month: number): number => {
  const s = LINES[id].season;
  const tot = s.reduce((a, b) => a + b, 0);
  return s[month - 1] / tot;
};

export const divisionOpen = (state: GameState, d: SupplyDivision): boolean => state.coop.facilities.some((f) => f.division === d && f.status === 'operating');

const cap = (facs: Facility[], id: ComponentId): number => facs.reduce((a, f) => a + (f.components[id] ?? 0), 0);

/** Annual demand per member, by line, in line units ($ lines in 2024 dollars). */
function memberAnnualDemand(m: Member, year: number, hdd: number, harvestMoisture: number, onFarmShare: number, cornYield: number): Partial<Record<LineId, number>> {
  const a = m.acres;
  const crop = a.corn + a.soybeans + a.wheat + a.other;
  const ad = AGRONOMY_DEMAND;
  const nLbs = valueAt(ad.nLbsPerAcreCorn, year);
  const cp = ad.cpPerAcre2024.value;
  const sd = ad.seedPerAcre2024.value;
  const pk = ad.pkTonsPerAcre.value;
  const cpIdx = valueAt(ad.cpRealIndex, year);
  const seedIdx = valueAt(ad.seedRealIndex, year);
  const fd = FEED_DEMAND.tonsPerHead.value;
  const manuf = valueAt(FEED_DEMAND.manufacturedShare, year);
  const ed = ENERGY_DEMAND;
  return {
    FERT_N: (a.corn * nLbs + a.wheat * nLbs * ad.wheatNShare.value) * ad.tonsPerLbN.value,
    FERT_PK: a.corn * pk.corn + a.soybeans * pk.soybeans + a.wheat * pk.wheat + a.other * pk.other,
    CROP_PROTECTION: (a.corn * cp.corn + a.soybeans * cp.soybeans + a.wheat * cp.wheat + a.other * cp.other) * cpIdx,
    SEED: (a.corn * sd.corn + a.soybeans * sd.soybeans + a.wheat * sd.wheat + a.other * sd.other) * seedIdx * ad.seedRetailShare.value,
    APPLICATION: crop * valueAt(ad.customShare, year) * ad.passesPerAcre.value,
    FEED_SWINE: m.livestock.hogs * fd.hogs * manuf,
    FEED_DAIRY: m.livestock.dairy * fd.dairy * manuf,
    FEED_BEEF: (m.livestock.beefCows * fd.beefCows + m.livestock.cattleOnFeed * fd.cattleOnFeed) * manuf,
    FUEL_DIESEL: crop * valueAt(ed.dieselPerAcre, year),
    FUEL_GAS: crop * valueAt(ed.gasolinePerAcre, year),
    // Heating (annualized from this month's degree days is handled per month below) + drying.
    PROPANE: hdd * ed.propanePerHdd.value + a.corn * cornYield * onFarmShare * Math.max(0, harvestMoisture - DRYING.baseMoisture.value) * ed.dryingGalPerBuPoint.value,
    LUBES: crop * ed.lubesPerAcre2024.value,
  };
}

interface Acc {
  demand: Partial<Record<LineId, number>>;
  /** Our sales by line before capacity limits, split member/nonmember (units). */
  ours: Partial<Record<LineId, number>>;
  memberUnits: Partial<Record<LineId, number>>;
  /** Our share of next spring's demand (for fills and prepay), annual units. */
  annualOurs: Partial<Record<LineId, number>>;
  shareSum: number;
  shareN: number;
  /** Who bought what (to apply capacity ratios and late-service grievances). */
  buyers: { m: Member; line: LineId; qty: number }[];
  propaneCustomers: number;
  avgDistance: number;
  distN: number;
}

const emptyAcc = (): Acc => ({ demand: {}, ours: {}, memberUnits: {}, annualOurs: {}, shareSum: 0, shareN: 0, buyers: [], propaneCustomers: 0, avgDistance: 0, distN: 0 });
const add = (o: Partial<Record<LineId, number>>, k: LineId, v: number) => (o[k] = (o[k] ?? 0) + v);

interface SupplierSite {
  ours: boolean;
  facility?: Facility;
  posture: number;
  service: number;
  townId: number;
  kind: FacilityKind;
}

function sitesFor(state: GameState, d: SupplyDivision, year: number): SupplierSite[] {
  const out: SupplierSite[] = [];
  for (const f of state.coop.facilities) if (f.division === d && f.status === 'operating') out.push({ ours: true, facility: f, posture: 0, service: 0, townId: f.townId, kind: f.kind });
  for (const c of state.competitors) {
    if (c.status !== 'active') continue;
    for (const s of c.sites) if (s.division === d && (s.arrivalYear ?? 0) <= year) out.push({ ours: false, posture: c.posture, service: c.service, townId: s.townId, kind: s.kind ?? 'agronomy' });
  }
  return out;
}

const STAFF_SERVICE = SUPPLY_SHARE.staffingService.value;
const SS = SUPPLY_SHARE;

export function stepSupply(ctx: TickContext): void {
  const { state, path, mi } = ctx;
  const month = monthOf(mi);
  const year = yearOf(mi);
  const pl = priceLevel(path, mi);
  // Per-unit supply margins (feed $/ton, fuel ¢/gal, application $/acre) moved between general
  // inflation and the grain cost index (D-036).
  const idx = (grainCostIndex(path, mi) + pl) / 2;
  const region = REGIONS[state.world.regionId];
  const hddNormalYear = region.hddNormals.value.reduce((a, b) => a + b, 0);
  const weather = state.world.weather;
  const onFarm = SUPPLY_SHARE.onFarmDryingShare.value;
  const cornYield = marketValue(path, 'yieldCorn', mi);

  // Which divisions each member already buys from us (for bundling).
  const bundled = (m: Member, except: string): number => {
    let n = 0;
    for (const k of ['GRAIN_CORN', 'AGRONOMY', 'FEED', 'ENERGY']) if (k !== except && (m.share[k] ?? 0) > CROSS_DIVISION.bundleThreshold) n++;
    return n;
  };
  const divisionsInTown = new Map<number, Set<string>>();
  for (const f of state.coop.facilities) {
    if (f.status !== 'operating') continue;
    if (!divisionsInTown.has(f.townId)) divisionsInTown.set(f.townId, new Set());
    divisionsInTown.get(f.townId)!.add(f.division);
  }

  for (const d of SUPPLY_DIVISIONS) {
    const book = state.coop.supply[d];
    const pol = state.coop.supplyPolicy[d];
    const cfg = DIVISION_CONFIG[d];
    const facs = state.coop.facilities.filter((f) => f.division === d && f.status === 'operating');
    const open = facs.length > 0;
    const lines = LINES_BY_DIVISION(d).filter((id) => (LINES[id].availableFrom ?? 0) <= year);
    const prices = {} as Record<LineId, LinePrice>;
    for (const id of lines) prices[id] = linePrice(state, path, id, mi, idx, pl, pol.posture);
    const acc = emptyAcc();
    const sites = sitesFor(state, d, year);
    const theta = cfg.thetaPerPct.value;
    const ourAdv = -cfg.posturePct.value[pol.posture];
    const lateMem = book.lateMemory;
    const creditU = CREDIT.utility.value[pol.credit];
    const dist = state.world.distances;

    if (d !== 'RETAIL') {
      for (const m of state.members.list) {
        if (m.status !== 'active') continue;
        // Share of wallet (D-029 generalized): utilities in % of price.
        let best: { u: number; site: SupplierSite; dist: number } | null = null;
        let denom = Math.exp(theta * cfg.outsideOption);
        const griev = m.grievances.reduce((a, g) => a + g.severity * (g.division === d ? 1 : CROSS_DIVISION.grievanceSpillover.value), 0);
        const nb = bundled(m, d);
        for (const s of sites) {
          const dd = dist[m.townId][s.townId];
          if (dd > cfg.reachMiles) continue;
          if (s.ours) {
            const f = s.facility!;
            const full = (divisionsInTown.get(f.townId)?.size ?? 0) >= 3 ? CROSS_DIVISION.fullServicePct.value : 0;
            const u = ourAdv * (0.5 + m.priceSens) - cfg.distancePctPerMile * dd
              + cfg.serviceQuality * (STAFF_SERVICE[f.staffing.level] - (d === 'AGRONOMY' ? lateMem * SS.lateServicePenalty.value : 0))
              + (m.kind === 'member' ? cfg.loyalty * m.loyalty : 0) + creditU * m.creditNeed
              + CROSS_DIVISION.bundlePct.value * Math.sqrt(nb) + full - griev * SS.grievancePct.value;
            if (!best || u > best.u) best = { u, site: s, dist: dd };
          } else {
            denom += Math.exp(theta * (s.posture * (0.5 + m.priceSens) - cfg.distancePctPerMile * dd + cfg.serviceQuality * s.service));
          }
        }
        const target = best ? Math.exp(theta * best.u) / (Math.exp(theta * best.u) + denom) : 0;
        const prev = m.share[d] ?? 0;
        const share = prev + (target > prev ? SS.inertiaUp.value : SS.inertiaDown.value) * (target - prev);
        m.share[d] = share;
        if (!best || share <= 0.001) continue;
        acc.shareSum += share;
        acc.shareN++;
        const hdd = weather.hdd;
        const annual = memberAnnualDemand(m, year, hddNormalYear, weather.harvestMoisture, onFarm, cornYield);
        for (const id of lines) {
          if (id === 'FEED_TOLL') continue;
          const a = (annual[id] ?? 0) * m.weight;
          if (a <= 0) continue;
          let qty: number;
          if (id === 'PROPANE') {
            // Heating follows this month's degree days; drying falls in the harvest months.
            const heat = hdd * ENERGY_DEMAND.propanePerHdd.value;
            const dryMonths = [9, 10, 11];
            const drying = dryMonths.includes(month) ? (annual.PROPANE! - hddNormalYear * ENERGY_DEMAND.propanePerHdd.value) / 3 : 0;
            qty = (heat + Math.max(0, drying)) * m.weight;
            acc.propaneCustomers += share * m.weight;
          } else qty = a * seasonShare(id, month);
          add(acc.demand, id, qty);
          add(acc.annualOurs, id, a * share);
          const ours = qty * share;
          add(acc.ours, id, ours);
          if (m.kind === 'member') add(acc.memberUnits, id, ours);
          if (ours > 0) acc.buyers.push({ m, line: id, qty: ours });
        }
        acc.avgDistance += best.dist;
        acc.distN++;
      }
      if (d === 'ENERGY') townEnergyDemand(ctx, sites, acc, book, ourAdv, theta, cfg.outsideOption, cfg.reachMiles, cfg.distancePctPerMile);
    } else {
      retailDemand(ctx, sites, acc, book, ourAdv, theta, cfg.outsideOption, cfg.reachMiles, cfg.distancePctPerMile);
    }

    // ---- capacity limits, toll milling and allocation ----
    const sold: Partial<Record<LineId, number>> = { ...acc.ours };
    const capacity: SupplyMonthReport['capacity'] = [];
    let lateShare = 0;
    if (d === 'AGRONOMY' && (acc.ours.APPLICATION ?? 0) > 0) {
      const rigs = cap(facs, 'applicator');
      const perDay = valueAt(AGRONOMY_DEMAND.acresPerRigDay, year);
      const days = weather.fieldDays.reduce((a, b) => a + b, 0);
      const capAcres = rigs * perDay * days;
      const booked = acc.ours.APPLICATION!;
      const done = Math.min(booked, capAcres);
      lateShare = booked > 0 ? (booked - done) / booked : 0;
      sold.APPLICATION = done;
      capacity.push({ label: 'Custom application', used: booked, available: capAcres, unit: 'acres' });
      if (lateShare > SS.lateTolerance.value) {
        const sev = lateShare * AGRONOMY_DEMAND.lateGrievance.value;
        const seen = new Set<number>();
        for (const b of acc.buyers) if (b.line === 'APPLICATION' && !seen.has(b.m.id)) {
          seen.add(b.m.id);
          b.m.grievances.push({ kind: 'lateApplication', division: 'AGRONOMY', month: mi, severity: Math.round(sev * 100) / 100 });
          if (b.m.grievances.length > 6) b.m.grievances.shift();
        }
      }
    }
    if (d === 'AGRONOMY') book.lateMemory = (1 - SS.lateMemoryWeight.value) * book.lateMemory + SS.lateMemoryWeight.value * lateShare * (sold.APPLICATION ? 1 : 0);
    if (d === 'FEED') {
      const millCap = cap(facs, 'feed-mill') / 12;
      const want = (['FEED_SWINE', 'FEED_DAIRY', 'FEED_BEEF'] as LineId[]).reduce((a, k) => a + (sold[k] ?? 0), 0);
      const ratio = want > millCap && want > 0 ? millCap / want : 1;
      for (const k of ['FEED_SWINE', 'FEED_DAIRY', 'FEED_BEEF'] as LineId[]) sold[k] = (sold[k] ?? 0) * ratio;
      // Toll milling for integrators uses spare capacity.
      const spare = Math.max(0, millCap - want * ratio);
      const tr = ctx.rng('supply.toll');
      if (book.toll && (!pol.tollMilling || tr.chance(FEED_DEMAND.tollCancelMonthly.value))) {
        if (pol.tollMilling) ctx.inbox({ kind: 'alert', title: 'Integrator pulls toll-milling contract', body: 'The integrator has moved its feed to its own mill. Our mill loses its biggest customer overnight.' });
        book.toll = null;
      } else if (!book.toll && pol.tollMilling && open && year >= FEED_DEMAND.tollFrom && spare > millCap * SS.tollSpareNeeded.value && tr.chance(SS.tollOfferMonthly.value)) {
        book.toll = { tonsPerMonth: Math.round(spare * FEED_DEMAND.tollSpareShare.value) };
        ctx.inbox({ kind: 'memo', title: 'Toll-milling contract signed', body: `An integrator will run about ${book.toll.tonsPerMonth.toLocaleString('en-US')} tons a month through our mill at a thin fee. It fills the mill, but one customer can leave at any time.` });
      }
      sold.FEED_TOLL = book.toll ? Math.min(book.toll.tonsPerMonth, spare) : 0;
      capacity.push({ label: 'Feed mill', used: want * ratio + (sold.FEED_TOLL ?? 0), available: millCap, unit: 'tons' });
    }
    if (d === 'ENERGY') {
      const trucks = cap(facs, 'fuel-truck');
      const truckCap = trucks * valueAt(ENERGY_DEMAND.truckGalPerMonth, year);
      const gal = (['FUEL_DIESEL', 'FUEL_GAS', 'PROPANE'] as LineId[]).reduce((a, k) => a + (sold[k] ?? 0), 0);
      const ratio = gal > truckCap && gal > 0 ? truckCap / gal : 1;
      for (const k of ['FUEL_DIESEL', 'FUEL_GAS', 'PROPANE'] as LineId[]) sold[k] = (sold[k] ?? 0) * ratio;
      capacity.push({ label: 'Delivery trucks', used: gal, available: truckCap, unit: 'gal' });
      if (seriesRatio(path, 'propane', mi) > ENERGY_DEMAND.shortageRatio.value) {
        sold.PROPANE = (sold.PROPANE ?? 0) * ENERGY_DEMAND.allocation.value;
        // Alert when allocation starts, not every month it lasts.
        if (open && (acc.ours.PROPANE ?? 0) > 0 && seriesRatio(path, 'propane', mi - 1) <= ENERGY_DEMAND.shortageRatio.value) ctx.inbox({ kind: 'alert', title: 'Propane supply on allocation', body: 'Our suppliers are allocating propane. We will be short of what customers need until supplies ease.' });
      }
    }
    if (d === 'AGRONOMY' && seriesRatio(path, 'anhydrous', mi) > ENERGY_DEMAND.shortageRatio.value) {
      sold.FERT_N = (sold.FERT_N ?? 0) * ENERGY_DEMAND.allocation.value;
    }
    if (!open) {
      for (const id of lines) sold[id] = 0;
      capacity.length = 0;
    }

    // ---- sales, inventory, postings ----
    const report: Partial<Record<LineId, SupplyLineMonth>> = {};
    const salesLines: JournalLine[] = [];
    let revenueTot = 0;
    let cogsTot = 0;
    let serviceTot = 0;
    let writeDown = 0;
    let rebates = 0;
    let memberRevenue = 0;
    const inv = INVENTORY_ACCOUNT[d];
    let prepayLeft = book.prepay;
    let creditSales = 0;
    let cashSales = 0;
    let harvestTerm = 0;
    let prepayUsed = 0;
    for (const id of lines) {
      const def = LINES[id];
      const p = prices[id];
      const q = sold[id] ?? 0;
      const demand = acc.demand[id] ?? 0;
      let revenue = roundCents(q * p.ours * 100);
      let cogs = 0;
      let fromPrepayLine = 0;
      // Propane prebuy gallons are delivered over the heating season at the contract price;
      // whatever is left is delivered in March.
      let prebuyDelivered = 0;
      if (id === 'PROPANE' && book.prebuyGal > 0 && [10, 11, 12, 1, 2, 3].includes(month) && q > 0) {
        const pg = month === 3 ? Math.min(book.prebuyGal, q) : Math.min(book.prebuyGal, q * ENERGY_DEMAND.prebuyShare.value * SUPPLY_SHARE.prebuyDeliveryPace.value);
        prebuyDelivered = pg;
        const pv = roundCents(pg * book.prebuyPrice * 100);
        revenue = revenue - roundCents(pg * p.ours * 100) + pv;
        book.prebuyGal -= pg;
        const fromPrepay = Math.min(pv, prepayLeft);
        prepayLeft -= fromPrepay;
        prepayUsed += fromPrepay;
        fromPrepayLine = fromPrepay;
      }
      if (def.inventory === 'position' && q > 0) {
        const layers = (book.inventory[id] ??= []);
        // Propane in storage covers prebuy contracts; other gallons are bought as delivered.
        const r = relieve(layers, id === 'PROPANE' ? prebuyDelivered : q);
        cogs += r.cost;
        const short = q - r.qty;
        if (short > 1e-9) cogs += roundCents(short * p.cost * 100);
        // Booked as: relieved inventory credited to the inventory account; hand-to-mouth paid in cash.
        if (r.cost) salesLines.push({ account: '5000', division: d, amount: r.cost }, { account: inv, division: d, amount: -r.cost });
        if (short > 1e-9) {
          const c = roundCents(short * p.cost * 100);
          salesLines.push({ account: '5000', division: d, amount: c }, { account: '1000', division: d, amount: -c });
        }
      } else if (!SERVICE_LINES.includes(id) && q > 0) {
        cogs = roundCents(q * p.cost * 100);
        salesLines.push({ account: '5000', division: d, amount: cogs }, { account: '1000', division: d, amount: -cogs });
      }
      // Revenue: from prepay first (agronomy spring inputs), then on account or cash.
      let rev = revenue - fromPrepayLine;
      if (d === 'AGRONOMY' && prepayLeft > 0 && rev > 0 && [3, 4, 5, 6].includes(month)) {
        const use = Math.min(prepayLeft, roundCents(rev * (1 - PREPAY.discountPct.value / 100)));
        // Prepaid product sells at the prepay discount.
        const discount = roundCents(use / (1 - PREPAY.discountPct.value / 100)) - use;
        revenue -= discount;
        rev = revenue - use;
        prepayLeft -= use;
        prepayUsed += use;
      }
      const credit = roundCents(rev * def.creditShare);
      const harvest = d === 'AGRONOMY' && [3, 4, 5, 6].includes(month) ? roundCents(credit * CREDIT.harvestTermsShare.value[pol.credit]) : 0;
      creditSales += credit - harvest;
      harvestTerm += harvest;
      cashSales += rev - credit;
      if (SERVICE_LINES.includes(id)) serviceTot += revenue;
      else revenueTot += revenue;
      cogsTot += cogs;
      const memberShare = q > 0 ? Math.min(1, (acc.memberUnits[id] ?? 0) / Math.max(1e-9, acc.ours[id] ?? 0)) : 0;
      memberRevenue += revenue * (d === 'RETAIL' ? retailMemberShare(state) : memberShare);
      report[id] = { demand, sold: q, unmet: Math.max(0, (acc.ours[id] ?? 0) - q), price: p.ours, cost: p.cost, revenue, cogs };
      // Rebates on crop protection, accrued by tier.
      if (id === 'CROP_PROTECTION' && revenue > 0) {
        book.rebateBase += revenue;
        const annual = (book.rebateBase / Math.max(1, monthsSinceOctober(month))) * 12 / pl;
        let rate = 0;
        for (const [min, r] of REBATES.tiers.value) if (annual >= min) rate = r;
        rebates += roundCents(revenue * rate);
      }
    }
    const revenueLines: JournalLine[] = [];
    if (cashSales) revenueLines.push({ account: '1000', division: d, amount: cashSales });
    if (creditSales) revenueLines.push({ account: '1100', division: d, amount: creditSales });
    if (harvestTerm) revenueLines.push({ account: '1100', division: d, amount: harvestTerm });
    if (prepayUsed) revenueLines.push({ account: '2130', division: d, amount: prepayUsed });
    if (revenueTot) revenueLines.push({ account: '4000', division: d, amount: -revenueTot });
    if (serviceTot) revenueLines.push({ account: '6000', division: d, amount: -serviceTot });
    if (revenueLines.length || salesLines.length) post(state, { source: `${d.toLowerCase()}-sales`, memo: `${d} sales and cost of goods`, lines: [...revenueLines, ...salesLines] });
    book.ar.current += creditSales;
    book.ar.harvest += harvestTerm;
    book.prepay -= prepayUsed;
    if (rebates > 0) {
      post(state, { source: 'rebates', memo: 'Manufacturer rebates earned', lines: [{ account: '1160', division: d, amount: rebates }, { account: '5000', division: d, amount: -rebates }] });
      book.rebatesAccrued += rebates;
    }
    if (month === REBATES.paidMonth && book.rebatesAccrued > 0) {
      post(state, { source: 'rebates', memo: 'Manufacturer rebate checks received', lines: [{ account: '1000', division: d, amount: book.rebatesAccrued }, { account: '1160', division: d, amount: -book.rebatesAccrued }] });
      book.rebatesAccrued = 0;
      book.rebateBase = 0;
    }

    // ---- fills and prebuy (position products) ----
    if (open) writeDown += fillAndPrebuy(ctx, d, book, facs, prices, acc, month);
    for (const id of lines) {
      if (LINES[id].inventory !== 'position') continue;
      const wd = lowerOfCostOrMarket(book.inventory[id] ?? [], prices[id].cost);
      if (wd > 0) {
        post(state, { source: 'inventory-lcm', memo: `${LINES[id].label}: write down to replacement cost`, lines: [{ account: '5000', division: d, amount: wd }, { account: inv, division: d, amount: -wd }] });
        writeDown += wd;
      }
    }

    // ---- variable operating costs: delivery, mill power, tank rent, prepay intake ----
    if (open) operatingExtras(ctx, d, book, sold, acc, idx, pl, month, prices);
    if (d === 'AGRONOMY' && open && pol.prepayProgram && PREPAY.months.includes(month)) {
      const springShare = [3, 4, 5, 6].reduce((a, m) => a + (['FERT_N', 'FERT_PK', 'CROP_PROTECTION', 'SEED'] as LineId[]).reduce((b, id) => b + (acc.annualOurs[id] ?? 0) * seasonShare(id, m) * prices[id].ours, 0), 0);
      const w = month === 12 ? PREPAY.decemberWeight.value : (1 - PREPAY.decemberWeight.value) / 2;
      const amt = roundCents(springShare * valueAt(PREPAY.share, year) * w * (1 - PREPAY.discountPct.value / 100) * 100);
      if (amt > 0) {
        post(state, { source: 'prepay', memo: 'Customer prepayments for spring inputs', lines: [{ account: '1000', division: d, amount: amt }, { account: '2130', division: d, amount: -amt }] });
        book.prepay += amt;
      }
    }

    // ---- credit ----
    const badDebt = stepCredit(ctx, d, book, pol);

    // ---- patronage tracking and member YTD ----
    const stats = state.coop.patronageStats[d];
    const totRev = revenueTot + serviceTot;
    stats.member += roundCents(memberRevenue);
    stats.nonmember += totRev - roundCents(memberRevenue);
    for (const id of Object.keys(report).sort() as LineId[]) {
      const ln = report[id]!;
      if (ln.sold > 0) addFyLine(state.coop.equityProgram, id, ln.sold, ln.revenue, ln.cogs);
    }
    for (const b of acc.buyers) {
      const ratio = (acc.ours[b.line] ?? 0) > 0 ? (sold[b.line] ?? 0) / acc.ours[b.line]! : 0;
      b.m.ytd[b.line] = (b.m.ytd[b.line] ?? 0) + b.qty * ratio;
    }

    const margin = bd(`${d}.margin`, `${d[0]}${d.slice(1).toLowerCase()} gross margin + service income`, revenueTot - cogsTot + rebates + serviceTot, [
      bd('sales', 'Sales', revenueTot, undefined, undefined, 'cents'),
      bd('cogs', 'Cost of goods sold', -(cogsTot), undefined, 'Inventory relieved at its (FIFO) cost, plus product bought as sold', 'cents'),
      bd('rebates', 'Manufacturer rebates', rebates, undefined, undefined, 'cents'),
      bd('writedown', 'Inventory written down to market', -writeDown, undefined, 'Lower of cost or market: product bought before a price drop loses value', 'cents'),
      bd('service', 'Service income (application, toll milling, tank rent, finance charges)', serviceTot, undefined, undefined, 'cents'),
    ], undefined, 'cents');
    margin.value = revenueTot - cogsTot + rebates - writeDown + serviceTot;
    const rep: SupplyMonthReport = { monthIndex: mi, lines: report, capacity, margin, badDebt, writeDown, share: acc.shareN ? acc.shareSum / acc.shareN : 0 };
    book.report = rep;
    book.reports = [...book.reports, rep].slice(-REPORT_HISTORY);
    if (open) ctx.summary.push(`${d[0]}${d.slice(1).toLowerCase()}: sales ${Math.round((revenueTot + serviceTot) / 100).toLocaleString('en-US')}.`);
  }
}

const monthsSinceOctober = (month: number): number => ((month - REBATES.paidMonth + 12) % 12) + 1;

/** Share of retail sales made to members (members in town over town households). */
function retailMemberShare(state: GameState): number {
  const [lo, hi] = RETAIL_DEMAND.memberShareRange.value;
  const members = state.members.list.filter((m) => m.status === 'active' && m.kind === 'member').length;
  const pop = state.world.towns.reduce((a, t) => a + t.population, 0);
  return clamp(members / Math.max(1, pop * RETAIL_DEMAND.householdsPerResident.value), lo, hi);
}

function retailDemand(ctx: TickContext, sites: { ours: boolean; posture: number; service: number; townId: number; kind: FacilityKind; facility?: Facility }[], acc: Acc, book: SupplyBook, ourAdv: number, theta: number, outside: number, reach: number, distPct: number): void {
  const { state, mi } = ctx;
  const month = monthOf(mi);
  const rd = RETAIL_DEMAND;
  const acresByTown = new Map<number, number>();
  for (const m of state.members.list) if (m.status === 'active') acresByTown.set(m.townId, (acresByTown.get(m.townId) ?? 0) + (m.acres.corn + m.acres.soybeans + m.acres.wheat + m.acres.other) * m.weight);
  const dist = state.world.distances;
  for (const t of state.world.towns) {
    for (const kind of ['station', 'farmstore'] as FacilityKind[]) {
      const local = sites.filter((s) => s.kind === kind && dist[t.id][s.townId] <= reach);
      let best: { u: number } | null = null;
      let denom = Math.exp(theta * outside);
      for (const s of local) {
        const dd = dist[t.id][s.townId];
        if (s.ours) {
          const u = ourAdv - distPct * dd + DIVISION_CONFIG.RETAIL.serviceQuality * STAFF_SERVICE[s.facility!.staffing.level];
          if (!best || u > best.u) best = { u };
        } else denom += Math.exp(theta * (s.posture - distPct * dd + DIVISION_CONFIG.RETAIL.serviceQuality * s.service));
      }
      const key = `${kind}:${t.id}`;
      const target = best ? Math.exp(theta * best.u) / (Math.exp(theta * best.u) + denom) : 0;
      const prev = book.townShare[key] ?? 0;
      const share = prev + (target > prev ? SS.inertiaUp.value : SS.inertiaDown.value) * (target - prev);
      book.townShare[key] = share;
      if (kind === 'station') {
        const gal = t.population * rd.galPerResident.value * (t.onHighway ? rd.highwayFactor.value : 1) * seasonShare('STATION_FUEL', month) * 12;
        add(acc.demand, 'STATION_FUEL', gal);
        add(acc.demand, 'STORE_INSIDE', gal * rd.insidePerGal.value);
        if (best) {
          add(acc.ours, 'STATION_FUEL', gal * share);
          add(acc.ours, 'STORE_INSIDE', gal * rd.insidePerGal.value * share);
          acc.shareSum += share;
          acc.shareN++;
        }
      } else {
        const dollars = ((acresByTown.get(t.id) ?? 0) * rd.farmStorePerAcre.value + t.population * rd.farmStorePerResident.value) * seasonShare('FARM_STORE', month);
        add(acc.demand, 'FARM_STORE', dollars);
        if (best) add(acc.ours, 'FARM_STORE', dollars * share);
      }
    }
  }
}

/** Town households heating with propane and commercial fuel accounts: non-member business. */
function townEnergyDemand(ctx: TickContext, sites: SupplierSite[], acc: Acc, book: SupplyBook, ourAdv: number, theta: number, outside: number, reach: number, distPct: number): void {
  const { state, mi } = ctx;
  const month = monthOf(mi);
  const ed = ENERGY_DEMAND;
  const dist = state.world.distances;
  for (const t of state.world.towns) {
    let best: number | null = null;
    let denom = Math.exp(theta * outside);
    for (const s of sites) {
      const dd = dist[t.id][s.townId];
      if (dd > reach) continue;
      if (s.ours) {
        const u = ourAdv - distPct * dd + DIVISION_CONFIG.ENERGY.serviceQuality * STAFF_SERVICE[s.facility!.staffing.level];
        if (best === null || u > best) best = u;
      } else denom += Math.exp(theta * (s.posture - distPct * dd + DIVISION_CONFIG.ENERGY.serviceQuality * s.service));
    }
    const key = `energy:${t.id}`;
    const target = best !== null ? Math.exp(theta * best) / (Math.exp(theta * best) + denom) : 0;
    const prev = book.townShare[key] ?? 0;
    const share = prev + (target > prev ? SS.inertiaUp.value : SS.inertiaDown.value) * (target - prev);
    book.townShare[key] = share;
    const propane = t.population * ed.ruralHouseholdsPerResident.value * state.world.weather.hdd * ed.propanePerHdd.value;
    const fuel = t.population * ed.commercialGalPerResident.value * seasonShare('FUEL_DIESEL', month);
    add(acc.demand, 'PROPANE', propane);
    add(acc.demand, 'FUEL_DIESEL', fuel);
    if (best === null) continue;
    add(acc.ours, 'PROPANE', propane * share);
    add(acc.ours, 'FUEL_DIESEL', fuel * share);
    add(acc.annualOurs, 'PROPANE', t.population * ed.ruralHouseholdsPerResident.value * SUPPLY_SHARE.normalHdd.value * ed.propanePerHdd.value * share);
    acc.propaneCustomers += t.population * ed.ruralHouseholdsPerResident.value * share;
  }
}

/** Fertilizer fill programs and propane prebuy. Returns any immediate write-down (none). */
function fillAndPrebuy(ctx: TickContext, d: SupplyDivision, book: SupplyBook, facs: Facility[], prices: Record<LineId, LinePrice>, acc: Acc, month: number): Cents {
  const { state, mi } = ctx;
  const pol = state.coop.supplyPolicy[d];
  const inv = INVENTORY_ACCOUNT[d];
  if (d === 'AGRONOMY') {
    const fertCap = cap(facs, 'dry-fert-plant') + cap(facs, 'nh3-storage') + cap(facs, 'liquid-fert-tanks');
    const held = layerQty(book.inventory.FERT_N ?? []) + layerQty(book.inventory.FERT_PK ?? []);
    let room = Math.max(0, fertCap - held);
    const program = FILL.summer.months.includes(month) ? { pct: pol.summerFillPct, disc: FILL.summer.discountPct.value } : FILL.winter.months.includes(month) ? { pct: pol.winterFillPct, disc: FILL.winter.discountPct.value } : null;
    if (program && program.pct > 0) {
      for (const id of ['FERT_N', 'FERT_PK'] as LineId[]) {
        const spring = [3, 4, 5, 6].reduce((a, m) => a + (acc.annualOurs[id] ?? 0) * seasonShare(id, m), 0);
        const qty = Math.min(room, (spring * program.pct) / 3);
        if (qty <= 0) continue;
        const cost = roundCents(qty * prices[id].cost * (1 - program.disc / 100) * 100);
        (book.inventory[id] ??= []).push({ qty, cost, month: mi });
        post(state, { source: 'fill', memo: `${LINES[id].label}: ${FILL.summer.months.includes(month) ? 'summer' : 'winter'} fill purchase`, lines: [{ account: inv, division: d, amount: cost }, { account: '1000', division: d, amount: -cost }] });
        room -= qty;
      }
    }
  }
  if (d === 'ENERGY' && pol.prebuyProgram && [7, 8, 9].includes(month)) {
    const winter = (acc.annualOurs.PROPANE ?? 0) * SUPPLY_SHARE.propaneWinterShare.value;
    const gal = (winter * ENERGY_DEMAND.prebuyShare.value) / 3;
    if (gal > 0) {
      const price = prices.PROPANE.ours;
      const cash = roundCents(gal * price * 100);
      post(state, { source: 'prebuy', memo: 'Propane prebuy contracts sold', lines: [{ account: '1000', division: d, amount: cash }, { account: '2130', division: d, amount: -cash }] });
      book.prepay += cash;
      book.prebuyPrice = (book.prebuyPrice * book.prebuyGal + price * gal) / (book.prebuyGal + gal);
      book.prebuyGal += gal;
      if (pol.supplyCover === 'covered') {
        const cost = roundCents(gal * prices.PROPANE.cost * 100);
        (book.inventory.PROPANE ??= []).push({ qty: gal, cost, month: mi });
        post(state, { source: 'prebuy-cover', memo: 'Propane bought to cover prebuy contracts', lines: [{ account: inv, division: d, amount: cost }, { account: '1000', division: d, amount: -cost }] });
      }
    }
  }
  return 0;
}

function operatingExtras(ctx: TickContext, d: SupplyDivision, book: SupplyBook, sold: Partial<Record<LineId, number>>, acc: Acc, idx: number, pl: number, month: number, prices: Record<LineId, LinePrice>): void {
  const { state } = ctx;
  const lines: JournalLine[] = [];
  let cash = 0;
  const avgDist = acc.distN ? acc.avgDistance / acc.distN : 0;
  const ex = (account: string, amount: Cents) => {
    if (amount <= 0) return;
    lines.push({ account, division: d, amount });
    cash -= amount;
  };
  const inc = (amount: Cents) => {
    if (amount <= 0) return;
    lines.push({ account: '6000', division: d, amount: -amount });
    cash += amount;
  };
  if (d === 'ENERGY') {
    const gal = (sold.FUEL_DIESEL ?? 0) + (sold.FUEL_GAS ?? 0) + (sold.PROPANE ?? 0);
    ex('7680', roundCents(gal * (ENERGY_DEMAND.deliveryBase.value + ENERGY_DEMAND.deliveryPerMile.value * avgDist) * pl * 100));
    inc(roundCents(acc.propaneCustomers * ENERGY_DEMAND.tankRent.value * pl * 100));
  }
  if (d === 'FEED') {
    const tons = (sold.FEED_SWINE ?? 0) + (sold.FEED_DAIRY ?? 0) + (sold.FEED_BEEF ?? 0);
    ex('7680', roundCents(tons * (FEED_DEMAND.deliveryPerTon2024.value + FEED_DEMAND.deliveryPerTonMile2024.value * avgDist) * pl * 100));
    ex('7400', roundCents((tons + (sold.FEED_TOLL ?? 0)) * FEED_DEMAND.powerPerTon2024.value * pl * 100));
    // Pellet mills earn a premium on part of the tonnage.
    const pellets = state.coop.facilities.some((f) => f.division === 'FEED' && f.status === 'operating' && (f.components['pellet-mill'] ?? 0) > 0);
    if (pellets) inc(roundCents(tons * FEED_DEMAND.pelletShare.value * FEED_DEMAND.pelletPremium.value * idx * 100));
  }
  if (lines.length) post(state, { source: `${d.toLowerCase()}-operating`, memo: `${d} delivery, power and service income`, lines: [...lines, { account: '1000', division: d, amount: cash }] });
}
