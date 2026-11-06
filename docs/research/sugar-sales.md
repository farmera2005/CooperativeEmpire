# Selling beet sugar: industrial, wholesale and retail (D-141)

Research notes for the sugar sales channels. These are web-search extracts and background
estimates. Values in `src/data/sugar.ts` (`SUGAR_SALES`) are low confidence unless noted, and
they are flagged in `docs/DATA_REVIEW.md`.

## Who buys refined sugar

- USDA ERS *Sugar and Sweeteners Yearbook* tables 20a/21 split refined deliveries by use. Industrial
  users are bakery, cereal, confectionery, dairy, beverage, canned and frozen foods and other food
  makers. Non-industrial buyers are wholesalers and jobbers, retail grocers and chain stores,
  restaurants and institutions, and government.
  - [ERS yearbook tables (archive)](https://webarchive.library.unt.edu/web/20130221075819/http://@ers.usda.gov/data-products/sugar-and-sweeteners-yearbook-tables.aspx)
  - [Deliveries by use: retail](https://catalog.data.gov/dataset/sweetener-market-data-historical-deliveries-by-use-retail)
- Non-industrial users took about 34% of deliveries in 1980 and about 45% by the early 1990s
  (trade press summarizing ERS). Of that, wholesalers and jobbers are the larger part; retail
  grocers took roughly a tenth of all deliveries.
- American Crystal: its marketing agency (United Sugars, later renamed) sells about 90% of its
  sugar by weight to industrial users such as confectioners, cereal makers and bakeries. The
  "Crystal Sugar" brand is licensed for retail packs.
  - [Crystal Sugar cooperative profile](https://crystalsugar.com/our-company/cooperative-profile)
  - [Agweek: United Sugars stands out with 43% market share](https://www.agweek.com/news/sugarbeet/united-sugars-stands-out-with-43-market-share)
  - [Food Business News: United Sugars unveils new name](https://www.foodbusinessnews.net/articles/23313-united-sugars-unveils-new-name)
- Grower co-ops in the Red River Valley and southern Minnesota market together through one
  agency. The agency's selling cost stays at the existing 4% of sales (`SUGAR.marketingCostPct`).
  Selling directly instead needs a sales office.
- Packaging and warehousing for consumer packs sit at or next to the factories.

## Contracts

Industrial buyers buy most of their sugar under annual contracts. These are negotiated mostly
in late summer and fall for the October–September marketing year (background). The game prices
contracts each October at the market. That steadies a year's price but gives up a rising
market, as in 2010–12.

## Retail against wholesale

- Retail sugar prices follow wholesale slowly. The retail spread widens when wholesale falls and
  narrows when it spikes.
  - 1980s: wholesale refined averaged 27.1¢/lb against 37.2¢ retail.
  - 1990s: 26.7¢ against 41.9¢.
  - 2000: 20.8¢ against 44.3¢.
  - [American Sugar Alliance: the myth of high U.S. sugar prices](https://sugaralliance.org/the-myth-of-high-u-s-sugar-prices/36774)
  - [Progressive Grocer](https://progressivegrocer.com/node/14662)
  - [ERS chart of note](https://www.ers.usda.gov/data-products/charts-of-note/86749)
- Beet sugar normally trades 1–2¢/lb below cane. In 2015/16 the gap was 5.5–7.5¢.
- Grocers carry sugar on thin margins as a traffic item. Store brands (private label) sell below
  national and regional brands. Packers pay slotting and promotion to keep shelf space
  (background).

## Model (D-141)

- **Channels.**
  - Industrial: contracted or at the market.
  - Wholesale grocers and foodservice distributors: 25–100 lb bags at a 5% premium, less bagging.
  - Retail packs: the shelf price, which follows the trailing year's wholesale price times a
    markup, less the grocer's margin, a store-brand discount that a stronger brand closes,
    packaging, freight and trade promotion.
- **Limits.**
  - Distributors' demand in the trade area.
  - Shelf space, which grows with brand strength.
  - The factory's consumer packaging line, a new component. A typical factory has a line of
    300,000 cwt a year, and the sugar company's factory comes with one.
- **Brand.** Brand support is none, modest or strong. The brand drifts toward the strength its
  support builds over about three years. The sugar company's brand comes with its factory.
