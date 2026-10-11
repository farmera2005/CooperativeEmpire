# Decisions log

Choices the build prompt left open, made on the realistic/simplest-defensible side. Each entry:
what, why, and how to reverse it. Newest at the bottom.

| ID | Decision | Rationale | Reversible? |
|---|---|---|---|
| D-001 | Clean-room repo; React 18 + TS strict + Vite + Tailwind + Zustand + Recharts + Vitest + `tsx`. Node 22. | Matches prompt; `tsx` runs the engine headless without a build step. | Yes |
| D-002 | Engine exposes `applyCommand` (intra-month) in addition to `advanceMonth(state, decisions)`. Both pure and deterministic. | Player must see a board vote or hiring result before ending the month; still satisfies the prompt's `advanceMonth(state, decisions)` contract. | Yes |
| D-003 | Engine copies the mutable working set on entry and mutates the copy; history chunks are append-only and shared. No Immer in the engine. | 5,000 members × many fields per month is too slow under Immer proxies. Input is never mutated, so purity holds for callers. | Yes |
| D-004 | RNG = sfc32 with named substreams seeded by hash(seed, month, stream, entity). | Adding a random draw to one system never perturbs others, keeping balance runs and saves stable across code changes. | No (save-affecting) |
| D-005 | Money stored as integer cents; unit prices as float dollars; rounding only at posting (banker's). | Ledger invariants must hold exactly. Safe integer range covers $90 trillion. | No |
| D-006 | All values are nominal dollars; UI can display charts in constant dollars. | Real co-op books are nominal; inflation is part of the history (1970s–80s). | Display only |
| D-007 | Journal entry detail kept for current FY + 2 prior; older years rolled into monthly balances by account × division. | 60+ years of detail would bloat saves; auditors and players rarely drill into 30-year-old entries. | Yes (config constant) |
| D-008 | Weekly sub-steps (4/month) only for capacity-bound activities: harvest receiving/drying (wheat Jun–Jul, corn/soy Sep–Nov), spring application (Mar–May), fall NH3 (Oct–Nov). | Harvest waits and application timeliness are decided in days, not months; everything else is fine monthly. | Yes |
| D-009 | History "drift" mode shifts/scales market-moving and event *timing* (±24 months, ×0.6–1.4) but never legal/structural dates (tax rates, brand dates, regulations, CoBank formation order). | Keeps the world plausible and real-name rules honest while removing hindsight. | Yes |
| D-010 | Individual member records capped at 5,000. If mergers would exceed it, records are merged into weighted "representative" records (`weight > 1`) by district and size class. | Meets the 5,000-record performance target while allowing large post-merger co-ops. | Yes |
| D-011 | Patronage vs non-patronage split: margins tagged at transaction; operating expenses allocated between the two by each division's member vs non-member gross margin share; patronage received from regionals/lender is patronage-sourced. | Standard practice and simple to audit. | Yes |
| D-012 | Competitors use a simplified financial model (annualized summary P&L and balance sheet), not a full ledger. Their facilities use the full Facility schema. | Enough for pricing, failure, and merger due diligence; a full ledger per competitor is cost without visible benefit. | Yes |
| D-013 | Engine runs on the main thread first; moved to a Web Worker only if a month exceeds 100 ms on target hardware (decided in M2 after profiling). | Avoid premature complexity; the API is already message-friendly (pure functions on serializable state). | Yes |
| D-014 | Tuning numbers live in `src/data/tuning.ts`; an ESLint rule flags numeric literals in `src/engine/**` (allowing 0, 1, -1, 2, 4, 12, 100 and `core/` utilities). | Enforces the data-driven pillar mechanically. | Yes |
| D-015 | Default allocation bases: grain by bushels per commodity, supplies by sales dollars; "by margin" available. Single pool default for co-ops with one division, by-division default once ≥ 2 divisions. | Common real practice. | Player choice |
| D-016 | Market history built from annual anchors + seasonality + encoded known monthly spikes + small noise, rather than a full monthly historical dataset. | No network data source assumed; monthly realism mostly comes from seasonality and known spikes. Correctable in `markets.ts`. | Yes |
| D-017 | Default fiscal year end August 31; audit takes 2 months; patronage vote in November; annual meeting and cash patronage in December (moves with FYE). | Matches many Corn Belt locals with August FYE. | Setup option |
| D-018 | Starting co-op founded at the start year as a new organization even though real co-ops of that era mostly existed already. | The prompt specifies the founding flow. | n/a |
