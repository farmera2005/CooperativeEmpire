// Career mode (D-142): the player's job from month to month. Pay and bonuses are counted, the
// annual review moves reputation and stats, the contract comes up for renewal, other co-ops'
// boards approach a GM with a good name, and a GM who leaves or is let go looks for work.
// Offers and the board's own pay can be negotiated: boards go some way past their opening
// number, further for a GM with a reputation, negotiating skill and another offer in hand.

import { BACKGROUNDS, CAREER, CEO_STATS, type CeoStat } from '../../data/career';
import { REGION_IDS } from '../../data/regions/eccb';
import { SETUP } from '../../data/tuning';
import { formatMonth, yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import { stream, type Rng } from '../core/rng';
import { cloneState } from '../sim/clone';
import type { TickContext } from '../sim/context';
import { previewTerritory, suggestCoopNames } from '../sim/newGame';
import type { CareerState, EmploymentContract, GameState, JobOffer, StintEnd } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { OVERHEAD } from '../../data/tuning';
import { ageOf, marketPay, reputationPay } from './core';

export type CareerMessage = { level: 'info' | 'error'; text: string };
export interface CareerResult { state: GameState; messages: CareerMessage[]; ok: boolean }

const activeMembers = (s: GameState) => s.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
const dollars = (c: Cents) => formatCents(c);

function log(c: CareerState, text: string): void {
  c.log = [...c.log, { monthIndex: c.monthIndex, text }].slice(-80);
}

/** A package's value to the GM against base pay alone (bonus at target, severance as security). */
export function packageValue(p: { base: Cents; bonusTarget: number; severanceMonths: number }): number {
  return p.base * (1 + CAREER.bonusValue * p.bonusTarget + CAREER.severanceValuePerMonth * p.severanceMonths);
}

/** Market pay for a co-op of this size at a month (nominal cents a year). */
function marketPayAt(s: GameState, mi: number, members: number, locations: number): Cents {
  return nominalCents(pathFor(s), mi, OVERHEAD.gmSalaryBase.value + OVERHEAD.gmSalaryPerMember.value * members + OVERHEAD.gmSalaryPerLocation.value * locations);
}

// ---------- the stint ends ----------

const END_REPUTATION: Partial<Record<StintEnd, number>> = {
  fired: CAREER.firedReputation, liquidated: CAREER.liquidatedReputation, absorbed: CAREER.absorbedReputation, notRenewed: CAREER.notRenewedReputation, resigned: -1,
};

/** Close the current job: the stint's record, reputation, severance; the career turns to looking (or retires). */
function endStint(c: CareerState, end: StintEnd, mi: number): void {
  const st = c.stints[c.stints.length - 1];
  if (st && st.toMonth === null) {
    st.toMonth = mi;
    st.end = end;
  }
  const k = c.contract;
  // Severance is owed when the board ends the job without cause, or the co-op is merged away.
  if (k && (end === 'fired' || end === 'absorbed')) c.severanceLeft = k.severanceMonths;
  if (k) c.lastBase = k.base;
  c.reputation = clamp(Math.round(c.reputation + (END_REPUTATION[end] ?? 0)), 0, 100);
  c.contract = null;
  c.status = end === 'retired' ? 'retired' : end === 'moved' ? 'employed' : 'searching';
  c.monthIndex = mi;
}

const OUTCOME_END: Record<NonNullable<GameState['outcome']>['kind'], StintEnd> = {
  fired: 'fired', liquidated: 'liquidated', absorbed: 'absorbed', resigned: 'resigned', notRenewed: 'notRenewed', moved: 'moved', retired: 'retired',
};

// ---------- monthly, while employed ----------

export function stepCareer(ctx: TickContext): void {
  const { state, mi } = ctx;
  const c = state.career;
  if (!c || c.status !== 'employed' || !c.contract) return;
  c.monthIndex = mi;
  const k = c.contract;
  const st = c.stints[c.stints.length - 1];
  const pay = roundCents(k.base / 12);
  c.earnings += pay;
  st.earnings += pay;

  // The annual review: the bonus, reputation and what the year taught.
  const rev = state.governance.reviews[state.governance.reviews.length - 1];
  if (rev && rev.monthIndex === mi) {
    c.earnings += rev.bonus;
    st.earnings += rev.bonus;
    st.reviews = [...st.reviews, rev.score];
    const before = c.reputation;
    c.reputation = clamp(Math.round(c.reputation + CAREER.reputationPerReviewPoint.value * (rev.score - 55) + CAREER.sizeReputation * activeMembers(state) / 1000), 0, 100);
    const rng = ctx.rng('career.growth');
    const age = ageOf(c);
    const grew: string[] = [];
    if (rng.chance(CAREER.growthChance.value)) {
      const k2 = rng.weighted(CEO_STATS, (x) => Math.max(0, 20 - c.character.stats[x]));
      if (c.character.stats[k2] < 20) {
        c.character.stats[k2] += 1;
        grew.push(`your ${k2 === 'boardRelations' ? 'board relations' : k2 === 'memberRelations' ? 'member relations' : k2} improved`);
      }
    }
    if (age >= CAREER.declineFromAge && rng.chance(0.4)) {
      const k3 = rng.pick(CEO_STATS);
      if (c.character.stats[k3] > 1) c.character.stats[k3] -= 1;
    }
    log(c, `Annual review ${rev.score}; bonus ${dollars(rev.bonus)}; reputation ${before} → ${c.reputation}${grew.length ? `; ${grew.join(', ')}` : ''}.`);
  }

  if (state.outcome) {
    const end = OUTCOME_END[state.outcome.kind];
    const sev = end === 'fired' || end === 'absorbed' ? k.severanceMonths : 0;
    endStint(c, end, mi);
    log(c, `Left ${st.coopName} (${end}).${sev ? ` Severance of ${sev} months' pay.` : ''}`);
    state.outcome = { ...state.outcome, text: `${state.outcome.text}${sev ? ` Your contract pays ${sev} months of base pay as severance.` : ''} Look for your next job on the Career screen.` };
    return;
  }

  // The contract term ends: the board renews it, with a raise for good years, or lets it lapse.
  if (mi >= k.endMonth) {
    const last = st.reviews[st.reviews.length - 1] ?? 55;
    if (state.governance.boardConfidence >= CAREER.renewConfidence) {
      // Pay catches up with the going rate for the job, plus a merit raise for good years.
      const raise = clamp(CAREER.renewRaisePerPoint * (last - 55), 0, 0.08);
      const going = marketPay(state) * reputationPay(c.reputation);
      c.contract = { ...k, startMonth: mi + 1, endMonth: mi + CAREER.termYears * 12, base: roundCents(Math.max(k.base, going) * (1 + raise) / 10_000) * 10_000 };
      log(c, `Contract renewed for ${CAREER.termYears} years at ${dollars(c.contract.base)}.`);
      ctx.inbox({ kind: 'memo', title: 'Your contract is renewed', body: `The board renewed your employment agreement for ${CAREER.termYears} years${raise > 0 ? ` with a ${Math.round(raise * 100)}% raise` : ''}: base pay ${dollars(c.contract.base)} a year, bonus target ${Math.round(k.bonusTarget * 100)}% of base.` });
    } else {
      state.outcome = { kind: 'notRenewed', monthIndex: mi, text: `Your contract ran out and the board, its confidence at ${Math.round(state.governance.boardConfidence)}, chose not to renew it. Look for your next job on the Career screen.` };
      endStint(c, 'notRenewed', mi);
      log(c, `The board did not renew the contract at ${st.coopName}.`);
      return;
    }
  }

  if (ageOf(c) >= CAREER.retireAge) {
    state.outcome = { kind: 'retired', monthIndex: mi, text: `At ${ageOf(c)} you retire as general manager of ${state.coop.name}.` };
    endStint(c, 'retired', mi);
    log(c, `Retired from ${st.coopName}.`);
    return;
  }

  // Other boards come calling.
  c.offers = c.offers.filter((o) => o.expiresMonth >= mi);
  const settled = mi - st.fromMonth >= CAREER.settleMonths;
  const [p0, p1] = CAREER.offerChanceEmployed;
  const rng = ctx.rng('career.offers');
  if (settled && c.offers.length < CAREER.maxOpenOffers && rng.chance(p0 + (p1 - p0) * c.reputation / 100)) {
    const o = makeOffer(state, c, rng, false);
    c.offers = [...c.offers, o];
    log(c, `${o.coopName} (${o.members.toLocaleString('en-US')} members, ${regionLabel(o.regionId)}) offered ${dollars(o.base)}.`);
    ctx.inbox({ kind: 'alert', title: `${o.coopName} wants to talk`, body: `${o.note}\n\nThey offer ${dollars(o.base)} a year, a ${Math.round(o.bonusTarget * 100)}% bonus target and ${o.severanceMonths} months' severance on a ${o.termYears}-year agreement. The offer stands until ${formatMonth(o.expiresMonth)}; see the Career screen.` });
  }
}

// ---------- offers ----------

function makeOffer(s: GameState, c: CareerState, rng: Rng, searching: boolean): JobOffer {
  const mi = c.monthIndex;
  const year = yearOf(mi);
  const id = c.nextOfferId++;
  const rep = clamp(c.reputation - (searching ? 10 : 0), 0, 100);
  const neighbors = s.competitors.filter((x) => x.kind === 'coop' && x.status === 'active' && x.sites.length > 0 && x.name !== s.coop.name).sort((a, b) => a.id - b.id);
  const neighbor = neighbors.length > 0 && rng.chance(CAREER.neighborShare) ? rng.pick(neighbors) : null;
  const [sp0, sp1] = CAREER.offerMembersSpread;
  const [m0, m1] = SETUP.membersRange;
  const members = clamp(Math.round((CAREER.offerMembersBase + CAREER.offerMembersPerRep * rep) * rng.range(sp0, sp1) / 10) * 10, m0, Math.min(m1, 3000));
  const [h0, h1] = CAREER.historyYears;
  const historyFrom = Math.max(1970, year - rng.int(h0, h1));
  const regionId = neighbor ? s.setup.regionId : rng.chance(0.5) ? s.setup.regionId : rng.pick(REGION_IDS);
  const coopType: 'grain' | 'sugar' = rng.chance(s.setup.coopType === 'sugar' ? 0.5 : 0.12) ? 'sugar' : 'grain';
  const mapSeed = neighbor ? s.setup.mapSeed : 100_000 + ((c.seed * 31 + id * 977) % 900_000);
  const territorySize = neighbor ? s.setup.territorySize : undefined;
  const homeTownId = neighbor ? neighbor.sites[0].townId : undefined;
  const preview = previewTerritory({ mapSeed, regionId, startYear: historyFrom, startingMembers: members, territorySize });
  const coopName = neighbor ? neighbor.name : suggestCoopNames(preview, historyFrom, mapSeed, 1, coopType)[0] ?? `Cooperative ${id}`;
  const town = homeTownId !== undefined ? preview.towns[homeTownId]?.name : undefined;
  const locations = Math.max(1, Math.round(members / 110));
  const base = roundCents(marketPayAt(s, mi, members, locations) * reputationPay(rep) * rng.range(0.95, 1.05) * (searching ? 0.95 : 1) / 100_000) * 100_000;
  const bonusTarget = rng.weighted([0.1, 0.12, 0.15, 0.18, 0.2], (b) => (b <= 0.15 ? 1.2 - rep / 100 : 0.4 + rep / 100));
  const severanceMonths = rep >= 60 ? 9 : rep < 25 ? 3 : CAREER.severanceMonths.value;
  const kind = coopType === 'sugar' ? 'a sugar beet growers\' co-op' : 'a grain and farm supply co-op';
  const note = neighbor
    ? `The board of ${coopName}, a neighboring co-op${town ? ` based in ${town}` : ''}, is looking for a general manager and asked whether you would be interested.`
    : `A search consultant calls on behalf of ${coopName}, ${kind} of about ${members.toLocaleString('en-US')} members in ${regionLabel(regionId)}. Its board wants a new general manager.`;
  return {
    id, monthIndex: mi, expiresMonth: mi + CAREER.offerMonths, coopName, regionId, coopType, members, historyFrom, mapSeed,
    ...(homeTownId !== undefined ? { homeTownId } : {}), ...(territorySize ? { territorySize } : {}), neighbor: !!neighbor,
    base, bonusTarget, severanceMonths, termYears: CAREER.termYears, rounds: 0, opening: { base, bonusTarget, severanceMonths }, note,
  };
}

const REGION_LABEL: Record<string, string> = { eccb: 'the central Corn Belt', rrv: 'the Red River Valley', wcb: 'the Western Corn Belt & Plains', glk: 'the Great Lakes' };
export const regionLabel = (id: string): string => REGION_LABEL[id] ?? id;

// ---------- negotiation ----------

/** How far past its opening package (in value) a board will go for this GM. */
export function boardSlack(c: CareerState, hasLeverage: boolean): number {
  const neg = c.character.stats.negotiation;
  return Math.max(0, CAREER.slackBase.value + CAREER.slackPerRep.value * c.reputation / 100 + CAREER.slackPerNegotiation.value * (neg - 10) + (hasLeverage ? CAREER.slackLeverage.value : 0));
}

/** You have leverage with a board when you can walk away: a job to keep, or another offer in hand. */
const leverage = (c: CareerState, offerId?: number) => c.status === 'employed' || c.offers.some((o) => o.id !== offerId);

export interface Ask { base: Cents; bonusTarget: number; severanceMonths: number }

function checkAsk(ask: Ask): string | null {
  const [b0, b1] = CAREER.bonusTargetRange;
  const [s0, s1] = CAREER.severanceRange;
  if (!(Number.isFinite(ask.base) && ask.base > 0)) return 'Ask for a base salary above zero.';
  if (!(ask.bonusTarget >= b0 && ask.bonusTarget <= b1)) return `A bonus target must be ${Math.round(b0 * 100)}–${Math.round(b1 * 100)}% of base.`;
  if (!(Number.isInteger(ask.severanceMonths) && ask.severanceMonths >= s0 && ask.severanceMonths <= s1)) return `Severance must be ${s0}–${s1} months.`;
  return null;
}

const withCareer = (s: GameState): GameState => cloneState(s);

/** Counter an offer. The board agrees, meets you partway, or walks away if you ask far too much. */
export function counterOffer(s0: GameState, offerId: number, askIn: Ask): CareerResult {
  const s = withCareer(s0);
  const c = s.career;
  const o = c?.offers.find((x) => x.id === offerId);
  if (!c || !o) return { state: s0, ok: false, messages: [{ level: 'error', text: 'No such offer.' }] };
  const ask = { ...askIn, base: roundCents(askIn.base) };
  const bad = checkAsk(ask);
  if (bad) return { state: s0, ok: false, messages: [{ level: 'error', text: bad }] };
  if (o.rounds >= CAREER.maxRounds) return { state: s0, ok: false, messages: [{ level: 'error', text: `${o.coopName}'s board has made its final offer.` }] };
  o.rounds += 1;
  const ceiling = packageValue(o.opening) * (1 + boardSlack(c, leverage(c, o.id)));
  const want = packageValue(ask);
  const rng = stream(c.seed, c.monthIndex, 'career.negotiate', o.id * 10 + o.rounds);
  if (want <= ceiling) {
    Object.assign(o, ask);
    log(c, `${o.coopName} agreed to ${dollars(ask.base)}, ${Math.round(ask.bonusTarget * 100)}% bonus target, ${ask.severanceMonths} months' severance.`);
    return { state: s, ok: true, messages: [{ level: 'info', text: `${o.coopName}'s board agrees to your terms.` }] };
  }
  const over = want / ceiling - 1;
  const hold = CAREER.holdChance.value + CAREER.holdPerNegotiation.value * (c.character.stats.negotiation - 10) - 2 * over;
  if (rng.chance(clamp(hold, 0.05, 0.95))) {
    // The board meets you at the most it will pay, keeping your bonus and severance asks where it can.
    const scale = ceiling / want;
    const base = roundCents(Math.max(o.base, ask.base * scale) / 100_000) * 100_000;
    const fit = { base, bonusTarget: ask.bonusTarget, severanceMonths: ask.severanceMonths };
    const counter = packageValue(fit) <= ceiling ? fit : { base: roundCents(ceiling / (1 + CAREER.bonusValue * o.bonusTarget + CAREER.severanceValuePerMonth * o.severanceMonths) / 100_000) * 100_000, bonusTarget: o.bonusTarget, severanceMonths: o.severanceMonths };
    Object.assign(o, counter);
    const final = o.rounds >= CAREER.maxRounds;
    log(c, `${o.coopName} came back with ${dollars(o.base)}.`);
    return { state: s, ok: true, messages: [{ level: 'info', text: `${o.coopName}'s board came back with ${dollars(o.base)} base, ${Math.round(o.bonusTarget * 100)}% bonus target, ${o.severanceMonths} months' severance${final ? ' — its final offer' : ''}.` }] };
  }
  c.offers = c.offers.filter((x) => x.id !== o.id);
  log(c, `${o.coopName} withdrew its offer.`);
  return { state: s, ok: true, messages: [{ level: 'info', text: `${o.coopName}'s board thought you asked too much and withdrew its offer.` }] };
}

export function declineOffer(s0: GameState, offerId: number): CareerResult {
  const s = withCareer(s0);
  const c = s.career;
  if (!c?.offers.some((o) => o.id === offerId)) return { state: s0, ok: false, messages: [{ level: 'error', text: 'No such offer.' }] };
  c.offers = c.offers.filter((o) => o.id !== offerId);
  return { state: s, ok: true, messages: [{ level: 'info', text: 'Offer declined.' }] };
}

/** When you may ask your own board for a raise: within a few months after a review, once a review. */
export function raiseWindow(s: GameState): { open: boolean; review: number | null; reason: string } {
  const c = s.career;
  if (!c || c.status !== 'employed') return { open: false, review: null, reason: 'Not employed.' };
  const rev = s.governance.reviews[s.governance.reviews.length - 1];
  if (!rev || s.clock.monthIndex - rev.monthIndex > CAREER.raiseWindow) return { open: false, review: null, reason: `Ask in the ${CAREER.raiseWindow} months after your annual review.` };
  if (c.askedAfterReview === rev.monthIndex) return { open: false, review: rev.monthIndex, reason: 'You already asked after this review.' };
  return { open: true, review: rev.monthIndex, reason: '' };
}

/** What your board would give now, as a share more than your current package's value. */
export function boardWillingness(s: GameState): number {
  const c = s.career!;
  const rev = s.governance.reviews[s.governance.reviews.length - 1];
  const score = rev?.score ?? 50;
  const st = c.character.stats;
  return Math.max(0, CAREER.raiseAtScore100.value * clamp((score - CAREER.raiseFromScore) / (100 - CAREER.raiseFromScore), 0, 1)
    + CAREER.slackPerNegotiation.value * (st.negotiation - 10) / 2 + 0.004 * (st.boardRelations - 10) + (c.offers.length > 0 ? CAREER.slackLeverage.value : 0)
    + 0.0015 * (s.governance.boardConfidence - 60)
    // A board pays at least the going rate for the job (pay falls behind with inflation and growth).
    + Math.max(0, (marketPay(s) * reputationPay(c.reputation)) / Math.max(1, c.contract!.base) - 1));
}

/** Ask your board for better terms; a granted ask starts a new agreement for the full term. */
export function askBoard(s0: GameState, askIn: Ask): CareerResult {
  const w = raiseWindow(s0);
  if (!w.open) return { state: s0, ok: false, messages: [{ level: 'error', text: w.reason }] };
  const ask = { ...askIn, base: roundCents(askIn.base) };
  const bad = checkAsk(ask);
  if (bad) return { state: s0, ok: false, messages: [{ level: 'error', text: bad }] };
  const s = withCareer(s0);
  const c = s.career!;
  const k = c.contract!;
  c.askedAfterReview = w.review!;
  const mi = s.clock.monthIndex;
  const willing = boardWillingness(s);
  const over = packageValue(ask) / packageValue(k) - 1;
  const newTerm = (terms: Ask): EmploymentContract => ({ ...k, ...terms, startMonth: mi, endMonth: mi + CAREER.termYears * 12 - 1 });
  if (over <= willing + 1e-9) {
    c.contract = newTerm(ask);
    log(c, `The board agreed to ${dollars(ask.base)}, ${Math.round(ask.bonusTarget * 100)}% bonus target, ${ask.severanceMonths} months' severance.`);
    return { state: s, ok: true, messages: [{ level: 'info', text: `The board agreed: base ${dollars(ask.base)}, bonus target ${Math.round(ask.bonusTarget * 100)}%, severance ${ask.severanceMonths} months, on a new ${CAREER.termYears}-year agreement.` }] };
  }
  const rng = stream(c.seed, mi, 'career.raise', w.review!);
  const hold = CAREER.holdChance.value + CAREER.holdPerNegotiation.value * (c.character.stats.negotiation - 10) - 3 * (over - willing);
  if (willing > 0.005 && rng.chance(clamp(hold, 0.05, 0.95))) {
    const base = roundCents(packageValue(k) * (1 + willing) / (1 + CAREER.bonusValue * k.bonusTarget + CAREER.severanceValuePerMonth * k.severanceMonths) / 100_000) * 100_000;
    c.contract = newTerm({ base: Math.max(base, k.base), bonusTarget: k.bonusTarget, severanceMonths: k.severanceMonths });
    log(c, `The board met the ask partway: ${dollars(c.contract.base)}.`);
    return { state: s, ok: true, messages: [{ level: 'info', text: `The board would not go that far but raised your base to ${dollars(c.contract.base)} on a new ${CAREER.termYears}-year agreement.` }] };
  }
  const hit = over - willing > 0.1 ? CAREER.overreachConfidence : CAREER.refusedConfidence;
  s.governance.boardConfidence = clamp(s.governance.boardConfidence + hit, 0, 100);
  log(c, 'The board turned down a request for better terms.');
  return { state: s, ok: true, messages: [{ level: 'info', text: `The board turned you down${hit === CAREER.overreachConfidence ? ', and some directors thought the ask was out of line' : ''}. Board confidence ${hit}.` }] };
}

// ---------- leaving, and looking ----------

/** Resign: the job ends this month. */
export function resign(s0: GameState): CareerResult {
  if (s0.career?.status !== 'employed' || s0.outcome) return { state: s0, ok: false, messages: [{ level: 'error', text: 'You are not running a co-op.' }] };
  const s = withCareer(s0);
  const c = s.career!;
  const mi = s.clock.monthIndex;
  const name = s.coop.name;
  endStint(c, 'resigned', mi);
  log(c, `Resigned from ${name}.`);
  s.outcome = { kind: 'resigned', monthIndex: mi, text: `You resigned as general manager of ${name}. Look for your next job on the Career screen.` };
  return { state: s, ok: true, messages: [{ level: 'info', text: 'You resigned.' }] };
}

/** Retire for good (from 55, or whenever you are out of work). */
export function retire(s0: GameState): CareerResult {
  const c0 = s0.career;
  if (!c0 || c0.status === 'retired') return { state: s0, ok: false, messages: [{ level: 'error', text: 'No career to retire from.' }] };
  if (c0.status === 'employed' && ageOf(c0) < 55) return { state: s0, ok: false, messages: [{ level: 'error', text: 'You can retire from the job at 55.' }] };
  const s = withCareer(s0);
  const c = s.career!;
  if (c.status === 'employed') {
    endStint(c, 'retired', s.clock.monthIndex);
    s.outcome = { kind: 'retired', monthIndex: s.clock.monthIndex, text: `You retire as general manager of ${s.coop.name}.` };
  } else c.status = 'retired';
  c.offers = [];
  log(c, 'Retired.');
  return { state: s, ok: true, messages: [{ level: 'info', text: 'You retired.' }] };
}

/** A month out of work: severance, calls from boards, and age. */
export function searchMonth(s0: GameState): CareerResult {
  const c0 = s0.career;
  if (!c0 || c0.status !== 'searching') return { state: s0, ok: false, messages: [{ level: 'error', text: 'You are not looking for work.' }] };
  const s = { ...s0, career: JSON.parse(JSON.stringify(c0)) as CareerState };
  const c = s.career!;
  c.monthIndex += 1;
  const messages: CareerMessage[] = [];
  if ((c.severanceLeft ?? 0) > 0) {
    // Severance: the last contract's base pay, month by month.
    c.earnings += roundCents((c.lastBase ?? 0) / 12);
    c.severanceLeft = (c.severanceLeft ?? 0) - 1;
  }
  c.offers = c.offers.filter((o) => o.expiresMonth >= c.monthIndex);
  if (ageOf(c) >= CAREER.retireAge) {
    c.status = 'retired';
    c.offers = [];
    log(c, 'Retired.');
    return { state: s, ok: true, messages: [{ level: 'info', text: `At ${ageOf(c)} you retire.` }] };
  }
  const rng = stream(c.seed, c.monthIndex, 'career.search');
  const [p0, p1] = CAREER.offerChanceSearching;
  if (c.offers.length < CAREER.maxOpenOffers && rng.chance(p0 + (p1 - p0) * c.reputation / 100)) {
    const o = makeOffer(s, c, rng, true);
    c.offers = [...c.offers, o];
    log(c, `${o.coopName} (${o.members.toLocaleString('en-US')} members, ${regionLabel(o.regionId)}) offered ${dollars(o.base)}.`);
    messages.push({ level: 'info', text: `${o.coopName} offers you its general manager's job.` });
  }
  return { state: s, ok: true, messages: messages.length ? messages : [{ level: 'info', text: `${formatMonth(c.monthIndex)}: no calls this month.` }] };
}


/** Stats of the character, for display. */
export const characterStats = (c: CareerState): [CeoStat, number][] => CEO_STATS.map((k) => [k, c.character.stats[k]]);
export const backgroundLabel = (c: CareerState): string => BACKGROUNDS[c.character.background].label;
