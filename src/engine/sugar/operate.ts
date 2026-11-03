// The sugar beet business (D-133). Each February the co-op contracts beet acres from member
// growers within reach of its piling stations and factory; growers sign up when beets look
// better than corn. In September (pre-pile) and October the crop is harvested and piled at the
// stations, as fast as the pilers and the pile ground allow — the rest stays in the field.
// Piles lose sugar while they wait, less when ventilated. The factory slices from September
// until the piles are gone or spoil in late spring, limited by its slicing line, lime kilns and
// boilers; beets are hauled in from the stations. Sugar goes to the silos and is sold through
// the year; pulp and molasses are sold as made. Growers are paid a share of a ton's product
// value at delivery and the rest of the division's savings comes back as patronage on tons.

import { SUGAR, SUGAR_COMPANY, SUGAR_FINANCE, SUGAR_STAFF } from '../../data/sugar';
import { PEOPLE } from '../../data/people';
import { effect } from '../people/leaders';
import { valueAt } from '../../data/types';
import { monthOf, yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { Facility, GameState, Member, SugarBook, SugarCampaign, SugarMonthReport, SugarPolicy } from '../types';
import { pathFor, priceLevel } from '../world/macro';
import { incomeStatement } from '../ledger/statements';
import { marketValue } from '../world/marketPath';
import { townYieldFactor } from '../world/farmEconomy';
import { stepSugarCompany } from './company';

export const emptySugarBook = (): SugarBook => ({ piles: [], pileSugarPct: 0, pileCost: 0, sugarCwt: 0, sugarCost: 0, campaign: null, campaigns: [], report: null, reports: [] });
export const defaultSugarPolicy = (): SugarPolicy => ({ targetAcres: null, growerShare: SUGAR.defaultGrowerShare });

const DIV = 'SUGAR' as const;
const RECEIVING = (f: Facility) => (f.kind === 'beetstation' || f.kind === 'sugarfactory') && f.status === 'operating';

/** Our factories and receiving sites. */
export function sugarSites(state: GameState): { factories: Facility[]; receiving: Facility[] } {
  const fac = state.coop.facilities;
  return {
    factories: fac.filter((f) => f.kind === 'sugarfactory' && f.status === 'operating').sort((a, b) => a.id - b.id),
    receiving: fac.filter(RECEIVING).sort((a, b) => a.id - b.id),
  };
}

export interface SugarCapacity {
  /** Tons of beets a day the factories can slice, and what holds it there. */
  tpd: number;
  bottleneck: string | null;
  pulpTpd: number;
  siloCwt: number;
  desugarization: boolean;
  /** Tons a day the pilers can take at harvest, and pile ground (tons) by site. */
  pilerTpd: number;
}

export function sugarCapacity(state: GameState): SugarCapacity {
  const { factories, receiving } = sugarSites(state);
  const sum = (fs: Facility[], id: keyof Facility['components']) => fs.reduce((a, f) => a + (f.components[id] ?? 0), 0);
  const slicing = sum(factories, 'beet-slicing');
  const kilns = sum(factories, 'lime-kiln') * SUGAR.kilnTpd.value;
  const boilers = sum(factories, 'sugar-boiler') * SUGAR.boilerTpd.value;
  const limits: [string, number][] = [['slicing line', slicing], ['lime kilns', kilns], ['boilers', boilers]];
  const [name, tpd] = limits.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    tpd, bottleneck: slicing > 0 && name !== 'slicing line' ? name : slicing > 0 ? null : 'no slicing line',
    pulpTpd: sum(factories, 'pulp-dryer'), siloCwt: sum(factories, 'sugar-silo'), desugarization: sum(factories, 'desugarization') > 0,
    pilerTpd: sum(receiving, 'beet-piler'),
  };
}

/** Pile ground at a site (tons) and the share of it ventilated. */
function pileSpace(f: Facility): { tons: number; ventilated: number } {
  const plain = f.components['beet-pile'] ?? 0;
  const vent = f.components['beet-pile-vent'] ?? 0;
  return { tons: plain + vent, ventilated: plain + vent > 0 ? vent / (plain + vent) : 0 };
}

/**
 * Acres our plants can handle in a crop year (D-133): the factory slices from September until
 * the piles would spoil, the pilers take the crop over the harvest days, and what is not sliced
 * during harvest must fit on the pile ground.
 */
export function suggestedAcres(state: GameState, year: number): number {
  const cap = sugarCapacity(state);
  const { receiving } = sugarSites(state);
  const perMonth = cap.tpd * 30 * sugarUptime(state);
  const yieldT = beetYield(year);
  if (perMonth <= 0 || yieldT <= 0) return 0;
  // Slicing from September through February leaves the warm-weather months as a cushion.
  const slice = perMonth * 6;
  const pre = SUGAR.harvest.prepileShare.value;
  const pilers = (cap.pilerTpd * (SUGAR.pilerDays[SUGAR.harvest.mainMonth] ?? 0)) / (1 - pre);
  const ground = receiving.reduce((a, f) => a + pileSpace(f).tons, 0) + perMonth * 2;
  return Math.max(0, Math.round(Math.min(slice, pilers, ground) / yieldT / 100) * 100);
}

/** Trend yield (tons/acre) and sugar content (%) for a crop year. */
export const beetYield = (year: number): number => valueAt(SUGAR.yieldTonsPerAcre, year);
export const beetSugarTrend = (year: number): number => valueAt(SUGAR.sugarPct, year);

/** Share of the sugar in beets recovered as sugar. */
export const recovery = (state: GameState, year: number): number =>
  valueAt(SUGAR.extraction, year) + (sugarCapacity(state).desugarization ? SUGAR.desugarizationGain.value : 0) + effect(state, 'sugar.extraction');

/** Share of a campaign month the factory runs: the base, the factory manager and the campaign crew (D-135). */
export function sugarUptime(state: GameState): number {
  return SUGAR.uptime.value + effect(state, 'sugar.uptime') + SUGAR_STAFF.crew.value[state.coop.sugarPolicy.campaignCrew ?? 'standard'].uptime;
}

