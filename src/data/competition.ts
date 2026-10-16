// Competitor behaviour (DESIGN §16) and history-driven national moves: shuttle loaders,
// ethanol plants. Dollar amounts are 2024 dollars.

import { s } from './types';

export const COMPETITOR_AI = {
  /** Strength (0–100): a simplified financial health score in place of a ledger (D-012). */
  initial: [40, 85] as [number, number],
  /** Quarterly drift toward this level. */
  equilibrium: s(60, 'low'),
  reversion: s(0.08, 'low'),
  /**
   * Strength lost per unit of farm-income stress each quarter, scaled by vulnerability
   * (1.4 − strength/100) so thin balance sheets suffer most. Calibrated so the 1980s farm
   * crisis closes roughly a fifth of local firms, not all of them (D-080).
   */
  stressDrag: s(9, 'low', 'Calibrated: ~15–25% of local grain and farm-supply firms failed or sold out in 1980–87'),
  noise: s(5, 'low'),
  /** A price war costs strength each quarter it lasts. */
  priceWarCost: s(4, 'low'),
  failBelow: s(12, 'low'),
  /** Below failBelow, the quarterly chance the lender closes them; otherwise a workout. */
  failProb: s(0.4, 'low'),
  workoutGain: s(10, 'low', 'Strength restored by a lender workout or new owner capital'),
  /** Share of a failed firm's plants bought by a stronger competitor instead of going to auction. */
  acquireProb: s(0.5, 'low'),
  acquireMiles: 40,
  /**
   * Consolidation: each quarter a smaller local firm may sell out to a stronger neighbor in the
   * same business (owners retiring, scale economics). The plants keep running under the buyer.
   */
  consolidateProb: s(0.005, 'low', 'About 2% of local firms a year; elevator firm counts roughly halved 1980–2010'),
  consolidateBelow: s(65, 'low'),
  investAbove: s(70, 'low'),
  investProb: s(0.12, 'low'),
  /** Storage added by an expansion (share of current). */
  investStorage: s(0.35, 'low'),
  priceWarProb: s(0.15, 'low'),
  priceWarQuarters: 4,
  /** Bid bump in a price war: grain $/bu; supply posture points (percent of price). */
  priceWarGrain: s(0.04, 'low'),
  priceWarSupply: s(1, 'low'),
  /** Two weak neighbouring co-ops may merge. */
  mergeBelow: s(42, 'low'),
  mergeProb: s(0.1, 'low'),
  mergeMiles: 20,
  /** A weak co-op near us may propose a merger. */
  approachBelow: s(38, 'low'),
  approachProb: s(0.08, 'low'),
  approachMiles: 30,
  /** Distressed sale discount when a competitor fails. */
  distressDiscount: [0.45, 0.7] as [number, number],
  /** Nationals and big co-ops build shuttle loaders on main lines from this year. */
  shuttleFrom: 1995,
  shuttleProb: s(0.25, 'low', 'Chance per year a qualifying national or large co-op site upgrades'),
};

export const ETHANOL = {
  /** Plants are built once the renewable fuel standard is on, through this year. */
  buildTo: 2010,
  /** Chance per year a qualifying county seat (on a main line) gets a plant. */
  plantProb: s(0.12, 'low'),
  maxPlants: 2,
  /** Road miles = straight line × this. */
  roadFactor: 1.2,
};

/**
 * How members weigh a merger at the vote (D-081). Appeal shifts every member's lean; a member at
 * satisfaction 50 with appeal 0.35 votes yes about 74% of the time. Board-recommended co-op
 * mergers usually pass with 70–90%; they fail over a debt-laden partner, lost control, or
 * unhappy members.
 */
export const MERGER_VOTE = {
  /** Members largely follow a united board's recommendation. */
  boardRecommends: s(0.3, 'low', 'Most board-recommended co-op unifications pass'),
  /** Partner's financial health: ± this at strength 45 ± 35. */
  partnerHealth: s(0.2, 'low'),
  /** Scale gained: this × (partner sites ÷ our sites, at most 1). */
  scale: s(0.1, 'low'),
  /** Partner leverage above 45% of its assets costs up to this. */
  leverage: s(0.3, 'low'),
  /** Each board seat beyond the first given to the partner. */
  perSeat: s(0.04, 'low'),
  /** Dropping our name. */
  rename: s(0.05, 'low'),
  /** Diligence findings presented at the information meetings. */
  diligence: s(0.05, 'low'),
  /** Trust in management: × (board confidence − 50). */
  trust: s(0.004, 'low'),
  /** Hard times make members open to consolidation: × farm stress. */
  hardTimes: s(0.25, 'low'),
  /** A partner far from our sites feels like a takeover of the hometown. */
  distanceMiles: 30,
  distance: s(0.1, 'low'),
  /** Their side: base yes share and adjustments. */
  theirBase: s(0.66, 'low'),
  theirPerSeat: s(0.04, 'low'),
  theirNoise: s(0.05, 'low'),
};

/** Mergers, division sales, joint ventures and buyouts (DESIGN §14.6). */
export const DEALS = {
  studyCost: s(40_000, 'low', 'Feasibility study by a co-op consultant (2024 $)'),
  studyMonths: 2,
  diligenceCost: s(60_000, 'low', 'Accountants and engineers (2024 $)'),
  /** Estimates before diligence are off by up to this share (less with a strong CFO). */
  estimateError: s(0.3, 'low'),
  memberMeetingMonths: 2,
  integrationMonths: 12,
  /** Service utility lost while systems and crews are combined. */
  integrationPenalty: s(0.12, 'low'),
  /** Partner balance sheet from its strength: working capital and debt as shares of plant value. */
  workingCapitalShare: s(0.15, 'low'),
  debtShareWeak: s(0.75, 'low', 'Debt / plant value at strength 0'),
  debtShareStrong: s(0.2, 'low', 'Debt / plant value at strength 100'),
  allocatedEquityShare: s(0.6, 'low', 'Share of partner equity held as members\' allocated equity'),
  /** A buyer pays this multiple of fair value for a farm-supply division. */
  divisionPrice: [0.8, 1.05] as [number, number],
  /** Chance per year a buyer approaches a weak co-op. */
  buyoutProb: s(0.12, 'low'),
  buyoutPremium: [1.0, 1.35] as [number, number],
  /** Joint venture: annual return on combined plant value, synergy, payout of earnings. */
  jvReturn: s(0.08, 'low'),
  jvSynergy: s(0.12, 'low'),
  jvPayout: s(0.5, 'low'),
  incomingExpiryMonths: 3,
  /**
   * Buying a private company (D-102): an asset purchase of its plants and working capital. The
   * owner asks this multiple of their appraised value, less for a retiring owner (65+), more for
   * a strong business, with ±noise.
   */
  askMultiple: s(1.15, 'low', 'Owners of profitable private elevators and dealers ask above appraisal'),
  askRetiringDiscount: s(0.15, 'low', 'Retiring owners without heirs in the business sell for less'),
  askStrengthPremium: s(0.4, 'low', 'Added multiple per unit of (strength − 50) ÷ 100'),
  askNoise: s(0.08, 'low'),
  /** The owner never takes less than this share of the asking price; at the asking price they always sell. */
  acceptFloor: s(0.85, 'low'),
  /** Integration of a bought company: shorter than a merger (no members, boards or equity to combine). */
  acquisitionIntegrationMonths: 6,
  /** Goodwill is amortized straight-line over this many months (the private-company alternative, ASU 2014-02). */
  goodwillMonths: 120,
};
