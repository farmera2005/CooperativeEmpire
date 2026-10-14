// Board votes (DESIGN §14.3). Each director's support for an item:
//   support = deference + a·perceivedMerit + b·stanceFit + c·petIssueEffect + d·(confidence−50)/50
//           + loyalty + e·factionPull + f·lobbied − g·controversy + noise
//   perceivedMerit = mix(trueMerit, headlineMerit, literacy/20)
// Yes if support > 0. The chair votes only to break a tie.

import { CONFIDENCE, POLITICAL_CAPITAL, VOTE_MODEL } from '../../data/governance';
import { formatMonth } from '../core/calendar';
import { clamp } from '../core/math';
import { distributePatronage } from '../finance/patronage';
import type { TickContext } from '../sim/context';
import { runCommand, type Command } from '../sim/commands';
import type { AgendaItem, Director, DirectorVote, GameState, MeritVector, VoteRecord } from '../types';
import { defaultProposal } from '../finance/defaults';
import { evaluate, PROPOSAL_LABEL } from './proposals';
import { dealBoardApproved, dealBoardRejected } from '../deals/deals';
import { stream } from '../core/rng';

export type Faction = 'growth' | 'conservative' | 'swing';
export const factionOf = (d: Director): Faction => (d.stance > 0.3 ? 'growth' : d.stance < -0.3 ? 'conservative' : 'swing');

function petEffect(d: Director, v: MeritVector, item: AgendaItem): number {
  let e = 0;
  for (const p of d.petIssues) {
    switch (p.kind) {
      case 'hometown': e += (v.townEffects[p.townId ?? -1] ?? 0) * (v.townEffects[p.townId ?? -1]! < 0 ? 1.5 : 0.8); break;
      case 'division': e += (v.divisionEffects[p.division!] ?? 0) * (p.favor ? 0.7 : -0.7); break;
      case 'redemption': if (item.type === 'redemptionPolicy') e += Math.sign(v.memberCashEffect) * 0.8; break;
      case 'patronageCash': if (item.type === 'patronage') e += v.memberCashEffect; break;
      case 'conservative': e -= Math.max(0, v.growth) * 0.5 + v.riskScore * 0.5; break;
      case 'merger': break;
    }
  }
  return e;
}

/** Support before noise and faction pull: the forecastable part. */
export function baseSupport(s: GameState, d: Director, v: MeritVector, item: AgendaItem): number {
  const w = VOTE_MODEL;
  const lit = clamp(d.literacy / 20, 0, 1);
  const perceived = lit * v.trueMerit + (1 - lit) * v.headlineMerit;
  return w.deference.value + w.merit.value * perceived
    + w.stanceFit.value * d.stance * v.growth
    + w.petIssue.value * petEffect(d, v, item)
    + w.confidence.value * (s.governance.boardConfidence - 50) / 50
    + w.loyalty.value * (d.loyaltyToGM - 50) / 50
    + (item.lobbied.includes(d.memberId) ? w.lobby.value : 0)
    - w.controversy.value * v.controversy;
}

function noiseFor(s: GameState, item: AgendaItem, d: Director): number {
  return stream(s.setup.gameSeed, item.submittedMonth, 'board.vote', item.id * 100_000 + d.memberId).normal(0, VOTE_MODEL.noise.value);
}

function withFaction(directors: Director[], raw: number[]): number[] {
  return directors.map((d, i) => {
    const f = factionOf(d);
    const peers = directors.map((x, j) => (j !== i && factionOf(x) === f && f !== 'swing' ? raw[j] : null)).filter((x): x is number => x !== null);
    const pull = peers.length ? peers.reduce((a, b) => a + b, 0) / peers.length : 0;
    return raw[i] + VOTE_MODEL.faction.value * pull;
  });
}

