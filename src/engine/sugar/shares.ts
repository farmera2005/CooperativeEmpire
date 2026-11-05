// The beet share market (D-137). Growers buy and sell beet shares among themselves each January,
// before contracts are signed: growers who quit farming must sell, growers whose rotation shrank
// sell the excess, and a few more trade for ordinary reasons (estates, reorganizing); growers
// short of shares, farms buying in and growers with rotation room buy. The price follows what a
// share earns — a few years of beets' advantage over corn — and moves with supply and demand.
// Stock moves with the shares; the co-op's equity is unchanged. If the board closes trading, the
// co-op redeems a departing grower's shares at their book value instead.

import { SHARE_MARKET, SUGAR } from '../../data/sugar';
import { roundCents, type Cents } from '../core/money';
import { stream } from '../core/rng';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { GameState, Member } from '../types';
import { pathFor, priceLevel } from '../world/macro';
import { growerReturns, growersNear, makeMember } from './operate';

const rotationRoom = (m: Member) => Math.max(0, (m.acres.corn + m.acres.soybeans + (m.beetAcres ?? 0)) * SUGAR.maxRotationShare.value);

/** What a share is worth to a grower now ($): a few years of beets' advantage over corn. */
export function shareValue(state: GameState): number {
  const { beets, corn } = growerReturns(state, state.clock.monthIndex);
  return Math.max(0, beets - corn) * SHARE_MARKET.paybackYears.value;
}

/** Last market price adjusted to today's dollars ($), or 0 before any trading. */
export function marketPrice(state: GameState): number {
  const log = state.coop.sugar.shareMarket ?? [];
  const last = log[log.length - 1];
  if (!last) return 0;
  const path = pathFor(state);
  return (last.price / 100) * (priceLevel(path, state.clock.monthIndex) / priceLevel(path, last.monthIndex));
}

interface Offer { m: Member; shares: number }