/** Beet growers we work with (farms): those with a contract or shares. */
export function beetGrowers(state: GameState): number {
  return state.members.list.reduce((a, m) => a + (m.status === 'active' && ((m.beetAcres ?? 0) > 0 || (m.beetShares ?? 0) > 0) ? m.weight : 0), 0);
}

/** Share of growers our agriculturists can work with (0–1). */
export function agCoverage(state: GameState): number {
  const n = state.coop.sugarPolicy.agriculturists ?? 0;
  const g = beetGrowers(state);
  return g > 0 ? Math.min(1, (n * SUGAR_STAFF.growersPerAgriculturist.value) / g) : n > 0 ? 1 : 0;
}

/** The agriculturists' pull on yields, sugar, sign-ups and piles: diminishing returns on coverage. */
export const agEffect = (state: GameState): number => Math.pow(agCoverage(state), 0.7);

/** Agriculturists for full coverage of today's growers. */
export const recommendedAgriculturists = (state: GameState): number =>
  Math.max(1, Math.round(beetGrowers(state) / SUGAR_STAFF.growersPerAgriculturist.value));

/** Agriculturists' cost for a year, nominal cents (wages, benefits, vehicles). */
export function agriculturistCost(state: GameState, mi: number): Cents {
  const pl = priceLevel(pathFor(state), mi);
  const n = state.coop.sugarPolicy.agriculturists ?? 0;
  return roundCents(n * (SUGAR_STAFF.agriculturistWage2024.value * (1 + PEOPLE.benefitsRate.value) + SUGAR_STAFF.agriculturistExpense2024.value) * pl * 100);
}

/** Product value of a ton of beets at a sugar content, nominal $ (sugar, pulp pellets, molasses). */
export function productValuePerTon(state: GameState, mi: number, sugarPct: number): number {
  const path = pathFor(state);
  const year = yearOf(mi);
  const sugarCwt = (2000 * sugarPct) / 100 / 100 * recovery(state, year);
  const sugarPrice = marketValue(path, 'sugar', mi) * (1 - SUGAR.marketingCostPct.value);
  return sugarCwt * sugarPrice + SUGAR.pulpTonsPerTon.value * pulpPrice(state, mi) + SUGAR.molassesTonsPerTon.value * molassesPrice(state, mi);
}

/** Pulp pellets, nominal $/ton: near corn's feeding value. */
export const pulpPrice = (state: GameState, mi: number): number => marketValue(pathFor(state), 'corn', mi) * (2000 / 56) * SUGAR.pulpCornRatio.value;
export const molassesPrice = (state: GameState, mi: number): number => SUGAR.molasses2024.value * priceLevel(pathFor(state), mi);

/** What a grower expects per acre from beets and from corn (nominal $), for signing up. */
export function growerReturns(state: GameState, mi: number): { beets: number; corn: number } {
  const path = pathFor(state);
  const year = yearOf(mi);
  const value = productValuePerTon(state, mi, beetSugarTrend(year));
  const pay = value * state.coop.sugarPolicy.growerShare;
  // Growers count on patronage like last year's per ton; before there is a record, on what
  // grower co-ops usually pay out in all.
  const last = [...state.coop.sugar.campaigns].reverse().find((c) => c.closed && c.deliveredTons > 0);
  const lastPatronage = last ? Math.max(0, lastSugarSavings(state) / 100 / last.deliveredTons) : value * Math.max(0, SUGAR.growerNetShare.value - state.coop.sugarPolicy.growerShare);
  const beets = beetYield(year) * (pay + lastPatronage) - SUGAR.growerCostPerAcre2024.value * priceLevel(path, mi);
  const corn = marketValue(path, 'yieldCorn', mi) * marketValue(path, 'corn', mi) * SUGAR.cornNetShare.value;
  return { beets, corn };
}

/** The sugar division's savings over the last twelve months (cents). */
function lastSugarSavings(state: GameState): number {
  const mi = state.clock.monthIndex;
  return incomeStatement(state.ledger, Math.max(state.ledger.firstMonth, mi - 12), mi - 1, DIV).savingsBeforeTax;
}

/** Members within reach of one of our receiving sites, with the nearest one. */
function eligibleGrowers(state: GameState, sites: Facility[]): { m: Member; site: Facility; miles: number }[] {
  return growersNear(state, sites, (f) => f.townId);
}

/** Active members within reach of any of the places, with the nearest one. */
function growersNear<T>(state: GameState, places: T[], townOf: (p: T) => number): { m: Member; site: T; miles: number }[] {
  const out: { m: Member; site: T; miles: number }[] = [];
  const dist = state.world.distances;
  for (const m of state.members.list) {
    if (m.status !== 'active' || m.kind !== 'member') continue;
    let best: { site: T; miles: number } | null = null;
    for (const f of places) {
      const d = dist[m.townId][townOf(f)];
      if (d <= SUGAR.reachMiles.value && (!best || d < best.miles)) best = { site: f, miles: d };
    }
    if (best) out.push({ m, ...best });
  }
  return out;
}

/**
 * February: sign growers for this year's crop. Each eligible member offers up to a rotation's
 * share of their row-crop acres, more willingly the better beets look against corn; offers are
 * scaled down to our target. Contracted acres move out of corn and soybeans into beets (carried
 * in `acres.other`).
 */
