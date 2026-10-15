// Mergers, division sales, joint ventures and buyouts (DESIGN §14.6). A deal moves through
// stages: (proposed →) study → terms (optional diligence) → our board → members (mergers
// and buyouts, both sides) → closing → integration. Closing posts a consolidation entry.

import { ETHANOL_RETURN, ETHANOL_RETURN_FALLBACK } from '../../data/events';
import { DEALS, MERGER_VOTE } from '../../data/competition';
import { dealAppeal, theirYes } from './vote';
import type { SupplyDivision } from '../../data/supply';
import { fiscalYearOf, formatMonth, isFiscalYearEnd, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { allocateCents, roundCents, type Cents } from '../core/money';
import { stream, type Rng } from '../core/rng';
import { competitorName, siteComponents, usedValue } from '../competitors/competitors';
import { capitalize, netBookValue, newFacility } from '../facilities/facilities';
import { facilityName } from '../facilities/actions';
import { lineRate, loanPayment } from '../finance/lender';
import { assignOfficers, makeDirector } from '../governance/board';
import { memberReferendum } from '../governance/elections';
import { addAgendaItem } from '../governance/votes';
import { balance, post } from '../ledger/ledger';
import { balanceSheet } from '../ledger/statements';
import { totalAcres } from '../members/generate';
import { effect } from '../people/leaders';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import { emptySupplyBook } from '../supply/defaults';
import type { Competitor, JournalLine, Deal, DealKind, DealPartner, DealTerms, Facility, GameState, JointVenture, OpDivision } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { LENDING } from '../../data/tuning';

type Msgs = CommandMessage[];
const err = (text: string): Msgs => [{ level: 'error', text }];
const info = (text: string): Msgs => [{ level: 'info', text }];
const openDeal = (d: Deal) => d.stage !== 'closed' && d.stage !== 'dead';
const INV_ACCOUNT: Record<SupplyDivision, string> = { AGRONOMY: '1210', FEED: '1220', ENERGY: '1230', RETAIL: '1240' };

/** What the partner really looks like, from its plants and its strength. */
export function partnerProfile(s: GameState, c: Competitor, division?: OpDivision): DealPartner {
  const mi = s.clock.monthIndex;
  const year = yearOf(mi);
  const sites = c.sites.filter((x) => !division || (x.division ?? 'GRAIN') === division);
  const fairValue = roundCents(sites.reduce((a, x) => a + usedValue(pathFor(s), mi, siteComponents(x), year - x.builtYear, x.condition), 0));
  const st = c.strength ?? 50;
  const debtShare = DEALS.debtShareWeak.value + (DEALS.debtShareStrong.value - DEALS.debtShareWeak.value) * (st / 100);
  const debt = roundCents(fairValue * debtShare);
  const workingCapital = roundCents(fairValue * DEALS.workingCapitalShare.value * (0.5 + st / 100));
  const equity = Math.max(0, fairValue + workingCapital - debt);
  const towns = new Set(sites.map((x) => x.townId));
  const members = s.members.list.filter((m) => m.status === 'active' && m.kind === 'nonmember' && towns.has(m.townId)).length;
  return { strength: st, sites: sites.length, fairValue, debt, workingCapital, allocatedEquity: roundCents(equity * DEALS.allocatedEquityShare.value), members };
}

/** Our estimate before diligence: every number off by up to ±error (smaller with a strong CFO). */
function fuzz(rng: Rng, p: DealPartner, s: GameState): DealPartner {
  const e = DEALS.estimateError.value * clamp(1 + effect(s, 'finance.forecast'), 0.3, 1.6);
  const f = (x: number) => Math.round(x * (1 + rng.range(-e, e)));
  return { ...p, strength: clamp(Math.round(p.strength + rng.range(-25, 25) * e), 0, 100), fairValue: f(p.fairValue), debt: f(p.debt), workingCapital: f(p.workingCapital), allocatedEquity: f(p.allocatedEquity) };
}

const dealRng = (s: GameState, id: number, what: string) => stream(s.setup.gameSeed, s.clock.monthIndex, `deals.${what}`, id);

function newDeal(s: GameState, kind: DealKind, partner: Competitor | null, partnerName: string, incoming: boolean, truth: DealPartner, division?: OpDivision): Deal {
  const id = s.coop.nextId++;
  const d: Deal = {
    id, kind, partnerId: partner?.id ?? null, partnerName, ...(division ? { division } : {}), incoming,
    stage: incoming ? 'proposed' : 'study', stageUntil: s.clock.monthIndex + (incoming ? DEALS.incomingExpiryMonths : DEALS.studyMonths),
    startedMonth: s.clock.monthIndex, truth, estimate: fuzz(dealRng(s, id, 'estimate'), truth, s), diligence: false, terms: null, log: [],
  };
  s.deals = [...s.deals, d];
  return d;
}

function chargeStudy(s: GameState, what: string): void {
  const fee = nominalCents(pathFor(s), s.clock.monthIndex, DEALS.studyCost.value);
  post(s, { source: 'deal-study', memo: `Feasibility study: ${what}`, lines: [{ account: '7670', division: 'CORP', amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
}

// ---------- Commands ----------

export function proposeMerger(s: GameState, partnerId: number): Msgs {
  const c = s.competitors.find((x) => x.id === partnerId && x.status === 'active');
  if (!c || c.kind !== 'coop') return err('Only another cooperative can merge with us.');
  if (s.deals.some((d) => openDeal(d) && d.partnerId === partnerId)) return err('We are already in talks with them.');
  chargeStudy(s, competitorName(s, c));
  newDeal(s, 'merger', c, competitorName(s, c), false, partnerProfile(s, c));
  return info(`Merger study with ${competitorName(s, c)} commissioned; results in ${DEALS.studyMonths} months.`);
}

export function proposeJv(s: GameState, partnerId: number, division: OpDivision): Msgs {
  if (division === 'GRAIN' || division === 'RETAIL') return err('Joint ventures are for agronomy, feed or energy.');
  const c = s.competitors.find((x) => x.id === partnerId && x.status === 'active');
  if (!c || c.kind !== 'coop' || !c.sites.some((x) => x.division === division)) return err(`They have no ${division.toLowerCase()} business to combine.`);
  if (!s.coop.facilities.some((f) => f.status === 'operating' && f.division === division)) return err(`We have no ${division.toLowerCase()} plants to contribute.`);
  if (s.deals.some((d) => openDeal(d) && d.partnerId === partnerId)) return err('We are already in talks with them.');
  chargeStudy(s, `${division.toLowerCase()} joint venture`);
  newDeal(s, 'jv', c, competitorName(s, c), false, partnerProfile(s, c, division), division);
  return info(`Joint-venture study with ${competitorName(s, c)} commissioned.`);
}

export function proposeDivisionSale(s: GameState, division: OpDivision): Msgs {
  if (division === 'GRAIN') return err('Selling the grain business would mean selling the co-op; consider a merger instead.');
  const facs = s.coop.facilities.filter((f) => f.status !== 'closed' && f.division === division);
  if (!facs.length) return err('We have nothing in that division to sell.');
  if (s.coop.projects.some((p) => facs.some((f) => f.id === p.facilityId))) return err('Finish the projects in that division first.');
  if (s.deals.some((d) => openDeal(d) && d.kind === 'divisionSale' && d.division === division)) return err('That sale is already being shopped.');
  const buyer = [...s.competitors].filter((c) => c.status === 'active' && (c.kind === 'national' || c.kind === 'coop') && c.sites.some((x) => x.division === division)).sort((a, b) => (b.strength ?? 50) - (a.strength ?? 50) || a.id - b.id)[0];
  chargeStudy(s, `sale of ${division.toLowerCase()}`);
  const truth = ourDivisionProfile(s, division);
  newDeal(s, 'divisionSale', buyer ?? null, buyer ? competitorName(s, buyer) : 'A regional farm-supply company', false, truth, division);
  return info(`Our advisers are shopping the ${division.toLowerCase()} division. Offers in ${DEALS.studyMonths} months.`);
}

function ourDivisionProfile(s: GameState, division: OpDivision): DealPartner {
  const mi = s.clock.monthIndex;
  const facs = s.coop.facilities.filter((f) => f.status !== 'closed' && f.division === division);
  const fairValue = roundCents(facs.reduce((a, f) => a + usedValue(pathFor(s), mi, f.components, yearOf(mi) - f.builtYear, f.condition), 0));
  return { strength: 50, sites: facs.length, fairValue, debt: 0, workingCapital: workingCapitalOf(s, division), allocatedEquity: 0, members: 0 };
}

function workingCapitalOf(s: GameState, division: OpDivision): Cents {
  if (division === 'GRAIN') return 0;
  const book = s.coop.supply[division as SupplyDivision];
  const inv = Object.values(book.inventory).reduce((a, layers) => a + (layers ?? []).reduce((b, x) => b + x.cost, 0), 0);
  const ar = book.ar.current + book.ar.past30 + book.ar.past60 + book.ar.past90 + book.ar.harvest;
  return inv + ar - book.allowance - book.prepay + book.rebatesAccrued;
}

export function respondDeal(s: GameState, dealId: number, accept: boolean): Msgs {
  const d = s.deals.find((x) => x.id === dealId);
  if (!d || d.stage !== 'proposed') return err('Nothing to respond to.');
  if (!accept) {
    setDeal(s, d.id, { stage: 'dead', log: [...d.log, `${formatMonth(s.clock.monthIndex)}: we declined.`] });
    return info('Declined.');
  }
  if (d.kind === 'buyout') {
    setDeal(s, d.id, { stage: 'terms', stageUntil: s.clock.monthIndex, terms: { name: s.coop.name, partnerSeats: 0, price: d.truth.fairValue } });
    return info('We will hear them out. Send the offer to the board when ready.');
  }
  chargeStudy(s, d.partnerName);
  setDeal(s, d.id, { stage: 'study', stageUntil: s.clock.monthIndex + DEALS.studyMonths });
  return info(`Merger study with ${d.partnerName} commissioned.`);
}

export function dealDiligence(s: GameState, dealId: number): Msgs {
  const d = s.deals.find((x) => x.id === dealId);
  if (!d || d.stage !== 'terms') return err('Diligence comes after the study, before the board.');
  if (d.diligence) return info('Diligence is already done.');
  const fee = nominalCents(pathFor(s), s.clock.monthIndex, DEALS.diligenceCost.value);
  post(s, { source: 'deal-diligence', memo: `Due diligence: ${d.partnerName}`, lines: [{ account: '7670', division: 'CORP', amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
  setDeal(s, d.id, { diligence: true, estimate: { ...d.truth }, log: [...d.log, `${formatMonth(s.clock.monthIndex)}: due diligence completed.`] });
  return info('Due diligence done: the numbers are now firm.');
}

export function submitDeal(s: GameState, dealId: number, terms: DealTerms): Msgs {
  const d = s.deals.find((x) => x.id === dealId);
  if (!d || d.stage !== 'terms') return err('That deal is not ready for the board.');
  if (d.kind === 'merger' && (!terms.name.trim() || terms.partnerSeats < 0 || terms.partnerSeats > 5)) return err('Give the combined co-op a name and 0–5 board seats for the partner.');
  setDeal(s, d.id, { stage: 'board', terms: { ...terms, ...(d.terms?.price !== undefined ? { price: d.terms.price } : {}) } });
  addAgendaItem(s, { type: 'deal', title: dealTitle(d), submittedMonth: s.clock.monthIndex, command: { type: 'dealBoardApproved', dealId: d.id }, source: 'gm' });
  return info(`"${dealTitle(d)}" goes to the board at next month's meeting.`);
}

export function abandonDeal(s: GameState, dealId: number): Msgs {
  const d = s.deals.find((x) => x.id === dealId);
  if (!d || !openDeal(d) || d.stage === 'closing' || d.stage === 'integration') return err('That deal cannot be abandoned now.');
  s.governance.agenda = s.governance.agenda.filter((i) => !(i.type === 'deal' && (i.command as { dealId?: number })?.dealId === d.id));
  setDeal(s, d.id, { stage: 'dead', log: [...d.log, `${formatMonth(s.clock.monthIndex)}: we walked away.`] });
  return info('Talks ended.');
}

export function dealTitle(d: Deal): string {
  switch (d.kind) {
    case 'merger': return `Merge with ${d.partnerName}`;
    case 'jv': return `Form a ${d.division?.toLowerCase()} joint venture with ${d.partnerName}`;
    case 'divisionSale': return `Sell the ${d.division?.toLowerCase()} division to ${d.partnerName}${d.terms?.price ? ` for ${formatCents(d.terms.price)}` : ''}`;
    case 'buyout': return `Sell the cooperative to ${d.partnerName}${d.terms?.price ? ` for ${formatCents(d.terms.price)}` : ''}`;
  }
}

function setDeal(s: GameState, id: number, patch: Partial<Deal>): void {
  s.deals = s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d));
}

// ---------- Incoming approaches ----------

export function proposeIncomingMerger(ctx: TickContext, c: Competitor): void {
  const d = newDeal(ctx.state, 'merger', c, competitorName(ctx.state, c), true, partnerProfile(ctx.state, c));
  ctx.inbox({ kind: 'alert', title: `${d.partnerName} proposes a merger`, body: `The board of ${d.partnerName} has asked whether we would consider merging. They have ${d.truth.sites} location${d.truth.sites > 1 ? 's' : ''}. Respond on the Deals screen within ${DEALS.incomingExpiryMonths} months.` });
}

/** A buyer approaches a struggling co-op. */
function maybeBuyout(ctx: TickContext): void {
  const { state } = ctx;
  if (ctx.month !== 3 || state.deals.some((d) => openDeal(d) && d.kind === 'buyout')) return;
  const bs = balanceSheet(state.ledger, ctx.mi);
  const weak = state.coop.finance.status !== 'standard' || (bs.totalAssets > 0 && bs.totalEquity / bs.totalAssets < 0.3);
  if (!weak || bs.totalEquity <= 0 || !ctx.rng('deals.buyout').chance(DEALS.buyoutProb.value)) return;
  const buyer = state.competitors.filter((c) => c.status === 'active' && (c.kind === 'national' || (c.kind === 'coop' && (c.strength ?? 0) > 65))).sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0) || a.id - b.id)[0];
  const name = buyer ? competitorName(state, buyer) : 'A regional cooperative';
  const rng = ctx.rng('deals.buyoutPrice');
  const price = roundCents(bs.totalEquity * rng.range(DEALS.buyoutPremium[0], DEALS.buyoutPremium[1]));
  newDeal(state, 'buyout', buyer ?? null, name, true, { strength: buyer?.strength ?? 70, sites: 0, fairValue: price, debt: 0, workingCapital: 0, allocatedEquity: 0, members: 0 });
  ctx.inbox({ kind: 'alert', title: `${name} offers to buy the co-op`, body: `${name} has offered ${formatCents(price)} for the cooperative's assets and business, about ${Math.round((price / bs.totalEquity) * 100)}% of member equity. Members would be paid out and the co-op would cease to exist. Respond on the Deals screen.` });
}

// ---------- Monthly step ----------

export function stepDeals(ctx: TickContext): void {
  const { state, mi } = ctx;
  maybeBuyout(ctx);
  for (const d of [...state.deals]) {
    if (!openDeal(d)) continue;
    if (d.stage === 'proposed' && mi >= d.stageUntil) {
      setDeal(state, d.id, { stage: 'dead', log: [...d.log, 'The offer lapsed.'] });
      continue;
    }
    if (d.stage === 'study' && mi >= d.stageUntil) {
      const price = d.kind === 'divisionSale' ? roundCents(d.truth.fairValue * ctx.rng('deals.divisionPrice', d.id).range(DEALS.divisionPrice[0], DEALS.divisionPrice[1]) + d.truth.workingCapital) : undefined;
      const terms: DealTerms = { name: d.kind === 'merger' ? state.coop.name : state.coop.name, partnerSeats: d.kind === 'merger' ? Math.min(3, Math.max(1, Math.round(d.truth.sites))) : 0, ...(price !== undefined ? { price } : {}) };
      setDeal(state, d.id, { stage: 'terms', terms, log: [...d.log, `${formatMonth(mi)}: study complete.`] });
      const e = d.estimate;
      ctx.inbox({
        kind: 'memo', title: `Study complete: ${dealTitle({ ...d, terms })}`,
        body: d.kind === 'divisionSale'
          ? `${d.partnerName} offers ${formatCents(price!)} for the ${d.division?.toLowerCase()} division (plants and working capital). Send it to the board from the Deals screen, or walk away.`
          : `Our consultant estimates ${d.partnerName}'s plants at ${formatCents(e.fairValue)}, debt ${formatCents(e.debt)}, members' equity ${formatCents(e.allocatedEquity)}. Due diligence would firm up these numbers. Set the terms and send it to the board from the Deals screen.`,
      });
      continue;
    }
    if (d.stage === 'members' && mi >= d.stageUntil) {
      const rng = dealRng(state, d.id, 'members');
      // Members hear the real figures at the information meetings.
      const terms = d.terms ?? { name: state.coop.name, partnerSeats: 0 };
      const { appeal } = dealAppeal(state, d, terms, d.truth);
      const ours = memberReferendum(state, rng, appeal, state.governance.bylaws.supermajority);
      const theirYesShare = d.kind === 'merger' ? clamp(theirYes(state, d, terms) + rng.normal(0, MERGER_VOTE.theirNoise.value), 0, 1) : 1;
      const theirs = { yesShare: theirYesShare, turnout: 0.4, passed: theirYesShare >= 2 / 3 };
      const passed = ours.passed && theirs.passed;
      setDeal(state, d.id, { ourMembers: ours, ...(d.kind === 'merger' ? { theirMembers: theirs } : {}), stage: passed ? 'closing' : 'dead', stageUntil: mi + 1, log: [...d.log, `${formatMonth(mi)}: our members ${ours.passed ? 'approved' : 'rejected'} (${Math.round(ours.yesShare * 100)}% yes)${d.kind === 'merger' ? `; theirs ${theirs.passed ? 'approved' : 'rejected'} (${Math.round(theirYesShare * 100)}%)` : ''}.`] });
      ctx.inbox({ kind: passed ? 'memo' : 'alert', title: `Member vote: ${dealTitle(d)}`, body: `Our members voted ${Math.round(ours.yesShare * 100)}% yes on ${Math.round(ours.turnout * 100)}% turnout (${Math.round(state.governance.bylaws.supermajority * 100)}% needed)${d.kind === 'merger' ? `; ${d.partnerName}'s members ${Math.round(theirYesShare * 100)}% yes` : ''}. ${passed ? 'The deal closes next month.' : 'The deal is dead.'}` });
      continue;
    }
    if (d.stage === 'closing' && mi >= d.stageUntil) {
      closeDeal(ctx, d);
      continue;
    }
    if (d.stage === 'integration' && mi >= d.stageUntil) setDeal(state, d.id, { stage: 'closed', log: [...d.log, `${formatMonth(mi)}: integration complete.`] });
  }
  stepJointVentures(ctx);
}

/** Our board approved the deal (called from the board meeting). */
export function dealBoardApproved(ctx: TickContext, dealId: number): string {
  const { state, mi } = ctx;
  const d = state.deals.find((x) => x.id === dealId);
  if (!d || d.stage !== 'board') return '';
  // Their board.
  if (d.kind === 'merger' || d.kind === 'jv') {
    const p = clamp(0.5 + (55 - d.truth.strength) / 100 + 0.08 * (d.terms?.partnerSeats ?? 0) + (d.incoming ? 0.3 : 0), 0.05, 0.95);
    if (!dealRng(state, d.id, 'theirBoard').chance(p)) {
      setDeal(state, d.id, { stage: 'dead', log: [...d.log, `${formatMonth(mi)}: their board said no.`] });
      return `${d.partnerName}'s board voted it down.`;
    }
  }
  const needsMembers = d.kind === 'merger' || d.kind === 'buyout';
  setDeal(state, d.id, { stage: needsMembers ? 'members' : 'closing', stageUntil: mi + (needsMembers ? DEALS.memberMeetingMonths : 0), log: [...d.log, `${formatMonth(mi)}: boards approved.`] });
  return needsMembers ? `Member information meetings begin; the vote is in ${formatMonth(mi + DEALS.memberMeetingMonths)}.` : 'Closing follows.';
}

export function dealBoardRejected(ctx: TickContext, dealId: number): void {
  const d = ctx.state.deals.find((x) => x.id === dealId);
  if (d) setDeal(ctx.state, d.id, { stage: 'dead', log: [...d.log, `${formatMonth(ctx.mi)}: our board said no.`] });
}

// ---------- Closing ----------

function closeDeal(ctx: TickContext, d: Deal): void {
  switch (d.kind) {
    case 'merger': closeMerger(ctx, d); break;
    case 'divisionSale': closeDivisionSale(ctx, d); break;
    case 'jv': closeJv(ctx, d); break;
    case 'buyout': {
      const { state } = ctx;
      setDeal(state, d.id, { stage: 'closed' });
      state.outcome = { kind: 'absorbed', monthIndex: ctx.mi, text: `${state.coop.name} has been sold to ${d.partnerName} for ${formatCents(d.terms?.price ?? 0)}. Members' equity is paid out and the cooperative is dissolved. Your work as general manager is done.` };
      break;
    }
  }
}

/** Take over partner sites as our facilities at fair value. Returns debit lines. */
function takeSites(state: GameState, c: Competitor, fairValue: Cents, division?: OpDivision) {
  const mi = state.clock.monthIndex;
  const sites = c.sites.filter((x) => !division || (x.division ?? 'GRAIN') === division);
  const values = sites.map((x) => usedValue(pathFor(state), mi, siteComponents(x), yearOf(mi) - x.builtYear, x.condition));
  const parts = allocateCents(fairValue, values);
  const lines: JournalLine[] = [];
  const facs: Facility[] = [];
  sites.forEach((site, i) => {
    const kind = site.kind ?? 'elevator';
    const comps = siteComponents(site);
    const f = newFacility(state, site.townId, facilityName(state.world.towns[site.townId].name, kind), comps, 'operating', site.builtYear, site.condition, kind);
    facs.push(f);
    lines.push(...capitalize(state, f.id, comps, parts[i], f.name, Math.max(0.3, 1 - (yearOf(mi) - site.builtYear) / 50)));
  });
  return { lines, facs, sites };
}

function closeMerger(ctx: TickContext, d: Deal): void {
  const { state, mi } = ctx;
  const c = state.competitors.find((x) => x.id === d.partnerId);
  if (!c) return;
  const p = partnerProfile(state, c);
  const { lines, facs } = takeSites(state, c, p.fairValue);
  // Partner's patrons become our members; their membership stock and allocated equity carry over.
  const towns = new Set(c.sites.map((x) => x.townId));
  const joiners = state.members.list.filter((m) => m.status === 'active' && m.kind === 'nonmember' && towns.has(m.townId)).sort((a, b) => a.id - b.id);
  const par = nominalCents(ctx.path, mi, 1000);
  const equity = Math.max(0, p.fairValue + p.workingCapital - p.debt);
  const stockTotal = Math.min(equity, par * joiners.length);
  // With no patrons to carry it (theirs already belong to us), their equity goes to unallocated reserves.
  const allocated = joiners.length ? Math.min(p.allocatedEquity, equity - stockTotal) : 0;
  const fy = fiscalYearOf(mi, state.setup.fiscalYearEndMonth);
  const acres = joiners.map((m) => totalAcres(m) + 20);
  const shares = allocateCents(allocated, acres);
  joiners.forEach((m, i) => {
    m.kind = 'member';
    m.loyalty = clamp(m.loyalty + 0.1, 0, 1);
    m.satisfaction = Math.max(m.satisfaction, 55);
    state.equity.commonStock[m.id] = (state.equity.commonStock[m.id] ?? 0) + (joiners.length ? Math.floor(stockTotal / joiners.length) + (i < stockTotal % joiners.length ? 1 : 0) : 0);
    if (shares[i] > 0) {
      // Spread their equity over the last ten vintages, as the partner held it.
      const v = (state.equity.allocated[m.id] ??= {});
      const per = allocateCents(shares[i], new Array(10).fill(1));
      per.forEach((amt, k) => {
        if (amt <= 0) return;
        const vy = fy - 9 + k;
        v[vy] = [(v[vy]?.[0] ?? 0) + amt, v[vy]?.[1] ?? 0];
      });
    }
  });
  // Partner debt becomes a term loan of ours.
  if (p.debt > 0) {
    const f = state.coop.finance;
    const rate = lineRate(state) + LENDING.termSpread.value;
    f.termLoans.push({ id: f.nextLoanId++, purpose: `Assumed debt of ${d.partnerName}`, principal: p.debt, balance: p.debt, ratePct: rate, payment: loanPayment(p.debt, rate, LENDING.termLoanMonths.value), startMonth: mi, months: LENDING.termLoanMonths.value });
  }
  const remainder = equity - stockTotal - allocated;
  post(state, {
    source: 'merger', memo: `Merger with ${d.partnerName}: assets, debt and members' equity carried over`,
    lines: [
      ...lines,
      { account: '1000', division: 'CORP', amount: p.workingCapital },
      { account: '2300', division: 'CORP', amount: -p.debt },
      { account: '3000', division: 'CORP', amount: -stockTotal },
      { account: '3200', division: 'CORP', amount: -allocated },
      { account: '3400', division: 'CORP', amount: -remainder },
    ],
  });
  c.status = 'sold';
  c.sites = [];
  c.lastMove = `merged with ${state.coop.name}`;
  // Board seats for the partner's directors; the combined co-op's name.
  const g = state.governance;
  const rng = dealRng(state, d.id, 'board');
  const seats = Math.min(d.terms?.partnerSeats ?? 0, joiners.length);
  for (let i = 0; i < seats; i++) {
    const m = joiners[Math.floor((i * joiners.length) / Math.max(1, seats))];
    g.directors = [...g.directors, makeDirector(rng, m, null, ctx.year + 1 + i)];
  }
  g.bylaws = { ...g.bylaws, boardSize: g.directors.length, atLargeSeats: g.directors.filter((x) => x.districtId === null).length };
  assignOfficers(g.directors);
  if (d.terms?.name && d.terms.name.trim() !== state.coop.name) state.coop.name = d.terms.name.trim();
  state.integrationUntil = mi + DEALS.integrationMonths;
  setDeal(state, d.id, { stage: 'integration', stageUntil: mi + DEALS.integrationMonths, log: [...d.log, `${formatMonth(mi)}: closed.`] });
  ctx.inbox({ kind: 'memo', title: `Merger with ${d.partnerName} closes`, body: `We now operate ${facs.length} more location${facs.length > 1 ? 's' : ''}; ${joiners.length} of their patrons are our members, bringing ${formatCents(allocated)} of allocated equity. We assumed ${formatCents(p.debt)} of debt. Expect a year of integration: systems and crews take time to combine, and service suffers meanwhile.${seats ? ` ${seats} of their directors join our board.` : ''}` });
}

/** Remove a facility and its assets from the books; returns the lines and its net book value. */
function disposeLines(state: GameState, f: Facility) {
  const assets = state.coop.assets.filter((a) => a.facilityId === f.id);
  const nbv = netBookValue(state, f.id);
  const byAcct: Record<string, number> = {};
  let accum = 0;
  for (const a of assets) {
    byAcct[a.account] = (byAcct[a.account] ?? 0) + a.cost;
    accum += a.accumDep;
  }
  const lines = Object.entries(byAcct).sort().map(([acct, cost]) => ({ account: acct, division: f.division, amount: -cost }));
  if (accum) lines.push({ account: '1590', division: f.division, amount: accum });
  state.coop.assets = state.coop.assets.filter((a) => a.facilityId !== f.id);
  f.status = 'closed';
  return { lines, nbv };
}

/** Hand a supply division's working capital over at book (cash for inventory and receivables, less prepayments). */
function transferWorkingCapital(state: GameState, division: SupplyDivision) {
  const book = state.coop.supply[division];
  const lines: JournalLine[] = [];
  const inv = Object.values(book.inventory).reduce((a, layers) => a + (layers ?? []).reduce((b, x) => b + x.cost, 0), 0);
  if (inv) lines.push({ account: INV_ACCOUNT[division], division, amount: -inv });
  const ar = balance(state.ledger, '1100', division);
  if (ar) lines.push({ account: '1100', division, amount: -ar });
  const allow = balance(state.ledger, '1150', division);
  if (allow) lines.push({ account: '1150', division, amount: -allow });
  const prepay = balance(state.ledger, '2130', division);
  if (prepay) lines.push({ account: '2130', division, amount: -prepay });
  const rebates = balance(state.ledger, '1160', division);
  if (rebates) lines.push({ account: '1160', division, amount: -rebates });
  const net = -lines.reduce((a, l) => a + l.amount, 0);
  state.coop.supply = { ...state.coop.supply, [division]: emptySupplyBook() };
  return { lines, net };
}

function closeDivisionSale(ctx: TickContext, d: Deal): void {
  const { state, mi } = ctx;
  const division = d.division as SupplyDivision;
  const facs = state.coop.facilities.filter((f) => f.status !== 'closed' && f.division === division);
  const price = d.terms?.price ?? 0;
  const wc = transferWorkingCapital(state, division);
  const lines: JournalLine[] = [...wc.lines];
  let nbv = 0;
  const sites = facs.map((f) => ({ townId: f.townId, kind: f.kind, components: { ...f.components }, builtYear: f.builtYear, condition: f.condition }));
  for (const f of facs) {
    const x = disposeLines(state, f);
    lines.push(...x.lines);
    nbv += x.nbv;
  }
  lines.push({ account: '1000', division: 'CORP', amount: price });
  // Whatever the price beats book value of plants and working capital by is a gain.
  const gain = lines.reduce((a, l) => a + l.amount, 0);
  if (gain !== 0) lines.push({ account: '8200', division, amount: -gain });
  void nbv;
  post(state, { source: 'division-sale', memo: `Sale of the ${division.toLowerCase()} division to ${d.partnerName}`, lines });
  // The buyer keeps serving the plants' customers.
  const buyer = state.competitors.find((c) => c.id === d.partnerId);
  const newSites = sites.map((x, i) => ({ id: 100 + i, townId: x.townId, division, kind: x.kind, components: x.components, storageBu: 0, receiveBuHr: 0, dryBuHr: 0, loadout: 'truck' as const, builtYear: x.builtYear, condition: x.condition }));
  if (buyer) buyer.sites = [...buyer.sites, ...newSites];
  else state.competitors = [...state.competitors, { id: Math.max(0, ...state.competitors.map((c) => c.id)) + 1, name: d.partnerName, kind: 'national', sites: newSites, posture: 0.5, service: 0.1, status: 'active', ownerAge: 50, volumeYtd: 0, strength: 70 }];
  setDeal(state, d.id, { stage: 'closed', log: [...d.log, `${formatMonth(mi)}: closed for ${formatCents(price)}.`] });
  ctx.inbox({ kind: 'memo', title: `${division[0]}${division.slice(1).toLowerCase()} division sold`, body: `The sale to ${d.partnerName} closed for ${formatCents(price)}, a ${gain >= 0 ? 'gain' : 'loss'} of ${formatCents(Math.abs(gain))} on the plants. Members will buy from ${d.partnerName} now.` });
}

function closeJv(ctx: TickContext, d: Deal): void {
  const { state, mi } = ctx;
  const division = d.division as SupplyDivision;
  const partner = state.competitors.find((c) => c.id === d.partnerId);
  if (!partner) return;
  const facs = state.coop.facilities.filter((f) => f.status !== 'closed' && f.division === division);
  const wc = transferWorkingCapital(state, division);
  const lines: JournalLine[] = [...wc.lines, { account: '1000', division: 'CORP', amount: wc.net }];
  let nbv = 0;
  const ourSites = facs.map((f) => ({ id: 0, townId: f.townId, division, kind: f.kind, components: { ...f.components }, storageBu: 0, receiveBuHr: 0, dryBuHr: 0, loadout: 'truck' as const, builtYear: f.builtYear, condition: f.condition }));
  for (const f of facs) {
    const x = disposeLines(state, f);
    lines.push(...x.lines);
    nbv += x.nbv;
  }
  lines.push({ account: '1450', division, amount: nbv });
  post(state, { source: 'jv-formation', memo: `Contribute ${division.toLowerCase()} plants to a joint venture with ${d.partnerName}`, lines });
  const theirs = partner.sites.filter((x) => x.division === division);
  const theirValue = d.truth.fairValue;
  const share = nbv + theirValue > 0 ? nbv / (nbv + theirValue) : 0.5;
  partner.sites = partner.sites.filter((x) => x.division !== division);
  if (!partner.sites.length) partner.status = 'sold';
  // The JV competes in the market as its own company.
  const name = `${state.world.towns[ourSites[0]?.townId ?? state.coop.homeTownId].name} ${division === 'AGRONOMY' ? 'Agronomy' : division === 'FEED' ? 'Feed' : 'Energy'} Partners LLC`;
  state.competitors = [...state.competitors, {
    id: Math.max(0, ...state.competitors.map((c) => c.id)) + 1, name, kind: 'coop', sites: [...ourSites, ...theirs].map((x, i) => ({ ...x, id: i + 1 })),
    posture: 0, service: 0.3, status: 'active', ownerAge: 50, volumeYtd: 0, strength: 75,
  }];
  const scale = nbv + theirValue;
  const jv: JointVenture = { id: d.id, name, partnerName: d.partnerName, division, sharePct: share, investment: nbv, scale, formedMonth: mi, earningsYtd: 0 };
  state.jvs = [...state.jvs, jv];
  setDeal(state, d.id, { stage: 'closed', log: [...d.log, `${formatMonth(mi)}: ${name} formed.`] });
  ctx.inbox({ kind: 'memo', title: `${name} formed`, body: `We own ${Math.round(share * 100)}% of ${name}, which now runs our and ${d.partnerName}'s ${division.toLowerCase()} business. Our share of its earnings shows as income from the joint venture; it pays out half each year.` });
}

function stepJointVentures(ctx: TickContext): void {
  const { state, mi } = ctx;
  if (!state.jvs.length) return;
  const rng = ctx.rng('deals.jv');
  state.jvs = state.jvs.map((jv) => {
    // An ethanol stake earns with the crush margin; a division JV with its plants.
    const monthly = jv.ethanol
      ? (jv.scale * (ETHANOL_RETURN.value[yearOf(mi)] ?? ETHANOL_RETURN_FALLBACK)) / 12 / jv.sharePct
      : (jv.scale * DEALS.jvReturn.value * (1 + DEALS.jvSynergy.value)) / 12;
    const earnings = Math.max(-jv.investment, roundCents(monthly * jv.sharePct * clamp(1 + rng.normal(0, 0.5), -1, 3)));
    let x = { ...jv, investment: jv.investment + earnings, earningsYtd: jv.earningsYtd + earnings };
    if (earnings) post(state, { source: 'jv-earnings', memo: `Share of ${jv.name} earnings`, lines: [{ account: '1450', division: jv.division, amount: earnings }, { account: '8210', division: jv.division, amount: -earnings }] });
    if (isFiscalYearEnd(mi, state.setup.fiscalYearEndMonth)) {
      const dist = Math.max(0, Math.min(x.investment, roundCents(x.earningsYtd * DEALS.jvPayout.value)));
      if (dist > 0) post(state, { source: 'jv-distribution', memo: `Cash distribution from ${jv.name}`, lines: [{ account: '1000', division: 'CORP', amount: dist }, { account: '1450', division: jv.division, amount: -dist }] });
      x = { ...x, investment: x.investment - dist, earningsYtd: 0 };
    }
    return x;
  });
}

export const integrationPenalty = (s: GameState): number => (s.integrationUntil !== null && s.clock.monthIndex < s.integrationUntil ? DEALS.integrationPenalty.value : 0);

