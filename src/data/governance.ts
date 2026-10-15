// Governance parameters (DESIGN §14): bylaws defaults, the director vote model, political
// capital, director demands, GM evaluation, elections, petitions and member votes.

import { s } from './types';

export const BYLAWS_DEFAULT = {
  quorumPct: s(0.1, 'medium', 'Typical member-meeting quorum'),
  /** Capital projects at or above this cost (2024 $) need a board vote. */
  capitalApproval: s(150_000, 'low'),
  /** Share of active members whose signatures force a special meeting. */
  memberPetitionPct: s(0.1, 'medium'),
  termLimit: null as number | null,
  advisoryDirectorsFrom: 2000,
};

/** Director support = Σ weights × terms (DESIGN §14.3). */
export const VOTE_MODEL = {
  /** Boards approve most of what management brings them: a standing lean toward yes. */
  deference: s(0.45, 'low'),
  merit: s(1.2, 'low'),
  stanceFit: s(0.5, 'low'),
  petIssue: s(0.8, 'low'),
  confidence: s(0.5, 'low', 'Weight on (board confidence − 50) / 50'),
  faction: s(0.35, 'low'),
  lobby: s(0.6, 'low'),
  controversy: s(0.6, 'low'),
  noise: s(0.35, 'low', 'Standard deviation of a director\'s idiosyncratic lean'),
  /** Loyalty to the GM shifts support by this much at 100 vs 50. */
  loyalty: s(0.3, 'low'),
  /** Months an item can be tabled before it must be voted. */
  maxTables: 2,
};

/** A rejected proposal can't come back unchanged for this long (Robert's Rules: reconsideration). */
export const BOARD_RECONSIDER_MONTHS = 6;

export const POLITICAL_CAPITAL = {
  max: 10,
  monthly: 2,
  lobbyCost: 2,
  /** Loyalty change when a lobbied director votes yes / no anyway. */
  lobbyYes: 1,
  lobbyNo: -2,
};

/** Board confidence (0–100): monthly drift and event effects. */
export const CONFIDENCE = {
  start: 60,
  voteWon: s(0.5, 'low'),
  voteLost: s(-3, 'low'),
  /** Monthly drift per lender status. */
  lenderStatus: { standard: 0, watch: -0.2, waiver: -0.4, specialCredit: -1, forcedAction: -5 } as Record<string, number>,
  /** Monthly drift per point of patrons' average satisfaction above 50. */
  satisfaction: s(0.03, 'low'),
  /** Monthly pull toward the latest review score. */
  reversion: s(0.03, 'low'),
  demandMet: s(4, 'low'),
  demandMissed: s(-4, 'low'),
  /** Termination thresholds. */
  pipBelow: 35,
  fireBelow: 25,
  /** A second weak review (below this score) while on a plan ends the GM's tenure. */
  fireScoreBelow: 45,
  fireAnyMeetingBelow: 10,
};

export const GM_REVIEW = {
  /** Months after fiscal year end (after the audit and the patronage vote). */
  monthsAfterFye: 3,
  /** Weights of the review score components (sum 1). */
  weights: { budget: 0.25, savings: 0.2, lender: 0.15, members: 0.1, demands: 0.1, votes: 0.05, loyalty: 0.15 },
  /** Points added to results scores per unit of farm-income stress (bad times are forgiven). */
  hardTimesCurve: s(60, 'low'),
  /**
   * Interest-rate hard times (D-100): directors also forgive results when the prime rate is far
   * above normal, as in 1979–82. Stress = (prime − this) ÷ 10, capped at 1; the larger of this and
   * farm-income stress sets the curve.
   */
  ratePainFrom: s(10, 'low'),
  /** Weight of the review score in board confidence (the rest is carried over). */
  reviewWeight: 0.4,
  /** Bonus as a share of salary at a perfect review (scaled from a score of 50). */
  maxBonus: s(0.25, 'low'),
};

export const DEMANDS = {
  /** Monthly chance a director raises an item from their pet issue. */
  raiseProb: s(0.02, 'low'),
  deadlineMonths: 18,
  expandDeadlineMonths: 30,
  maxOpen: 3,
};

export const ELECTIONS = {
  /** Mean district satisfaction below this brings an insurgent candidate. */
  insurgentBelow: s(45, 'low', 'Patronage-weighted mean satisfaction'),
  /** Chance of an insurgent even in a content district (hot local issue). */
  insurgentBase: s(0.08, 'low'),
  incumbencyBonus: s(0.6, 'low'),
  neighborBonus: s(0.4, 'low'),
  turnoutBase: s(0.18, 'low'),
  turnoutPerPoint: s(0.008, 'low', 'Extra turnout per point of |satisfaction − 50|'),
  endorsementBoost: s(0.25, 'low'),
  endorsementBackfire: s(-8, 'low', 'Board confidence when an endorsed incumbent loses'),
  retireAge: 72,
  /** Chance an incumbent with ≥ 9 years' tenure steps down. */
  stepDownProb: s(0.3, 'low'),
};

export const PETITIONS = {
  /** Members below this satisfaction may sign. */
  signBelow: s(25, 'low'),
  /** Only real patrons (this share of their business with us) bother to sign. */
  minEngagement: s(0.3, 'low'),
  /** Months between petition and special meeting. */
  meetingDelay: 2,
};

/** Annual-meeting floor remarks, chosen by the year's conditions. */
export const MEETING_REMARKS: { when: 'loss' | 'profit' | 'lowCash' | 'highCash' | 'watch' | 'closure' | 'expansion' | 'any'; text: string }[] = [
  { when: 'loss', text: '"How does a co-op lose money in a year like this? Somebody explain that to me."' },
  { when: 'loss', text: '"I didn\'t join this outfit to subsidize the fertilizer plant."' },
  { when: 'profit', text: '"Good year. Now let\'s see some of it come back to the people who earned it."' },
  { when: 'profit', text: '"My dad helped start this co-op. He\'d be proud of the numbers."' },
  { when: 'lowCash', text: '"I owe more tax on my patronage than the check you sent me. That isn\'t right."' },
  { when: 'highCash', text: '"Nice check this year. Don\'t go spending the place into the ground to make up for it."' },
  { when: 'watch', text: '"I heard the bank\'s got us on a watch list. Is that true, and what are you doing about it?"' },
  { when: 'closure', text: '"You closed our elevator. Now I haul twelve more miles. What do I get for that?"' },
  { when: 'expansion', text: '"That new plant looks fine, but who decided we needed it, and who\'s paying for it?"' },
  { when: 'any', text: '"When do I get my equity back? I retired four years ago."' },
  { when: 'any', text: '"Wait times at harvest were long again. We need more dump pits, not more meetings."' },
  { when: 'any', text: '"Thank you to the board and the staff. The fuel driver came out on Christmas Eve."' },
];