export function contractBeets(ctx: TickContext): void {
  const { state, mi } = ctx;
  const year = yearOf(mi);
  // Last year's beets are back in the rotation.
  for (const m of state.members.list) if (m.beetAcres) {
    m.acres.other = Math.max(0, m.acres.other - m.beetAcres);
    m.acres.corn += m.beetAcres;
    m.beetAcres = 0;
  }
  // Last year's crop is still being sliced: it moves to the archive, where slicing keeps adding to it.
  const prev = state.coop.sugar.campaign;
  if (prev && prev.deliveredTons > 0) state.coop.sugar.campaigns = [...state.coop.sugar.campaigns, prev].slice(-30);
  const sites = state.coop.facilities.filter((f) => (f.kind === 'beetstation' || f.kind === 'sugarfactory') && (f.status === 'operating' || f.status === 'underConstruction')).sort((a, b) => a.id - b.id);
  const hasFactory = state.coop.facilities.some((f) => f.kind === 'sugarfactory' && f.status !== 'closed');
  resetShareFromProceeds(ctx);
  const target = state.coop.sugarPolicy.targetAcres ?? suggestedAcres(state, year);
  state.coop.sugar.campaign = null;
  if (!hasFactory || !sites.length || target <= 0) return;
  const { beets, corn } = growerReturns(state, mi);
  const ratio = beets / Math.max(1, corn);
  const willing = clamp(0.2 + SUGAR.signupSlope.value * (ratio - 0.8) + effect(state, 'sugar.signup') + SUGAR_STAFF.maxSignupGain.value * agEffect(state), 0.03, 0.95);
  const growers = eligibleGrowers(state, sites);
  transferShares(state, growers.map((g) => g.m));
  // Shareholders grow their shares first (it is their right and their duty); others fill what is
  // left of the target as they are willing. If shares exceed the target everyone is cut back alike.
  const shareAcres = (m: Member) => Math.min(m.beetShares ?? 0, (m.acres.corn + m.acres.soybeans) * SUGAR.maxRotationShare.value * 1.6);
  const totalShares = growers.reduce((a, g) => a + shareAcres(g.m) * g.m.weight, 0);
  const shareScale = totalShares > target ? target / totalShares : 1;
  const room = Math.max(0, target - totalShares * shareScale);
  const offers = growers.map((g) => ({ ...g, acres: Math.max(0, (g.m.acres.corn + g.m.acres.soybeans) * SUGAR.maxRotationShare.value - shareAcres(g.m)) * willing * g.m.weight }));
  const offered = offers.reduce((a, o) => a + o.acres, 0);
  const scale = offered > room ? room / offered : 1;
  let acres = 0;
  let n = 0;
  for (const o of offers) {
    const a = Math.round(shareAcres(o.m) * shareScale + (o.acres * scale) / o.m.weight);
    if (a < 5) continue;
    const fromCorn = Math.min(o.m.acres.corn, Math.round(a * 0.6));
    const fromSoy = Math.min(o.m.acres.soybeans, a - fromCorn);
    const got = fromCorn + fromSoy;
    if (got <= 0) continue;
    o.m.acres.corn -= fromCorn;
    o.m.acres.soybeans -= fromSoy;
    o.m.acres.other += got;
    o.m.beetAcres = got;
    acres += got * o.m.weight;
    n += o.m.weight;
  }
  if (state.coop.sugarPolicy.agriculturists === undefined) state.coop.sugarPolicy = { ...state.coop.sugarPolicy, agriculturists: recommendedAgriculturists(state) };
  state.coop.sugar.campaign = {
    year, contractedAcres: Math.round(acres), growers: Math.round(n), deliveredTons: 0, leftInFieldTons: 0, avgSugarPct: 0,
    slicedTons: 0, sugarCwt: 0, pulpTons: 0, molassesTons: 0, storageLossTons: 0, growerPayments: 0,
  };
  ctx.inbox({
    kind: 'memo', title: `Beet contracts for ${year}`,
    body: `${Math.round(n)} growers signed ${Math.round(acres).toLocaleString('en-US')} acres of sugar beets${target > 0 ? ` against our target of ${Math.round(target).toLocaleString('en-US')}` : ''}. Beets look ${ratio >= 1.1 ? 'clearly better' : ratio >= 0.9 ? 'about as good' : 'worse'} than corn to growers this year at a ${Math.round(state.coop.sugarPolicy.growerShare * 100)}% payment share.`,
  });
}

