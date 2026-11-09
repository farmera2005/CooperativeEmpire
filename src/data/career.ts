// Career mode (D-142, docs/research/career.md): the player is a co-op general manager / CEO with
// stats of their own, an employment contract, a reputation in the industry, and a career that
// runs across co-ops. Dollar amounts are 2024 dollars.

import { s } from './types';
import type { Skill } from './people';

export type CeoStat = 'finance' | 'operations' | 'commercial' | 'leadership' | 'boardRelations' | 'memberRelations' | 'negotiation';
export const CEO_STATS: CeoStat[] = ['finance', 'operations', 'commercial', 'leadership', 'boardRelations', 'memberRelations', 'negotiation'];

export const CEO_STAT_INFO: Record<CeoStat, { label: string; description: string }> = {
  finance: { label: 'Financial acumen', description: 'Reading statements, budgets and the lender. Lowers loan spreads and budget error; covers a missing CFO.' },
  operations: { label: 'Operations', description: 'Running plants safely and cheaply. Trims site costs and wear; covers a missing COO or safety director.' },
  commercial: { label: 'Merchandising & sales', description: 'Grain marketing and selling inputs. Better basis and farm-supply share; covers missing division managers.' },
  leadership: { label: 'Leadership', description: 'Building and keeping a team. Staff morale and turnover; covers a missing HR or IT manager.' },
  boardRelations: { label: 'Board relations', description: 'Working with the directors: board confidence and votes on what you bring them.' },
  memberRelations: { label: 'Member relations', description: 'Talking with farmers at the elevator, the annual meeting and the coffee shop. Member satisfaction and elections.' },
  negotiation: { label: 'Negotiation', description: 'Your own pay and contract terms.' },
};

/** The skill a co-op role mostly uses, and the CEO stat that covers it when the role is vacant. */
export const SKILL_STAT: Record<Skill, CeoStat> = {
  leadership: 'leadership', operations: 'operations', sales: 'commercial', merchandising: 'commercial', finance: 'finance',
  safety: 'operations', memberRelations: 'memberRelations', innovation: 'leadership',
};

export type BackgroundId = 'merchandiser' | 'lender' | 'agronomist' | 'operations' | 'outsider' | 'farmer';

export interface BackgroundDef {
  label: string;
  description: string;
  /** Points added to stats on top of what the player spends. */
  bonus: Partial<Record<CeoStat, number>>;
  /** Standing in the industry at the start (0–100). */
  reputation: number;
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  merchandiser: { label: 'Grain merchandiser', description: 'Came up through a regional\'s grain desk and a country elevator.', bonus: { commercial: 3, finance: 1 }, reputation: 30 },
  lender: { label: 'Ag lender', description: 'Loan officer at the co-op bank; knows balance sheets and boards.', bonus: { finance: 3, boardRelations: 1 }, reputation: 30 },
  agronomist: { label: 'Agronomist & salesman', description: 'Sold fertilizer and chemicals and walked fields with growers.', bonus: { commercial: 2, memberRelations: 2 }, reputation: 25 },
  operations: { label: 'Plant manager', description: 'Ran an elevator, feed mill or fertilizer plant for years.', bonus: { operations: 3, leadership: 1 }, reputation: 28 },
  outsider: { label: 'Outside executive', description: 'Corporate manager from food or equipment business; new to co-ops.', bonus: { finance: 2, leadership: 2, negotiation: 1, memberRelations: -1 }, reputation: 35 },
  farmer: { label: 'Farmer & director', description: 'Farmed and served on a co-op board before managing one.', bonus: { memberRelations: 3, boardRelations: 2, finance: -1 }, reputation: 20 },
};

