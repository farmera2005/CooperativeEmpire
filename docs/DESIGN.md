# Agricultural Cooperative Tycoon — Design

Status: **draft for approval** (pre-Milestone 1). This is my interpretation of the build prompt.
Where the prompt left something open I made the realistic call and logged it in
`docs/DECISIONS.md` (referenced here as `D-nnn`).

---

## 0. Reading guide

| § | Topic |
|---|---|
| 1 | Pillars as engineering rules |
| 2 | Architecture, packages, determinism, performance |
| 3 | Time, calendar, and the monthly tick order |
| 4 | Core state schema |
| 5 | Data layer and confidence |
| 6 | World: territory, weather, markets, history modes |
| 7 | Members, customers, demand, share of wallet |
| 8 | Facilities (common model) |
| 9 | Divisions: grain, agronomy, feed, energy, retail, cross-division |
| 10 | Ledger, statements, ratios |
| 11 | Patronage, tax, equity, redemption |
| 12 | Lender, borrowing base, covenants |
| 13 | Regional co-ops, suppliers, brands |
| 14 | Governance: board, votes, elections, annual meeting, mergers |
| 15 | People |
| 16 | Competitors |
| 17 | Events, history, technology, regulation |
| 18 | Player controls, commands, pacing, explanations |
| 19 | Scorecard, outcomes, scenarios |
| 20 | UI |
| 21 | Saves |
| 22 | Testing and the headless runner |

---

## 1. Pillars as engineering rules

1. **It behaves like a real co-op.** The objective function is never "maximize profit". Every
   member's satisfaction is driven by price position, service, patronage cash, and equity
   redemption, and the board weighs these against financial soundness. Profit that comes from
   gouging members shows up as lost share and lower satisfaction.
2. **Real financial statements.** Every dollar moves through a double-entry journal posted by
   division. No system may change `cash` or any balance directly; it must post a journal entry.
   Statements are *derived* from the ledger, never stored independently.
3. **Policy over micromanagement.** Division managers execute monthly operations inside
   player-set policies. The player's direct levers are capital, people, policy, money, and
   politics.
4. **History matters.** Era-gating (brands, tech, regulations, tax law, lenders) is data-driven
   by date. Historical shocks hit markets and rules.
5. **Data-driven.** No market value, cost anchor, probability, or tuning coefficient is a
   literal in `src/engine`. Engine code reads them from `src/data`. (Enforced by review and a
   lint rule banning numeric literals other than 0, 1, -1, 2, 12, 100 in `src/engine/**`
   outside `core/` utilities — see D-014.)

---

## 2. Architecture

### 2.1 Stack
React 18 + TypeScript (strict) + Vite, Tailwind CSS, Zustand for UI state, Recharts for charts,
hand-written SVG for the map, Vitest for tests, `tsx` for the headless runner. No backend.

### 2.2 Layout

```
src/
  engine/            pure TypeScript simulation. NO React, NO DOM, NO IndexedDB, NO Date.now(),
                     NO Math.random(). Compiled under tsconfig.engine.json with lib: ["ES2022"]
                     (no "DOM") so a DOM reference is a type error.
    core/            rng, calendar, money, ids, clone, invariants, Breakdown type
    ledger/          chart of accounts, posting, trial balance, statements, ratios
    world/           territory generation, weather, market series builder, history drift
    members/         member generation, demographics, farm structure, satisfaction
    demand/          seasonal demand per member per product line
    share/           attractiveness model and share-of-wallet allocation
    facilities/      common facility model, construction, depreciation, condition
    divisions/       grain/, agronomy/, feed/, energy/, retail/  (one module each)
    finance/         patronage, tax, equity subledger, redemption, lender, borrowing base, covenants
    regionals/       regional co-ops, supplier programs, rebates, regional equity
    governance/      bylaws, board, directors, proposals, votes, elections, annual meeting, mergers
    people/          leaders, skills→effects, hiring pipeline, staffing levers, labor market
    competitors/     competitor entities and AI
    events/          historical + random event engine, effect DSL interpreter
    tech/            technology tree
    scorecard/       scorecard and loss conditions
    sim/             newGame(), applyCommand(), advanceMonth(), tick pipeline, policy bots
    save/            save schema version + migrations (pure functions only)
  data/              *.ts data files (typed), tuning constants, name lists
  ui/                React app: screens/, components/, store/ (Zustand), format/
  persistence/       IndexedDB autosave + named slots, JSON export/import (browser only)
tools/
  sim/               headless balance runner (npm run sim)
  data-review/       generates docs/DATA_REVIEW.md from confidence flags (npm run data:review)
tests/               Vitest (engine tests live beside code as *.test.ts; cross-system tests here)
docs/
```

### 2.3 Engine API (the only surface the UI uses)

```ts
newGame(setup: GameSetup): GameState
applyCommand(state: GameState, cmd: Command): CommandResult   // intra-month, pure
advanceMonth(state: GameState, decisions?: Command[]): TickResult  // pure
advanceUntilAttention(state, interrupts: InterruptConfig, maxMonths): TickResult[]
// read-only selectors
selectIncomeStatement(state, period, division?) / selectBalanceSheet / selectCashFlow / selectRatios
previewProposal(state, proposal): ProposalPreview   // vote forecast, financial effects, tax, covenants
explain(state, metricKey): Breakdown                // "why did this happen"

interface CommandResult { state: GameState; ok: boolean; messages: Message[] }
interface TickResult    { state: GameState; summary: MonthSummary; interrupts: Interrupt[] }
```

- `applyCommand` exists so the player can hold the board meeting, hire someone, or answer an
  event *within* the month and see the result before ending the month. `advanceMonth` applies
  any `decisions` passed to it via `applyCommand` first, then runs the tick. Both are
  deterministic (D-002).
- Neither function mutates its input. Internally they copy the mutable working set and mutate
  the copy (D-003): a hand-written `cloneForTick` deep-copies current-state objects but shares
  append-only history chunks by reference. This is much faster than Immer over 5,000 members.

### 2.4 Determinism and RNG
- PRNG: `sfc32`, seeded from 128 bits derived from the game seed.
- **Named substreams**: every random draw comes from `rng(state, 'weather')`,
  `rng(state, 'members.death')`, etc. A substream's seed = hash(gameSeed, monthIndex,
  streamName [, entityId]). Adding a new random draw in one system never perturbs any other
  system's sequence, which keeps saves and balance runs stable as the code grows (D-004).
- Commands within a month use substream `cmd:<n>` where n is the command's ordinal that month.
- No `Date`, `Math.random`, `Object.keys` ordering on numeric-like keys used for logic
  (we iterate arrays sorted by id).

