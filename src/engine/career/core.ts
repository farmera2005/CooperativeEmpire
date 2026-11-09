// Career mode core (D-142): the player's stats and what they do in the co-op, market pay for
// the job, and creating a character. Kept free of the game-setup and tick modules so the
// people and governance code can use it.

import { BACKGROUNDS, CAREER, CEO_STATS, SKILL_STAT, type BackgroundId, type CeoStat } from '../../data/career';
import { EFFECTS, type EffectKey, type Skill } from '../../data/people';
import { OVERHEAD } from '../../data/tuning';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import { roundCents, type Cents } from '../core/money';
import type { CareerState, CeoCharacter, GameState } from '../types';
import { nominalCents, pathFor } from '../world/macro';

/** The player's stat, or null outside career mode (and while not running a co-op). */
export function ceoStat(s: GameState, stat: CeoStat): number | null {
  const c = s.career;
  if (!c || c.status !== 'employed') return null;
  return c.character.stats[stat];
}

/** Which stat drives each effect the GM shares with their managers. */
const GM_EFFECTS: Partial<Record<EffectKey, CeoStat>> = {
  'finance.spread': 'finance', 'finance.forecast': 'finance',
  'coo.opex': 'operations', 'coo.decay': 'operations', 'safety.incidents': 'operations',
  'grain.basis': 'commercial', 'supply.share': 'commercial',
  'staff.morale': 'leadership', 'hr.turnover': 'leadership',
  'members.satisfaction': 'memberRelations', 'members.election': 'memberRelations',
};

/** The GM's own part of an effect: half a dedicated manager's per point away from 10. */
export function gmEffect(s: GameState, key: EffectKey): number {
  const stat = GM_EFFECTS[key];
  const v = stat ? ceoStat(s, stat) : null;
  if (v === null) return 0;
  const row = EFFECTS.find((e) => e.key === key);
  return row ? row.perPoint * CAREER.effectWeight.value * (v - 10) : 0;
}

/** Skill a vacant role gets from the GM covering it: the GM's matching stat less a penalty, or null outside career mode. */
export function vacancySkill(s: GameState, skill: Skill): number | null {
  const v = ceoStat(s, SKILL_STAT[skill]);
  return v === null ? null : clamp(v - CAREER.vacancyPenalty, 2, 12);
}

/** Board relations: monthly confidence drift, and support on votes. */
export const boardDrift = (s: GameState): number => ((ceoStat(s, 'boardRelations') ?? 10) - 10) * CAREER.boardDriftPerPoint.value;
export const voteSupport = (s: GameState): number => ((ceoStat(s, 'boardRelations') ?? 10) - 10) * CAREER.voteSupportPerPoint.value;

/** The board's market rate for its GM this month (nominal cents a year): base plus members and locations. */
export function marketPay(s: GameState, members?: number, locations?: number): Cents {
  const m = members ?? s.members.list.filter((x) => x.kind === 'member' && x.status === 'active').length;
  const l = locations ?? s.coop.facilities.filter((f) => f.status !== 'closed').length;
  return nominalCents(pathFor(s), s.clock.monthIndex, OVERHEAD.gmSalaryBase.value + OVERHEAD.gmSalaryPerMember.value * m + OVERHEAD.gmSalaryPerLocation.value * l);
}

/** Pay against the market by reputation. */
export const reputationPay = (rep: number): number => {
  const [lo, hi] = CAREER.payByReputation;
  return lo + (hi - lo) * clamp(rep / 100, 0, 1);
};

/** The GM's base pay this month (nominal cents a year): the contract in career mode. */
export function gmBasePay(s: GameState): Cents | null {
  return s.career?.status === 'employed' && s.career.contract ? s.career.contract.base : null;
}

export interface CharacterInput {
  name: string;
  female: boolean;
  age: number;
  background: BackgroundId;
  /** Points spent on each stat (on top of the base). */
  points: Record<CeoStat, number>;
}

/** Points a character of this age has to spend. */
export const pointsFor = (age: number): number => Math.min(CAREER.pointsMax, Math.round(CAREER.pointsAt25 + CAREER.pointsPerYearOver25 * Math.max(0, age - 25)));

/** Check and build a character; returns an error message instead when the input is not valid. */
export function makeCharacter(input: CharacterInput, startYear: number): CeoCharacter | string {
  const [a0, a1] = CAREER.ageRange;
  if (!input.name.trim()) return 'Your character needs a name.';
  if (!(Number.isInteger(input.age) && input.age >= a0 && input.age <= a1)) return `Age must be ${a0}–${a1}.`;
  const bg = BACKGROUNDS[input.background];
  if (!bg) return 'Unknown background.';
  const spent = CEO_STATS.reduce((a, k) => a + (input.points[k] ?? 0), 0);
  if (CEO_STATS.some((k) => !(Number.isInteger(input.points[k]) && input.points[k] >= 0))) return 'Points must be whole numbers.';
  if (spent > pointsFor(input.age)) return `You have ${pointsFor(input.age)} points to spend; ${spent} are spent.`;
  const stats = {} as Record<CeoStat, number>;
  for (const k of CEO_STATS) {
    const v = CAREER.statBase + input.points[k];
    if (v > CAREER.statMaxAtStart) return `No stat may start above ${CAREER.statMaxAtStart} before your background.`;
    stats[k] = clamp(v + (bg.bonus[k] ?? 0), 1, 20);
  }
  return { name: input.name.trim().slice(0, 40), female: input.female, birthYear: startYear - input.age, background: input.background, stats };
}

/** A career starting at the founding: the board hires the character at market terms. */
export function newCareer(s: GameState, character: CeoCharacter): CareerState {
  const mi = s.clock.monthIndex;
  const rep = clamp(BACKGROUNDS[character.background].reputation + Math.max(0, yearOf(mi) - character.birthYear - 30) * 0.4, 0, 60);
  const base = roundCents(marketPay(s) * reputationPay(rep));
  return {
    seed: s.setup.gameSeed * 7919 + 17,
    character,
    status: 'employed',
    monthIndex: mi,
    contract: { coopName: s.coop.name, startMonth: mi, endMonth: mi + CAREER.termYears * 12 - 1, base, bonusTarget: CAREER.bonusTarget.value, severanceMonths: CAREER.severanceMonths.value },
    reputation: Math.round(rep),
    offers: [],
    nextOfferId: 1,
    stints: [{ coopName: s.coop.name, regionId: s.setup.regionId, fromMonth: mi, toMonth: null, reviews: [], earnings: 0, startMembers: s.members.list.filter((m) => m.kind === 'member').length }],
    earnings: 0,
    log: [{ monthIndex: mi, text: `Hired as general manager of ${s.coop.name} at ${formatCents(base)} a year.` }],
  };
}

export const ageOf = (c: CareerState): number => yearOf(c.monthIndex) - c.character.birthYear;