/** Monthly: harvest, storage losses, slicing, sales, and the report. */
export function stepSugar(ctx: TickContext): void {
  const { state, mi, path } = ctx;
  const month = monthOf(mi);
  const year = yearOf(mi);
  const book = state.coop.sugar;
  stepSugarCompany(ctx);
  if (month === 2) contractBeets(ctx);
  const cap = sugarCapacity(state);
  const { factories, receiving } = sugarSites(state);
  const report: SugarMonthReport = {
    monthIndex: mi, delivered: 0, sliced: 0, sliceCapacity: 0, pileTons: 0, pileSugarPct: book.pileSugarPct, sugarMade: 0, sugarSold: 0,
    sugarPrice: marketValue(path, 'sugar', mi), revenue: 0, growerPayments: 0, processingCost: 0, haulCost: 0, bottleneck: cap.bottleneck,
  };
  const c = book.campaign;
  // The crop in the piles: this fall's from September, last fall's before.
  const cropYear = month >= SUGAR.harvest.prepileMonth ? year : year - 1;
  const pc = book.campaign?.year === cropYear ? book.campaign : book.campaigns.find((x) => x.year === cropYear) ?? null;
  const lines: { account: string; amount: Cents; facilityId?: number }[] = [];
  let cash = 0;

  // ---- harvest and delivery (September pre-pile, October main harvest) ----
  if (c && c.year === year && (month === SUGAR.harvest.prepileMonth || month === SUGAR.harvest.mainMonth) && receiving.length) {
    const share = month === SUGAR.harvest.prepileMonth ? SUGAR.harvest.prepileShare.value : 1 - SUGAR.harvest.prepileShare.value;
    const rng = ctx.rng('sugar.harvest');
    if (month === SUGAR.harvest.prepileMonth) {
      c.avgSugarPct = beetSugarTrend(year) + SUGAR.sugarPctSd.value * rng.normal() - (state.world.weather.wetFall ? SUGAR.wetFallSugarPenalty.value : 0) + SUGAR_STAFF.maxSugarGain.value * agEffect(state);
    }
    const sugarPct = c.avgSugarPct || beetSugarTrend(year);
    const pay = productValuePerTon(state, mi, sugarPct) * state.coop.sugarPolicy.growerShare;
    const days = SUGAR.pilerDays[month] ?? 0;
    // What each site can take: its pilers over the harvest days, and its free pile ground.
    const room = new Map<number, number>();
    // A factory also takes beets straight from the field for what it slices this month.
    const fresh = factories.length ? (cap.tpd * days * sugarUptime(state)) / factories.length : 0;
    for (const f of receiving) {
      const piled = book.piles.find((p) => p.facilityId === f.id)?.tons ?? 0;
      const direct = f.kind === 'sugarfactory' && f.status === 'operating' ? fresh : 0;
      room.set(f.id, Math.min((f.components['beet-piler'] ?? 0) * days + direct, Math.max(0, pileSpace(f).tons - piled) + direct));
    }
    let delivered = 0;
    let paid = 0;
    let left = 0;
    for (const g of eligibleGrowers(state, receiving)) {
      const acres = g.m.beetAcres ?? 0;
      if (acres <= 0) continue;
      const tons = acres * beetYield(year) * townYieldFactor(state, year, g.m.townId) * share * g.m.weight * (1 + SUGAR_STAFF.maxYieldGain.value * agEffect(state));
      // Nearest site first, then any other with room.
      const order = [g.site, ...receiving.filter((f) => f.id !== g.site.id && state.world.distances[g.m.townId][f.townId] <= SUGAR.reachMiles.value * 1.5)];
      let need = tons;
      for (const f of order) {
        const r = room.get(f.id) ?? 0;
        const take = Math.min(need, r);
        if (take <= 0) continue;
        room.set(f.id, r - take);
        const pile = book.piles.find((p) => p.facilityId === f.id);
        if (pile) pile.tons += take;
        else book.piles.push({ facilityId: f.id, tons: take });
        need -= take;
      }
      const got = tons - need;
      left += need;
      delivered += got;
      const amount = got * pay;
      paid += amount;
      if (got > 0) {
        g.m.ytd.SUGAR_BEETS = (g.m.ytd.SUGAR_BEETS ?? 0) + got / g.m.weight;
        // Delivering beets is member business.
        state.coop.patronageStats.SUGAR.member += roundCents(amount * 100);
      }
    }
    const payCents = roundCents(paid * 100);
    if (payCents > 0) {
      // Beets go on the books at what we paid; mixing piles averages the sugar content.
      const before = book.piles.reduce((a, p) => a + p.tons, 0) - delivered;
      book.pileSugarPct = before + delivered > 0 ? (book.pileSugarPct * before + sugarPct * delivered) / (before + delivered) : sugarPct;
      book.pileCost += payCents;
      // Growers get the initial payment now; the rest is owed and paid as the sugar sells (D-135).
      const initial = roundCents(payCents * SUGAR_FINANCE.initialPaymentShare.value);
      book.growerPayable = (book.growerPayable ?? 0) + payCents - initial;
      post(state, { source: 'sugar-beets', memo: 'Beet deliveries: initial payment to growers', lines: [{ account: '1260', division: DIV, amount: payCents }, { account: '1000', division: DIV, amount: -initial }, { account: '2115', division: DIV, amount: -(payCents - initial) }] });
    }
    const fy = state.coop.equityProgram.fyLines;
    fy.SUGAR_BEETS = { units: (fy.SUGAR_BEETS?.units ?? 0) + delivered, revenue: (fy.SUGAR_BEETS?.revenue ?? 0) + payCents, cogs: 0 };
    c.deliveredTons += delivered;
    c.leftInFieldTons += left;
    c.growerPayments += payCents;
    report.delivered = delivered;
    report.growerPayments = payCents;
    if (left > delivered * 0.05) {
      ctx.inbox({ kind: 'alert', title: 'Beets left in the field', body: `Our pilers and pile ground could not take ${Math.round(left).toLocaleString('en-US')} tons of growers' beets this ${month === 9 ? 'pre-pile' : 'harvest'}. Growers lose that crop; add pilers or pile ground before next fall.` });
      for (const g of eligibleGrowers(state, receiving)) if (g.m.beetAcres) g.m.satisfaction = Math.max(0, g.m.satisfaction - 6);
    }
  }

  // ---- storage losses ----
  const piled = book.piles.reduce((a, p) => a + p.tons, 0);
  if (piled > 0) {
    let vent = 0;
    for (const p of book.piles) {
      const f = state.coop.facilities.find((x) => x.id === p.facilityId);
      vent += (f ? pileSpace(f).ventilated : 0) * p.tons;
    }
    const ventShare = vent / piled;
    const lossFactor = (1 - ventShare * (1 - SUGAR.ventilatedLossShare.value)) * (1 + effect(state, 'sugar.pileLoss')) * (1 - SUGAR_STAFF.maxPileLossCut.value * agEffect(state));
    const sugarLoss = SUGAR.pileSugarLossPerMonth.value[month - 1] * lossFactor;
    book.pileSugarPct *= 1 - sugarLoss;
    const shrink = SUGAR.pileShrinkPerMonth.value * lossFactor;
    for (const p of book.piles) p.tons *= 1 - shrink;
    if (pc) pc.storageLossTons += piled * shrink;
  }

  // ---- slicing ----
  const campaignOn = SUGAR.campaignMonths.includes(month) && factories.length > 0;
  const capacity = campaignOn ? cap.tpd * 30 * sugarUptime(state) : 0;
  report.sliceCapacity = capacity;
  let slice = Math.min(capacity, book.piles.reduce((a, p) => a + p.tons, 0));
  if (slice > 0) {
    const factory = factories[0];
    let haulCost = 0;
    let need = slice;
    // Factory-yard piles first, then the nearest stations.
    const order = [...book.piles].sort((a, b) => dist(state, a.facilityId, factory) - dist(state, b.facilityId, factory) || a.facilityId - b.facilityId);
    for (const p of order) {
      const take = Math.min(need, p.tons);
      if (take <= 0) continue;
      p.tons -= take;
      need -= take;
      const miles = dist(state, p.facilityId, factory);
      if (miles > 0) haulCost += take * (SUGAR.haulPerTon2024.value + SUGAR.haulPerTonMile2024.value * miles);
    }
    slice -= need;
    const totalBefore = book.piles.reduce((a, p) => a + p.tons, 0) + slice;
    const costOut = totalBefore > 0 ? roundCents(book.pileCost * (slice / totalBefore)) : book.pileCost;
    book.pileCost -= costOut;
    const rec = recovery(state, year);
    const cwt = (slice * 2000 * book.pileSugarPct) / 100 / 100 * rec;
    book.sugarCwt += cwt;
    book.sugarCost += costOut;
    // Co-products: pulp dried as far as the dryers allow; molasses less what desugarization takes.
    const dried = Math.min(slice, cap.pulpTpd * 30 * sugarUptime(state));
    const pulpValue = (dried * SUGAR.pulpTonsPerTon.value + (slice - dried) * SUGAR.pulpTonsPerTon.value * SUGAR.wetPulpValueShare.value) * pulpPrice(state, mi);
    const molTons = slice * SUGAR.molassesTonsPerTon.value * (cap.desugarization ? 1 - SUGAR.desugarizedMolassesShare.value : 1);
    const coRevenue = roundCents((pulpValue + molTons * molassesPrice(state, mi)) * 100);
    // Processing: fuel, supplies, the campaign crew, hauling from stations.
    const pl = priceLevel(path, mi);
    const energy = slice * valueAt(SUGAR.energyMmbtuPerTon, year) * marketValue(path, 'natgas', mi);
    const supplies = slice * SUGAR.suppliesPerTon2024.value * pl;
    const crew = (cap.tpd / 1000) * SUGAR.campaignFtePer1000Tpd.value * (SUGAR.campaignWage2024.value / 12) * pl * Math.min(1, slice / Math.max(1, capacity)) * SUGAR_STAFF.crew.value[state.coop.sugarPolicy.campaignCrew ?? 'standard'].cost;
    const procCents = roundCents((energy + supplies) * 100);
    const crewCents = roundCents(crew * 100);
    const haulCents = roundCents(haulCost * pl * 100);
    // Absorption costing: what it takes to turn beets into sugar is carried in the sugar's cost
    // and expensed as the sugar is sold through the year, as beet processors' books do.
    const absorbed = procCents + crewCents + haulCents;
    book.sugarCost += absorbed;
    lines.push({ account: '1260', amount: absorbed, facilityId: factory.id });
    lines.push({ account: '4000', amount: -coRevenue, facilityId: factory.id });
    cash += absorbed - coRevenue;
    report.sliced = slice;
    report.sugarMade = cwt;
    report.processingCost = procCents + crewCents;
    report.haulCost = haulCents;
    report.revenue += coRevenue;
    if (pc) {
      pc.slicedTons += slice;
      pc.sugarCwt += cwt;
      pc.pulpTons += slice * SUGAR.pulpTonsPerTon.value;
      pc.molassesTons += molTons;
    }
  }
  book.piles = book.piles.filter((p) => p.tons > 0.5);
  // Beets still piled when the weather turns warm spoil.
  if (month === SUGAR.campaignEndMonth && book.piles.length) {
    const lost = book.piles.reduce((a, p) => a + p.tons, 0);
    if (book.pileCost !== 0) post(state, { source: 'sugar-spoil', memo: 'Beets spoiled in the piles at the end of the campaign', lines: [{ account: '5000', division: DIV, amount: book.pileCost }, { account: '1260', division: DIV, amount: -book.pileCost }] });
    book.pileCost = 0;
    book.piles = [];
    if (pc) pc.storageLossTons += lost;
    ctx.inbox({ kind: 'alert', title: 'Beets spoiled in the piles', body: `${Math.round(lost).toLocaleString('en-US')} tons of beets were still piled when the weather warmed and had to be written off. More slicing capacity, or fewer contracted acres, would have run them through in time.` });
  }

  // ---- sugar sales through the year ----
  if (book.sugarCwt > 0) {
    const monthsLeft = month >= 9 ? 12 - month + 9 : 9 - month;
    let sell = book.sugarCwt / Math.max(1, monthsLeft);
    // What the silos cannot hold goes now, at a discount.
    const over = Math.max(0, book.sugarCwt - sell - cap.siloCwt);
    const price = marketValue(path, 'sugar', mi) * (1 - SUGAR.marketingCostPct.value);
    const loanRate = valueAt(SUGAR_FINANCE.loanRate, cropYear);
    if (loanRate > price) {
      // Below the loan rate the co-op pledges all its sugar to the CCC and forfeits what it would
      // sell: the loans are nonrecourse, so the loan rate is the price.
      const loan = book.cccLoan ?? 0;
      const full = roundCents(book.sugarCwt * loanRate * 100);
      if (full > loan) {
        lines.push({ account: '2050', amount: -(full - loan) });
        cash -= full - loan;
      }
      const value = Math.min(full, roundCents((sell + over) * loanRate * 100));
      book.cccLoan = full - value;
      post(state, { source: 'ccc-forfeit', memo: 'Sugar forfeited to the CCC at the loan rate', lines: [{ account: '2050', division: DIV, amount: value }, { account: '4000', division: DIV, amount: -value }] });
      if (!(book.reports[book.reports.length - 1]?.forfeitedCwt)) ctx.inbox({ kind: 'memo', title: 'Sugar forfeited to the CCC', body: `Refined sugar is selling below the CCC loan rate of $${loanRate.toFixed(2)}/cwt, so we are handing pledged sugar to the government instead of selling it. The loans are nonrecourse: the loan rate is our price.` });
      report.forfeitedCwt = sell + over;
      report.revenue += value;
      sell += over;
    } else {
      const revenue = roundCents((sell * price + over * price * (1 - SUGAR.overflowDiscount.value)) * 100);
      sell += over;
      lines.push({ account: '4000', amount: -revenue });
      cash -= revenue;
      report.revenue += revenue;
    }
    const costOut = roundCents(book.sugarCost * Math.min(1, sell / book.sugarCwt));
    book.sugarCwt -= sell;
    book.sugarCost -= costOut;
    if (book.sugarCwt < 1e-6) { book.sugarCwt = 0; }
    report.sugarSold = sell;
    if (costOut !== 0) post(state, { source: 'sugar-cost', memo: 'Cost of sugar sold', lines: [{ account: '5000', division: DIV, amount: costOut }, { account: '1260', division: DIV, amount: -costOut }] });
  }
  // ---- field staff ----
  const agCost = roundCents(agriculturistCost(state, mi) / 12);
  if (agCost > 0) {
    lines.push({ account: '7000', amount: agCost });
    cash += agCost;
  }

  // ---- grower installments: what is owed is paid down evenly through August (D-135) ----
  const owed = book.growerPayable ?? 0;
  if (owed > 0 && month !== SUGAR.harvest.prepileMonth && month !== SUGAR.harvest.mainMonth) {
    const last = SUGAR_FINANCE.finalPaymentMonth;
    const left = month <= last ? last - month + 1 : 12 - month + last + 1;
    const pay = month === last ? owed : roundCents(owed / left);
    book.growerPayable = owed - pay;
    lines.push({ account: '2115', amount: pay });
    cash += pay;
    report.installments = pay;
  }

  report.cccLoan = book.cccLoan ?? 0;

  const real = lines.filter((l) => l.amount !== 0);
  if (real.length) {
    post(state, {
      source: 'sugar', memo: 'Sugar factory: sales, processing and hauling',
      lines: [...real.map((l) => ({ account: l.account, division: DIV, amount: l.amount, ...(l.facilityId !== undefined ? { facilityId: l.facilityId } : {}) })), { account: '1000', division: DIV, amount: -cash }].filter((l) => l.amount !== 0),
    });
  }
  report.pileTons = book.piles.reduce((a, p) => a + p.tons, 0);
  report.pileSugarPct = book.pileSugarPct;
  book.report = report;
  book.reports = [...book.reports, report].slice(-24);
  // The campaign closes when the last of the crop is sliced or written off.
  if (pc && !pc.closed && pc.deliveredTons > 0 && !book.piles.length && month !== SUGAR.harvest.prepileMonth && month !== SUGAR.harvest.mainMonth) {
    pc.closed = true;
    ctx.inbox({ kind: 'memo', title: `Sugar campaign ${pc.year} closed`, body: `Growers delivered ${Math.round(pc.deliveredTons).toLocaleString('en-US')} tons at ${pc.avgSugarPct.toFixed(1)}% sugar; we sliced ${Math.round(pc.slicedTons).toLocaleString('en-US')} tons and made ${Math.round(pc.sugarCwt).toLocaleString('en-US')} cwt of sugar. Storage losses ${Math.round(pc.storageLossTons).toLocaleString('en-US')} tons${pc.leftInFieldTons > 0 ? `; ${Math.round(pc.leftInFieldTons).toLocaleString('en-US')} tons stayed in the field` : ''}.` });
  }
}