export const CAREER = {
  /** Stats run 1–20, as leaders' skills do (10 is an ordinary manager). Each starts here before points are spent. */
  statBase: 6,
  statMaxAtStart: 16,
  /** Points to spend at age 25, and more for experience. */
  pointsAt25: 28,
  pointsPerYearOver25: 0.3,
  pointsMax: 38,
  ageRange: [25, 60] as [number, number],
  /** Careers end at this age. */
  retireAge: 70,
  /** A CEO's weight on the effects their managers deliver, against a dedicated manager. */
  effectWeight: s(0.5, 'low', 'The GM sets the tone; specialists do the work'),
  /** Board confidence drift per month per point of board relations above 10. */
  boardDriftPerPoint: s(0.03, 'low'),
  /** Director support on votes per point of board relations above 10. */
  voteSupportPerPoint: s(0.03, 'low'),
  /** A vacant role is covered at the GM's matching stat less this. */
  vacancyPenalty: 4,
  /** Stats grow with years on the job: chance a year that the stat most used rises a point, and decline from this age. */
  growthChance: s(0.5, 'low'),
  declineFromAge: 64,

  // ---- pay ----
  /**
   * Bonus target as a share of base pay; co-op GM plans run ~10–25% of base, 15% typical.
   * The bonus paid is the target scaled by the review score from 50 (nothing) to 100 (twice the target).
   */
  bonusTarget: s(0.15, 'low', 'Co-op manager compensation surveys and plans: 10–20% of base common, 15% a frequent benchmark, caps of 15–25%'),
  bonusTargetRange: [0.05, 0.4] as [number, number],
  /** Employment agreement: term (years) and severance (months of base) if let go without cause. */
  termYears: 3,
  severanceMonths: s(6, 'low', 'Pre-agreed severance of about six months is a common example in nonprofit and cooperative CEO agreements'),
  severanceRange: [0, 24] as [number, number],
  /** What boards pay against the co-op's market rate, by reputation 0 → 100. */
  payByReputation: [0.88, 1.25] as [number, number],

  // ---- reputation ----
  reputationPerReviewPoint: s(0.2, 'low', 'Per review point above or below 55'),
  firedReputation: -12,
  liquidatedReputation: -20,
  absorbedReputation: -3,
  notRenewedReputation: -5,
  /** Running a bigger co-op raises your standing a little each year (per 1,000 members). */
  sizeReputation: 0.6,

  // ---- offers ----
  /** Chance a month that another co-op approaches you while employed, at reputation 0 and 100. */
  offerChanceEmployed: [0.01, 0.06] as [number, number],
  /** Chance a month of an offer while looking for work. */
  offerChanceSearching: [0.12, 0.4] as [number, number],
  /** No approaches in the first months of a new job. */
  settleMonths: 18,
  offerMonths: 3,
  maxOpenOffers: 3,
  /** Members of the co-op that offers, around reputation × this plus the base, and its spread. */
  offerMembersBase: 250,
  offerMembersPerRep: 14,
  offerMembersSpread: [0.6, 1.5] as [number, number],
  /** Years of history simulated for the co-op you join. */
  historyYears: [6, 12] as [number, number],
  /** Share of offers from a co-op near the current one (same region and territory). */
  neighborShare: 0.35,

  // ---- negotiation ----
  /**
   * How far over its opening offer a board will go: a base, plus reputation and negotiation
   * skill, plus leverage (another offer in hand, or a job you can keep).
   */
  slackBase: s(0.04, 'low'),
  slackPerRep: s(0.12, 'low', 'At reputation 100'),
  slackPerNegotiation: s(0.012, 'low', 'Per point above 10'),
  slackLeverage: s(0.06, 'low'),
  /** Severance and bonus traded against base pay in a package's value. */
  bonusValue: 0.6,
  severanceValuePerMonth: 0.02,
  /** Asking more than the board's ceiling: chance of meeting halfway rather than walking away, per point of negotiation. */
  holdChance: s(0.55, 'low'),
  holdPerNegotiation: s(0.03, 'low'),
  maxRounds: 2,
  /** Raises: after a review the board will give up to this much at a score of 100, nothing below 55. */
  raiseAtScore100: s(0.12, 'low'),
  raiseFromScore: 55,
  /** Months after a review when you can ask. */
  raiseWindow: 3,
  /** Board confidence lost when an ask is refused, and when it was far over. */
  refusedConfidence: -2,
  overreachConfidence: -6,
  /** Board renews a contract at term end when confidence is at least this. */
  renewConfidence: 40,
  /** Yearly raise in a renewal, per review point above 55. */
  renewRaisePerPoint: 0.002,
};
