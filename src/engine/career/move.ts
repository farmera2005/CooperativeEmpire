// Taking a job at another co-op (D-142). The co-op you join has a past: it is founded in the
// offer's history year and run by a prudent manager (the baseline bot) up to the month you
// arrive, in the same economy (same game seed and history mode) as the rest of your career.
// Then the board hands it to you on the terms you agreed.

import { CAREER } from '../../data/career';
import { formatMonth } from '../core/calendar';
import { formatCents } from '../core/format';
import { advanceMonth } from '../sim/advance';
import { DEFAULT_SETUP, newGame } from '../sim/newGame';
import { POLICIES } from '../sim/policies';
import type { CareerState, GameSetup, GameState, JobOffer } from '../types';
import type { CareerResult } from './career';

function buildEmployer(from: GameState, o: JobOffer, arrive: number, attempt: number): GameState | null {
  const setup: GameSetup = {
    ...DEFAULT_SETUP,
    coopName: o.coopName,
    startYear: o.historyFrom,
    startingMembers: o.members,
    gameSeed: from.setup.gameSeed,
    mapSeed: o.mapSeed + attempt * 7,
    historyMode: from.setup.historyMode,
    regionId: o.regionId,
    fictionalizeBrands: from.setup.fictionalizeBrands,
    difficulty: from.setup.difficulty,
    coopType: o.coopType,
    ...(o.homeTownId !== undefined && attempt === 0 ? { homeTownId: o.homeTownId } : {}),
    ...(o.territorySize ? { territorySize: o.territorySize } : {}),
  };
  let s = newGame(setup);
  while (s.clock.monthIndex < arrive - 1 && !s.outcome) s = advanceMonth(s, POLICIES.baseline(s)).state;
  return s.outcome ? null : s;
}

/** Take an offer: the job you have (if any) ends, and the game continues at the new co-op. */
export function acceptOffer(s0: GameState, offerId: number): CareerResult {
  const c0 = s0.career;
  const o = c0?.offers.find((x) => x.id === offerId);
  if (!c0 || !o) return { state: s0, ok: false, messages: [{ level: 'error', text: 'No such offer.' }] };
  if (c0.status === 'retired') return { state: s0, ok: false, messages: [{ level: 'error', text: 'You have retired.' }] };
  const career = JSON.parse(JSON.stringify(c0)) as CareerState;
  // Leaving a job for another: the current stint ends this month.
  const arrive = career.status === 'employed' ? s0.clock.monthIndex + 1 : career.monthIndex + 1;
  if (career.status === 'employed') {
    const st = career.stints[career.stints.length - 1];
    st.toMonth = s0.clock.monthIndex;
    st.end = 'moved';
    career.reputation = Math.min(100, career.reputation + (o.members > s0.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length ? 2 : 0));
  }
  let s: GameState | null = null;
  for (let attempt = 0; attempt < 3 && !s; attempt++) s = buildEmployer(s0, o, arrive, attempt);
  if (!s) return { state: s0, ok: false, messages: [{ level: 'error', text: `${o.coopName} could not be set up; try another offer.` }] };
  const mi = s.clock.monthIndex;
  const members = s.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
  career.status = 'employed';
  career.monthIndex = mi;
  career.offers = career.offers.filter((x) => x.id !== o.id);
  career.severanceLeft = 0;
  career.contract = { coopName: s.coop.name, startMonth: mi + 1, endMonth: mi + o.termYears * 12, base: o.base, bonusTarget: o.bonusTarget, severanceMonths: o.severanceMonths };
  career.stints = [...career.stints, { coopName: s.coop.name, regionId: o.regionId, fromMonth: mi + 1, toMonth: null, reviews: [], earnings: 0, startMembers: members }];
  career.log = [...career.log, { monthIndex: mi, text: `Joined ${s.coop.name} as general manager at ${formatCents(o.base)} a year.` }].slice(-80);
  // The handover, as in a scenario: the past is history, the board starts with an open mind.
  s = { ...s, inbox: s.inbox.map((i) => ({ ...i, read: true })), deals: s.deals.filter((d) => d.stage === 'closed' || d.stage === 'dead'), career };
  s.clock = { ...s.clock, startMonth: mi + 1 };
  s.governance = { ...s.governance, boardConfidence: 60 + Math.round((career.character.stats.boardRelations - 10) / 2), pip: false, reviews: [] };
  s.inbox.push({
    id: s.nextInboxId++, monthIndex: mi, read: false, kind: 'memo', title: `You are the new general manager of ${s.coop.name}`,
    body: `The board of ${s.coop.name} (${members.toLocaleString('en-US')} active members, ${s.coop.facilities.filter((f) => f.status === 'operating').length} operating sites) welcomes you. You start in ${formatMonth(mi + 1)} on a ${o.termYears}-year agreement: base ${formatCents(o.base)} a year, bonus target ${Math.round(o.bonusTarget * 100)}% of base, ${o.severanceMonths} months' severance.\n\nThe co-op's past annual reports are on the Reports screen. Your first review comes after the next fiscal year end${CAREER.settleMonths ? '; other boards will leave you alone for a while' : ''}.`,
  });
  return { state: s, ok: true, messages: [{ level: 'info', text: `You join ${s.coop.name}.` }] };
}