### 2.5 Money and units
- All money in the engine is **integer cents** (`type Cents = number`). Rounding happens only
  at posting via `roundCents` (banker's rounding). Prices per unit are `number` dollars with
  full precision (e.g. $3.4725/bu); extended amounts are rounded when posted (D-005).
- Units: grain in bushels (corn 56 lb, soybeans and wheat 60 lb), fertilizer in short tons,
  fuel in gallons, feed in tons, acres, head of livestock.
- All dollars are nominal (D-006). The UI offers a "show in YYYY dollars" toggle on charts.

### 2.6 Performance budget
- Target: `advanceMonth` < 250 ms at 5,000 members, 60 years of history, all divisions, on a
  mid-range laptop. A Vitest benchmark guards it (fails above 1,000 ms in CI).
- Hot loop (demand × share) runs over members in flat arrays; no per-member allocations inside
  the loop; product lines enumerated by small integer ids.
- History is columnar: `Float64Array` chunks per metric per year, grown by year.
- Journal detail retained for the current fiscal year plus two prior; older years are rolled
  into monthly balances by account × division (D-007). Drill-down works for recent years;
  older years drill down to monthly account balances.

---

## 3. Time and the monthly tick

### 3.1 Calendar
- `monthIndex = year * 12 + (month - 1)`. Fiscal year is labeled by the calendar year in which
  it ends. Default FYE August 31 (fiscal year Sep–Aug). Selectable FYE: any month end.
- Phase within the month: `'decisions' | 'resolved'`. The UI's turn flow: inbox & events →
  decisions (commands) → optional board meeting (commands) → End Month → summary.
- **Sub-steps.** Months with capacity crunches run the capacity-sensitive parts of the
  division models in weekly sub-steps (4 per month): grain receiving/drying in harvest months
  (wheat: June–July; corn/soy: September–November), custom application in spring (March–May)
  and fall NH3 (October–November). Everything else runs monthly (D-008).
- **Field days.** Weather yields workable field days per month and per week; these drive
  application capacity, harvest pace (thus the peak receiving demand), and NH3 window.

### 3.2 Annual calendar (defaults; FYE-relative items move with FYE)

| Month | Business rhythm | Co-op cycle (FYE Aug) |
|---|---|---|
| Jan | winter meetings, prepay, seed booking, winter fill | regional patronage checks arrive |
| Feb | prepay, propane heating peak | |
| Mar | spring NH3, fertilizer move starts | |
| Apr | planting crush, spring application peak | |
| May | planting, post-emerge spraying | budget drafted |
| Jun | wheat harvest starts, spraying, **summer fill** | |
| Jul | wheat harvest, summer fill | budget and capital plan approved |
| Aug | slow, pre-harvest repairs | **fiscal year end** |
| Sep | early corn/soy harvest, fall fill | audit fieldwork |
| Oct | harvest peak, drying propane, fall NH3 | audit (1–2 mo) → management letter |
| Nov | harvest end, fall NH3, fall fertilizer | patronage & redemption proposal; board vote |
| Dec | **tax-driven prepay**, year-end grain sales | annual meeting & elections; patronage paid |

### 3.3 Monthly tick order (`advanceMonth`)

Order matters for both realism and ledger correctness. Each step reads the results of earlier
steps; posting happens in the step that causes it.

```
 0. applyCommands(decisions)                     — via applyCommand, in order
 1. clock.advance                                — monthIndex++, fiscal period, era flags
 2. world.macro                                  — CPI, construction index, prime, lender rate
 3. world.weather                                — field days (weekly), HDD, crop condition,
                                                   harvest moisture, yield realization (at harvest)
 4. world.markets                                — futures, local basis by destination, inputs,
                                                   energy, livestock (historical/drift/procedural)
 5. events.scheduled                             — historical events whose (drifted) date is now;
                                                   regulations/tax/era rules switch on/off
 6. tech + regulation availability               — unlock/expire tech, brands, programs
 7. facilities.progress                          — construction, aging, condition decay,
                                                   breakdowns (stream 'facilities')
 8. people.monthly                               — leaders' state, turnover, labor market,
                                                   seasonal labor, vacancies → GM coverage penalty
 9. members.demographics                         — aging, death → estates, retirement, farm
                                                   exits/consolidation (structural pass in Jan),
                                                   new members, livestock exits
10. competitors.pricing                          — competitor prices and service this month
11. demand.generate                              — per member × product line seasonal demand
12. share.allocate                               — attractiveness → share of wallet (coop vs
                                                   each competitor), with inertia & grievances
13. divisions.operate (grain, agronomy, feed, energy, retail)
                                                 — volumes vs capacity (weekly sub-steps where
                                                   flagged), service failures → grievances,
                                                   purchases, sales, inventories, hedges,
                                                   contracts; post journal entries
14. crossDivision                                — shared-cost allocation, bundling memory update
15. finance.workingCapital                       — AR billing/collections/aging, bad debt,
                                                   prepay draw-down, AP, payroll, utilities,
                                                   insurance, taxes payable
16. finance.marketValuation                      — grain inventory & open contracts MTM; futures
                                                   variation margin; fertilizer/fuel LCM write-
                                                   downs
17. finance.depreciation + interest accrual
18. regionals.patronage & lender patronage       — when scheduled (cash + non-cash equity)
19. finance.treasury                             — borrowing base, line draw/repay (cash sweep),
                                                   term-loan service, margin-call funding;
                                                   liquidity crisis if base is exhausted
20. events.random                                — roll from probability tables shaped by state;
                                                   create inbox items (with or without choices)
21. ledger.close                                 — month-end trial balance; snapshot balances
22. invariants                                   — A = L + E; TB balances; equity subledger ties
                                                   to GL; cash flow reconciles (throws in dev/test,
                                                   logs + flags save in production)
23. finance.quarterEnd                           — covenant tests (quarterly) and lender reaction
24. annualCycle                                  — FYE close, audit timer, patronage proposal
                                                   window, annual meeting, elections, GM review,
                                                   budget season, regional equity revolvement
25. governance.monthly                           — member & director satisfaction, board
                                                   confidence, petitions, director-raised items,
                                                   next board agenda
26. competitors.strategy (quarterly)             — invest, price wars, fail, merge, approach us
27. people.notes                                 — each leader's monthly note & recommendation
28. scorecard + history.append + summary
29. lossConditions                               — fired, liquidation, absorbed
```

Steps 13–19 run per division in a fixed order (Grain, Agronomy, Feed, Energy, Retail, Corp).

---

## 4. Core state schema (abridged TypeScript)

```ts
interface GameState {
  schemaVersion: number;
  setup: GameSetup;                  // immutable after newGame
  clock: { monthIndex: number; phase: 'decisions' | 'resolved'; commandsThisMonth: number };
  drift: DriftPlan;                  // per-event time shifts & magnitudes (fixed at newGame)
  world: WorldState;
  markets: MarketState;              // current month + recent window (full series in history)
  members: MemberStore;
  competitors: Competitor[];
  coop: CoopState;
  ledger: LedgerState;
  equity: EquitySubledger;
  lender: LenderState;
  regionals: RegionalState;
  governance: GovernanceState;
  people: PeopleState;
  tech: TechState;
  events: EventState;
  inbox: InboxItem[];
  history: HistoryStore;
  scorecard: Scorecard;
  outcome: null | { kind: 'fired' | 'liquidated' | 'absorbed'; monthIndex: number; text: string };
}

interface GameSetup {
  coopName: string; startYear: number; startingMembers: number;    // 50..5000
  startingCapital: Cents; capitalPreset: 'shoestring'|'typical'|'well'|'custom';
  fiscalYearEndMonth: number;        // 1..12, default 8
  difficulty: 'easy' | 'normal' | 'hard';
  mapSeed: number; gameSeed: number;
  historyMode: 'strict' | 'drift';   // default 'drift'
  regionId: string;                  // 'eastern-central-corn-belt'
  fictionalizeBrands: boolean;
  scenarioId?: string;
}

interface CoopState {
  divisionsOpen: Record<DivisionId, boolean>;
  facilities: Facility[];
  policies: DivisionPolicies;        // §18
  staffing: Record<FacilityId, StaffingLevers>;
  trainingSafetyBudget: Cents;       // annual
  grain: GrainBook;  agronomy: AgronomyBook;  feed: FeedBook;  energy: EnergyBook;  retail: RetailBook;
  ar: ReceivablesBook;  ap: PayablesBook;  prepay: PrepayBook;
  budget: Budget | null;  capitalPlan: CapitalProject[];
  reputation: { community: number; safety: number; employer: number };
  safetyRecord: SafetyRecord;
}
type DivisionId = 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'CORP';
```

Every subsystem section below gives its own schema.

---

## 5. Data layer

### 5.1 Confidence
```ts
type Confidence = 'high' | 'medium' | 'low';
interface Sourced<T> { value: T; confidence: Confidence; source?: string; note?: string }
interface AnnualPoint { year: number; value: number; confidence: Confidence; source?: string }
```
Every historical value, cost anchor, and calibration constant is `Sourced` or an
`AnnualPoint`. `npm run data:review` walks the data registry and writes `docs/DATA_REVIEW.md`
listing every medium/low item with file, key, value, and note.

### 5.2 Files (`src/data`)
| File | Contents |
|---|---|
| `markets.ts` | annual series 1970→latest for every market (§6.3), seasonality profiles, volatilities, correlations, procedural parameters |
| `macro.ts` | CPI, construction-cost index, prime rate, BC/CoBank spread, land values, net farm income, tax rates |
| `history.ts` | historical events (§17.1) |
| `randomEvents.ts` | random event definitions (§17.2) |
| `brands.ts` | brands, regionals, suppliers, buyers, railroads, equipment, competitors' real names, with `availableFrom/To`, `successor`, `fictionalName` |
| `facilities.ts` | facility catalog: types, capacities, cost anchors (2024 $), build time, staff, licences, depreciation lives |
| `tech.ts` | technology tree |
| `regions/eccb.ts` | the Eastern/Central Corn Belt region definition |
| `agronomics.ts` | era application rates per acre, seed/chem $/acre, yields & trend, diesel/acre, drying propane |
| `livestock.ts` | rations, feed tons per head-year, structural trends by species |
| `names.ts` | given names by birth decade, surnames (Midwest mix), town-name parts, co-op name patterns |
| `leaders.ts` | trait definitions, skill→effect table, salary bands, note templates per voice |
| `tuning.ts` | all model coefficients (attractiveness weights, elasticities, margins, probabilities, board weights …) grouped by system, each `Sourced` |
| `law.ts` | tax regimes, Subchapter T parameters, DPAD/199A, Capper-Volstead rule, UST rules, ELD, etc. dated |
| `scenarios.ts` | scenario starts |
| `glossary.ts` | glossary entries used by tooltips |

Data files are TypeScript (typed, comment-able, tree-shaken). JSON is accepted where a file is
pure tables (e.g. names). A `registry.ts` re-exports everything for the review tool.

---

## 6. World

### 6.1 Region definition (data)
```ts
interface RegionDef {
  id: string; name: string;
  cropMix: { crop: CropId; shareOfCropland: AnnualPoint[] }[];  // corn, soy, srw wheat, hay/other
  livestock: { species: SpeciesId; headPerThousandAcres: AnnualPoint[]; farmsTrend: AnnualPoint[] }[];
  yieldTrend: Record<CropId, AnnualPoint[]>;                 // bu/acre regional trend
  weatherRisk: { droughtProb; wetSpringProb; wetFallProb; derechoProb; floodProb };
  farmSize: { meanAcres: AnnualPoint[]; sizeClassShares: AnnualPoint[][] };
  townsRange: [15, 40]; countiesRange: [3, 6];
  basisGeography: { riverTerminalProb: number; processorDensity: number };
}
```
Shipping region: `eccb` (Indiana/Illinois/Ohio-like). Crops: corn, soybeans, SRW wheat.
Livestock: hogs (farrow-to-finish → finishing contract), dairy, beef cow-calf, cattle on feed,
contract poultry (layers/turkeys).

### 6.2 Territory generation (from `mapSeed`)
- Place 3–6 counties as a jittered grid of ~24×24 mile cells; one county seat per county
  (pop 3k–25k), 15–40 towns total (pop 100–3k), Poisson-disc spacing ≥ 5 miles.
- Highways: minimum spanning tree over towns plus extra edges (Gabriel graph), with 1–2
  US/state highways designated "major" (affects retail traffic).
- Rail: 1 Class I main line crossing the area (shuttle-capable), 1–3 branch lines with
  `abandonmentRisk` (Staggers 1980 raises it). Railroad owners drawn from the era-gated
  `brands.ts` list for the region; branches can be sold to fictional short lines.
- 0–1 river terminal within 30–80 miles (off-map node with a trucking distance), plus off-map
  destinations: processors (soy crush, corn wet mill), feeders, later ethanol plants (built by
  events/competitors), export via rail (shuttle) or river.
- Voting districts: board districts are contiguous groups of towns, balanced by member count
  at founding; redistricting is a bylaw action.
- Each town: `{ id, name, countyId, x, y, population(year), onHighway, onRail: RailLineId|null,
  distanceTable }`. Distances are precomputed shortest road paths.

### 6.3 Markets
Monthly series (current value in `markets`, full series in `history`):

| Group | Series |
|---|---|
| Grain | corn, soybean, wheat (SRW) nearby futures + the futures strip (5 contract months) for spreads; local basis by destination type |
| Feed/livestock | soybean meal, DDGS (2000s+), lean hogs (live hogs pre-1997), live/feeder cattle, Class III / all-milk |
| Energy | WTI crude, diesel (rack), gasoline (rack), propane (Conway/Mt Belvieu), natural gas (Henry Hub) |
| Fertilizer | anhydrous, urea, UAN28, DAP, potash (Corn Belt retail and wholesale) |
| Money | prime, co-op lender rate, 3-mo T-bill |
| Macro | CPI-U, construction cost index, farmland $/acre (region), net farm income index |
| Yields | regional realized yield by crop (weather-shocked) |

**Building the series.** Annual history (from my knowledge, spot-checked by web search where
available; each point with confidence) → monthly via (a) cubic interpolation of annual
anchors, (b) data-defined seasonality (e.g. corn lower at harvest, propane higher in winter,
fertilizer higher in spring), (c) known historical monthly spikes encoded as event overlays
(e.g. 1973 soybeans in June, 2008 peaks mid-year, 2012 drought July–August), (d) small
AR(1) noise. Futures strip: nearby ± carry derived from a stocks-to-use proxy; inverted in
short-crop years.

**Basis model.** Local cash bid = futures + basis. Basis per destination =
`destinationBasis(month) − freight(distance, mode, era) − competitionAdj`. Destination basis
has seasonality (wide at harvest, narrows into summer), widens on rail/river disruptions,
narrows when an ethanol plant or crush plant opens nearby.

### 6.4 History modes and drift
At `newGame`, `drift: DriftPlan` is sampled once:
- **strict**: all shifts 0, magnitudes 1.0, market noise still present (small).
- **drift** (default): each historical event with `driftable: true` gets
  `shiftMonths ∈ [−24, +24]` (triangular, mode 0) and `magnitude ∈ [0.6, 1.4]`, subject to
  ordering constraints (`after: ['evt-id']`) so causality holds (e.g. CoBank cannot form before
  the 1987 Act). Structural/legal facts (tax rates, brand dates, regulations) are **not**
  drifted (D-009).
- Market series are decomposed into `trend` (centered 5-year smooth) + `deviation`. Each
  market-moving event owns a deviation window; drift time-shifts and rescales that window and
  re-blends it with the trend, so the 2012 price spike moves with the 2012 drought. Residual
  deviations get fresh noise.

### 6.5 After the data ends
Procedural continuation: log-price mean-reverting processes around inflation-adjusted
long-run means with a correlation matrix (corn/soy/wheat/meal/fertilizer/natgas/crude),
regime switching (boom/normal/bust with data-defined transition matrix), CPI drift 2–3%,
rate regime, and generated events (droughts, policy shocks, consolidation) from the random
event engine with "modern era" tables.

### 6.6 Weather
Per month: workable field days (weekly), heating degree days, precipitation anomaly; per year:
crop condition path → realized yield vs trend (drought years from history/drift, otherwise
sampled), harvest moisture distribution (drives drying revenue and propane), vomitoxin /
aflatoxin risk, prevented-planting share.

---

## 7. Members, customers, demand, share of wallet

### 7.1 Member schema
```ts
interface Member {
  id: number; name: string; birthYear: number; townId: TownId; districtId: DistrictId;
  kind: 'member' | 'nonmember';          // non-member customers tracked too
  status: 'active' | 'inactive' | 'retired' | 'deceased' | 'estateOpen' | 'estateSettled';
  joinedMonth: number;
  acres: Record<CropId, number>;        // this year's planted acres
  livestock: Record<SpeciesId, number>; // head (poultry: contract houses × capacity)
  sizeClass: 'small' | 'mid' | 'large' | 'mega';
  loyalty: number;           // 0..1
  priceSens: number;         // 0..1
  serviceSens: number;       // 0..1
  creditNeed: number;        // 0..1 (rises in bad years)
  satisfaction: number;      // 0..100, EMA of monthly experience
  grievances: Grievance[];   // bounded (≤6), each {kind, division, month, severity}, decays
  relationship: Record<DivisionId, number>;     // with our sales staff
  share: Float32Array;       // current share of wallet per product line (coop's share)
  ytd: { volume: Float32Array; margin: Float32Array; sales: Float32Array }; // per product line, fiscal YTD
  successorId?: number;      // heir who takes over the farm
  isDirector?: boolean;
  weight: number;            // farms represented by this record (1 unless > cap; D-010)
}
```
Equity is **not** on the member record; it lives in the equity subledger (§11.4).

### 7.2 Generation
At newGame: members drawn from the region's era farm-size distribution and town populations;
`startingMembers` sets the number of member records; the trade territory acreage is the sum.
Non-member customers are generated at ~15–35% of member count (data), more around highway
towns. Names from `names.ts` by birth decade; ages from the era farm-operator age distribution
(median ~51 in 1970 rising to ~58 by 2020).

### 7.3 Structural trends (January pass + monthly deaths)
- Mortality by age (data table) → estate opens; retirement probability rises from 62; on
  exit, land goes to a successor (if any), to neighbors (consolidation: larger, younger, more
  price-sensitive farms absorb acres, with a bias to farms already large), or to a non-member.
- Livestock exits follow `livestock.ts` trends (e.g. small hog farms vanishing late 1990s,
  dairy consolidation); remaining operations scale up.
- New members: young farmers and in-migrants join at a rate tied to satisfaction and
  reputation; non-member customers convert based on patronage paid.
- Calibration target: member count falls ~60–70% over 1970–2024 in a stable territory while
  acres/farm roughly triples; total acres roughly constant (minus urban creep).

### 7.4 Product lines (fixed enum)
```
GRAIN_CORN GRAIN_SOY GRAIN_WHEAT  DRYING  STORAGE
FERT_N  FERT_PK  LIME  CROP_PROTECTION  SEED  APPLICATION  PRECISION
FEED_SWINE FEED_DAIRY FEED_BEEF FEED_POULTRY FEED_OTHER
FUEL_DIESEL FUEL_GAS PROPANE_HEAT PROPANE_DRYING LUBES
RETAIL_FUEL RETAIL_STORE TIRES_SERVICE
```
Each line belongs to a division, has a demand function (data), a season profile, and a
capacity binding (which facility capacity limits it).

### 7.5 Demand
`demand[member][line][month] = f(acres, livestock, era rates, weather, prices)`, e.g. N
demand = corn acres × era N rate × (1 − prevent-plant) × price elasticity, split between fall
and spring by weather; propane heating = household base × HDD; drying propane = corn bushels
× harvest moisture excess × gal/point. Retail demand is per town population and highway
traffic, not per member.

### 7.6 Share of wallet (attractiveness model)
For each member *m* and product line *ℓ* with positive demand, each supplier *s*
(our co-op and every competitor with a facility serving *ℓ* within reach) gets a utility:

```
U(m,ℓ,s) = wP(m)·pricePosition(s,ℓ)        // cents/unit vs the market, normalized
         − wD(m)·distance(m,s)·freightPerMile
         + wS(m)·serviceQuality(s,ℓ)        // staffing, condition, tech, manager skill
         + wC   ·capacityScore(s,ℓ)         // harvest wait, application timeliness (memory)
         + wR   ·creditTerms(s)·creditNeed(m)
         + wRel ·relationship(m,s)
         + wL   ·loyalty(m)·[s is incumbent]
         + wPat ·expectedPatronage(s,ℓ)     // last 3 yrs cash patronage + equity paid, perceived
         + wB   ·bundle(m,s)                // how many other divisions m already buys from s
         − wG   ·grievances(m,s,ℓ)
```
Weights come from `tuning.ts`, modulated by member sensitivities (large farms: high wP, want
volume pricing; small farms: high wS). Target share = multinomial logit with scale `θ`;
realized share moves toward target with inertia `λ` per month (sticky, so price cuts take
seasons to win accounts and bad experiences lose them faster than good ones win them back —
asymmetric λ). Bad experiences add grievances that decay over ~24 months.

Large farms can request **volume pricing / direct-ship deals** (inbox item → policy
exception), trading margin for retention.

Non-patronage: volume from non-member customers is tracked separately per line for patronage
and for the **Capper-Volstead** test (non-member business ≤ member business, by value) —
monitored on the dashboard; breach triggers counsel warning, then legal-risk events.

---

## 8. Facilities (common model)

```ts
interface Facility {
  id: FacilityId; type: FacilityTypeId; name: string; townId: TownId; division: DivisionId;
  ownership: 'owned' | 'leased' | 'jv';
  status: 'planned' | 'underConstruction' | 'operating' | 'mothballed' | 'closed';
  builtYear: number; acquiredMonth: number;
  capacity: Record<string, number>;     // e.g. { storageBu, receiveBuHr, dryBuHr, loadoutCars, ... }
  components: FacilityComponent[];       // bins, dryer, leg, scale, tanks, blend tower, trucks…
  condition: number;                     // 0..100
  techLevel: number; techs: TechId[];
  licenses: License[];                   // warehouse licence, bond, NH3, UST, feed, …
  envLiabilities: EnvLiability[];        // known/hidden; found via due diligence or events
  book: { cost: Cents; accumDep: Cents; lifeYears: number; method: 'SL' };
  construction?: { startMonth; completeMonth; budget: Cents; spent: Cents; overrunRisk };
  lease?: { monthly: Cents; termEndMonth: number };
}
```
- **Catalog** (`facilities.ts`): each type/component with era availability, capacity units,
  2024-$ cost anchor (low/high), build months, permit months, staff per unit, depreciation
  life, condition decay per year, repair cost curve. Cost in a year =
  anchor × constructionIndex(year)/constructionIndex(2024).
- **Ways in:** build (capital project → board approval above threshold → permits →
  construction with overrun risk); buy (marketplace of facilities from retiring independents
  and failing competitors; due diligence reveals condition and hidden env liabilities with
  probability by CFO/Safety skill and diligence spend); lease; JV (§14.6); merger.
- **Lifecycle:** depreciation; condition decay accelerated by over-utilization; breakdowns
  (probability ↑ as condition ↓) cause outages in peak; repairs (expense) vs upgrades
  (capitalized); mothball (low fixed cost, condition still decays slowly); close (sale or
  scrap; community and director reaction, particularly hometown directors; members in that
  town lose distance advantage).

---

## 9. Divisions

Each division module implements:
```ts
interface DivisionModule {
  id: DivisionId;
  isOpen(state): boolean;
  operate(ctx: TickContext): DivisionMonthResult;   // volumes, service outcomes, journal lines
  capacityReport(state): CapacityReport;
  policySchema: PolicySchema;                       // UI renders policy controls from this
}
```
The division manager (or GM if vacant) executes within policy; their skills modify the
mechanics through the skill→effect table (§15.2).

### 9.1 Grain
**State**
```ts
interface GrainBook {
  inventory: Record<Commodity, { ownedBu; ownedCostBasis: Cents; storedForOthersBu; dpBu; whrBu; qualityRisk }>;
  byFacility: Record<FacilityId, Record<Commodity, number>>;
  purchaseContracts: GrainContract[];   // forward cash, basis, HTA, DP, min-price…
  saleContracts: GrainSale[];           // to processors/exporters/feeders/ethanol
  futures: Record<Commodity, Record<ContractMonth, { contracts: number; avgPrice: number }>>;
  marginAccount: Cents;                 // initial + variation margin on deposit
  limits: PositionLimits;               // board-set
  railCarsOrdered: …; shuttleSlots: …;
}
type GrainContractKind = 'spot' | 'forwardCash' | 'basis' | 'hta' | 'delayedPrice'
                       | 'openStorage' | 'warehouseReceipt' | 'govLoan';
```
Contract availability is era-gated (HTA boom mid-1990s; government loan/warehouse receipt
programs per era).

**Monthly operation**
1. *Farmer receipts.* Harvest flow (weekly sub-steps) = member production × our share ×
   harvest pace (field days). Farmers' marketing mix (sell at harvest / store at our elevator /
   store on farm / contract ahead) depends on carry, basis, era, and farm size (large farms
   store on-farm and deliver later; on-farm storage grows over decades).
