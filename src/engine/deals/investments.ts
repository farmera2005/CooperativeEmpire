// Investments in larger ag businesses (D-112). Each January the market brings a few offers to
// take an equity stake in a fictional plant — ethanol, biodiesel, soybean crushing, a shuttle
// loader, a producers' packing plant, wind, sugar — that fit the era. A stake is an
// equity-method investment (account 1450): our share of the plant's earnings posts monthly and
// half is paid out at fiscal year end (the joint-venture machinery). Young plants and plants
// coming off a losing year can fail and be written off. A stake can be sold.

import { INVEST_MARKET, INVESTMENTS, type InvestmentType } from '../../data/investments';
import { formatMonth, monthOf, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import { stream } from '../core/rng';
import { liquidity } from '../finance/lender';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { GameState, InvestOffer, JointVenture } from '../types';
import { nominalCents, pathFor } from '../world/macro';

const DEFS = INVESTMENTS.value;
export const INVESTMENT_TYPES = Object.keys(DEFS) as InvestmentType[];
const err = (text: string): CommandMessage[] => [{ level: 'error', text }];

/** The industry's return on equity in a year: known years from the record, others the mean with seeded noise. */
export function investmentReturn(s: GameState, type: InvestmentType, year: number): number {
  const d = DEFS[type];
  if (d.years[year] !== undefined) return d.years[year];
  const rng = stream(s.setup.gameSeed, year * 12, 'invest.return', INVESTMENT_TYPES.indexOf(type));
  return clamp(d.mean + d.sd * rng.normal(0, 1), -0.6, 0.8);
}

/** The type of a joint venture that is an investment (legacy ethanol stakes included). */
export const investmentTypeOf = (jv: JointVenture): InvestmentType | null => jv.investmentType ?? (jv.ethanol ? 'ethanol' : null);

export function investInVenture(s: GameState, offerId: number, amount: Cents): CommandMessage[] {
  const o = (s.investOffers ?? []).find((x) => x.id === offerId);
  if (!o || o.expiresMonth < s.clock.monthIndex) return err('That offer is no longer open.');
  const stake = Math.round(amount);
  if (stake < o.minStake || stake > o.maxStake) return err(`The stake must be between ${formatCents(o.minStake)} and ${formatCents(o.maxStake)}.`);
  if (stake > liquidity(s)) return err(`Not enough cash and line of credit for ${formatCents(stake)}.`);
  const d = DEFS[o.type];
  post(s, { source: 'investment', memo: `Equity stake in ${o.name}`, lines: [{ account: '1450', division: d.division, amount: stake }, { account: '1000', division: 'CORP', amount: -stake }] });
  const jv: JointVenture = {
    id: 200000 + o.id, investmentType: o.type, name: o.name, partnerName: 'farmer investors', division: d.division,
    sharePct: clamp(stake / o.plantEquity, 0.001, 1), investment: stake, scale: stake, formedMonth: s.clock.monthIndex, earningsYtd: 0,
  };
  s.jvs = [...s.jvs, jv];
  s.investOffers = (s.investOffers ?? []).filter((x) => x.id !== o.id);
  return [{ level: 'info', text: `We own ${(jv.sharePct * 100).toFixed(1)}% of ${o.name} for ${formatCents(stake)}.` }];
}

/** What a buyer pays for our stake: book value, more after a good year, less after a bad one. */
export function stakeSalePrice(s: GameState, jv: JointVenture): Cents {
  const type = investmentTypeOf(jv);
  const last = type ? investmentReturn(s, type, yearOf(s.clock.monthIndex) - 1) : 0;
  return roundCents(jv.investment * clamp(INVEST_MARKET.saleBase.value + INVEST_MARKET.saleReturnFactor.value * last, 0.3, 1.5));
}

export function sellStake(s: GameState, jvId: number): CommandMessage[] {
  const jv = s.jvs.find((x) => x.id === jvId);
  if (!jv || !investmentTypeOf(jv)) return err('That is not an investment we can sell.');
  const price = stakeSalePrice(s, jv);
  const gain = price - jv.investment;
  post(s, {
    source: 'investment-sale', memo: `Sale of our stake in ${jv.name}`,
    lines: [{ account: '1000', division: 'CORP', amount: price }, { account: '1450', division: jv.division, amount: -jv.investment }, { account: '8200', division: jv.division, amount: -gain }],
  });
  s.jvs = s.jvs.filter((x) => x.id !== jv.id);
  return [{ level: 'info', text: `Sold our stake in ${jv.name} for ${formatCents(price)}, a ${gain >= 0 ? 'gain' : 'loss'} of ${formatCents(Math.abs(gain))}.` }];
}

/** January: new offers that fit the era, expired ones dropped, and plants that fail written off. */
export function stepInvestments(ctx: TickContext): void {
  const { state, mi } = ctx;
  state.investOffers = (state.investOffers ?? []).filter((o) => o.expiresMonth >= mi);
  if (monthOf(mi) !== 1) return;
  const year = yearOf(mi);
  const rng = ctx.rng('invest.offers');
  const path = pathFor(state);
  for (const type of INVESTMENT_TYPES) {
    if (state.investOffers.length >= INVEST_MARKET.maxOpenOffers) break;
    const d = DEFS[type];
    const w = d.windows.find((x) => year >= x.from && year <= x.to);
    if (!w || !rng.chance(w.prob)) continue;
    const town = state.world.towns[rng.int(0, state.world.towns.length - 1)];
    const offer: InvestOffer = {
      id: state.coop.nextId++, type, name: rng.pick(d.names).replace('{t}', town.name), townId: town.id,
      minStake: nominalCents(path, mi, d.minStake), maxStake: nominalCents(path, mi, d.maxStake), plantEquity: nominalCents(path, mi, d.plantEquity),
      offeredMonth: mi, expiresMonth: mi + INVEST_MARKET.offerMonths,
    };
    state.investOffers = [...state.investOffers, offer];
    ctx.inbox({ kind: 'memo', title: `Investment offer: ${offer.name}`, body: `${d.description} Local investors invite the co-op to take a stake of ${formatCents(offer.minStake)} to ${formatCents(offer.maxStake)}. Such plants have earned about ${Math.round(d.mean * 100)}% a year on equity, but swing widely. The offer is open until ${formatMonth(offer.expiresMonth)} (Deals screen).` });
  }
  // Failures: young plants, and plants coming off a losing year.
  const frng = ctx.rng('invest.failure');
  for (const jv of [...state.jvs]) {
    const type = investmentTypeOf(jv);
    if (!type) continue;
    const f = DEFS[type].failure;
    const age = (mi - jv.formedMonth) / 12;
    const p = (age < f.youngYears ? f.young : 0) + (investmentReturn(state, type, year - 1) < 0 ? f.afterLoss : 0);
    if (p <= 0 || !frng.chance(p)) continue;
    if (jv.investment > 0) post(state, { source: 'investment-loss', memo: `${jv.name} fails; our stake is written off`, lines: [{ account: '8200', division: jv.division, amount: jv.investment }, { account: '1450', division: jv.division, amount: -jv.investment }] });
    state.jvs = state.jvs.filter((x) => x.id !== jv.id);
    ctx.inbox({ kind: 'alert', title: `${jv.name} fails`, body: `${jv.name} has filed for bankruptcy. Our stake of ${formatCents(jv.investment)} is written off.` });
  }
}
