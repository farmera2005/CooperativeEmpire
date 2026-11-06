// Selling the sugar (D-141). Beet co-ops sell most of their sugar in bulk to food makers, a
// good part of it forward under annual contracts priced before the marketing year (October to
// September), and bag or pack the rest for wholesale grocers and foodservice distributors and
// for grocery shelves under their own brand or grocers' store brands. Bulk sugar sells at the
// market; bagged sugar earns a small premium; retail packs follow the shelf price, which trails
// wholesale by about a year, less the grocer's margin, packaging, freight and trade promotion.
// Retail volume is held by the packaging line and by the shelf space the brand can win.

import { SUGAR, SUGAR_SALES } from '../../data/sugar';
import { TERRITORY } from '../../data/tuning';
import { valueAt } from '../../data/types';
import { monthOf, yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { GameState, SugarChannel, SugarSalesPolicy } from '../types';
import { nominalCents, pathFor, priceLevel } from '../world/macro';
import { marketValue } from '../world/marketPath';
import type { MarketPath } from '../world/marketPath';

export const SUGAR_CHANNELS: SugarChannel[] = ['contract', 'spot', 'wholesale', 'retail'];

/** What a co-op with no sales policy did before D-141: everything in bulk at the market, through an agency. */
const LEGACY: SugarSalesPolicy = { forwardShare: 0, wholesaleShare: 0, retailShare: 0, brand: 'none', selling: 'agency' };

/** The sales mix a new game starts with: most sugar forward to food makers, some bagged and packed. */
export const defaultSugarSales = (): SugarSalesPolicy => ({ forwardShare: 0.5, wholesaleShare: 0.15, retailShare: 0.15, brand: 'modest', selling: 'agency' });

export const sugarSalesPolicy = (state: GameState): SugarSalesPolicy => state.coop.sugarPolicy.sales ?? LEGACY;

/** Marketing year that a month's sales belong to (October–September), named for the crop. */
export const marketingYear = (mi: number): number => (monthOf(mi) >= SUGAR_SALES.contractMonth ? yearOf(mi) : yearOf(mi) - 1);

/** The selling cost as a share of sales: the agency's fee, or our own sales costs that vary with sales. */
export const sellingFee = (state: GameState): number => (sugarSalesPolicy(state).selling === 'direct' ? SUGAR_SALES.directFeePct.value : SUGAR.marketingCostPct.value);

/** Average wholesale price over the months the shelf price follows. */
export function trailingSugarPrice(path: MarketPath, mi: number): number {
  const n = SUGAR_SALES.retailLagMonths;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += marketValue(path, 'sugar', mi - k);
  return sum / n;
}

/** How much of the world's shelves and distributors our sales reach: larger worlds hold more grocers. */
const marketScale = (state: GameState): number => Math.sqrt(TERRITORY.sizes.value[state.setup.territorySize ?? 'standard'] ?? 1);

export interface ChannelQuote {
  channel: SugarChannel;
  /** Price the buyer pays, $/cwt, and our own costs to serve the channel, $/cwt, before the selling fee. */
  price: number;
  cost: number;
  /** Price less the selling fee and the channel's costs: what a cwt brings home. */
  net: number;
  why: string;
}

/** What a cwt brings in each channel this month (the "why" of the sales mix). */
export function channelQuotes(state: GameState, mi: number): ChannelQuote[] {
  const path = pathFor(state);
  const p = marketValue(path, 'sugar', mi);
  const pl = priceLevel(path, mi);
  const fee = sellingFee(state);
  const book = state.coop.sugar;
  const contract = book.contractPrice?.year === marketingYear(mi) ? book.contractPrice.price : p;
  const wholesale = p * (1 + SUGAR_SALES.wholesalePremium.value);
  const bagging = SUGAR_SALES.wholesaleBagging2024.value * pl;
  const shelf = trailingSugarPrice(path, mi) * valueAt(SUGAR_SALES.retailMarkup, yearOf(mi));
  const brand = book.brand ?? 0;
  const pl0 = SUGAR_SALES.privateLabelPrice.value;
  const toGrocer = shelf * (1 - SUGAR_SALES.grocerMargin.value) * (pl0 + (1 - pl0) * brand);
  const retailCost = (SUGAR_SALES.packaging2024.value + SUGAR_SALES.retailFreight2024.value) * pl + toGrocer * SUGAR_SALES.tradePromotion.value;
  const q = (channel: SugarChannel, price: number, cost: number, why: string): ChannelQuote => ({ channel, price, cost, net: price * (1 - fee) - cost, why });
  return [
    q('contract', contract, 0, book.contractPrice?.year === marketingYear(mi) ? `bulk to food makers at the price contracted last October` : 'no contract yet this marketing year: sold at the market'),
    q('spot', p, 0, 'bulk to food makers at the market'),
    q('wholesale', wholesale, bagging, `${Math.round(SUGAR_SALES.wholesalePremium.value * 100)}% over bulk, less $${bagging.toFixed(2)} of bagging`),
    q('retail', toGrocer, retailCost, `shelf $${shelf.toFixed(2)} (a year's wholesale × ${valueAt(SUGAR_SALES.retailMarkup, yearOf(mi)).toFixed(2)}) less the grocer's ${Math.round(SUGAR_SALES.grocerMargin.value * 100)}%${brand < 0.99 ? `, at ${Math.round((pl0 + (1 - pl0) * brand) * 100)}% of a strong brand's price` : ''}; packaging, freight and trade promotion $${retailCost.toFixed(2)}`),
  ];
}

/** Yearly limits on the packed channels (cwt): distributors' demand, shelf space and the packaging lines. */
export function channelLimits(state: GameState): { wholesale: number; shelf: number; packing: number } {
  const scale = marketScale(state);
  const floor = SUGAR_SALES.shelfReachFloor.value;
  const packing = state.coop.facilities
    .filter((f) => f.kind === 'sugarfactory' && f.status === 'operating')
    .reduce((a, f) => a + (f.components['sugar-packaging'] ?? 0), 0);
  return {
    wholesale: SUGAR_SALES.wholesaleMarketCwt.value * scale,
    shelf: SUGAR_SALES.retailMarketCwt.value * scale * (floor + (1 - floor) * (state.coop.sugar.brand ?? 0)),
    packing,
  };
}

/** Split a month's regular sales (cwt) among the channels. */
export function planSales(state: GameState, cwt: number): Record<SugarChannel, number> {
  const pol = sugarSalesPolicy(state);
  const lim = channelLimits(state);
  const retail = Math.max(0, Math.min(cwt * clamp(pol.retailShare, 0, SUGAR_SALES.maxShare.retail), lim.shelf / 12, lim.packing / 12));
  const wholesale = Math.max(0, Math.min(cwt * clamp(pol.wholesaleShare, 0, SUGAR_SALES.maxShare.wholesale), lim.wholesale / 12, cwt - retail));
  const bulk = Math.max(0, cwt - retail - wholesale);
  const contract = bulk * clamp(pol.forwardShare, 0, 1);
  return { contract, spot: bulk - contract, wholesale, retail };
}

/**
 * Monthly, before the sugar is sold: price October's industrial contracts for the marketing
 * year, move the brand toward what its support builds, and pay for brand support and a sales
 * office if we sell ourselves.
 */
export function stepSugarSales(ctx: TickContext): void {
  const { state, mi, path } = ctx;
  const book = state.coop.sugar;
  const owns = state.coop.facilities.some((f) => f.kind === 'sugarfactory' && f.status === 'operating');
  const pol = sugarSalesPolicy(state);
  if (monthOf(mi) === SUGAR_SALES.contractMonth && pol.forwardShare > 0 && owns) {
    book.contractPrice = { year: marketingYear(mi), price: Math.round(marketValue(path, 'sugar', mi) * 100) / 100 };
  }
  if (!owns) return;
  const support = SUGAR_SALES.brand.value[pol.brand];
  const b = book.brand ?? 0;
  book.brand = clamp(b + (support.target - b) / SUGAR_SALES.brandMonths, 0, 1);
  const yearly = support.cost2024 + (pol.selling === 'direct' ? SUGAR_SALES.directOffice2024.value : 0);
  const cost: Cents = yearly > 0 ? nominalCents(path, mi, yearly / 12) : 0;
  if (cost > 0) post(state, { source: 'sugar-selling', memo: pol.selling === 'direct' ? 'Sugar sales office and brand support' : 'Sugar brand support', lines: [{ account: '7690', division: 'SUGAR', amount: cost }, { account: '1000', division: 'SUGAR', amount: -cost }] });
}

/** Cost of the packed channels' own work this month, by account (cents): bagging and packaging, freight, trade promotion. */
export function channelCosts(state: GameState, mi: number, plan: Record<SugarChannel, number>): { packaging: Cents; freight: Cents; promotion: Cents } {
  const path = pathFor(state);
  const pl = priceLevel(path, mi);
  const retail = channelQuotes(state, mi).find((q) => q.channel === 'retail')!;
  return {
    packaging: roundCents((plan.wholesale * SUGAR_SALES.wholesaleBagging2024.value + plan.retail * SUGAR_SALES.packaging2024.value) * pl * 100),
    freight: roundCents(plan.retail * SUGAR_SALES.retailFreight2024.value * pl * 100),
    promotion: roundCents(plan.retail * retail.price * SUGAR_SALES.tradePromotion.value * 100),
  };
}
