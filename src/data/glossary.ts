// Glossary entries shown as tooltips on co-op and industry terms.

export interface GlossaryEntry {
  id: string;
  term: string;
  text: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { id: 'patronage', term: 'Patronage', text: 'Business a member does with the co-op. Net savings from member business are returned to members in proportion to their patronage, as cash or retained equity.' },
  { id: 'patronage-refund', term: 'Patronage refund', text: 'The member\'s share of the co-op\'s patronage-sourced net savings, paid partly in cash and partly as allocated equity.' },
  { id: 'qualified', term: 'Qualified allocation', text: 'A patronage allocation the member has agreed to include in taxable income now. The co-op deducts it now. At least 20% of a qualified refund must be paid in cash.' },
  { id: 'nonqualified', term: 'Nonqualified allocation', text: 'Retained patronage the member is not taxed on until it is redeemed. The co-op pays tax now and takes the deduction at redemption.' },
  { id: 'unallocated', term: 'Unallocated equity', text: 'Retained earnings not assigned to any member. Taxed at the corporate rate; permanent capital that never has to be redeemed.' },
  { id: 'allocated-equity', term: 'Allocated equity', text: 'Members\' retained patronage, held by the co-op and recorded by member and by year (vintage). Redeemed later under the board\'s redemption plan.' },
  { id: 'membership-stock', term: 'Membership stock', text: 'The stock a farmer buys to become a voting member. One member, one vote, regardless of how much stock or equity they hold.' },
  { id: 'basis', term: 'Basis', text: 'Local cash price minus the futures price. A co-op elevator buys and sells basis; futures are used to hedge price risk.' },
  { id: 'carry', term: 'Carry', text: 'The amount by which deferred futures exceed nearby futures. When carry pays for storage, interest and shrink, a hedged elevator earns money by storing grain.' },
  { id: 'shrink', term: 'Shrink', text: 'Weight lost when wet grain is dried (moisture shrink) or handled (handling shrink). Elevators charge for it through moisture discounts.' },
  { id: 'dp', term: 'Delayed price (DP)', text: 'Farmer delivers grain and transfers title now, but sets the price later. The co-op owns the grain and owes a priced amount later.' },
  { id: 'borrowing-base', term: 'Borrowing base', text: 'The amount a lender will advance on the seasonal line, computed monthly from eligible receivables, inventory and hedged grain times advance rates.' },
  { id: 'seasonal-line', term: 'Seasonal line of credit', text: 'Short-term borrowing that finances inventory, receivables and margin calls through the year, repaid as grain and inputs are sold.' },
  { id: 'net-savings', term: 'Net savings', text: 'A co-op\'s word for net income. Local savings plus patronage received from regionals and the lender, less income tax.' },
  { id: 'local-savings', term: 'Local savings', text: 'Net savings from the co-op\'s own operations, before patronage received from regional co-ops and the lender.' },
  { id: 'regional', term: 'Regional cooperative', text: 'A cooperative owned by local co-ops. It supplies products and markets grain for its members and pays patronage, often partly in its own equity.' },
  { id: 'capper-volstead', term: 'Capper-Volstead', text: 'The 1922 law letting farmers market jointly through co-ops. One condition: a co-op may not do more business with non-members than with members.' },
  { id: 'subchapter-t', term: 'Subchapter T', text: 'The part of the tax code governing co-ops: patronage refunds paid or allocated on a qualified basis are deductible to the co-op.' },
  { id: 'owner-equity', term: 'Owner equity %', text: 'Member equity divided by total assets. Healthy local co-ops historically financed 40–50% of assets with equity.' },
  { id: 'hedge', term: 'Hedge', text: 'Selling futures against grain the co-op owns so a price drop on the grain is offset by a gain on the futures. A fully hedged elevator earns basis, carry and service income, not price speculation.' },
  { id: 'open-storage', term: 'Open storage', text: 'Grain a farmer stores at the elevator while keeping ownership. The co-op earns a monthly storage charge; the farmer sells later.' },
  { id: 'margin-call', term: 'Margin call', text: 'When futures rise, a short hedge loses money that must be deposited with the broker immediately, even though the grain gained the same amount. Rallies with a full house drain cash and the line of credit.' },
  { id: 'position-limit', term: 'Position limit', text: 'The board\'s cap on unhedged (net open) bushels per commodity.' },
  { id: 'turns', term: 'Turns', text: 'Bushels handled in a year divided by storage capacity. Country elevators typically turn 1.5 to 3 times.' },
  { id: 'lcm', term: 'Lower of cost or market', text: 'Inventory is carried at what it cost or what it would cost to replace now, whichever is lower. Fertilizer bought before a price collapse is written down, and the loss shows up in cost of goods sold.' },
  { id: 'prepay', term: 'Prepay', text: 'Farmers pay in winter (often December, for taxes) for spring inputs at a discount. The co-op holds the cash as a liability until it delivers.' },
  { id: 'prebuy', term: 'Propane prebuy', text: 'Customers lock in a winter propane price in summer. If the co-op doesn\'t buy the gallons to cover the contracts and prices spike, it delivers at a loss.' },
  { id: 'toll-milling', term: 'Toll milling', text: 'Grinding and mixing feed for an integrator who owns the ingredients. High volume, thin fee per ton, and one customer who can leave.' },
  { id: 'share-of-wallet', term: 'Share of wallet', text: 'The share of a farm\'s purchases (or grain) that comes to the co-op rather than to competitors. Price, distance, service, credit, loyalty and doing other business with us all move it.' },
  { id: 'fiscal-year', term: 'Fiscal year', text: 'The co-op\'s accounting year, labeled by the calendar year in which it ends. Many Corn Belt locals end their year on August 31, before harvest.' },
  { id: 'revolving', term: 'Revolving fund', text: 'Redeeming allocated equity oldest year first, so each year\'s retained patronage is paid back after a set period (the revolving period).' },
  { id: 'estate-redemption', term: 'Estate redemption', text: 'Paying out a deceased member\'s equity to the estate, often first in line and sometimes at a discount for early payment.' },
  { id: 'base-capital', term: 'Base capital plan', text: 'Each member is expected to hold equity in proportion to their recent business; over-invested members are paid down first.' },
  { id: 'patronage-pool', term: 'Patronage pool', text: 'A group of business (all of it, or one division) whose savings are allocated together, on one basis: bushels, dollars of sales, or margin.' },
  { id: 'dpad', term: 'DPAD / 199A(g)', text: 'Deductions for domestic production (2005–2017) and agricultural co-op production (2018 on). A co-op may keep the deduction or pass it through to members with their patronage.' },
  { id: 'nol', term: 'Net operating loss', text: 'A tax loss carried forward to offset future taxable income, for a limited number of years (from 2018, indefinitely but only against 80% of income).' },
  { id: 'covenant', term: 'Loan covenant', text: 'A financial test in the loan agreement (current ratio, equity ratio, term debt to fixed assets, debt service coverage). Breaches lead to waivers, higher rates and, if they persist, special credit.' },
  { id: 'special-credit', term: 'Special credit', text: 'The lender\'s workout group for troubled borrowers. It restricts patronage cash, redemptions and capital spending until the co-op recovers, or forces a sale.' },
  { id: 'term-out', term: 'Terming out', text: 'Converting part of a seasonal line of credit into an amortizing term loan to restore working capital.' },
  { id: 'lender-equity', term: 'Co-op bank stock', text: 'Banks for Cooperatives and CoBank are owned by their borrowers, who hold stock built from retained patronage. Stock above the bank\'s target is retired.' },
  { id: 'unfunded-obligation', term: 'Unfunded redemption obligation', text: 'Allocated equity held by members who no longer do business with the co-op, plus vintages older than the target revolving period: what members expect back with no plan to pay it.' },
  { id: 'drift', term: 'History with drift', text: 'Historical forces arrive in their eras, but timing shifts by up to about two years and magnitudes vary, so hindsight is not a cheat code.' },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));