/** January: growers trade shares (or the co-op redeems departing growers' shares when trading is closed). */
export function stepShareMarket(ctx: TickContext): void {
  const { state, mi } = ctx;
  const book = state.coop.sugar;
  const towns = state.coop.facilities.filter((f) => (f.kind === 'sugarfactory' || f.kind === 'beetstation') && f.status !== 'closed').map((f) => f.townId).sort((a, b) => a - b);
  const holders = state.members.list.filter((m) => (m.beetShares ?? 0) > 1e-9).sort((a, b) => a.id - b.id);
  if (!holders.length) return;
  const pref = state.equity.preferredStock;

  if (state.coop.sugarPolicy.shareTrading === false || !towns.length) {
    // Closed: the co-op buys back a departing grower's shares at book value.
    let redeemed = 0;
    let cash = 0;
    for (const m of holders) {
      if (m.status === 'active') continue;
      const stock = pref[m.id] ?? 0;
      redeemed += (m.beetShares ?? 0) * m.weight;
      m.beetShares = 0;
      if (stock > 0) {
        delete pref[m.id];
        cash += stock;
        post(state, { source: 'share-redeem', memo: `Beet shares redeemed: ${m.name}`, lines: [{ account: '3100', division: 'SUGAR', amount: stock, memberId: m.id }, { account: '1000', division: 'SUGAR', amount: -stock }] });
      }
    }
    if (redeemed > 0) book.shareMarket = [...(book.shareMarket ?? []), { monthIndex: mi, price: 0, traded: 0, buyers: 0, sellers: 0, offered: 0, redeemed: Math.round(redeemed), redeemedCost: cash }].slice(-30);
    return;
  }

  // ---- what is offered ----
  const rng = (id: number) => stream(state.setup.gameSeed, mi, 'sugar.shares', id);
  const offers: Offer[] = [];
  for (const m of holders) {
    const have = m.beetShares ?? 0;
    if (m.status !== 'active') { offers.push({ m, shares: have }); continue; }
    // A grower whose rotation shrank sells what it cannot plant; a few sell some for ordinary reasons.
    let sell = Math.max(0, have - rotationRoom(m) * SHARE_MARKET.excessHolding.value);
    if (rng(m.id).chance(SHARE_MARKET.annualTurnover.value)) sell = Math.max(sell, have * SHARE_MARKET.turnoverSellShare.value);
    if (sell >= 1) offers.push({ m, shares: Math.floor(sell) });
  }

  // ---- price: last year's moved toward what a share earns ----
  const value = shareValue(state);
  const prev = marketPrice(state) || value;

  // ---- who wants to buy ----
  const buyers = growersNear(state, towns, (t) => t, true).map((g) => g.m).filter((m) => rotationRoom(m) - (m.beetShares ?? 0) >= 10);
  const pull = prev > 0 ? Math.min(SHARE_MARKET.maxBuyShare.value, SHARE_MARKET.buyShareAtValue.value * (value / prev)) : SHARE_MARKET.maxBuyShare.value;
  const short = (m: Member) => Math.max(0, (m.beetAcres ?? 0) - (m.beetShares ?? 0));
  const want = (m: Member) => Math.max(short(m), (rotationRoom(m) - (m.beetShares ?? 0)) * pull);
  const order = [...buyers].sort((a, b) => short(b) - short(a) || Number((a.beetShares ?? 0) > 0) - Number((b.beetShares ?? 0) > 0) || want(b) - want(a) || a.id - b.id);
  const supply = offers.reduce((a, o) => a + o.shares * o.m.weight, 0);
  const demand = order.reduce((a, m) => a + Math.floor(want(m)) * m.weight, 0);
  const traded = Math.min(supply, demand);
  const imbalance = supply + demand > 0 ? (demand - supply) / (demand + supply) : 0;
  const price = Math.max(SHARE_MARKET.minPrice.value * priceLevel(pathFor(state), mi), (1 - SHARE_MARKET.anchorWeight.value) * prev * (1 + SHARE_MARKET.imbalanceSlope.value * imbalance) + SHARE_MARKET.anchorWeight.value * value);

  // ---- matching: estates sell first, then everyone else alike ----
  let toSell = traded;
  const sold = new Map<number, number>();
  for (const o of offers.filter((x) => x.m.status !== 'active')) {
    const n = Math.min(toSell, o.shares * o.m.weight);
    sold.set(o.m.id, n);
    toSell -= n;
  }
  const rest = offers.filter((x) => x.m.status === 'active');
  const restTotal = rest.reduce((a, o) => a + o.shares * o.m.weight, 0);
  for (const o of rest) sold.set(o.m.id, restTotal > 0 ? (toSell * o.shares * o.m.weight) / restTotal : 0);

  // Stock that moves: each seller's stock in proportion to the shares sold.
  let stockPool = 0;
  let sellers = 0;
  for (const o of offers) {
    const n = sold.get(o.m.id) ?? 0;
    if (n <= 0) continue;
    const have = (o.m.beetShares ?? 0) * o.m.weight;
    const stock = pref[o.m.id] ?? 0;
    const move = have - n <= 1e-6 ? stock : Math.floor((stock * n) / have);
    o.m.beetShares = Math.max(0, (have - n) / o.m.weight);
    if (o.m.beetShares < 1e-6) o.m.beetShares = 0;
    if (move) {
      if (move === stock) delete pref[o.m.id];
      else pref[o.m.id] = stock - move;
    }
    stockPool += move;
    sellers += o.m.weight;
  }
  let left = traded;
  let buyersN = 0;
  let movedStock = 0;
  let first: Member | null = null;
  for (const b of order) {
    if (left <= 1e-9) break;
    const take = Math.min(left, Math.floor(want(b)) * b.weight);
    if (take <= 0) continue;
    if (b.kind !== 'member') makeMember(state, b);
    b.beetShares = (b.beetShares ?? 0) + take / b.weight;
    const cents = traded > 0 ? Math.floor((stockPool * take) / traded) : 0;
    if (cents) pref[b.id] = (pref[b.id] ?? 0) + cents;
    movedStock += cents;
    left -= take;
    buyersN += b.weight;
    first ??= b;
  }
  if (first && stockPool - movedStock) pref[first.id] = (pref[first.id] ?? 0) + stockPool - movedStock;
  book.shareMarket = [...(book.shareMarket ?? []), {
    monthIndex: mi, price: roundCents(price * 100), traded: Math.round(traded), buyers: Math.round(buyersN), sellers: Math.round(sellers), offered: Math.round(supply),
  }].slice(-30);
  if (traded >= 1) ctx.summary.push(`Growers traded ${Math.round(traded).toLocaleString('en-US')} beet shares at about $${Math.round(price).toLocaleString('en-US')} a share.`);
}

export type { Cents };
