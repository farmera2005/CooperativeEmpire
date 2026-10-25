# CLAUDE.md — project conventions

Agricultural Cooperative Tycoon: a single-player business sim of a Midwest farmer-owned co-op,
1970 onward. Design: `docs/DESIGN.md`. Plan: `docs/MILESTONES.md`. Choices: `docs/DECISIONS.md`.

## Clean room
Everything here is designed from the build prompt and `docs/`. Never read, copy, or adapt code,
data, or design from other games or projects on this machine.

## Architecture rules (hard)
- `src/engine/**` is pure TypeScript: no React, DOM, IndexedDB, `window`, `Date.now()`,
  `new Date()`, `Math.random()`, or I/O. It compiles under `tsconfig.engine.json` (no DOM lib).
- The UI only reads `GameState` and dispatches `Command`s through engine functions
  (`newGame`, `applyCommand`, `advanceMonth`, selectors). The UI never computes game results.
- Engine functions never mutate their input state.
- All randomness via named substreams: `rng(ctx, 'system.purpose', entityId?)`. Never share a
  stream across systems.
- **Money is integer cents** (`Cents`). Unit prices are float dollars. Round only when posting.
- **No balance changes outside the ledger.** Cash, inventories, equity, debt change only by
  `post(journalEntry)`; every line carries a `division`. Statements are derived, never stored.
- **Data-driven:** prices, costs, probabilities, dates, brands, and model coefficients live in
  `src/data/**` (typically `tuning.ts`), each with `confidence` and optional `source`. No magic
  numbers in engine logic.
- Real companies only do what `src/data/history.ts` records; negative random events may target
  only fictional entities. All people are fictional. Brand names go through `brandName(id)`
  (respects `fictionalizeBrands`).
- Iterate collections in deterministic order (arrays sorted by id). No logic depending on
  object key order or Map insertion order from non-deterministic sources.

## Code style
- TypeScript strict, ES modules, named exports, no default exports except React screens.
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for components. Tests beside code as `*.test.ts`.
- Small pure functions; tick steps are `(ctx: TickContext) => void` operating on the working copy.
- Every major computed number returns or records a `Breakdown` for the "why" UI.
- Comments explain *why* (domain rules, sources), not what.
- Tailwind for styling; no purchased assets; SVG for map and icons.

## Commands
- `npm run dev` — dev server; `npm run build` — static site; `npm run typecheck`
- `npm run share` — build and share over a Cloudflare Tunnel (in Docker, `docker compose up --build` runs the app service with the in-game Settings controls)
- `npm test` — Vitest (ledger invariants, finance math, determinism, benchmark)
- `npm run sim -- --start 1970 --years 55 --policy baseline --seeds 50` — headless runner → `runs/`
- `npm run data:review` — regenerate `docs/DATA_REVIEW.md`

## Workflow
- Build milestone by milestone; commit at each milestone (and at internal checkpoints);
  stop with a short "what to playtest" note.
- For open questions make the realistic choice and log it in `docs/DECISIONS.md` (D-nnn).
- Any data value added with medium/low confidence must be reflected by `npm run data:review`.
- Save-schema changes bump `SCHEMA_VERSION` and add a migration plus a fixture test.
- Before committing: `npm run typecheck && npm test` must pass.
