// Livestock the co-op owns (D-111). The feed division buys feeder pigs or calves, places them
// with contract growers (hogs) or in a custom feedlot (cattle), feeds them — from our own mill
// at cost when it has room after customers, otherwise bought in — and sells them to packers on
// the spot market, on a formula contract that pays a quality premium, or at a price fixed when
// they were placed. Animals are inventory (1250) carried at cost; a sale books revenue (4050)
// and the cost of livestock sold (5050).

import { LINES, LIVESTOCK } from '../../data/supply';
import { valueAt } from '../../data/types';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents, type Cents } from '../core/money';
import { liquidity } from '../finance/lender';
import { grainCostIndex } from '../grain/prices';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { GameState, LivestockBook, LivestockCohort, LivestockKind, LivestockMarketing } from '../types';
import { marketValue, type MarketPath } from '../world/marketPath';
import { pathFor, priceLevel } from '../world/macro';
import { lineCost } from './prices';

const L = LIVESTOCK;
export const LIVESTOCK_KINDS: LivestockKind[] = ['hogs', 'cattle'];
const SERIES: Record<LivestockKind, 'hogs' | 'cattle'> = { hogs: 'hogs', cattle: 'cattle' };

export function emptyLivestock(): LivestockBook {
  return { program: { hogs: { headPerMonth: 0, marketing: 'spot' }, cattle: { headPerMonth: 0, marketing: 'spot' } }, cohorts: [], nextId: 1, sales: [] };
}

/** Months on feed for animals placed this year. */
export const monthsOnFeed = (kind: LivestockKind, year: number): number => Math.max(1, Math.round(valueAt(L[kind].days, year) / 30.4));

/** Live weight at sale (lb). */
export const saleWeight = (kind: LivestockKind, year: number): number => valueAt(L[kind].outWeight, year);

/** Feed per head over the whole feeding period (tons as fed). */
export function feedTonsPerHead(kind: LivestockKind, year: number): number {
  if (kind === 'cattle') return valueAt(L.cattle.feedTons, year);
  return ((saleWeight('hogs', year) - L.hogs.inWeight) * valueAt(L.hogs.feedConversion, year)) / 2000;
}

/** Our own hog ration cost ($/ton nominal), from the feed division's cost model. */
function rationCost(state: GameState, path: MarketPath, mi: number): number {
  const pl = priceLevel(path, mi);
  const idx = (grainCostIndex(path, mi) + pl) / 2;
  return lineCost(state, path, LINES.FEED_SWINE, mi, idx, pl);
}

/** Feeder animal price per head ($ nominal). */
export function feederPrice(kind: LivestockKind, path: MarketPath, mi: number): number {
  const p = marketValue(path, SERIES[kind], mi);
  const year = yearOf(mi);
  return kind === 'hogs' ? p * L.hogs.feederRatio.value : (valueAt(L.cattle.inWeight, year) / 100) * p * valueAt(L.cattle.feederRatio, year);
}

/** Can the co-op run this program now? Returns the reason if not. */
export function livestockBlocked(state: GameState, kind: LivestockKind): string | null {
  if (yearOf(state.clock.monthIndex) < L[kind].from) return `Contract ${kind === 'hogs' ? 'hog production' : 'cattle feeding'} is not available until ${L[kind].from}.`;
  if (!state.coop.facilities.some((f) => f.division === 'FEED' && f.status === 'operating' && (f.components['feed-mill'] ?? 0) > 0)) return 'A livestock program needs one of our feed mills in operation.';
  return null;
}

/** A rough per-head margin at today's prices, for the screen (nominal $). */
export function projectedMargin(state: GameState, kind: LivestockKind): { revenue: number; cost: number; margin: number } {
  const path = pathFor(state);
  const mi = state.clock.monthIndex;
  const year = yearOf(mi);
  const ration = rationCost(state, path, mi) * (kind === 'cattle' ? L.cattle.rationFactor.value : 1);
  const feed = feedTonsPerHead(kind, year) * ration;
  const fees = kind === 'hogs'
    ? (L.hogs.growerFee2024.value + L.hogs.otherCost2024.value) * priceLevel(path, mi)
    : (L.cattle.yardagePerDay2024.value * valueAt(L.cattle.days, year) + L.cattle.otherCost2024.value) * priceLevel(path, mi);
  const prog = state.coop.livestock?.program[kind];
  const premium = prog?.marketing === 'formula' ? L[kind].formulaPremium.value : 0;
  const revenue = (1 - L[kind].deathLoss.value) * (saleWeight(kind, year) / 100) * marketValue(path, SERIES[kind], mi) * (1 + premium);
  const cost = feederPrice(kind, path, mi) + feed + fees;
  return { revenue, cost, margin: revenue - cost };
}

export function setLivestockProgram(s: GameState, kind: LivestockKind, headPerMonth: number, marketing: LivestockMarketing): CommandMessage[] {
  if (!LIVESTOCK_KINDS.includes(kind)) return [{ level: 'error', text: 'Unknown livestock type.' }];
  if (!['spot', 'formula', 'fixed'].includes(marketing)) return [{ level: 'error', text: 'Unknown marketing choice.' }];
  const head = Math.round(headPerMonth);
  if (!(head >= 0 && head <= L[kind].maxPerMonth)) return [{ level: 'error', text: `Between 0 and ${L[kind].maxPerMonth} head a month.` }];
  if (head > 0) {
    const blocked = livestockBlocked(s, kind);
    if (blocked) return [{ level: 'error', text: blocked }];
  }
  const book = s.coop.livestock ?? emptyLivestock();
  s.coop.livestock = { ...book, program: { ...book.program, [kind]: { headPerMonth: head, marketing } } };
  return [{ level: 'info', text: head ? `${head.toLocaleString('en-US')} ${kind === 'hogs' ? 'pigs' : 'calves'} a month will be placed, sold ${marketing === 'spot' ? 'on the spot market' : marketing === 'formula' ? 'on a packer formula contract' : 'at a price fixed at placement'}.` : `${kind === 'hogs' ? 'Hog' : 'Cattle'} placements stopped; animals on feed will be finished and sold.` }];
}