2. *Receiving capacity.* Throughput limited by pit/leg bu/hr, dryer bu/hr (wet corn), scale,
   hours, and available space (storage + shipping out + ground piles). Excess demand → queue
   wait time → grievances and lost bushels to competitors this week. Wait time is the
   harvest's key visible metric.
3. *Shrink and quality.* Moisture shrink (standard factor: 1.4%/point for corn over 15%, by
   commodity in data), handling shrink 0.25–0.5%, quality risk rises with ground piles, age,
   and poor condition; out-of-condition events.
4. *Pricing.* Our bid basis vs competitors' set by policy posture (aggressive/market/premium
   = narrower/at/wider-than-market by data cents) adjusted by manager merchandising skill.
5. *Merchandising (sales).* Manager allocates shipments to destinations to maximize
   (destination basis − freight) subject to load-out capacity, car/shuttle availability, and
   the carry decision: if the futures spread + basis appreciation > storage cost of
   carry (interest + shrink + handling) the grain is held. Shuttle loaders get premium freight
   but must load ~400,000 bu within the window: failing the window costs demurrage/penalties.
6. *Hedging.* Net position = owned + purchase contracts priced − sale contracts priced
   ± futures. Policy target: fully hedged within board limits (bu net long/short per
   commodity). The executed hedge deviates by `slippage` and `bias` (Gunslinger trait,
   Merchandising skill). Over-limit positions persist only if the manager hides them
   (rogue-trader event) or the board approved speculation.
