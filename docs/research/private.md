# Private companies: owning, running and working for one (D-149)

These are research notes for the private-company game mode. They come from web-search extracts
and background estimates. Values in `src/data/private.ts` are low confidence and listed in
`docs/DATA_REVIEW.md`.

## How a private grain and farm-supply company differs from a co-op

- **Ownership and control**
  - A farmer co-op is owned by its producer members, one member one vote.
  - A private company is owned by shareholders: often a family, sometimes local investors.
    Control follows shares.
  - Farmers are customers, not owners. There is no patronage and no member equity. Customers
    do not vote and do not elect a board.
  - Sources: [IRS letter ruling on farmers' co-ops](https://irs.gov/pub/irs-wd/1250009.pdf);
    [USDA RD RR-153](https://www.rd.usda.gov/files/rr153.pdf).
- **Taxation**
  - A co-op is taxed once on patronage income: patronage refunds are deductible under
    Subchapter T.
  - A C corporation pays corporate income tax on all of its income, and owners pay again on
    dividends.
  - The top federal corporate rate:
    | Period | Top rate |
    |---|---|
    | 1970 | 49.2% (with the surcharge) |
    | 1979–1986 | 46% |
    | 1987 | 40% (transition) |
    | 1988–1992 | 34% |
    | 1993–2017 | 35% |
    | From 2018 | 21% |
  - Sources: [Tax Foundation](https://taxfoundation.org/data/all/federal/historical-corporate-tax-rates-brackets/);
    [Tax Policy Center](https://taxpolicycenter.org/sites/default/files/statistics/pdf/corporate_top_rate_bracket_1.pdf).
  - Many family firms are S corporations instead, which pass income through to the owners.
    The game models a C corporation. A smaller company pays lower bracket rates, so the game
    uses an effective rate somewhat under the top rate.
- **What farmers weigh**
  - At a co-op, members may get money back at year end.
  - A private elevator may bid a little higher at the scale instead.
  - After 2017, Section 199A briefly favored selling to co-ops over private elevators. The
    "grain glitch" fix narrowed the gap.
  - Sources: [Kansas City Public Radio](https://www.kcur.org/2018-11-09/ag-co-ops-are-more-than-seeds-and-sales-theyre-boosting-rural-economies);
    [Tax Notes on the grain glitch](https://www.taxnotes.com/tax-reform/economic-analysis-complex-grain-glitch-fix-leaves-jumbled-mix);
    [Western Producer](https://www.producer.com/?p=194587).
- **Credit**
  - The banks for cooperatives, later CoBank, were built to lend to co-ops. CoBank now also
    lends to other agribusinesses, but co-op lending is its core.
  - Farm Credit associations lend to farm-related businesses only under conditions.
  - Independent elevators and ag retailers mostly borrow from commercial banks. They offer
    their customers input credit through Farm Credit-backed programs such as ProPartners.
  - Sources: [FCA: banks and associations](https://www.fca.gov/bank-oversight/about-banks-and-associations);
    [CoBank agribusiness](https://www.cobank.com/services/agribusiness);
    [ProPartners Financial](https://ara.swoogo.com/agretailers25/sponsor/884321/propartners-financial).
  - **Game model:** a private company uses a commercial bank and receives no lender patronage.
- **Suppliers**
  - Regional co-ops (GROWMARK, CHS and others) sell to non-member customers, but only members
    earn patronage.
  - Sources: [GROWMARK membership](https://GROWMARK.COM/membership);
    [CHS cooperative value](https://chsinc.com/cooperative-value).
  - **Game model:** a private company can buy through regionals but earns no regional
    patronage and holds no regional equity.
- **Who owns elevators**
  - Family elevators were commonly handed down or sold to employees, other companies or
    co-ops when the owner retired.
  - Independent single-site elevators have become rare among multi-location co-ops.
  - Sources: [High Plains Journal](https://hpj.com/?p=5703);
    [Grain Journal](https://www.grainjournal.com/article/1116158/along-the-tracks);
    [Washington Times](https://www.washingtontimes.com/news/2016/apr/10/7-grain-elevators-in-northwest-iowa-sold-to-local-/).
  - The independent ag retailers that remain stress family ownership.
    Source: [CropLife](https://www.croplife.com/?p=94929).

## Dividends

- Family businesses favor paying dividends, but payout ratios are modest.
  - Mercer Capital's survey found 60% target less than a quarter of earnings.
  - For a C corporation, the payout is measured against earnings after corporate tax.
  - Nearly half have no formal policy.
  - Sources: [Mercer Capital](https://mercercapital.com/family-business-dividend-survey-results);
    [Brown Brothers Harriman](https://www.bbh.com/us/en/insights/capital-partners-insights/establishing-a-dividend-policy-for-a-familyowned-business.html).
- **Game model:** the payout is a policy, defaulting to 25% of after-tax earnings.

## A hired CEO at a family company

- Family owners rarely give real equity to an outside CEO. They use cash bonuses, profit pools,
  and phantom stock, which pays the gain in share value without giving up shares.
- Vesting periods are longer than at public companies.
- Long-term incentives are about 23% of a private-company CEO's package, against 51% at
  private-equity-backed firms.
- Sources: [BDO](https://www.bdo.com/insights/tax/life-cycle-of-a-family-owned-business-and-the-impact-on-structuring-ceo-pay);
  [Davis Wright Tremaine](https://www.dwt.com/blogs/family-business-resource-center/2021/02/family-business-equity-compensation-alternatives);
  [Family Business Magazine](https://familybusinessmagazine.com/uncategorized/2025-2026-compensation-survey-highlights-family-business-executive-pay/);
  [Ag Proud](https://agproud.com/articles/37172-compensating-top-managers-with-equity-and-profit-sharing-options);
  [NACD](https://www.nacdonline.org/all-governance/governance-resources/directorship-magazine/private-company-directorship-newsletter/setting-executive-compensation-at-private-family-businesses/).
- **Game model:** a hired CEO of a private company has the career contract, a bonus tied to
  profit, and phantom equity. Phantom equity is a share of the growth in book equity since
  hire, paid when the contract ends well or when the company is sold. The family board
  reviews the CEO on profit, dividends, the lender, and its own goals.
