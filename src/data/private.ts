// Private companies (D-149, docs/research/private.md): an investor-owned grain and farm-supply
// business — founded and owned by the player, or a family company that hires the player as CEO.
// Dollar amounts are 2024 dollars.

import { s } from './types';

export const PRIVATE = {
  /** Share of after-tax earnings paid out as dividends unless the owner sets otherwise. */
  dividendPayout: s(0.25, 'low', 'Mercer Capital family business dividend survey: 60% target under a quarter of earnings; for C corporations, of net earnings'),
  /** The owner's stake at founding; the rest comes from family and local investors. */
  stakeOptions: [1, 0.75, 0.51],
  /** A buyer pays this multiple of book equity for the company (a going concern). */
  saleMultiple: s<[number, number]>([1.0, 1.6], 'low', 'Small agribusinesses change hands near book value; more for a strong one'),
  /** Months advisers take to find a buyer. */
  saleStudyMonths: 3,
  /** No dividends while the lender has the company on its watch list or worse. */
  dividendNeedsStanding: true,
  /** The owners' board that hires a CEO: directors (family and local investors). */
  boardSize: 5,
  /** Hired CEO's phantom equity: a share of the growth in book equity, paid when the term ends in good standing or the company is sold. */
  phantomPct: s<[number, number]>([0.01, 0.04], 'low', 'Family businesses use phantom stock and profit pools rather than real shares for outside CEOs'),
  /** Career mode: share of offers from private companies, and of random established employers. */
  offerShare: 0.35,
  establishedShare: 0.3,
  /** Customers who do at least this share of their business with us count toward the size of the job (pay, overhead). */
  regularCustomerShare: 0.25,
  /** Customers' loyalty to a local private company (relationships, not ownership), against members' loyalty to their co-op; there is no patronage refund. */
  relationshipLoyalty: s(0.6, 'low', 'Independent dealers keep customers on relationships and service; co-op members add ownership and patronage'),
  /** Names of private grain and farm-supply companies ({surname}, {town}, {county}). */
  namePatterns: ['{surname} Grain Company', '{town} Grain & Supply, Inc.', '{surname} Ag Services', '{town} Farm Service Company', '{county} Grain Corporation', '{surname} & Sons Elevator Co.'],
};
