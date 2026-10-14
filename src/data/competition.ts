// Competitor behaviour (DESIGN §16) and history-driven national moves: shuttle loaders,
// ethanol plants. Dollar amounts are 2024 dollars.

import { s } from './types';

export const COMPETITOR_AI = {
  /** Strength (0–100): a simplified financial health score in place of a ledger (D-012). */
  initial: [40, 85] as [number, number],
  /** Quarterly drift toward this level. */
  equilibrium: s(60, 'low'),
  reversion: s(0.08, 'low'),
  /** Strength lost per unit of farm-income stress each quarter. */
  stressDrag: s(25, 'low'),
  noise: s(5, 'low'),
  /** A price war costs strength each quarter it lasts. */
  priceWarCost: s(4, 'low'),
  failBelow: s(12, 'low'),
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
};