/** Monthly: sell finished groups, feed the rest, place new ones. */
export function stepLivestock(ctx: TickContext): void {
  const { state, path, mi } = ctx;
  const book0 = state.coop.livestock;
  if (!book0 || (!book0.cohorts.length && !LIVESTOCK_KINDS.some((k) => book0.program[k].headPerMonth > 0))) return;
  const book: LivestockBook = { ...book0, cohorts: book0.cohorts.map((c) => ({ ...c })), sales: book0.sales.slice() };
  const year = yearOf(mi);
  const pl = priceLevel(path, mi);

  // 1. Sell groups that are finished.
  for (const c of book.cohorts.filter((x) => x.sellMonth <= mi)) {
    const sold = Math.round(c.head * (1 - c.deathLoss));
    const spot = marketValue(path, SERIES[c.kind], mi);
    const price = c.marketing === 'fixed' && c.lockedPrice ? c.lockedPrice : spot * (1 + (c.marketing === 'formula' ? L[c.kind].formulaPremium.value : 0));
    const revenue = roundCents(sold * (saleWeight(c.kind, yearOf(c.placedMonth)) / 100) * price * 100);
    post(state, {
      source: 'livestock-sale', memo: `${sold.toLocaleString('en-US')} ${c.kind === 'hogs' ? 'market hogs' : 'fed steers'} sold`,
      lines: [
        { account: '1000', division: 'FEED', amount: revenue },
        { account: '4050', division: 'FEED', amount: -revenue },
        { account: '5050', division: 'FEED', amount: c.cost },
        { account: '1250', division: 'FEED', amount: -c.cost },
      ],
    });
    book.sales = [...book.sales, { monthIndex: mi, kind: c.kind, head: sold, revenue, cost: c.cost }].slice(-36);
  }
  book.cohorts = book.cohorts.filter((x) => x.sellMonth > mi);

  // 2. Feed and care for the groups on feed. Our mill feeds them from whatever room customers leave.
  const millReport = state.coop.supply.FEED.report;
  const mill = millReport && millReport.monthIndex === mi ? millReport.capacity.find((x) => x.label === 'Feed mill') : undefined;
  let spare = mill ? Math.max(0, mill.available - mill.used) : 0;
  const ration = rationCost(state, path, mi);
  let taken = 0;
  for (const c of book.cohorts) {
    const months = Math.max(1, c.sellMonth - c.placedMonth);
    const placedYear = yearOf(c.placedMonth);
    const alive = c.head * (1 - c.deathLoss / 2);
    const tons = (feedTonsPerHead(c.kind, placedYear) * alive) / months;
    let cost: number;
    if (c.kind === 'hogs') {
      const own = Math.min(spare, tons);
      spare -= own;
      cost = own * ration + (tons - own) * ration * (1 + L.commercialFeedMarkup.value);
    } else {
      // The custom feedlot supplies the ration and charges for it.
      cost = tons * ration * L.cattle.rationFactor.value;
    }
    const fee = c.kind === 'hogs'
      ? ((L.hogs.growerFee2024.value + L.hogs.otherCost2024.value) * pl * c.head) / months
      : ((L.cattle.yardagePerDay2024.value * valueAt(L.cattle.days, placedYear) + L.cattle.otherCost2024.value) * pl * c.head) / months;
    const add = roundCents((cost + fee) * 100);
    c.cost += add;
    taken += add;
  }
  if (taken > 0) post(state, { source: 'livestock-feed', memo: `Feed, grower and feedlot charges for livestock on feed`, lines: [{ account: '1250', division: 'FEED', amount: taken }, { account: '1000', division: 'FEED', amount: -taken }] });

  // 3. Place this month's groups.
  for (const kind of LIVESTOCK_KINDS) {
    const prog = book.program[kind];
    if (prog.headPerMonth <= 0) continue;
    const blocked = livestockBlocked(state, kind);
    if (blocked) {
      book.program = { ...book.program, [kind]: { ...prog, headPerMonth: 0 } };
      ctx.inbox({ kind: 'alert', title: `${kind === 'hogs' ? 'Hog' : 'Cattle'} placements stopped`, body: blocked });
      continue;
    }
    const cost: Cents = roundCents(prog.headPerMonth * feederPrice(kind, path, mi) * 100);
    if (cost > liquidity(state)) {
      ctx.summary.push(`No ${kind === 'hogs' ? 'pigs' : 'calves'} placed: ${formatCents(cost)} needed and the cash and line are short.`);
      continue;
    }
    const shock = kind === 'hogs' ? L.hogs.deathLossShock.value[year] : undefined;
    const c: LivestockCohort = {
      id: book.nextId++, kind, head: prog.headPerMonth, placedMonth: mi, sellMonth: mi + monthsOnFeed(kind, year), cost,
      marketing: prog.marketing, deathLoss: shock ?? L[kind].deathLoss.value,
      ...(prog.marketing === 'fixed' ? { lockedPrice: marketValue(path, SERIES[kind], mi) } : {}),
    };
    post(state, { source: 'livestock-buy', memo: `${c.head.toLocaleString('en-US')} ${kind === 'hogs' ? 'feeder pigs' : 'feeder steers'} placed`, lines: [{ account: '1250', division: 'FEED', amount: cost }, { account: '1000', division: 'FEED', amount: -cost }] });
    book.cohorts = [...book.cohorts, c];
  }
  state.coop.livestock = book;
}
