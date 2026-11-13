// Taking a job at another co-op (D-142). The co-op you join has a past: it is founded in the
// offer's history year and run by a prudent manager (the baseline bot) up to the month you
// arrive, in the same economy (same game seed and history mode) as the rest of your career.
// Then the board hands it to you on the terms you agreed.

import { CAREER } from '../../data/career';
import { formatMonth, toMonthIndex, yearOf } from '../core/calendar';
import type { Cents } from '../core/money';
import { newCareer } from './core';
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
  career.offers = career.offers.filter((x) => x.id !== o.id);
  career.severanceLeft = 0;
  s = handOver(s, career, o);
  return { state: s, ok: true, messages: [{ level: 'info', text: `You join ${s.coop.name}.` }] };
}

interface Terms { base: Cents; bonusTarget: number; severanceMonths: number; termYears: number }

/**
 * The handover, as in a scenario: the co-op's past is history, the board starts with an open
 * mind, and the GM starts next month on the agreed terms.
 */
function handOver(s0: GameState, career: CareerState, t: Terms): GameState {
  const mi = s0.clock.monthIndex;
  const members = s0.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
  career.status = 'employed';
  career.monthIndex = mi;
  career.contract = { coopName: s0.coop.name, startMonth: mi + 1, endMonth: mi + t.termYears * 12, base: t.base, bonusTarget: t.bonusTarget, severanceMonths: t.severanceMonths };
  career.stints = [...career.stints, { coopName: s0.coop.name, regionId: s0.setup.regionId, fromMonth: mi + 1, toMonth: null, reviews: [], earnings: 0, startMembers: members }];
  career.log = [...career.log, { monthIndex: mi, text: `Joined ${s0.coop.name} as general manager at ${formatCents(t.base)} a year.` }].slice(-80);
  const s = { ...s0, inbox: s0.inbox.map((i) => ({ ...i, read: true })), deals: s0.deals.filter((d) => d.stage === 'closed' || d.stage === 'dead'), career };
  s.clock = { ...s.clock, startMonth: mi + 1 };
  s.governance = { ...s.governance, boardConfidence: 60 + Math.round((career.character.stats.boardRelations - 10) / 2), pip: false, reviews: [] };
  const founded = yearOf(s.coop.foundedMonth);
  s.inbox.push({
    id: s.nextInboxId++, monthIndex: mi, read: false, kind: 'memo', title: `You are the new general manager of ${s.coop.name}`,
    body: `The board of ${s.coop.name} (organized ${founded}; ${members.toLocaleString('en-US')} active members, ${s.coop.facilities.filter((f) => f.status === 'operating').length} operating sites) welcomes you. You start in ${formatMonth(mi + 1)} on a ${t.termYears}-year agreement: base ${formatCents(t.base)} a year, bonus target ${Math.round(t.bonusTarget * 100)}% of base, ${t.severanceMonths} months' severance.\n\nThe co-op's past annual reports are on the Reports screen, its plants on the Map and Locations screens, and its people on the People screen. Your first review comes after the next fiscal year end${CAREER.settleMonths ? '; other boards will leave you alone for a while' : ''}.`,
  });
  return s;
}

/** Years an established co-op may have behind it at the start of a career (D-143). */
export const ESTABLISHED_YEARS = [5, 10, 15, 25];

/**
 * Career mode at an established co-op (D-143): the co-op is organized `establishedYears` before
 * the start year with the setup's members, capital, lender and region, run by a prudent manager
 * (the baseline bot) until the start year, and then its board hires the player's character at
 * the going rate for a co-op of its size.
 */
export function newEstablishedGame(setup: GameSetup): GameState {
  const ch = setup.career?.character;
  const years = setup.career?.establishedYears ?? 0;
  if (!ch || years <= 0) return newGame(setup);
  const from = setup.startYear - years;
  if (from < 1970) throw new Error(`A co-op ${years} years old in ${setup.startYear} would have been organized before 1970, where the game's history begins.`);
  const takeover = toMonthIndex(setup.startYear, 1);
  let s: GameState | null = null;
  // A history that ends in failure is rerun on a neighboring map.
  for (let attempt = 0; attempt < 4 && !s; attempt++) {
    const { career: _c, ...rest } = setup;
    void _c;
    let h = newGame({ ...rest, startYear: from, mapSeed: setup.mapSeed + attempt * 7, ...(attempt === 0 && setup.homeTownId !== undefined ? { homeTownId: setup.homeTownId } : { homeTownId: undefined }), ...(attempt === 0 ? {} : { coopName: '' }) });
    while (h.clock.monthIndex < takeover - 1 && !h.outcome) h = advanceMonth(h, POLICIES.baseline(h)).state;
    s = h.outcome ? null : h;
  }
  if (!s) throw new Error('The co-op\'s history ended in failure on every try; choose another start.');
  s = { ...s, setup: { ...s.setup, career: setup.career } };
  const career = newCareer(s, ch);
  career.stints = [];
  career.log = [];
  const t = { base: career.contract!.base, bonusTarget: career.contract!.bonusTarget, severanceMonths: career.contract!.severanceMonths, termYears: CAREER.termYears };
  return handOver(s, career, t);
}

/** Start a game from the setup screen: a founding, or (career mode) an established co-op. */
export const startGame = (setup: GameSetup): GameState => (setup.career?.establishedYears ? newEstablishedGame(setup) : newGame(setup));