const dist = (state: GameState, facilityId: number, to: Facility): number => {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  return f ? state.world.distances[f.townId][to.townId] : 0;
};

export type { SugarCampaign };

/**
 * Paying from proceeds (D-134): set the delivery share to what a ton of beets is worth at
 * today's prices less what it cost last year to process it and run the plants, keeping a small
 * margin. Growers then carry the sugar price, as grower co-ops' do.
 */
function resetShareFromProceeds(ctx: TickContext): void {
  const { state, mi } = ctx;
  const p = state.coop.sugarPolicy;
  if (p.paymentBasis !== 'proceeds') return;
  const reps = state.coop.sugar.reports.filter((r) => r.monthIndex >= mi - 12);
  const sliced = reps.reduce((a, r) => a + r.sliced, 0);
  if (sliced <= 0) return;
  const is = incomeStatement(state.ledger, Math.max(state.ledger.firstMonth, mi - 12), mi - 1, DIV);
  const perTon = (reps.reduce((a, r) => a + r.processingCost + r.haulCost, 0) + is.totalOpex + is.interestNet) / 100 / sliced;
  const value = productValuePerTon(state, mi, beetSugarTrend(yearOf(mi)));
  // What a ton actually brought in last year (after pile losses and the like), at today's sugar price.
  const avgPrice = reps.reduce((a, r) => a + r.sugarPrice, 0) / reps.length;
  const realized = (is.sales / 100 / sliced) * (avgPrice > 0 ? marketValue(pathFor(state), 'sugar', mi) / avgPrice : 1);
  if (value <= 0 || realized <= 0) return;
  const wanted = (realized * (1 - SUGAR.proceedsMargin.value) - perTon) / value;
  const [lo, hi] = SUGAR.growerShareBounds;
  // Cuts take effect at once; raises come a step at a time, as boards are wary of paying out a good year.
  const next = Math.round(clamp(Math.min(wanted, p.growerShare + SUGAR.proceedsMaxRaise.value), lo, hi) * 100) / 100;
  if (next === p.growerShare) return;
  ctx.inbox({ kind: 'memo', title: `Beet payment set at ${Math.round(next * 100)}% from proceeds`, body: `Paying from proceeds, the delivery payment for the coming crop moves from ${Math.round(p.growerShare * 100)}% to ${Math.round(next * 100)}% of a ton's value. A ton sliced brought in about $${realized.toFixed(2)} at today's sugar price; processing it and running the plants cost $${perTon.toFixed(2)} a ton last year, and the co-op keeps ${Math.round(SUGAR.proceedsMargin.value * 100)}% of sales.` });
  state.coop.sugarPolicy = { ...p, growerShare: next };
}

