// Member democracy (DESIGN §14.5): annual director elections with nominees and insurgents,
// the annual meeting, member petitions (recalls) and member votes on bylaw amendments.

import { ELECTIONS, MEETING_REMARKS, PETITIONS } from '../../data/governance';
import { GOVERNANCE_SETUP } from '../../data/tuning';
import { formatMonth, monthOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { balanceSheet, incomeStatement } from '../ledger/statements';
import { totalAcres } from '../members/generate';
import type { TickContext } from '../sim/context';
import type { Director, ElectionResult, ElectionSeat, GameState, Member, MemberVote, PetIssue } from '../types';
import { assignOfficers, makeDirector } from './board';
import { averageSatisfaction } from './review';
import { effect } from '../people/leaders';

const age = (m: Member, year: number) => year - m.birthYear;
/** How much of a member's business is with us (0..1): engaged patrons vote and sign petitions. */
export function engagement(m: Member): number {
  const v = Object.values(m.share);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
const turnoutOf = (m: Member) => clamp((ELECTIONS.turnoutBase.value + ELECTIONS.turnoutPerPoint.value * Math.abs(m.satisfaction - 50)) * (0.4 + engagement(m)), 0.02, 0.9);
const voters = (s: GameState, districtId: number | null) => s.members.list.filter((m) => m.kind === 'member' && m.status === 'active' && (districtId === null || m.districtId === districtId));

/** What the district's members are most upset about, as an insurgent platform. */
function platformFor(s: GameState, pool: Member[]): PetIssue['kind'] {
  const counts: Record<string, number> = {};
  for (const m of pool) for (const g of m.grievances) counts[g.kind] = (counts[g.kind] ?? 0) + g.severity * m.weight;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (top === 'patronageTax') return 'patronageCash';
  if (top === 'harvestWait' || top === 'lateApplication') return 'hometown';
  const bs = balanceSheet(s.ledger, s.clock.monthIndex);
  if (bs.totalAssets > 0 && bs.totalEquity / bs.totalAssets < 0.35) return 'conservative';
  return 'redemption';
}

const grievanceFits = (m: Member, platform?: PetIssue['kind']) =>
  platform === 'patronageCash' ? m.grievances.some((g) => g.kind === 'patronageTax') : platform === 'hometown' ? m.grievances.some((g) => g.kind !== 'patronageTax') : m.satisfaction < 45;

interface Candidate { m: Member; kind: 'incumbent' | 'nominee' | 'insurgent'; platform?: PetIssue['kind'] }

function tally(s: GameState, rng: Rng, districtId: number | null, cands: Candidate[]): { votes: number[]; turnout: number; eligible: number } {
  const g = s.governance;
  const marketing = effect(s, 'members.election');
  const votes = cands.map(() => 0);
  let turnout = 0;
  let eligible = 0;
  for (const v of voters(s, districtId)) {
    const t = turnoutOf(v);
    eligible += v.weight;
    turnout += v.weight * t;
    const u = cands.map((c) => {
      let x = c.kind === 'insurgent' ? (50 - v.satisfaction) / 25 + (grievanceFits(v, c.platform) ? 0.5 : 0) : (v.satisfaction - 50) / 25;
      if (c.kind === 'incumbent') x += ELECTIONS.incumbencyBonus.value + (g.endorse ? ELECTIONS.endorsementBoost.value : 0) + marketing;
      if (c.kind === 'nominee' && g.endorse) x += ELECTIONS.endorsementBoost.value / 2;
      if (c.m.townId === v.townId) x += ELECTIONS.neighborBonus.value;
      return Math.exp(x);
    });
    const tot = u.reduce((a, b) => a + b, 0);
    u.forEach((x, i) => (votes[i] += (v.weight * t * x) / tot));
  }
  return { votes: votes.map((x) => Math.round(x * Math.exp(rng.normal(0, 0.12)))), turnout, eligible };
}

export function runElection(ctx: TickContext): ElectionResult | null {
  const { state, year } = ctx;
  const g = state.governance;
  const rng = ctx.rng('governance.election');
  const byId = new Map(state.members.list.map((m) => [m.id, m]));
  // Board size follows the bylaws: seats are added or retired at elections (at-large first).
  let directors = [...g.directors];
  while (directors.length < g.bylaws.boardSize) directors.push({ memberId: -1, districtId: null, termEndYear: year, stance: 0, literacy: 10, loyaltyToGM: 50, tenureYears: 0, petIssues: [] });
  while (directors.length > g.bylaws.boardSize) {
    const up = directors.filter((d) => d.termEndYear <= year);
    const drop = up.find((d) => d.districtId === null) ?? up[0] ?? directors.find((d) => d.districtId === null) ?? directors[directors.length - 1];
    const m = byId.get(drop.memberId);
    if (m) m.isDirector = false;
    directors = directors.filter((d) => d !== drop);
  }
  const up = directors.filter((d) => d.termEndYear <= year);
  let totalTurnout = 0;
  let totalEligible = 0;
  for (const v of voters(state, null)) {
    totalEligible += v.weight;
    totalTurnout += v.weight * turnoutOf(v);
  }
  const turnout = totalEligible > 0 ? totalTurnout / totalEligible : 0;
  if (!up.length) {
    g.directors = directors.filter((d) => d.memberId >= 0);
    return null;
  }
  if (turnout < g.bylaws.quorumPct) {
    for (const d of up) d.termEndYear += 1;
    g.directors = directors.filter((d) => d.memberId >= 0);
    ctx.inbox({ kind: 'memo', title: 'No quorum at the annual meeting', body: 'Too few members came to elect directors. Sitting directors hold over for another year.' });
    return { year, turnout, seats: [] };
  }
  const seats: ElectionSeat[] = [];
  let endorsedLost = false;
  for (const d of up) {
    const inc = d.memberId >= 0 ? byId.get(d.memberId) : undefined;
    const terms = Math.ceil(d.tenureYears / g.bylaws.termYears);
    const runs = !!inc && inc.status === 'active' && age(inc, year) <= ELECTIONS.retireAge && (g.bylaws.termLimit === null || terms < g.bylaws.termLimit)
      && !(d.tenureYears >= 9 && rng.chance(ELECTIONS.stepDownProb.value));
    const taken = new Set(directors.map((x) => x.memberId));
    const pool = voters(state, d.districtId).filter((m) => !taken.has(m.id) && age(m, year) >= GOVERNANCE_SETUP.directorMinAge && age(m, year) <= 70);
    const cands: Candidate[] = [];
    if (runs) cands.push({ m: inc!, kind: 'incumbent' });
    else if (pool.length) {
      const nom = rng.weighted(pool, (m) => Math.max(1, m.satisfaction - 30) * Math.sqrt(totalAcres(m) + 50));
      cands.push({ m: nom, kind: 'nominee' });
    }
    const district = voters(state, d.districtId);
    const w = district.reduce((a, m) => a + m.weight * engagement(m), 0);
    const sat = w > 0 ? district.reduce((a, m) => a + m.satisfaction * m.weight * engagement(m), 0) / w : 50;
    const insurgentPool = pool.filter((m) => !cands.some((c) => c.m.id === m.id));
    if (insurgentPool.length && (sat < ELECTIONS.insurgentBelow.value || rng.chance(ELECTIONS.insurgentBase.value))) {
      const ins = rng.weighted(insurgentPool, (m) => Math.max(1, 65 - m.satisfaction) * Math.sqrt(totalAcres(m) + 50));
      cands.push({ m: ins, kind: 'insurgent', platform: platformFor(state, district) });
    }
    if (!cands.length) continue;
    const t = cands.length > 1 ? tally(state, rng, d.districtId, cands) : { votes: [0] };
    const wi = t.votes.indexOf(Math.max(...t.votes));
    const winner = cands[wi];
    seats.push({
      districtId: d.districtId, winnerId: winner.m.id,
      candidates: cands.map((c, i) => ({ memberId: c.m.id, name: c.m.name, kind: c.kind, ...(c.platform ? { platform: c.platform } : {}), votes: t.votes[i] })),
    });
    if (winner.kind === 'incumbent') {
      d.termEndYear = year + g.bylaws.termYears;
      continue;
    }
    if (inc) inc.isDirector = false;
    if (runs && g.endorse) endorsedLost = true;
    const fresh = makeDirector(rng, winner.m, d.districtId, year + g.bylaws.termYears, winner.kind === 'insurgent' ? winner.platform : undefined);
    if (winner.kind === 'insurgent' && g.endorse) fresh.loyaltyToGM = clamp(fresh.loyaltyToGM - 10, 0, 100);
    directors = directors.map((x) => (x === d ? fresh : x));
  }
  directors = directors.filter((d) => d.memberId >= 0);
  for (const d of directors) d.tenureYears += 1;
  assignOfficers(directors);
  g.directors = directors;
  g.bylaws = { ...g.bylaws, atLargeSeats: directors.filter((d) => d.districtId === null).length };
  // Open demands from directors who left lapse.
  const ids = new Set(directors.map((d) => d.memberId));
  g.demands = g.demands.filter((x) => x.status !== 'open' || ids.has(x.directorId));
  if (endorsedLost) g.boardConfidence = clamp(g.boardConfidence + ELECTIONS.endorsementBackfire.value, 0, 100);
  g.endorse = false;
  const result: ElectionResult = { year, turnout, seats };
  g.elections = [...g.elections, result].slice(-12);
  return result;
}

/** The annual meeting: four months after fiscal year end. */
export function stepAnnualMeeting(ctx: TickContext): void {
  const { state } = ctx;
  const fye = state.setup.fiscalYearEndMonth;
  if ((monthOf(ctx.mi) - fye + 12) % 12 !== 4 || ctx.mi - state.coop.foundedMonth < 6) return;
  const rng = ctx.rng('governance.annualMeeting');
  const res = runElection(ctx);
  const name = (id: number) => state.members.list.find((m) => m.id === id)?.name ?? '?';
  const lines: string[] = [];
  const is = incomeStatement(state.ledger, Math.max(state.ledger.firstMonth, ctx.mi - 15), ctx.mi - 4);
  lines.push(`The auditors' report: net savings of ${formatCents(is.netSavings)} on sales of ${formatCents(is.sales)} for the fiscal year.`);
  const h = state.coop.equityProgram.history[state.coop.equityProgram.history.length - 1];
  if (h && ctx.mi - h.monthIndex <= 2) lines.push(`Patronage: ${formatCents(h.cash + h.qualified + h.nonqualified)} allocated, ${formatCents(h.cash)} of it in cash.`);
  if (res && res.seats.length) {
    lines.push(`Turnout ${Math.round(res.turnout * 100)}%. Elections:`);
    for (const st of res.seats) {
      const dname = st.districtId === null ? 'At large' : state.world.districts[st.districtId]?.name ?? 'District';
      const desc = st.candidates.length === 1 ? 'unopposed' : st.candidates.map((c) => `${c.name} (${c.kind}${c.platform ? `, ${c.platform}` : ''}) ${c.votes}`).join(' vs ');
      lines.push(`  ${dname}: ${name(st.winnerId)} — ${desc}`);
    }
  }
  // Floor remarks chosen from the year's conditions.
  const conds = new Set<string>(['any']);
  if (is.netSavings < 0) conds.add('loss');
  else conds.add('profit');
  if (h && h.taxOverCheck > h.patrons * 0.2) conds.add('lowCash');
  if (h && h.cash > (h.cash + h.qualified) * 0.45) conds.add('highCash');
  if (state.coop.finance.status !== 'standard') conds.add('watch');
  if (state.coop.facilities.some((f) => f.status === 'closed')) conds.add('closure');
  if (state.coop.projects.length || state.coop.facilities.some((f) => ctx.mi - f.acquiredMonth < 12)) conds.add('expansion');
  const pool = MEETING_REMARKS.filter((r) => conds.has(r.when));
  const picked = new Set<string>();
  for (let i = 0; i < 2 && pool.length; i++) picked.add(rng.pick(pool).text);
  lines.push('From the floor:', ...[...picked].map((x) => `  ${x}`));
  ctx.inbox({ kind: 'memo', title: 'Annual meeting', body: lines.join('\n') });
}

/** Petitions and special meetings; member votes on bylaw amendments and recalls. */
export function stepMemberDemocracy(ctx: TickContext): void {
  const { state } = ctx;
  const g = state.governance;
  const rng = ctx.rng('governance.members');
  // Member votes due this month.
  const due = g.memberVotes.filter((v) => !v.result && v.meetingMonth === ctx.mi);
  for (const mv of due) holdMemberVote(ctx, mv, rng);
  g.memberVotes = g.memberVotes.filter((v) => !v.result || ctx.mi - v.meetingMonth < 36);
  // Petitions: enough unhappy members force a special meeting to recall the chair.
  if (g.lastPetitionMonth !== null && ctx.mi - g.lastPetitionMonth < 18) return;
  if (g.memberVotes.some((v) => !v.result)) return;
  let unhappy = 0;
  let total = 0;
  for (const m of voters(state, null)) {
    total += m.weight;
    if (m.satisfaction < PETITIONS.signBelow.value && engagement(m) >= PETITIONS.minEngagement.value) unhappy += m.weight;
  }
  if (total <= 0 || unhappy / total < g.bylaws.memberPetitionPct) return;
  const chair = g.directors.find((d) => d.office === 'chair');
  if (!chair) return;
  const chairName = state.members.list.find((m) => m.id === chair.memberId)?.name ?? 'the chair';
  g.lastPetitionMonth = ctx.mi;
  g.memberVotes = [...g.memberVotes, { id: g.nextItemId++, kind: 'recall', title: `Recall ${chairName} as director`, directorId: chair.memberId, meetingMonth: ctx.mi + PETITIONS.meetingDelay, supermajority: false }];
  ctx.inbox({ kind: 'alert', title: 'Members petition for a special meeting', body: `${Math.round((100 * unhappy) / total)}% of active members signed a petition to recall board chair ${chairName}. A special meeting will vote in ${formatMonth(ctx.mi + PETITIONS.meetingDelay)}. Unhappy members blame the board, and the board will remember who it blames.` });
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function holdMemberVote(ctx: TickContext, mv: MemberVote, rng: Rng): void {
  const { state } = ctx;
  const g = state.governance;
  let yes = 0;
  let cast = 0;
  let eligible = 0;
  const appeal = (() => {
    const c = mv.bylaw;
    if (!c) return 0;
    switch (c.field) {
      case 'termLimit': return c.value === null ? -0.2 : 0.35;
      case 'capitalApproval': return c.value > g.bylaws.capitalApproval ? -0.25 : 0.15;
      case 'memberPetitionPct': return c.value < g.bylaws.memberPetitionPct ? 0.25 : -0.3;
      case 'boardSize': return c.value < g.bylaws.boardSize ? -0.1 : 0;
    }
  })();
  for (const m of voters(state, null)) {
    const t = turnoutOf(m) * (mv.kind === 'recall' ? 1.3 : 1);
    eligible += m.weight;
    cast += m.weight * t;
    const p = mv.kind === 'recall' ? sigmoid((50 - m.satisfaction) / 10 - 0.6) : sigmoid(3 * (appeal + (m.satisfaction - 50) / 100));
    yes += m.weight * t * p;
  }
  const yesShare = clamp((cast > 0 ? yes / cast : 0) + rng.normal(0, 0.03), 0, 1);
  const turnout = eligible > 0 ? cast / eligible : 0;
  const passed = turnout >= g.bylaws.quorumPct && yesShare >= (mv.supermajority ? g.bylaws.supermajority : 0.5);
  mv.result = { yesShare, turnout, passed };
  g.memberVotes = g.memberVotes.map((x) => (x.id === mv.id ? { ...mv } : x));
  if (mv.kind === 'bylaw' && mv.bylaw) {
    if (passed) {
      const c = mv.bylaw;
      g.bylaws = { ...g.bylaws, [c.field]: c.value };
    }
    ctx.inbox({ kind: 'memo', title: `Members ${passed ? 'adopt' : 'reject'} bylaw amendment`, body: `${mv.title}: ${Math.round(yesShare * 100)}% yes on ${Math.round(turnout * 100)}% turnout (${mv.supermajority ? `${Math.round(g.bylaws.supermajority * 100)}% needed` : 'majority needed'}).${passed && mv.bylaw.field === 'boardSize' ? ' The new board size takes effect at the next election.' : ''}` });
    return;
  }
  if (mv.kind === 'recall' && mv.directorId !== undefined) {
    const d = g.directors.find((x) => x.memberId === mv.directorId);
    if (passed && d) {
      const gone = state.members.list.find((m) => m.id === d.memberId);
      if (gone) gone.isDirector = false;
      const pool = voters(state, d.districtId).filter((m) => !m.isDirector && ctx.year - m.birthYear >= GOVERNANCE_SETUP.directorMinAge && ctx.year - m.birthYear <= 70);
      if (pool.length) {
        const pick = rng.weighted(pool, (m) => Math.max(1, 65 - m.satisfaction) * Math.sqrt(totalAcres(m) + 50));
        const fresh: Director = makeDirector(rng, pick, d.districtId, d.termEndYear, platformFor(state, pool));
        g.directors = g.directors.map((x) => (x === d ? fresh : x));
      } else g.directors = g.directors.filter((x) => x !== d);
      assignOfficers(g.directors);
      g.demands = g.demands.filter((x) => !(x.directorId === mv.directorId && x.status === 'open'));
      g.boardConfidence = clamp(g.boardConfidence - 8, 0, 100);
    }
    ctx.inbox({ kind: passed ? 'alert' : 'memo', title: passed ? 'Members recall a director' : 'Recall fails', body: `${mv.title}: ${Math.round(yesShare * 100)}% yes on ${Math.round(turnout * 100)}% turnout.${passed ? ' The members elected a critic of management to the seat.' : ''} Average member satisfaction: ${Math.round(averageSatisfaction(state))}.` });
  }
}
