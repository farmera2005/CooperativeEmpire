# Milestones

Each milestone ends with a commit, a push, and a short **"what to playtest"** note.

**Definition of done (every milestone):**
- `npm test` passes (including ledger invariants and the determinism test).
- Playable through the new systems from a fresh start in **1970, 1985, and 2010**.
- `npm run sim -- --seeds 50` completes without errors for every start year above.
- `docs/DECISIONS.md` and `docs/DATA_REVIEW.md` (`npm run data:review`) are current.
- `npm run build` succeeds; `npm run typecheck` clean (engine tsconfig has no DOM lib).

---

## M1 — Foundation ✅ complete
- Scaffold: Vite + React + TS + Tailwind + Zustand + Recharts + Vitest + ESLint; `tsconfig.engine.json` (no DOM); scripts `dev, build, test, typecheck, sim, data:review`.
- Engine core: sfc32 RNG with named substreams; calendar/fiscal periods; Cents helpers; Breakdown type; clone; state hash.
- Ledger: chart of accounts, posting, trial balance, statements (IS/BS/CF) skeleton, invariant tests.
- Data schemas + first content: `markets.ts` and `macro.ts` annual series 1970→latest with confidence; seasonality; `law.ts` tax rates; `names.ts`; region `eccb`; facility catalog skeleton; `brands.ts` seed list; `history.ts` seed list (market effects only).
- World: territory generation (towns, counties, roads, rail, districts), weather, market series builder with strict/drift/procedural.
- Members: generation and demographics (aging, death/estates, retirement, consolidation).
- New-game setup screen (name generator, members, capital presets, start year, FYE, difficulty, seeds, history mode) and founding sequence stub (board elected, GM hired, lender and regional choice).
- Saves: IndexedDB autosave + named slots, JSON export/import, schema version + migration harness.
- Headless runner skeleton (runs empty co-op for N years, outputs CSV); `data:review` generator.
- UI shell: title screen with non-affiliation notice, Dashboard skeleton, Markets screen, Members list, Map (towns/rail/roads).
- **Playtest:** create co-ops in 1970/1985/2010, advance years, look at markets, map, member aging; save/load/export.

## M2 — Grain ✅ complete
- Facility model (build/buy/lease, construction, depreciation, condition, mothball/close), purchasable facility marketplace.
- Demand & share-of-wallet engine (first used by grain), competitor entities with grain bids (static AI).
- Grain division: receipts with weekly harvest sub-steps, drying, shrink, storage, contracts, merchandising and destinations, rail/shuttle, hedging, margin calls, MTM, fees, compliance basics.
- Seasonal line of credit + simple borrowing base (full lender in M4).
- Dashboard, Map (facilities, share by town), Grain division screen, Financials (IS/BS/CF, drill-down).
- Profiling → D-013 decision on Web Worker.
- **Playtest:** buy an elevator, run harvests, watch wait times, hedge, live through 1973 and 2008/2012.

## M3 — Agronomy, Feed, Energy, Retail ✅ complete
Internal checkpoints (commit each): M3a Agronomy → M3b Feed → M3c Energy → M3d Retail → M3e cross-division effects (bundling, shared costs, overhead allocation, Capper-Volstead tracking).
- **Playtest:** open each division; fill decisions vs 2008 collapse; spring application crunch; propane 2013–14; station traffic.

## M4 — Co-op finance ✅ complete
- Fiscal year close, audit, patronage proposal builder (pools, bases, cash/qualified/nonqualified/unallocated, 20% rule), Subchapter T tax with DPAD and 199A(g), loss treatments.
- Equity subledger by vintage, member patronage statements, five redemption plans + combinations.
- Full lender: BC → CoBank transition, lender equity and patronage, term loans, borrowing base, covenants and breach path; commercial bank alternative.
- Regional co-ops: affiliations, programs, rebates, patronage (cash + equity), revolvement, Farmland/Agway failures.
- Budget & capital plan; Equity & Patronage screen; Regional & Lender screen.
- **Playtest:** a full annual cycle; compare patronage mixes; survive 1980–86 rates and bad debt.

## M5 — Governance ✅ complete
- Bylaws, directors with factions, monthly board meeting and agenda, proposal evaluators, votes, lobbying/amend/table, director-raised items and demands, executive sessions.
- GM evaluation and confidence; termination loss.
- Elections, nominating, insurgents, annual meeting, member petitions, member votes (supermajority).
- Board Room screen.
- **Playtest:** pass a capital project, lose a vote, survive an insurgent slate, get evaluated.

## M6 — People ✅ complete
- Leadership roles, skills→effects table wired into every division, traits, hiring pipeline (internal/external/poach), hidden stats & interviews, coaching/bonuses, retirements, misconduct flags.
- Staffing levers per facility, training & safety budget, labor market by era.
- Leader monthly notes with skill-dependent accuracy. People screen.
- **Playtest:** hire a Gunslinger vs a Disciplined Hedger; run lean staffing through harvest.

## M7 — World in motion ✅ complete
- Competitor AI (invest, price war, fail, merge, approach us), nationals per history (shuttle loaders, ethanol plants, big boxes).
- Mergers/acquisitions/JVs/division sales full state machine.
- Historical events expanded with rule/entity effects and choices; random events; technology tree; regulations (UST, ELD, VFD, nutrient rules, etc.).
- News & Inbox polish; "advance until attention" interrupts.
- **Playtest:** 1998 merger wave from both sides; UST deadline; a dust explosion.

## M8 — Polish and balance ✅ complete (balance targets partly met; see status)
- Guided first year tutorial, glossary tooltips everywhere, "why did this happen" on every major number, Annual Report, Scorecard, scenarios (1979, 1998, +1).
- Balance passes with the runner: baseline ≥ 80% survival over 55 yrs; reckless fails in 1980s/2008; net savings 1–4% of sales.
- Accessibility and keyboard navigation; performance check at 5,000 members × 60 years.
- **Playtest:** a full 1970–2025 campaign.

**M8 status (50 seeds, 55 years each; drift history unless noted; after D-095–D-112):**

| Run | Survived | Median net savings | Target |
|---|---|---|---|
| Baseline from 1970 | 47/50 (94%) | 3.5% | met |
| Baseline from 1985 | 49/50 (98%) | 3.8% | met |
| Baseline from 2010 | 43/50 (86%) | 3.8% | met |
| Reckless from 1970 | 4/50 | 1.5% | met: 36 of 46 failures 1975–93 |
| Reckless from 2000, strict history | 24/50 | 1.9% | met: 12 of 26 failures in 2008–10, the largest cluster |

Farm-supply divisions (D-103, prudent bot, 10 seeds × 25 years): feed profitable in 96–100% of
division-years (median 3.6–4.7% of sales), energy 61–94% (4.6–6.3%), agronomy 85–100%
(3.6% from 1970, 8.2% from 2000). Retail is not built by the bots; a test co-op's retail earns
2–8% of sales across eras.

D-108's larger default trade area strengthened every co-op, the reckless one included; D-113 restored the reckless failure rates (the bot speculates in proportion to its receipts, and lenders move a co-op with equity under 25% of assets straight to special credit).

Engine errors: 0 in every run. Open balance work: the reckless co-ops that ride out 2008 and
fail decades later; agronomy in the 2000s at the top of its plausible range.