/** Set the beet contract policy (D-133). */
export function setSugarPolicy(state: GameState, policy: Partial<SugarPolicy>): { level: 'info' | 'error'; text: string }[] {
  const next = { ...state.coop.sugarPolicy, ...policy };
  const [lo, hi] = SUGAR.growerShareBounds;
  if (!(next.growerShare >= lo && next.growerShare <= hi)) return [{ level: 'error', text: `The payment share must be between ${Math.round(lo * 100)}% and ${Math.round(hi * 100)}% of a ton's value.` }];
  if (next.targetAcres !== null && !(next.targetAcres >= 0 && next.targetAcres <= 500_000)) return [{ level: 'error', text: 'Contract acres must be between 0 and 500,000.' }];
  if (next.targetAcres !== null) next.targetAcres = Math.round(next.targetAcres);
  if (next.agriculturists !== undefined && !(Number.isInteger(next.agriculturists) && next.agriculturists >= 0 && next.agriculturists <= SUGAR_STAFF.maxAgriculturists)) return [{ level: 'error', text: `Agriculturists must be a whole number from 0 to ${SUGAR_STAFF.maxAgriculturists}.` }];
  if (next.campaignCrew !== undefined && !['lean', 'standard', 'full'].includes(next.campaignCrew)) return [{ level: 'error', text: 'Unknown crew level.' }];
  state.coop.sugarPolicy = next;
  return [{ level: 'info', text: `Beet contracts: ${next.targetAcres === null ? 'what our plants can handle' : `${next.targetAcres.toLocaleString('en-US')} acres`} at ${Math.round(next.growerShare * 100)}% of a ton's value at delivery.` }];
}

