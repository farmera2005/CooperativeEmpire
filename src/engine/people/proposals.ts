// Managers' proposals to the GM (D-104). A hired division manager looks at their business each
// season and, when their read of it crosses a threshold, proposes a change to its settings as
// an inbox decision. The read is the truth (where the market is going, how busy the plants
// were) blurred by noise that shrinks with the manager's skill, so a strong manager's proposals
// are usually right and a weak one's are often wrong. Months later a review memo says how the
// call turned out, and the manager's track record and the GM's read of their skill sharpen.

import { PROPOSALS, ROLE_DEFS, type Role, type Skill } from '../../data/people';
import type { SupplyDivision } from '../../data/supply';
import { formatMonth, monthOf } from '../core/calendar';
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import { farmStress } from '../supply/credit';
import type { DivisionId, GameState, InboxItem, Leader, StaffLevel } from '../types';
import { marketValue } from '../world/marketPath';
import { grainCapacity } from '../facilities/facilities';
import { effectiveSkill } from './leaders';

const DIVS: DivisionId[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
const LEVELS: StaffLevel[] = ['lean', 'standard', 'full'];
const HANDLER = 'mgr.';
const P = PROPOSALS;

/** One proposal a manager could make this month: the change and how right it is. */
export interface Draft {
  kind: 'fill' | 'cover' | 'credit' | 'hedge' | 'staffing' | 'offseason' | 'toll' | 'fees';
  skill: Skill;
  title: string;
  /** The manager's case, in their words (uses their noisy read). */
  body: string;
  /** What approving does, for the button. */
  detail: string;
  /** Encoded change and the facts needed to review it. */
  data: Record<string, number>;
  /** True if the true situation supports the change. */
  right: boolean;
  /** What actually happened (the signal's true value), for the review memo. */
  truth: number;
}

/** One sentence on what actually happened, rebuilt from the decision's data. */
function outcomeText(kind: string, truth: number, d: DivisionId): string {
  switch (kind) {
    case 'fill': return `Nitrogen moved ${pct(truth)} by spring`;
    case 'cover': return `Propane moved ${pct(truth)} by January`;
    case 'credit': return `Farm-income stress ${truth > 0.01 ? 'worsened' : truth < -0.01 ? 'eased' : 'held steady'} over the year`;
    case 'hedge': return `Corn moved ${pct(truth)} over six months`;
    case 'staffing': return d === 'GRAIN' ? `Waits at the worst of last harvest were really ${truth.toFixed(1)} hours` : `Equipment really ran at ${Math.round(truth * 100)}% at last season's peak`;
    case 'toll': return `The mill really ran at ${Math.round(truth * 100)}% of capacity`;
    case 'offseason': return 'The busy season was over';
    case 'fees': return truth >= 0 ? `We really turned away ${Math.round(truth * 100)}% of the grain offered last year` : `The house really turned ${(-truth).toFixed(1)} times last year`;
    default: return 'The facts are in';
  }
}

/** Noise in a manager's read: their effective skill in the relevant area, scaled to the signal. */
function readNoise(s: GameState, role: Role, skill: Skill, scale: number): number {
  return P.noiseAtSkill1.value * scale * clamp((20 - effectiveSkill(s, role, skill)) / 19, 0.03, 1.2);
}

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
const change = (ctx: TickContext, series: Parameters<typeof marketValue>[1], ahead: number) =>
  marketValue(ctx.path, series, ctx.mi + ahead) / marketValue(ctx.path, series, ctx.mi) - 1;

/** Peak use of a division's equipment over the same season last year (0..1), or null if unknown. */
function lastSeasonPeak(s: GameState, d: DivisionId, months: number[]): number | null {
  if (d === 'GRAIN') return null;
  const reports = s.coop.supply[d as SupplyDivision].reports.filter((r) => s.clock.monthIndex - r.monthIndex <= 13 && months.includes(monthOf(r.monthIndex)));
  let peak = -1;
  for (const r of reports) for (const c of r.capacity) if (c.available > 0) peak = Math.max(peak, c.used / c.available);
  return peak < 0 ? null : peak;
}

/** The busy season each division staffs up for, and the month the manager raises it. */
const SEASON: Record<DivisionId, { ask: number; months: number[] } | undefined> = {
  GRAIN: { ask: 7, months: [9, 10, 11] },
  AGRONOMY: { ask: 2, months: [3, 4, 5] },
  FEED: { ask: 10, months: [11, 12, 1, 2] },
  ENERGY: { ask: 9, months: [10, 11, 12, 1, 2] },
  RETAIL: undefined,
  CORP: undefined,
};

/** The proposals a manager would make this month, if any (exported for tests). */
export function draftProposals(ctx: TickContext, l: Leader, rng: Rng): Draft[] {
  const { state, mi } = ctx;
  const d = l.role as DivisionId;
  const m = monthOf(mi);
  const out: Draft[] = [];
  const read = (truth: number, skill: Skill, scale: number) => truth + rng.normal(0, readNoise(state, l.role, skill, scale));
  const open = state.coop.facilities.filter((f) => f.division === d && f.status === 'operating');
  if (!open.length) return out;
  const divIndex = DIVS.indexOf(d);

  // Fertilizer fills, before the summer and winter fill programs.
  if (d === 'AGRONOMY' && (m === 5 || m === 11)) {
    const pol = state.coop.supplyPolicy.AGRONOMY;
    const field = m === 5 ? 'summer' : 'winter';
    const cur = m === 5 ? pol.summerFillPct : pol.winterFillPct;
    const ahead = ((16 - m) % 12) || 12; // to next April
    const truth = change(ctx, 'anhydrous', ahead);
    const seen = read(truth, 'merchandising', P.fillScale.value);
    const up = seen > P.fillThreshold.value && cur < 0.9;
    const down = seen < -P.fillThreshold.value && cur > 0;
    if (up || down) {
      const value = Math.round(clamp(cur + (up ? 1 : -1) * P.fillStep.value, 0, 0.9) * 100) / 100;
      out.push({
        kind: 'fill', skill: 'merchandising',
        title: `${l.name} proposes a ${up ? 'heavier' : 'lighter'} ${field} fertilizer fill`,
        body: `I expect nitrogen to be ${pct(seen)} by spring. ${up ? 'Buying more at fill prices locks in cheaper product for our customers and our margin.' : 'If prices fall, fertilizer we fill now will be written down and we will be undersold in spring.'} I propose taking the ${field} fill from ${Math.round(cur * 100)}% to ${Math.round(value * 100)}% of expected spring sales.`,
        detail: `${field[0].toUpperCase()}${field.slice(1)} fill ${Math.round(cur * 100)}% → ${Math.round(value * 100)}%`,
        data: { div: divIndex, value, field: m === 5 ? 0 : 1 },
        right: up ? truth > 0 : truth < 0,
        truth,
      });
    }
  }

  // Propane cover for prebuy contracts, before the prebuy season.
  if (d === 'ENERGY' && m === 6 && state.coop.supplyPolicy.ENERGY.prebuyProgram) {
    const pol = state.coop.supplyPolicy.ENERGY;
    const truth = change(ctx, 'propane', 7);
    const seen = read(truth, 'merchandising', P.coverScale.value);
    const cover = seen > P.coverThreshold.value && pol.supplyCover === 'hand';
    const uncover = seen < -P.coverThreshold.value && pol.supplyCover === 'covered';
    if (cover || uncover) {
      out.push({
        kind: 'cover', skill: 'merchandising',
        title: `${l.name} proposes ${cover ? 'buying supply to cover' : 'leaving uncovered'} this winter's propane prebuys`,
        body: `I read propane at ${pct(seen)} by January. ${cover ? 'If we sell prebuy contracts without buying the gas, a price spike comes straight out of our margin.' : 'Covering now would lock in gas we can buy cheaper this winter.'}`,
        detail: cover ? 'Cover prebuy contracts with supply' : 'Buy prebuy supply as needed',
        data: { div: divIndex, value: cover ? 1 : 0 },
        right: cover ? truth > 0 : truth < 0,
        truth,
      });
    }
  }

  // Customer credit, at the start of the year (a supply division's terms).
  if (d !== 'GRAIN' && m === 1) {
    const pol = state.coop.supplyPolicy[d as SupplyDivision];
    const now = farmStress(ctx);
    const truth = farmStress({ ...ctx, mi: mi + 12 }) - now;
    const seen = read(truth, 'finance', P.creditScale.value);
    const tighten = seen > P.creditThreshold.value && pol.credit !== 'strict';
    const relax = seen < -P.creditThreshold.value && pol.credit === 'strict';
    if (tighten || relax) {
      out.push({
        kind: 'credit', skill: 'finance',
        title: `${l.name} proposes ${tighten ? 'tightening' : 'relaxing'} ${d.toLowerCase()} credit`,
        body: tighten
          ? 'Farm income looks to be getting worse over the next year. Customers who cannot pay will cost us more than the sales we lose by tightening terms now.'
          : 'Farm income is recovering. Strict terms are costing us customers who would pay.',
        detail: tighten ? 'Customer credit: strict' : 'Customer credit: normal',
        data: { div: divIndex, value: tighten ? 0 : 1 },
        right: tighten ? truth > 0 : truth < 0,
        truth,
      });
    }
  }

  // Hedging discipline (grain): back to fully hedged when prices look to fall; a Gunslinger
  // wants room to ride a rally.
  if (d === 'GRAIN' && (m === 3 || m === 9)) {
    const pol = state.coop.grainPolicy;
    const truth = change(ctx, 'corn', 6);
    const seen = read(truth, 'merchandising', P.hedgeScale.value);
    if (pol.hedgeRatio < 0.95 && seen < -P.hedgeThreshold.value) {
      out.push({
        kind: 'hedge', skill: 'merchandising',
        title: `${l.name} proposes hedging all owned grain again`,
        body: `I expect corn to be ${pct(seen)} over the next six months. Every unhedged bushel we own loses that much; I want the book fully hedged.`,
        detail: `Hedge ratio ${Math.round(pol.hedgeRatio * 100)}% → 100%`,
        data: { div: divIndex, value: 1 },
        right: truth < 0,
        truth,
      });
    } else if (pol.hedgeRatio >= 0.95 && l.traits.includes('gunslinger') && seen > 2 * P.hedgeThreshold.value) {
      const value = P.gunslingerHedge.value;
      out.push({
        kind: 'hedge', skill: 'merchandising',
        title: `${l.name} proposes hedging only ${Math.round(value * 100)}% of owned grain`,
        body: `Corn is going up — I see ${pct(seen)} over six months. Hedging every bushel gives that away. Let me carry part of the book open.`,
        detail: `Hedge ratio ${Math.round(pol.hedgeRatio * 100)}% → ${Math.round(value * 100)}%`,
        data: { div: divIndex, value },
        right: truth > 0,
        truth,
      });
    }
  }

  // Crews for the busy season: full when last season's equipment ran flat out, lean when idle.
  const season = SEASON[d];
  if (season && m === season.ask) {
    const level = open[0].staffing.level;
    let truth: number | null;
    let seen: number;
    let busy: boolean;
    let quiet: boolean;
    if (d === 'GRAIN') {
      truth = Math.max(...open.map((f) => f.grain.waitMemory));
      seen = read(truth, 'operations', P.waitScale.value);
      busy = seen > P.grainWaitAbove.value;
      quiet = seen < P.grainWaitAbove.value / 5;
    } else {
      truth = lastSeasonPeak(state, d, season.months);
      seen = truth === null ? 0 : read(truth, 'operations', P.utilScale.value);
      busy = seen > P.busyAbove.value;
      quiet = seen < P.quietBelow.value;
    }
    if (truth !== null) {
      const target: StaffLevel | null = busy && level !== 'full' ? 'full' : quiet && level === 'full' ? 'standard' : quiet && level === 'standard' && d !== 'GRAIN' ? 'lean' : null;
      if (target) {
        const t = truth;
        const actuallyBusy = d === 'GRAIN' ? t > P.grainWaitAbove.value : t > P.busyAbove.value;
        const actuallyQuiet = d === 'GRAIN' ? t < P.grainWaitAbove.value / 5 : t < P.quietBelow.value;
        const describe = d === 'GRAIN' ? `trucks waited about ${Math.max(0, seen).toFixed(1)} hours at the worst of last harvest` : `our equipment ran at about ${Math.round(clamp(seen, 0, 1.5) * 100)}% at last season's peak`;
        out.push({
          kind: 'staffing', skill: 'operations',
          title: `${l.name} proposes ${target} crews for the ${d.toLowerCase()} busy season`,
          body: `By my count ${describe}. ${target === 'full' ? 'Short crews will cost us customers and grievances; I want more hands for the season.' : 'We are carrying more people than the work needs; I can run it with fewer.'}`,
          detail: `Staffing at ${open.length} ${d.toLowerCase()} site${open.length > 1 ? 's' : ''}: ${level} → ${target}`,
          data: { div: divIndex, value: LEVELS.indexOf(target) },
          right: target === 'full' ? actuallyBusy : actuallyQuiet,
          truth: t,
        });
      }
    }
  }

  // After the busy season: full crews back to standard.
  const off = P.offSeasonAsk.value[d];
  if (off !== undefined && m === off && open.some((f) => f.staffing.level === 'full')) {
    out.push({
      kind: 'offseason', skill: 'operations',
      title: `${l.name} proposes standard crews now the season is over`,
      body: 'The rush is behind us. Extra seasonal hands are an expense we no longer need.',
      detail: `Staffing at ${open.length} ${d.toLowerCase()} site${open.length > 1 ? 's' : ''}: full → standard`,
      data: { div: divIndex, value: LEVELS.indexOf('standard') },
      right: true,
      truth: 0,
    });
  }

  // Grain storage fees before harvest: charge more when the house turns grain away, less when it sits empty.
  if (d === 'GRAIN' && m === 8) {
    const pol = state.coop.grainPolicy;
    const reps = state.coop.grain.reports.slice(-12);
    let received = 0;
    let away = 0;
    for (const r of reps) for (const c of Object.values(r.byCommodity)) {
      received += c.receivedBu;
      away += c.turnedAwayBu;
    }
    const space = open.reduce((a, f) => a + grainCapacity(f.components).storageBu + grainCapacity(f.components).pileBu, 0);
    const offered = received + away;
    if (offered > 0 && space > 0) {
      const truthAway = away / offered;
      const turns = received / space;
      const seenAway = read(truthAway, 'merchandising', P.turnedAwayScale.value);
      const seenTurns = read(turns, 'merchandising', 1);
      if (seenAway > P.turnedAwayAbove.value && pol.storageFee < P.storageFeeUp.value) {
        out.push({
          kind: 'fees', skill: 'merchandising',
          title: `${l.name} proposes raising storage fees`,
          body: `We turned away about ${Math.round(clamp(seenAway, 0, 1) * 100)}% of the grain offered last year. Space is scarce; we should charge for it.`,
          detail: `Storage fees ×${pol.storageFee.toFixed(2)} → ×${P.storageFeeUp.value.toFixed(2)}`,
          data: { div: divIndex, value: P.storageFeeUp.value },
          right: truthAway > P.turnedAwayAbove.value,
          truth: truthAway,
        });
      } else if (seenTurns < P.emptyTurns.value && pol.storageFee > P.storageFeeDown.value) {
        out.push({
          kind: 'fees', skill: 'merchandising',
          title: `${l.name} proposes cutting storage fees`,
          body: `The house turned only about ${Math.max(0, seenTurns).toFixed(1)} times last year. Cheaper storage would bring grain in that now goes elsewhere.`,
          detail: `Storage fees ×${pol.storageFee.toFixed(2)} → ×${P.storageFeeDown.value.toFixed(2)}`,
          data: { div: divIndex, value: P.storageFeeDown.value },
          right: turns < P.emptyTurns.value,
          truth: -turns,
        });
      }
    }
  }

  // Toll milling when the mill has room.
  if (d === 'FEED' && m === 4 && !state.coop.supplyPolicy.FEED.tollMilling && ctx.year >= 1990) {
    const truth = lastSeasonPeak(state, 'FEED', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    if (truth !== null) {
      const seen = read(truth, 'sales', P.utilScale.value);
      if (seen < 0.7) {
        out.push({
          kind: 'toll', skill: 'sales',
          title: `${l.name} proposes taking toll-milling work`,
          body: `The mill ran at only about ${Math.round(clamp(seen, 0, 1) * 100)}% last year. An integrator's toll contract would cover fixed costs, at the risk of depending on one customer.`,
          detail: 'Offer toll milling',
          data: { div: divIndex, value: 1 },
          right: truth < 0.8,
          truth,
        });
      }
    }
  }
  return out;
}

/** Monthly: each division manager with no proposal pending may bring one to the GM. */
export function stepProposals(ctx: TickContext): void {
  const { state, mi } = ctx;
  for (const l of [...state.people.leaders].sort((a, b) => a.id - b.id)) {
    if (!DIVS.includes(l.role as DivisionId)) continue;
    if (state.inbox.some((i) => i.choice && !i.choice.chosen && i.choice.handler.startsWith(HANDLER) && i.choice.data?.leaderId === l.id)) continue;
    const rng = ctx.rng('people.proposals', l.id);
    const options = draftProposals(ctx, l, rng);
    if (!options.length) continue;
    const initiative = clamp(P.initiativeBase.value + P.initiativePerLeadership.value * (effectiveSkill(state, l.role, 'leadership') - 10) + P.initiativePerAmbition.value * (l.ambition - 0.5), 0.15, 0.95);
    if (!rng.chance(initiative)) continue;
    const dr = options[0];
    l.flags = { ...l.flags, proposed: (l.flags.proposed ?? 0) + 1 };
    state.inbox.push({
      id: state.nextInboxId++, monthIndex: mi, read: false, kind: 'memo', title: dr.title,
      body: `${dr.body}\n\n— ${l.name}, ${ROLE_DEFS[l.role].label}`,
      choice: {
        options: [
          { id: 'approve', label: 'Approve', detail: dr.detail },
          { id: 'decline', label: 'Decline', detail: 'Keep the current settings' },
        ],
        defaultId: 'decline', deadline: mi + 2, handler: `${HANDLER}${dr.kind}`,
        data: { ...dr.data, leaderId: l.id, right: dr.right ? 1 : 0, truth: dr.truth, reviewMonth: mi + P.reviewMonths },
      },
    });
  }
  stepReviews(ctx);
}

/** Apply an approved proposal. Called from the inbox decision handler. */
export function applyProposal(s: GameState, item: InboxItem, optionId: string): CommandMessage[] {
  const c = item.choice!;
  const data = c.data ?? {};
  const leader = s.people.leaders.find((x) => x.id === data.leaderId);
  if (leader) {
    leader.morale = clamp(leader.morale + (optionId === 'approve' ? P.approveMorale : P.declineMorale), 0, 100);
    if (optionId === 'approve') leader.flags = { ...leader.flags, approved: (leader.flags.approved ?? 0) + 1 };
  }
  if (optionId !== 'approve') return [{ level: 'info', text: 'Declined; settings unchanged.' }];
  const d = DIVS[data.div ?? 0];
  const kind = c.handler.slice(HANDLER.length);
  switch (kind) {
    case 'fill': {
      const p = { ...s.coop.supplyPolicy.AGRONOMY };
      if (data.field === 0) p.summerFillPct = data.value;
      else p.winterFillPct = data.value;
      s.coop.supplyPolicy.AGRONOMY = p;
      break;
    }
    case 'cover':
      s.coop.supplyPolicy.ENERGY = { ...s.coop.supplyPolicy.ENERGY, supplyCover: data.value ? 'covered' : 'hand' };
      break;
    case 'credit':
      s.coop.supplyPolicy[d as SupplyDivision] = { ...s.coop.supplyPolicy[d as SupplyDivision], credit: data.value ? 'normal' : 'strict' };
      break;
    case 'hedge':
      s.coop.grainPolicy = { ...s.coop.grainPolicy, hedgeRatio: data.value };
      break;
    case 'staffing':
    case 'offseason':
      for (const f of s.coop.facilities) if (f.division === d && f.status === 'operating') f.staffing = { ...f.staffing, level: LEVELS[data.value] };
      break;
    case 'toll':
      s.coop.supplyPolicy.FEED = { ...s.coop.supplyPolicy.FEED, tollMilling: true };
      break;
    case 'fees':
      s.coop.grainPolicy = { ...s.coop.grainPolicy, storageFee: data.value };
      break;
  }
  return [{ level: 'info', text: 'Approved; the change takes effect now.' }];
}

/** The review memo: how a proposal from months ago turned out, and what it says about its author. */
function stepReviews(ctx: TickContext): void {
  const { state, mi } = ctx;
  for (const item of state.inbox) {
    const c = item.choice;
    if (!c?.chosen || !c.handler.startsWith(HANDLER) || c.data?.reviewMonth !== mi) continue;
    const l = state.people.leaders.find((x) => x.id === c.data!.leaderId);
    if (!l) continue;
    const right = c.data!.right === 1;
    if (right) l.flags = { ...l.flags, right: (l.flags.right ?? 0) + 1 };
    // A track record narrows what we know of the skill behind the call.
    const skill: Skill = c.handler.endsWith('staffing') || c.handler.endsWith('offseason') ? 'operations' : c.handler.endsWith('credit') ? 'finance' : c.handler.endsWith('toll') ? 'sales' : 'merchandising';
    const [lo, hi] = l.revealed[skill];
    if (hi - lo > 2) l.revealed[skill] = right ? [Math.min(l.skills[skill], lo + 1), hi] : [lo, Math.max(l.skills[skill], hi - 1)];
    const approved = c.chosen === 'approve';
    const outcome = outcomeText(c.handler.slice(HANDLER.length), c.data!.truth ?? 0, DIVS[c.data!.div ?? 0]);
    state.inbox.push({
      id: state.nextInboxId++, monthIndex: mi, read: false, kind: 'memo',
      title: `Looking back: ${item.title.replace(`${l.name} proposes`, `${l.name}'s proposal on`)}`,
      body: `In ${formatMonth(item.monthIndex)} ${l.name} proposed: ${c.options.find((o) => o.id === 'approve')?.detail ?? ''}. We ${approved ? 'approved it' : 'declined'}. ${outcome}, so the call was ${right ? 'right' : 'wrong'}${approved ? (right ? ' and it paid off.' : ', and it cost us.') : right ? '; it would have paid off.' : '; declining spared us.'} Track record: ${l.flags.right ?? 0} right of ${l.flags.proposed ?? 0} proposals.`,
    });
  }
}