7. *Margin.* Variation margin daily → modeled monthly from futures change × contracts; margin
   calls drawn on the line of credit (borrowing base advance on hedged grain helps; a rally
   with a full house can exhaust the line — the 2008/2021–22 liquidity crisis).
8. *Revenue lines.* grain sales (at contract price), cost of grain sold (purchases +
   hedge gains/losses + inventory MTM change), storage fees (open storage, monthly), drying
   charges (per point per bushel), handling/in-out, DP service charges, freight.
9. *Valuation.* Owned grain and open contracts marked to market (futures + local basis);
   futures at settlement; changes flow through cost of grain sold, as co-op elevator
   accounting does.
10. *Compliance.* Licensed capacity vs bushels; bond requirement scales with obligations to
   farmers; state indemnity fund assessments; inspections; dust/entrapment safety risk ∝
   throughput × (1 − safety factors).

### 9.2 Agronomy
- **Facilities:** dry plant (tons, blend tower rate, load-out), liquid tanks, NH3 storage +
  nurse tanks/toolbars, chem warehouse (containment), seed warehouse + treater, application
  fleet (floaters, sprayers, spreaders, tenders with acres/day), lime, precision services,
  hub plant + satellites (modern era).
- **Position business.** Products held as inventory layers `{tons, costPerTon, month}`; the
  purchasing policy sets *summer fill* and *winter fill* targets as % of expected season
  demand vs hand-to-mouth. Monthly LCM test writes down layers above replacement cost
  (2008–09). Supplier fill programs offer discounts for early commitment.