/** Towns of the beet plants a share drive would serve: ours, and the company's while it is for sale. */
export function shareDriveTowns(state: GameState): number[] {
  const towns = new Set(state.coop.facilities.filter((f) => (f.kind === 'sugarfactory' || f.kind === 'beetstation') && f.status !== 'closed').map((f) => f.townId));
  const co = state.coop.sugar.company;
  if (co?.status === 'forSale') [co.factoryTownId, ...co.stationTownIds].forEach((t) => towns.add(t));
  return [...towns].sort((a, b) => a - b);
}

/** What growers would subscribe at a share price (dollars per one-acre share): acres and growers. */
export function shareDemand(state: GameState, pricePerShare: number): { shares: number; growers: number; perGrower: { m: Member; shares: number }[]; advantage: number } {
  const towns = shareDriveTowns(state);
  const { beets, corn } = growerReturns(state, state.clock.monthIndex);
  const advantage = Math.max(0, beets - corn);
  const [fast, slow] = SUGAR.sharePaybackYears.value;
  const payback = advantage > 0 ? pricePerShare / advantage : Infinity;
  const take = clamp((slow - payback) / (slow - fast), 0, 1);
  const perGrower: { m: Member; shares: number }[] = [];
  let shares = 0;
  let growers = 0;
  if (take > 0) for (const g of growersNear(state, towns, (t) => t)) {
    const room = (g.m.acres.corn + g.m.acres.soybeans + (g.m.beetAcres ?? 0)) * SUGAR.maxRotationShare.value - (g.m.beetShares ?? 0);
    const want = Math.floor(Math.max(0, room) * take);
    if (want < 10) continue;
    perGrower.push({ m: g.m, shares: want });
    shares += want * g.m.weight;
    growers += g.m.weight;
  }
  return { shares: Math.round(shares), growers: Math.round(growers), perGrower, advantage };
}

/**
 * Sell beet shares to growers (D-133): preferred stock, one share per acre, that carries the
 * right and the duty to grow beets for the factory. The money is equity for buying or building
 * the plants. At most `maxShares` are sold, spread over the growers who want them.
 */
export function offerBeetShares(state: GameState, pricePerShare: number, maxShares: number): { level: 'info' | 'error'; text: string }[] {
  const mi = state.clock.monthIndex;
  const book = state.coop.sugar;
  if (!shareDriveTowns(state).length) return [{ level: 'error', text: 'A share drive needs a beet factory or station we own, are building, or could buy.' }];
  const last = book.shareDrives?.[book.shareDrives.length - 1];
  if (last && mi - last.monthIndex < SUGAR.shareDriveGapMonths) return [{ level: 'error', text: 'Growers were asked for share money less than a year ago.' }];
  if (!(pricePerShare > 0) || !(maxShares > 0)) return [{ level: 'error', text: 'Set a share price and how many shares to offer.' }];
  const d = shareDemand(state, pricePerShare);
  if (d.shares <= 0) return [{ level: 'error', text: 'At that price no grower would buy shares: beets do not pay enough over corn to earn it back.' }];
  const scale = Math.min(1, maxShares / d.shares);
  const r = issueBeetShares(state, d.perGrower.map((g) => ({ m: g.m, shares: Math.floor(g.shares * scale) })), pricePerShare, Math.round(maxShares));
  if (r.raised <= 0) return [{ level: 'error', text: 'No shares were sold.' }];
  const { growers, sold, raised } = r;
  return [{ level: 'info', text: `${Math.round(growers)} growers bought ${Math.round(sold).toLocaleString('en-US')} beet shares, raising $${Math.round(raised / 100).toLocaleString('en-US')} of equity.` }];
}

