// Regional cooperatives (DESIGN §13): the co-op buys inputs from (and markets grain through)
// the regionals it is affiliated with, and receives annual patronage on those purchases,
// part in cash and part as regional equity that revolves on the regional's schedule.
// Regionals rename and merge on the brand timeline; Farmland and Agway fail in 2002 and
// their locals write off the equity.

import { brandsAvailable, getBrand } from '../../data/brands';
import { AFFILIATION, DEFAULT_AFFILIATION_ORDER, REGIONAL_DEFAULT, REGIONALS, type RegionalCategory } from '../../data/finance';
import { COMMODITIES } from '../../data/grain';
import type { SupplyDivision } from '../../data/supply';
import { valueAt } from '../../data/types';
import { formatCents } from '../core/format';
import { roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { DivisionId, GameSetup, GameState } from '../types';
import { nominalCents, pathFor, priceLevel } from '../world/macro';

export const CATEGORIES: RegionalCategory[] = ['grain', 'agronomy', 'feed', 'energy', 'retail'];
export const CATEGORY_DIVISION: Record<RegionalCategory, DivisionId> = { grain: 'GRAIN', agronomy: 'AGRONOMY', feed: 'FEED', energy: 'ENERGY', retail: 'RETAIL' };
const DIVISION_CATEGORY: Record<SupplyDivision, RegionalCategory> = { AGRONOMY: 'agronomy', FEED: 'feed', ENERGY: 'energy', RETAIL: 'retail' };

export const programOf = (id: string) => REGIONALS[id] ?? REGIONAL_DEFAULT;

export function affiliationFor(state: GameState, cat: RegionalCategory): string | null {
  return state.coop.regionalAffiliations.find((a) => a.lines.includes(cat))?.regionalId ?? null;
}

/** Pick the usual regional for each line when a setup leaves affiliations empty. */
export function defaultAffiliations(year: number, regionId: string): GameSetup['regionalAffiliations'] {
  const avail = new Set(brandsAvailable('regional', year, regionId).map((b) => b.id));
  const out: GameSetup['regionalAffiliations'] = [];
  for (const cat of CATEGORIES) {
    const id = DEFAULT_AFFILIATION_ORDER[cat].find((r) => avail.has(r) && getBrand(r)?.supplies?.includes(cat));
    if (!id) continue;
    const ex = out.find((a) => a.regionalId === id);
    if (ex) ex.lines.push(cat);
    else out.push({ regionalId: id, lines: [cat] });
  }
  return out;
}

export function setAffiliation(state: GameState, cat: RegionalCategory, regionalId: string | null, charge: boolean): string | null {
  const year = Math.floor(state.clock.monthIndex / 12);
  if (regionalId) {
    const br = brandsAvailable('regional', year, state.setup.regionId).find((b) => b.id === regionalId);
    if (!br) return 'That regional is not available.';
    if (!br.supplies?.includes(cat)) return `${br.name} does not supply that line.`;
  }
  const cur = affiliationFor(state, cat);
  if (cur === regionalId) return null;
  const rest = state.coop.regionalAffiliations.map((a) => ({ ...a, lines: a.lines.filter((l) => l !== cat) })).filter((a) => a.lines.length);
  if (regionalId) {
    const ex = rest.find((a) => a.regionalId === regionalId);
    if (ex) ex.lines = [...ex.lines, cat];
    else rest.push({ regionalId, lines: [cat] });
  }
  state.coop.regionalAffiliations = rest;
  if (charge && cur && regionalId) {
    const cost = nominalCents(pathFor(state), state.clock.monthIndex, AFFILIATION.switchCost.value);
    post(state, { source: 'affiliation-switch', memo: 'Re-signage and contract costs of changing regional supplier', lines: [{ account: '7670', division: CATEGORY_DIVISION[cat], amount: cost }, { account: '1000', division: 'CORP', amount: -cost }] });
  }
  return null;
}

/** Monthly: tally this month's purchases from (and grain marketed through) affiliated regionals. */
export function stepRegionalPurchases(ctx: TickContext): void {
  const { state } = ctx;
  const p = state.coop.regional.purchases;
  for (const [d, book] of Object.entries(state.coop.supply) as [SupplyDivision, GameState['coop']['supply'][SupplyDivision]][]) {
    const cat = DIVISION_CATEGORY[d];
    const rid = affiliationFor(state, cat);
    if (!rid || !book.report || book.report.monthIndex !== ctx.mi) continue;
    let cogs = 0;
    for (const ln of Object.values(book.report.lines)) cogs += ln?.cogs ?? 0;
    if (cogs > 0) (p[rid] ??= {})[cat] = (p[rid][cat] ?? 0) + cogs;
  }
  const gid = affiliationFor(state, 'grain');
  const rep = state.coop.grain.report;
  if (gid && rep && rep.monthIndex === ctx.mi) {
    const bu = COMMODITIES.reduce((s, c) => s + rep.byCommodity[c].shippedBu, 0);
    if (bu > 0) (p[gid] ??= {}).grain = (p[gid].grain ?? 0) + bu;
  }
}

export function regionalEquityHeld(state: GameState, id?: string): Cents {
  let t = 0;
  for (const [rid, v] of Object.entries(state.coop.regional.equity)) {
    if (id && rid !== id) continue;
    for (const y in v) t += v[y];
  }
  return t;
}

/** January: renames and mergers, last year's patronage, and revolvement of old equity. */
export function stepRegionalAnnual(ctx: TickContext): void {
  if (ctx.month !== AFFILIATION.patronageMonth) return;
  const { state } = ctx;
  const rb = state.coop.regional;
  const year = ctx.year;

  // Successions (Cenex + Harvest States → CHS, FS Services → GROWMARK, ...).
  const ids = new Set([...state.coop.regionalAffiliations.map((a) => a.regionalId), ...Object.keys(rb.equity), ...Object.keys(rb.purchases)]);
  for (const id of [...ids].sort()) {
    const br = getBrand(id);
    if (!br?.successor || br.availableTo === undefined || year < br.availableTo) continue;
    const to = br.successor;
    if (rb.equity[id]) {
      const dst = (rb.equity[to] ??= {});
      for (const [y, c] of Object.entries(rb.equity[id])) dst[Number(y)] = (dst[Number(y)] ?? 0) + c;
      delete rb.equity[id];
    }
    if (rb.purchases[id]) {
      const dst = (rb.purchases[to] ??= {});
      for (const [k, v] of Object.entries(rb.purchases[id])) dst[k] = (dst[k] ?? 0) + v;
      delete rb.purchases[id];
    }
    let moved = false;
    for (const a of state.coop.regionalAffiliations) if (a.regionalId === id) {
      a.regionalId = to;
      moved = true;
    }
    if (moved) {
      // Merge duplicate affiliations into one entry per regional.
      const merged: typeof state.coop.regionalAffiliations = [];
      for (const a of state.coop.regionalAffiliations) {
        const ex = merged.find((m) => m.regionalId === a.regionalId);
        if (ex) ex.lines = [...new Set([...ex.lines, ...a.lines])];
        else merged.push({ ...a, lines: [...a.lines] });
      }
      state.coop.regionalAffiliations = merged;
      ctx.inbox({ kind: 'news', title: `${br.name} becomes ${getBrand(to)?.name ?? to}`, body: `Our regional supplier ${br.name} is now part of ${getBrand(to)?.name ?? to}. Our affiliation and the equity we hold carry over.` });
    }
  }

  // Patronage on last calendar year's purchases.
  const patronage: Record<string, Cents> = {};
  const revolved: Record<string, Cents> = {};
  for (const rid of Object.keys(rb.purchases).sort()) {
    const prog = programOf(rid);
    const health = prog.health ? valueAt(prog.health, year - 1) : 1;
    const byDiv: { div: DivisionId; amt: Cents }[] = [];
    for (const cat of CATEGORIES) {
      const qty = rb.purchases[rid][cat] ?? 0;
      const rate = prog.rate[cat] ?? 0;
      if (qty <= 0 || rate <= 0 || health <= 0) continue;
      const amt = cat === 'grain' ? roundCents(qty * rate * priceLevel(ctx.path, ctx.mi - 1) * 100 * health) : roundCents((qty * rate * health) / 100);
      if (amt > 0) byDiv.push({ div: CATEGORY_DIVISION[cat], amt });
    }
    const total = byDiv.reduce((s, x) => s + x.amt, 0);
    if (total <= 0) continue;
    const cash = roundCents(total * prog.cashPortion);
    const stock = total - cash;
    const v = (rb.equity[rid] ??= {});
    v[year - 1] = (v[year - 1] ?? 0) + stock;
    post(state, {
      source: 'regional-patronage', memo: `Patronage from ${getBrand(rid)?.name ?? rid} on ${year - 1} purchases`,
      lines: [
        { account: '1000', division: 'CORP', amount: cash },
        { account: '1400', division: 'CORP', amount: stock },
        ...byDiv.map((x) => ({ account: '8100', division: x.div, amount: -x.amt })),
      ],
    });
    patronage[rid] = total;
  }
  rb.purchases = {};

  // Revolvement of old regional equity.
  for (const rid of Object.keys(rb.equity).sort()) {
    const prog = programOf(rid);
    if (prog.suspendRevolve && year >= prog.suspendRevolve[0] && year <= prog.suspendRevolve[1]) continue;
    const v = rb.equity[rid];
    let paid = 0;
    for (const y of Object.keys(v).map(Number).sort((a, b) => a - b)) {
      if (y > year - prog.revolveYears) break;
      paid += v[y];
      delete v[y];
    }
    if (Object.keys(v).length === 0) delete rb.equity[rid];
    if (paid > 0) {
      post(state, { source: 'regional-revolvement', memo: `${getBrand(rid)?.name ?? rid} revolves old equity`, lines: [{ account: '1000', division: 'CORP', amount: paid }, { account: '1400', division: 'CORP', amount: -paid }] });
      revolved[rid] = paid;
    }
  }
  rb.last = { year: year - 1, patronage, revolved };
  const total = Object.values(patronage).reduce((s, x) => s + x, 0);
  const rev = Object.values(revolved).reduce((s, x) => s + x, 0);
  if (total > 0 || rev > 0) {
    ctx.inbox({ kind: 'memo', title: 'Regional patronage checks arrive', body: `Our regional suppliers allocated ${formatCents(total)} of patronage on last year's business${rev > 0 ? ` and revolved ${formatCents(rev)} of older equity` : ''}. Regional equity now held: ${formatCents(regionalEquityHeld(state))}.` });
  }
}

/** A regional fails (history entity event): write off its equity and find a new supplier. */
export function regionalFails(ctx: TickContext, brandId: string): void {
  const { state } = ctx;
  const rb = state.coop.regional;
  const held = regionalEquityHeld(state, brandId);
  const recovery = roundCents(held * (programOf(brandId).recoveryPct ?? 0));
  const loss = held - recovery;
  if (held > 0) {
    post(state, {
      source: 'regional-failure', memo: `Write off equity in ${getBrand(brandId)?.name ?? brandId}`,
      lines: [{ account: '8300', division: 'CORP', amount: loss }, { account: '1000', division: 'CORP', amount: recovery }, { account: '1400', division: 'CORP', amount: -held }],
    });
  }
  delete rb.equity[brandId];
  delete rb.purchases[brandId];
  const lost = state.coop.regionalAffiliations.find((a) => a.regionalId === brandId)?.lines ?? [];
  if (!lost.length && held <= 0) return;
  state.coop.regionalAffiliations = state.coop.regionalAffiliations.filter((a) => a.regionalId !== brandId);
  const replacements: string[] = [];
  const avail = defaultAffiliations(ctx.year, state.setup.regionId);
  for (const cat of lost) {
    const rid = avail.find((a) => a.lines.includes(cat) && a.regionalId !== brandId)?.regionalId;
    if (rid && !setAffiliation(state, cat, rid, false)) replacements.push(`${cat} → ${getBrand(rid)?.name ?? rid}`);
  }
  ctx.inbox({
    kind: 'alert', title: `${getBrand(brandId)?.name ?? brandId} equity written off`,
    body: `${getBrand(brandId)?.name ?? brandId} is in bankruptcy. We wrote off ${formatCents(loss)} of equity we held in it${recovery > 0 ? ` (recovering ${formatCents(recovery)})` : ''}. The loss hits member equity and our covenant ratios.${replacements.length ? ` The board signed supply agreements with new regionals: ${replacements.join(', ')}.` : ''}`,
  });
}