- **Crop protection:** sales margin + manufacturer rebates earned by volume tiers per brand
  (accrued monthly as a receivable, paid annually; tier misses reverse accruals).
- **Seed:** booked in winter, delivered spring, returns allowance, treatment income,
  seed-brand agency commissions where applicable.
- **Custom application:** capacity = Σ machines × acres/day × workable days (weekly). Demand
  over capacity → late acres → grievance (severity ∝ delay; tight springs lose accounts).
  Fees $/acre by era. Precision ag services from mid-1990s via tech tree.
- **Customer finance:** prepay programs (cash in → `customerPrepay` liability, often with a
  discount), credit terms (net 30 / due at harvest / interest after 30), input financing
  (third-party or regional programs from 1990s), AR aging; bad debt rate rises with low net
  farm income, high credit need, and loose policy.
- **Compliance:** NH3 safety, containment, applicator licensing (by staff), nutrient rules
  (post-2014 in certain watersheds), drift complaints (dicamba 2017).

### 9.3 Feed
- Mill capacity tons/yr; grind-and-mix vs pelleting; bagging line; micro-ingredient
  automation reduces error/shrink; bulk trucks; warehouse.
- Demand = territory livestock × rations × share. Margin $/ton by posture; ingredients bought
  at market (corn from our grain division at transfer price = market, meal, DDGS from mid-
  2000s, premix). Toll milling contracts with integrators: big volume, thin margin,
  termination risk (concentration).
- Under-utilization: fixed costs (staff, depreciation) spread over fewer tons — an under-used
  mill bleeds visibly.
- Compliance: medicated feed (VFD 2017), FSMA feed rules (2016+), biosecurity events (PRRS,
  PEDv 2013–14, HPAI 2015/2022, ASF risk) affecting volume.

### 9.4 Energy
- Bulk plant, propane storage (30k gal tanks), bobtails/transports, customer tank leasing
  (asset + rental income), lubes warehouse, cardtrol sites, tank monitoring, DEF (2010+).
- Margin ¢/gal by product and posture; demand = farm diesel per acre, residential/farm
  propane × HDD, drying propane × harvest moisture.
- **Contracts:** prebuy/fixed-price contracts create obligations; policy says cover with
  physical supply contracts or hedge; uncovered contracts are exposed. Supplier allocation
  limits in shortages (2013–14 propane; 1973–74 fuel allocation).
- Route density: cost per delivery ∝ miles/stop; driver availability (shortage era).
- **Compliance:** UST rules (1988, 10-year upgrade deadline 1998 → upgrade/close decision per
  site), SPCC, hazmat CDL, ELD (2017), fuel spec changes (unleaded, E10/E15, ULSD 2006,
  biodiesel blends) requiring tank/pump investments or supplier changes.

### 9.5 Retail and stations
- Station (+ C-store), farm & home/hardware, tire & service, lawn & garden, country store.
- Traffic ∝ town population × highway factor × brand-flag strength; fuel ¢/gal + inside sales
  × inside margin (~30%) − shrink; hours/staffing levels.