export function castVotes(s: GameState, item: AgendaItem): { votes: DirectorVote[]; passed: boolean; yes: number; no: number; merit: MeritVector } {
  const merit = evaluate(s, item);
  const ds = s.governance.directors;
  const raw = ds.map((d) => baseSupport(s, d, merit, item) + noiseFor(s, item, d));
  const sup = withFaction(ds, raw);
  const votes = ds.map((d, i) => ({ memberId: d.memberId, yes: sup[i] > 0, support: Math.round(sup[i] * 100) / 100 }));
  let yes = 0;
  let no = 0;
  let chairVote: boolean | null = null;
  ds.forEach((d, i) => {
    if (d.office === 'chair') chairVote = votes[i].yes;
    else if (votes[i].yes) yes++;
    else no++;
  });
  if (yes === no && chairVote !== null) chairVote ? yes++ : no++;
  return { votes, passed: yes > no, yes, no, merit };
}

/** Forecast for the Board Room: each director's chance of voting yes (noise unknown). */
export function forecastItem(s: GameState, item: AgendaItem): { merit: MeritVector; directors: { memberId: number; pYes: number }[]; expectedYes: number; passProb: number } {
  const merit = evaluate(s, item);
  const ds = s.governance.directors;
  const sup = withFaction(ds, ds.map((d) => baseSupport(s, d, merit, item)));
  const sd = VOTE_MODEL.noise.value * (1 + VOTE_MODEL.faction.value * 0.5);
  const pYes = sup.map((x) => normCdf(x / sd));
  // Exact chance of passing: distribution of yes votes among non-chair directors, chair breaks ties.
  let dist = [1];
  let chairP = 0;
  ds.forEach((d, i) => {
    if (d.office === 'chair') {
      chairP = pYes[i];
      return;
    }
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - pYes[i]);
      next[k + 1] += q * pYes[i];
    });
    dist = next;
  });
  const n = dist.length - 1;
  let passProb = 0;
  dist.forEach((q, k) => {
    if (k > n - k) passProb += q;
    else if (k === n - k) passProb += q * chairP;
  });
  return { merit, directors: ds.map((d, i) => ({ memberId: d.memberId, pYes: Math.round(pYes[i] * 100) / 100 })), expectedYes: pYes.reduce((a, b) => a + b, 0), passProb };
}

function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function addAgendaItem(s: GameState, item: Omit<AgendaItem, 'id' | 'tabled' | 'attempts' | 'lobbied'>): AgendaItem {
  const g = s.governance;
  const full: AgendaItem = { ...item, id: g.nextItemId++, tabled: 0, attempts: 0, lobbied: [] };
  g.agenda = [...g.agenda, full];
  return full;
}

/** The monthly board meeting: vote everything on the agenda that isn't tabled. */
export function holdBoardMeeting(ctx: TickContext): void {
  const { state } = ctx;
  const g = state.governance;
  g.politicalCapital = Math.min(POLITICAL_CAPITAL.max, g.politicalCapital + POLITICAL_CAPITAL.monthly);
  const due = g.agenda.filter((i) => i.submittedMonth < ctx.mi);
  if (!due.length) return;
  const keep: AgendaItem[] = g.agenda.filter((i) => i.submittedMonth >= ctx.mi);
  const lines: string[] = [];
  for (const item of due) {
    const r = castVotes(state, item);
    const rec: VoteRecord = { id: item.id, monthIndex: ctx.mi, type: item.type, title: item.title, ...(item.command ? { commandKey: JSON.stringify(item.command) } : {}), passed: r.passed, yes: r.yes, no: r.no, votes: r.votes };
    g.votes = [...g.votes, rec].slice(-80);
    // Lobbied directors remember whether they went along.
    for (const v of r.votes) {
      if (!item.lobbied.includes(v.memberId)) continue;
      const d = g.directors.find((x) => x.memberId === v.memberId);
      if (d) d.loyaltyToGM = clamp(d.loyaltyToGM + (v.yes ? POLITICAL_CAPITAL.lobbyYes : POLITICAL_CAPITAL.lobbyNo), 0, 100);
    }
    g.boardConfidence = clamp(g.boardConfidence + (r.passed ? CONFIDENCE.voteWon.value : CONFIDENCE.voteLost.value), 0, 100);
    lines.push(`${PROPOSAL_LABEL[item.type]} — ${item.title}: ${r.passed ? 'approved' : 'rejected'} ${r.yes}–${r.no}.`);
    if (r.passed) {
      const msgs = execute(ctx, item);
      if (msgs) lines.push(`  ${msgs}`);
    } else {
      const retry = onRejected(ctx, item);
      if (retry) keep.push(retry);
      if (r.no >= Math.ceil((r.yes + r.no) * 2 / 3) && item.source === 'gm') {
        ctx.inbox({ kind: 'memo', title: 'Executive session', body: `After rejecting "${item.title}", the board met in executive session without the general manager. The chair says only that directors "want to see more homework before big asks."` });
      }
    }
  }
  g.agenda = keep;
  ctx.inbox({ kind: 'memo', title: `Board meeting, ${formatMonth(ctx.mi)}`, body: lines.join('\n') });
}

