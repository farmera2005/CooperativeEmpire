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
  { id: 'fiscal-year', term: 'Fiscal year', text: 'The co-op\'s accounting year, labeled by the calendar year in which it ends. Many Corn Belt locals end their year on August 31, before harvest.' },
  { id: 'drift', term: 'History with drift', text: 'Historical forces arrive in their eras, but timing shifts by up to about two years and magnitudes vary, so hindsight is not a cheat code.' },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));