- Mostly non-member business → Capper-Volstead tracking and non-patronage income (taxed).
- Competition: chain C-stores (Casey's expansion through the 1980s–2000s, Speedway…), farm
  big boxes (Tractor Supply, Rural King) arriving by era into county seats.

### 9.6 Cross-division effects
- **Bundling term** in utility (§7.6): each additional division a member buys from us raises
  utility in the others (diminishing).
- **Full-service location bonus:** a town with grain + agronomy + energy gives a relationship
  boost.
- **Shared costs:** trucks/staff/locations shared at the same town reduce fixed cost (data
  sharing factors); allocated to divisions by an allocation policy (volume/margin/headcount),
  visible as "allocated overhead" on departmental statements.
- **Relationship spillover:** a grievance in one division damages relationship in others at a
  reduced weight.

---

## 10. Ledger and statements

### 10.1 Chart of accounts (excerpt; full list in `src/engine/ledger/coa.ts`)
```
1000 Cash                      1100 Accounts receivable (sub: aging buckets)
1150 Allowance for bad debt    1160 Rebates receivable     1170 Notes receivable
1200 Grain inventory (MTM)     1210 Agronomy inventory     1220 Feed inventory
1230 Energy inventory          1240 Retail inventory
1300 Prepaid supplier deposits 1310 Margin deposits        1320 Open grain contracts – gains
1400 Investments in other cooperatives (sub: per regional, lender)
1500 Land  1510 Buildings & structures  1520 Machinery & equipment  1530 Vehicles
1540 Construction in progress  1590 Accumulated depreciation
2000 Seasonal line of credit   2100 Accounts payable       2110 Grain payables (incl. DP liability)
2120 Open grain contracts – losses   2130 Customer prepayments   2140 Accrued expenses
2150 Patronage payable (cash)   2160 Equity redemptions payable   2170 Income tax payable
2200 Current portion of term debt   2300 Long-term debt   2310 Deferred taxes
3000 Membership (common) stock  3100 Preferred stock
3200 Allocated equity – qualified (sub: vintage)   3300 Allocated equity – nonqualified (sub: vintage)
3400 Unallocated retained earnings   3900 Current-year net savings (closing)
4xxx Sales by product line      5xxx Cost of goods sold by product line
6xxx Service & other income (storage, drying, handling, application, delivery, finance charges, tank rent)
7xxx Operating expenses (salaries & wages, benefits, payroll tax, depreciation, repairs, insurance,
     utilities, fuel for own use, property tax, bad debt, professional fees, travel, training/safety,
     dues, advertising, rent, IT, allocated overhead) 
8000 Interest expense   8100 Patronage income – regionals   8110 Patronage income – lender
8200 Other income / gain on sale  8300 Non-operating   9000 Income tax expense
```
Every journal line carries `division`. Corporate/admin is `CORP` and allocated by policy for
departmental views (both "before allocation" and "after allocation" views).

### 10.2 Journal
```ts
interface JournalEntry { id: number; monthIndex: number; source: string; memo: string;
  lines: { account: AccountId; division: DivisionId; amount: Cents; ref?: string }[] } // +debit −credit, Σ=0
```
`post()` validates Σ=0 and account existence, updates running balances
`balances[account][division]`, and appends to the month's journal.

### 10.3 Statements (derived)
- **Income statement** by division and consolidated, in the co-op format: Sales → COGS →
  Gross margin → Service & other income → Gross revenue → Operating expenses (personnel,
  depreciation, repairs, insurance, utilities, bad debt, other) → Interest → **Local
  savings** → Patronage income (regionals, lender) → Savings before tax → Tax → **Net
  savings**. Periods: month, FYTD, fiscal year, trailing 12; comparisons to budget and prior
  year.
- **Balance sheet** at any month end.
- **Cash flow** (indirect method): net savings + depreciation + non-cash patronage (−) +
  working-capital changes; investing (capex, disposals, regional equity revolved); financing
  (line, term debt, patronage cash paid, equity redeemed, stock issued). Reconciles to Δcash.
- **Ratios:** working capital, current ratio, local leverage (total liabilities / local
  equity, where local equity excludes investments in other co-ops), owner equity %, term
  debt to net fixed assets, debt service coverage, return on local equity, days receivable,
  inventory turns, division contribution, Capper-Volstead ratio.

### 10.4 Fiscal year close
Revenue/expense accounts close to 3900; after the board's distribution vote, 3900 is
distributed to 2150 (cash patronage), 3200/3300 by vintage, 3400, and tax. Audit (1–2
months after FYE) can post adjusting entries (inventory count differences, bad-debt reserve,
accrual corrections) whose size depends on CFO skill and controls; produces a management
letter (findings become inbox items).

---

## 11. Patronage, tax, equity, redemption

### 11.1 Patronage-sourced vs non-patronage
Per product line, volumes/margins are tagged member vs non-member at transaction time.
Patronage-sourced income = margins on member business + allocable share of patronage
received from regionals/lender (patronage-sourced); non-patronage = non-member margins +
investment and other income (data rule set; D-011 describes the allocation of overhead
between the two by gross margin share).

### 11.2 Distribution proposal (built by player, voted by board)
```ts
interface PatronageProposal {
  fiscalYear: number;
  pooling: 'single' | 'byDivision';
  allocationBasis: Record<DivisionId, 'units' | 'sales' | 'margin'>;   // default grain units, others sales
  lossTreatment?: 'absorbUnallocated' | 'carryForward' | 'chargeAllocated' | 'netAgainstPools';
  pools: Record<PoolId, { cashPct: number; qualifiedRetainedPct: number; nonqualifiedPct: number;
                          unallocatedPct: number }>;   // of patronage-sourced savings
  pass199A: number;  // 0..1 share of 199A(g) deduction passed through (2018+)
}
```
Hard rule: for qualified allocations, cash ≥ 20% of the qualified patronage refund
(cash + qualified retained). The builder blocks invalid mixes. Preview shows: total cash out,
tax at co-op, member tax bills vs checks (count of members whose tax > check), equity ratio
after, covenant headroom, member satisfaction impact by segment, vote forecast.

### 11.3 Tax (Subchapter T, simplified but faithful)
```
taxable = patronageSourcedSavings − qualifiedAllocations(cash+qualified retained)
        − nonqualifiedRedeemedThisYear − perUnitRetainsPaid(n/a)
        + nonPatronageIncome − DPAD(2005–2017) − 199A(g) retained portion(2018+)
tax = federal(rate by year, brackets simplified) + state(flat, data)
```
- Federal rates: 48% (to 1978), 46% (1979–86), 1987 blended 40%, 34% (1988–92), 35%
  (1993–2017 top rate; graduated brackets for small co-ops modeled), 21% (2018+).
- DPAD: phased 3%/6%/9% (2005–06, 2007–09, 2010–17) of qualified production activities
  income, limited by 50% of W-2 wages.
- 199A(g) (2018+): ~9% of qualified production activities income capped at 50% of W-2
  wages; the "grain glitch" (2018, fixed March 2018 for tax years beginning 2018 — handled as
  a law-file entry) affects member pass-through behavior and competitor bids briefly.
- Nonqualified allocations taxed at co-op now; deduction on redemption (deferred tax asset
  tracked in 2310).
- Losses: NOL carryforward per era rules; board choice (§11.2 `lossTreatment`).

### 11.4 Equity subledger
```ts
interface EquitySubledger {
  // per member: vintage → [qualifiedCents, nonqualifiedCents] outstanding
  accounts: Map<MemberId, Map<number /*vintageFY*/, [Cents, Cents]>>; // serialized as arrays
  stock: Map<MemberId, { common: Cents; preferred: Cents }>;
  totalsByVintage: Map<number, [Cents, Cents]>;   // maintained incrementally
}
```
Invariant: Σ accounts by vintage = GL sub-balances of 3200/3300 by vintage, and
Σ stock = 3000/3100. Tested every month.

### 11.5 Redemption plans
Board sets a policy with an **annual budget** and an **ordered list of plans**; each plan
consumes budget in priority order:
- `estate` (on death; optional discount rate for early payout; always offered first by
  default),
- `ageOfPatron` (age threshold 65–72),
- `revolving` (oldest vintage first; target revolving period displayed),
- `percentagePool` (same % across all outstanding),
- `baseCapital` (target investment = k × member's share of last N years' business; pay down
  over-invested members, retain more from under-invested ones via allocation mix).
Order within a plan: vintage then member id (deterministic). Nonqualified redemptions
generate the tax deduction. Redemptions may be restricted by lender covenants.

Visible consequences: unfunded redemption obligation (allocated equity of inactive/deceased
members + vintages older than target period), **generational fairness meter** (share of
allocated equity held by members not active in last 3 years vs share of business from active
members), revolving period, and covenant trade-off.

---

## 12. Lender

```ts
interface LenderState {
  lenderId: string;   // 'bc-district' (to 1988) | 'cobank' (1989+) | 'bank-<fictional>'
  line: { commitment: Cents; drawn: Cents; rateSpread: number; maturityMonth: number };
  termLoans: { id; principal: Cents; balance: Cents; rate: number; fixed: boolean; amortMonths: number; purpose }[];
  borrowingBase: { eligibleAR: Cents; inventory: Cents; hedgedGrain: Cents; advanceRates; value: Cents };
  covenants: Covenant[];
  status: 'standard' | 'watch' | 'waiver' | 'specialCredit' | 'forcedAction';
  equityRequired: { pctOfAvgLoans: number };    // BC/CoBank stock purchase requirement
  relationship: number;                         // 0..100
}
```
- Rate = era base (prime or lender cost of funds) + spread (risk rating, CFO skill,
  relationship). 1980–81 prime above 20% flows straight into line interest.
- Borrowing base monthly; draws limited by min(commitment, base). Cash sweep keeps
  operating cash near a target.
- Covenants (quarterly, annual): min working capital, min owner equity %, max term debt /
  net fixed assets, min debt service coverage. Breach path: waiver request (fee, rate +bps) →
  tighter covenants/collateral → special credit (restrictions on patronage cash, redemptions,
  capex; lender-appointed consultant) → forced merger or liquidation (loss).
- BC/CoBank patronage: annual, partly cash, partly lender equity; borrowing requires equity
  investment in the lender. Commercial banks: no patronage, no equity requirement,
  different spreads and covenant strictness; can call loans in the farm crisis.
- Ag Credit Act 1987 → CoBank 1989 is a scheduled transition event (state migrates
  automatically, relationship carries).

---

## 13. Regional co-ops, suppliers, brands

```ts
interface Brand { id; name; fictionalName; category: BrandCategory; availableFrom: number; availableTo?: number;
  successor?: string; region?: string[]; confidence; source?; notes? }
interface RegionalCoop { brandId; programs: Program[]; patronageRatePct: AnnualPoint[] | procedural;
  cashPortion: number; revolvementYears: number; healthPath; bankruptcy?: { month; recoveryPct } }
interface RegionalState { affiliations: { regionalId; categories: ('grain'|'agronomy'|'feed'|'energy')[];
  since: number }[]; equityHeld: Map<regionalId, Map<vintage, Cents>>; purchasesYTD; }
```
- Affiliation determines supply source, sign/bag brand, rebate programs, and patronage. A
  local can affiliate with different regionals per category (realistic: energy with Cenex,
  agronomy with GROWMARK/FS, feed with Purina/Land O'Lakes).
- Regional patronage: % of purchases, paid ~30–50% cash, rest as regional equity (asset
  1400) that revolves on the regional's own schedule.
- Brand timeline drives renames (Harvest States → CHS) and failures (Farmland 2002, Agway
  2002 in strict history; their locals write off equity — a non-cash loss that hits owner
  equity % and covenants).
- Switching affiliations: contract exit terms, re-signage capex, lost programs, member
  confusion penalty; possible regional equity retained until revolved.
- `fictionalizeBrands`: UI and engine read names through `brandName(id)` which returns
  `fictionalName` when the flag is on. Title screen shows the non-affiliation notice.
- Real-name rule: real entities only do what is in `history.ts`; random events with
  negative valence target only fictional entities (`events/targeting.ts` enforces).

---

## 14. Governance

### 14.1 Bylaws (data constants, amendable by member vote)
```ts
interface Bylaws { boardSize: 7|8|9|10|11; districts: DistrictDef[]; atLargeSeats: number;
  termYears: 3; termLimit?: number; supermajority: number /*0.667*/; quorumPct: number;
  advisoryDirectors: number /*2000s+*/; capitalProjectApprovalThreshold: Cents;
  activeMemberDefinition: { minBusinessPerYear: Cents; lookbackYears: number };
  equityRedemptionAuthority: 'board'; memberPetitionPct: number }
```

### 14.2 Directors
Director = a member record + `{ stance: −1..1 (conservative..growth); literacy: 1..20;
tenure; termEnd; loyaltyToGM: 0..100; petIssues: PetIssue[]; faction?: FactionId;
relationships: Map<directorId, −1..1>; office?: 'chair'|'vice'|'secretary'; committees }`.

### 14.3 Proposals and votes
```ts
type ProposalType = 'budget' | 'capitalProject' | 'borrowing' | 'patronage' | 'redemptionPolicy'
  | 'creditPolicy' | 'positionLimits' | 'riskPolicy' | 'acquisition' | 'jv' | 'facilityClosure'
  | 'compensationBand' | 'auditor' | 'affiliationChange' | 'mergerRecommendation'
  | 'bylawRecommendation' | 'divisionSale' | 'speculativePosition';
```
Each proposal type has an **evaluator** that produces a merit vector
`{ npv, riskScore, memberCashEffect, equityRatioEffect, covenantHeadroom, townEffects,
divisionEffects, controversy }`.

Director support:
```
support = a·perceivedMerit + b·stanceFit + c·petIssueEffect + d·(gmConfidence−50)/50
        + e·factionPull + f·lobbying − g·controversy + noise(stream 'board.vote')
perceivedMerit = mix(trueMerit, headlineMerit, literacy/20)   // low literacy reacts to headlines
```
Yes if support > 0. Chair votes only to break ties (configurable). The player may
**lobby** (limited monthly political capital, recharges; spending it on a director raises
`f` for one vote and slightly affects `loyaltyToGM`), **amend** (re-evaluate), or **table**.
`previewProposal` shows the forecast with uncertainty bands (narrower with higher
Member Relations skill on the team).

Directors raise their own items (data templates conditioned on pet issues/state), set
demands with deadlines (become GM goals), and occasionally hold executive session (an
inbox item revealing only the outcome).

### 14.4 GM evaluation
Annually after the audit: goals (set in previous review + director demands) scored;
pay/bonus set; `boardConfidence` (0–100) updated. Monthly drift from results vs budget,
covenant status, safety incidents, member satisfaction, scandals, lost votes. If
confidence < 25 at a review (or < 15 at any meeting with a successful motion) → termination
(loss). A warning (“performance improvement plan”) precedes it.

### 14.5 Elections and annual meeting
- Staggered seats; nominating committee recruits from members (preference for satisfied,
  literate, mid-career); insurgent candidates appear when district dissatisfaction or a hot
  issue crosses thresholds, with platforms tied to the issue.
- Member voting: turnout ∝ |satisfaction − 50| + issue salience; vote choice by candidate
  platform vs member grievances, relationships (neighbors), incumbency.
- GM intervention: optional "speak for the record" (small boost to incumbents, reputational
  risk if insurgent wins or if seen as heavy-handed).
- Annual meeting: audit summary, patronage announcement, election results, Q&A whose tone is
  generated from the year (quotes from templated members).
- Member petitions (special meeting, director recall) when a threshold % of active members
  sign (threshold from bylaws).

### 14.6 Mergers, acquisitions, JVs
State machine per deal:
`approach → study (cost, months) → due diligence (reveals partner balance sheet, equity
obligations, facility condition, bad debt; accuracy by CFO skill & spend) → term sheet
(name, HQ town, board seat split, GM, equity carry-over method, redemption commitments) →
boards vote (ours via §14.3; theirs via their simplified board) → member info meetings →
member votes on both sides (supermajority of votes cast) → closing (consolidation journal:
fair-value assets/liabilities, equity carried over by vintage, goodwill/bargain gain) →
integration (systems, culture; temporary service penalties, cost synergies)`.
Also: buy an independent (asset purchase), sell a division (asset sale + gain/loss),
JV LLC with neighbors (equity-method investment; shared agronomy/feed company with its own
simplified P&L), and being the target (unsolicited approaches when weak; board may push it).

---

## 15. People

### 15.1 Leaders
```ts
type Role = 'CFO' | 'COO' | 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'SAFETY' | 'HR'
          | 'MARKETING' | 'IT';
interface Leader { id; name; birthYear; role: Role | 'location'; facilityId?;
  skills: Record<Skill, number>;        // 1..20, true values
  revealed: Record<Skill, [number, number]>; // ranges known to the player
  traits: TraitId[]; salary: Cents; expectation: Cents; loyalty; ambition; morale; burnout;
  hiredMonth; bonusPlan?; flags: { hiddenPosition?; embezzling? } }
type Skill = 'leadership'|'operations'|'sales'|'merchandising'|'finance'|'safety'|'memberRelations'|'innovation';
```
Role unlocks: by division openings and size (e.g. CFO at founding; COO at > N locations;
HR at > M employees; IT 1990s+). Vacant roles are covered by the GM with a fixed effect
penalty (effective skill = 6) and a GM time drain (less political capital).

### 15.2 Skill → effect table (data, shown in UI)
Each row: `{ role, skill, effectKey, formula: 'linear'|'logistic', min, max, description }`.
Examples:
| Role | Skill | Effect |
|---|---|---|
| Grain | Merchandising | basis capture ±; hedge slippage −; carry decision accuracy |
| Grain | Operations | receiving throughput +; shrink −; quality loss − |
| CFO | Finance | lender spread −; audit adjustments −; forecast error − (budget, previews) |
| Safety | Safety | incident probability −; insurance premium −; inspection outcomes |
| Agronomy | Sales | share-of-wallet utility +; rebate tier attainment |
| Agronomy | Operations | application acres/day + |
| any | Innovation | tech adoption time −, tech effect realization + |
| Marketing | Member Relations | member satisfaction +, vote forecast accuracy, election outcomes |
| COO | Operations | condition decay −, cost per unit − across divisions |
| HR | Leadership | turnover −, hiring pool quality + |
Traits apply modifiers (Disciplined Hedger: slippage ×0.5, never over-limit; Gunslinger:
merchandising +2, bias ≠ 0, hidden-position risk; Old School: −innovation, +relationship;
Rainmaker: +sales; Tight With a Dollar: −opex, −morale; Builder: capex overrun −, wants
projects; Coasting to Retirement: effects −20%, retirement soon).

### 15.3 Hiring pipeline
Internal promotion (location managers' skills grow with tenure and training), external
search (fee + 2–4 months; candidate pool quality from reputation, pay band, town size,
era labor market), poaching (cost, competitor retaliation). Candidates show skill *ranges*;
interviews and reference checks narrow them. Leaders: coaching, bonus plans, promotion,
retirement, burnout, poached by competitors, misconduct (hidden flags; audit or events
reveal).

### 15.4 Staffing levers (per facility)
`{ level: 'lean'|'standard'|'full'; pay: 'below'|'at'|'above' }` plus co-op-wide training &
safety budget. Effects: service quality, overtime cost, turnover, morale, accident risk,
seasonal labor cost (automatic). Era labor market tightness (data) affects wages and
vacancies (CDL drivers, applicators).

---

## 16. Competitors

**Fidelity choice (D-012): competitors use a simplified financial model**, not a full ledger.
```ts
interface Competitor { id; name; kind: 'coop' | 'independent' | 'national'; brandId?; townIds;
  facilities: Facility[];                // same schema, enabling acquisitions
  posture: Record<DivisionId, number>;   // price aggressiveness
  service: Record<DivisionId, number>;
  fin: { sales; margin; opex; equity; assets; debt; equityRatio; cash; allocatedEquity; badDebt } // annual-ish summary rolled monthly
  strategy: 'expand'|'hold'|'retrench'|'priceWar'|'sellOut';
  management: { aggressiveness; competence };
  patronageHistory: { year; cashPct; ratePct }[];   // for member comparison
  boardMood: number; }
```
Competitor AI (quarterly): invest (add capacity where share is contested; shuttle loaders
in the 1990s; national players build per history), set postures (price war if losing share
and financially strong), fail (equity ratio + cash thresholds), merge with each other, put
facilities on the market, approach us. National players' moves follow history (e.g. an
ethanol plant built per the ethanol build-out events, shifting local corn basis).

---

## 17. Events, history, technology, regulation

### 17.1 Historical events (`history.ts`)
```ts
interface HistoricalEvent { id; date: { year; month }; driftable: boolean; after?: string[];
  headline: string; body: string; confidence; source?;
  effects: Effect[];         // market overlays, rule changes, entity changes
  choices?: Choice[];        // e.g. "join the fuel allocation program"
}
type Effect =
  | { kind: 'marketShock'; series; shape: 'step'|'spike'|'ramp'; pct: number; months: number }
  | { kind: 'ruleOn' | 'ruleOff'; ruleId }
  | { kind: 'entity'; op: 'fail'|'rename'|'merge'|'form'; brandId; ... }
  | { kind: 'territory'; op: 'abandonBranch'|'buildEthanolPlant'|...; probability }
  | { kind: 'demand'; line; pct; months }
  | { kind: 'cost'; line; pct; months }
  | { kind: 'lender'; op; ... } | { kind: 'members'; op; ... } | { kind: 'news'; text }
```
The prompt's seed list is the starting content; I'll expand it in M1 (markets) and M7
(rules/entities).

### 17.2 Random events
`{ id; eraFrom; eraTo; baseProb; modifiers: [{ stateKey, factor }]; target; effects;
choices; headlineTemplates }`. Probability shaped by state (dust explosion ∝ throughput ×
(1 − housekeeping/safety/tech); embezzlement ∝ weak controls/CFO finance; out-of-condition ∝
ground piles × wet fall; etc.). Events with choices become inbox items that must be answered
(or auto-resolve to a default after a deadline).

### 17.3 Technology
`{ id; name; firstYear; cost; requiresSkill?: { role; skill; min }; requiresTech?; adoption
months; effects: Effect[] }`. Adoption time reduced by Innovation. Examples per the prompt
(two-way radio → AI tools). Effects are concrete (e.g. electronic scales: −0.1% weight error
shrink, −1 FTE per scale; tank monitors: −15% delivery miles).

### 17.4 Regulation
Rules in `law.ts` toggled by date or events: UST (1988, deadline 1998), Staggers (1980),
OSHA grain handling standard (1987), PSM/RMP for NH3 (1990s), CDL (1992), hazmat, VFD
(2017), FSMA, ELD (2017), Lake Erie nutrient rules (2014+), tax regimes. A rule can impose
capex deadlines (compliance projects), opex, licence requirements, or fines.

---

## 18. Player controls

### 18.1 Policies (per division, executed by manager)
```ts
interface DivisionPolicies {
  grain: { pricing: Posture; hedgeRatio: number; positionLimits: Record<Commodity, number>; contractsOffered: GrainContractKind[];
           storageRates; dryingRates; carryAppetite: 'low'|'normal'|'high' };
  agronomy: { pricing: Posture; fillPolicy: { summerPct; winterPct }; prepayDiscountPct; creditTerms; creditLimitPolicy;
              applicationPriority: 'firstCome'|'bigAccounts'|'prepaidFirst'; feePerAcre };
  feed: { pricing: Posture; tollMillingAppetite; ingredientCover: 'hand'|'30d'|'90d' };
  energy: { pricing: Posture; supplyCover: 'hand'|'covered'; prebuyProgram: boolean; fixedPriceProgram: boolean; tankLease };
  retail: { pricing: Posture; hours: 'limited'|'standard'|'extended' };
  corp: { overheadAllocation: 'volume'|'margin'|'headcount'; minCash: Cents; creditPolicy };
}
type Posture = 'aggressive' | 'market' | 'premium';
```

### 18.2 Commands (discriminated union)
`setPolicy, startCapitalProject, buyFacility, leaseFacility, sellFacility, closeFacility,
mothballFacility, upgradeFacility, hireLeader, fireLeader, coachLeader, setBonusPlan,
setStaffing, setTrainingBudget, changeAffiliation, negotiateLender, requestWaiver,
drawTermLoan, submitProposal, lobbyDirector, amendProposal, tableProposal,
holdBoardMeeting, answerEvent, startMergerTalks, mergerStep, adoptTech, communityAction,
setBudget, speakAtAnnualMeeting, setInterruptConfig`.

### 18.3 Pacing
- "Advance until something needs my attention": runs months until an interrupt fires
  (configurable: event requiring choice, covenant breach/warning, board demand, vote needed,
  margin call > X, cash below Y, leader resignation, harvest wait > Z, annual cycle steps).
- Leader monthly notes: templated per trait voice; their recommendation is computed from a
  forecast with error ∝ (20 − skill).

### 18.4 Explanations ("why did this happen")
Engine type `Breakdown { key; label; value; components: Breakdown[]; note? }`. Every major
number (division margin, net savings, share by line, member satisfaction, board confidence,
vote forecast, borrowing base, tax, covenant ratios) is produced with its Breakdown
(attribution of the change vs prior period/budget into drivers). UI shows it in a popover.

---

## 19. Scorecard and outcomes
Cumulative: member value (cash patronage, equity redeemed, estimated price advantage =
Σ volume × (our price position vs competitor average)), financial strength (equity %, DSC,
working capital trend), market share by line/town, safety (TRIR-like incidents, fatalities),
member satisfaction, employees, board confidence. Loss: fired; lender-forced liquidation;
absorbed on the other side's terms. Sandbox continues past the data's end. Scenarios
(M8): 1979 eve of the crash; 1998 merger wave; others.

---

## 20. UI
Desktop-first (min 1280px), dense tables, era flavor in headlines (typewriter/newspaper
styling for 1970s–80s, cleaner later), glossary tooltips (`<Term id="basis">`).
Screens: Title/New Game/Load; Dashboard; Map (SVG: towns, roads, rail by type, facilities
ours/competitors, share-by-town choropleth, draw areas); Divisions (tab each); Financials
(IS by division, BS, CF, budget vs actual, trend charts, drill-down: statement line →
account × division → month → journal entries); Equity & Patronage (vintages, redemption
modeler, proposal builder with previews); Board Room (directors, factions graph,
agenda, vote history, GM evaluation); Members (search, top accounts, satisfaction by
segment/district, at-risk); People (team, candidates, succession, staffing levers);
Markets (charts, basis, spreads, rates); Regional & Lender; News & Inbox; Annual Report;
Glossary. Keyboard: global shortcuts (E end month, A advance until attention, 1–9 screens).
UI state in Zustand: `{ game: GameState, ui: {...} }` — the store calls engine functions
and replaces `game`; the engine runs in a Web Worker in production builds if a month takes
> 100 ms on target hardware (decided in M2 after profiling; D-013).

---

## 21. Saves
- `SaveFile { schemaVersion; savedAt (ISO, set by UI layer); slotName; state: GameState }`,
  serialized with typed-array/Map encoders, compressed with the browser `CompressionStream`
  (gzip) in IndexedDB; JSON export is uncompressed `.json` (gzip optional).
- Autosave every month into a rolling `autosave` slot (+ keep last 3); named slots.
- `migrations: Record<number, (s: any) => any>` applied in sequence on load; each migration
  has a test with a fixture save.

---

## 22. Testing and the headless runner

### 22.1 Vitest
- Ledger: Σ lines = 0 per entry; trial balance; **A = L + E every month** (multi-year
  property run); cash flow reconciles to Δcash; equity subledger ties to GL by vintage.
- Patronage: 20% qualified cash rule; pool math; non-patronage split; loss treatments.
- Tax: rates by year, DPAD/199A caps, nonqualified redemption deduction.
- Redemption: each plan + combinations + budget exhaustion + determinism.
- Board vote: support function monotonicity, literacy effects, ties, supermajority.
- Determinism: same seed + same commands → byte-identical state hash after N months.
- Performance benchmark (§2.6).
- Migrations.

### 22.2 Headless runner
`npm run sim -- --start 1970 --years 55 --policy baseline --seeds 50 [--mode drift|strict]
[--members 400] [--out runs/]` → `runs/<timestamp>/{summary.md, years.csv, seeds.csv}`.
Policies are scripted bots in `src/engine/sim/policies/` (`baseline`, `reckless`,
`conservative`, `growth`), issuing the same Commands a player would (including board
proposals, which can fail). Outputs: survival rate by decade, failure causes, net savings %
of sales distribution, equity %, patronage cash, member counts, share. Tuning targets:
baseline survives ≥ 80% of seeds over 55 years; reckless fails in the 1980s or 2008 in
≥ 70% of seeds; median net savings 1–4% of sales.