function execute(ctx: TickContext, item: AgendaItem): string {
  const { state } = ctx;
  switch (item.type) {
    case 'patronage': distributePatronage(ctx); return '';
    case 'budget':
      if (state.coop.budget) state.coop.budget.approved = true;
      return '';
    case 'deal':
      return dealBoardApproved(ctx, (item.command as { dealId: number }).dealId);
    case 'bylawRecommendation':
      if (!item.bylaw) return '';
      state.governance.memberVotes = [...state.governance.memberVotes, { id: item.id, kind: 'bylaw', title: item.title, bylaw: item.bylaw, meetingMonth: ctx.mi + 2, supermajority: true }];
      return `Sent to the members for a vote at a special meeting in ${formatMonth(ctx.mi + 2)}.`;
    default: {
      if (!item.command) return '';
      const msgs = runCommand(state, item.command as Command, true);
      return msgs.map((m) => m.text).join(' ');
    }
  }
}

/** What happens after a rejection: system items come back; after two tries the board decides itself. */
function onRejected(ctx: TickContext, item: AgendaItem): AgendaItem | null {
  const { state } = ctx;
  const attempts = item.attempts + 1;
  if (item.type === 'deal') {
    dealBoardRejected(ctx, (item.command as { dealId: number }).dealId);
    return null;
  }
  if (item.type === 'patronage') {
    if (attempts >= 2) {
      state.coop.equityProgram.proposal = defaultProposal();
      ctx.inbox({ kind: 'memo', title: 'Board writes its own patronage plan', body: 'Having rejected the patronage plan twice, the board adopted a conventional plan of its own (30% cash, 70% qualified retained, pooled by division).' });
      distributePatronage(ctx);
      return null;
    }
    ctx.inbox({ kind: 'alert', title: 'Board rejects the patronage plan', body: 'The board voted down the patronage plan. Revise it on the Equity & Patronage screen; it comes back at next month\'s meeting.' });
    return { ...item, attempts, lobbied: [], submittedMonth: ctx.mi };
  }
  if (item.type === 'budget') {
    const b = state.coop.budget;
    if (attempts >= 2 && b) {
      b.capex = Math.round(b.capex * 0.75);
      b.approved = true;
      ctx.inbox({ kind: 'memo', title: 'Board approves a trimmed budget', body: 'After rejecting the budget twice, the board approved it with the capital budget cut by a quarter.' });
      return null;
    }
    ctx.inbox({ kind: 'alert', title: 'Board rejects the budget', body: 'The board sent the budget back. Adjust it on the Financials screen; it returns next month.' });
    return { ...item, attempts, lobbied: [], submittedMonth: ctx.mi };
  }
  return null;
}