/** Sell beet shares to the growers given (whole shares per farm), posting the stock (D-133). */
export function issueBeetShares(state: GameState, perGrower: { m: Member; shares: number }[], pricePerShare: number, offered: number): { sold: number; growers: number; raised: Cents } {
  let sold = 0;
  let growers = 0;
  let raised = 0;
  const lines: { account: string; division: 'SUGAR'; amount: Cents; memberId?: number }[] = [];
  for (const g of perGrower) {
    const n = Math.floor(g.shares);
    if (n <= 0) continue;
    // Members are cohorts of `weight` farms; each buys n shares.
    const cash = roundCents(n * pricePerShare * 100 * g.m.weight);
    g.m.beetShares = (g.m.beetShares ?? 0) + n;
    state.equity.preferredStock[g.m.id] = (state.equity.preferredStock[g.m.id] ?? 0) + cash;
    lines.push({ account: '3100', division: 'SUGAR', amount: -cash, memberId: g.m.id });
    sold += n * g.m.weight;
    growers += g.m.weight;
    raised += cash;
  }
  if (raised <= 0) return { sold: 0, growers: 0, raised: 0 };
  post(state, { source: 'beet-shares', memo: `Beet shares sold to ${Math.round(growers)} growers`, lines: [{ account: '1000', division: 'SUGAR', amount: raised }, ...lines] });
  const book = state.coop.sugar;
  book.shareDrives = [...(book.shareDrives ?? []), { monthIndex: state.clock.monthIndex, pricePerShare: roundCents(pricePerShare * 100), offered, sold: Math.round(sold), growers: Math.round(growers), raised }];
  return { sold, growers, raised };
}

/**
 * Seasonal credit a beet factory needs (nominal cents): grower payments for a campaign's beets
 * are carried in inventory until the sugar is sold through the year.
 */
export function sugarLineNeed(state: GameState): Cents {
  if (!sugarSites(state).factories.length) return 0;
  const mi = state.clock.monthIndex;
  const year = yearOf(mi);
  const tons = suggestedAcres(state, year) * beetYield(year);
  return roundCents(tons * productValuePerTon(state, mi, beetSugarTrend(year)) * state.coop.sugarPolicy.growerShare * SUGAR_FINANCE.initialPaymentShare.value * 100);
}

/**
 * Take over a selling company's campaign in progress (D-134): when growers buy a factory in
 * winter or spring, the beets still in its piles and the sugar in its silos come with it, at
 * what they cost the company, carried on the seasonal line. Returns what was paid (cents).
 */
export function takeOverCampaign(state: GameState, factory: Facility): Cents {
  const mi = state.clock.monthIndex;
  const month = monthOf(mi);
  if (month > SUGAR.campaignEndMonth) return 0;
  const crop = yearOf(mi) - 1;
  const tons = suggestedAcres(state, crop) * beetYield(crop);
  if (tons <= 0) return 0;
  const path = pathFor(state);
  const perMonth = sugarCapacity(state).tpd * 30 * sugarUptime(state);
  // Slicing has run since September; sugar has been sold evenly since then.
  const months = month + 12 - SUGAR.harvest.prepileMonth;
  const sliced = Math.min(tons, perMonth * months);
  const piled = tons - sliced;
  const sugarPct = beetSugarTrend(crop);
  const made = (sliced * 2000 * sugarPct) / 100 / 100 * recovery(state, crop);
  const cwt = made * Math.max(0, 1 - months / 12);
  const share = state.coop.sugarPolicy.growerShare;
  const pileCost = roundCents(piled * productValuePerTon(state, mi, sugarPct) * share * 100);
  const sugarCost = roundCents(cwt * marketValue(path, 'sugar', mi) * Math.min(0.95, share + SUGAR_COMPANY.takeoverProcessingShare.value) * 100);
  const book = state.coop.sugar;
  if (piled > 0) book.piles = [{ facilityId: factory.id, tons: piled }];
  book.pileSugarPct = sugarPct;
  book.pileCost = pileCost;
  book.sugarCwt = cwt;
  book.sugarCost = sugarCost;
  const acres = Math.round(tons / beetYield(crop));
  book.campaigns = [...book.campaigns, {
    year: crop, contractedAcres: acres, growers: 0, deliveredTons: tons, leftInFieldTons: 0, avgSugarPct: sugarPct,
    slicedTons: sliced, sugarCwt: made, pulpTons: sliced * SUGAR.pulpTonsPerTon.value, molassesTons: sliced * SUGAR.molassesTonsPerTon.value,
    storageLossTons: 0, growerPayments: 0, ...(piled > 0 ? {} : { closed: true }),
  }];
  const paid = pileCost + sugarCost;
  if (paid > 0) {
    post(state, {
      source: 'sugar-takeover', memo: 'Beets in the piles and sugar in the silos taken over with the factory',
      lines: [{ account: '1260', division: DIV, amount: paid, facilityId: factory.id }, { account: '2000', division: 'CORP', amount: -paid }],
    });
  }
  return paid;
}

/**
 * Beet shares stay with the land (D-134): shares of members who have left are sold to growers
 * near the plants, in proportion to the rotation acres they could plant, and their stock goes
 * with them. The money changes hands between farmers; the co-op's equity is unchanged.
 */
function transferShares(state: GameState, buyers: Member[]): void {
  const sellers = state.members.list.filter((m) => m.status !== 'active' && (m.beetShares ?? 0) > 0).sort((a, b) => a.id - b.id);
  if (!sellers.length || !buyers.length) return;
  const room = buyers.map((m) => Math.max(0, (m.acres.corn + m.acres.soybeans + (m.beetAcres ?? 0)) * SUGAR.maxRotationShare.value - (m.beetShares ?? 0)) * m.weight);
  const totalRoom = room.reduce((a, b) => a + b, 0);
  if (totalRoom <= 0) return;
  const pref = state.equity.preferredStock;
  for (const sel of sellers) {
    const shares = (sel.beetShares ?? 0) * sel.weight;
    const stock = pref[sel.id] ?? 0;
    let movedStock = 0;
    buyers.forEach((b, i) => {
      const part = room[i] / totalRoom;
      if (part <= 0) return;
      b.beetShares = (b.beetShares ?? 0) + (shares * part) / b.weight;
      const cents = Math.floor(stock * part);
      movedStock += cents;
      if (cents) pref[b.id] = (pref[b.id] ?? 0) + cents;
    });
    // Rounding pennies go to the grower who took the most.
    const top = buyers[room.indexOf(Math.max(...room))];
    if (stock - movedStock) pref[top.id] = (pref[top.id] ?? 0) + stock - movedStock;
    sel.beetShares = 0;
    if (stock) delete pref[sel.id];
  }
}
