# Agricultural Cooperative Tycoon

A single-player business simulation of a farmer-owned agricultural cooperative in the U.S. Corn Belt, 1970 onward.

Personal, non-commercial project. Not affiliated with or endorsed by any company named in the game.

## Run

```sh
npm install
npm run dev          # play at http://localhost:5173
npm run build        # static site in dist/
npm test             # Vitest: ledger invariants, determinism, data, performance
npm run typecheck    # engine (no DOM), app, tools
npm run lint:engine  # engine purity rules
npm run sim -- --start 1970 --years 55 --policy baseline --seeds 50   # headless runner → runs/
npm run data:review  # regenerate docs/DATA_REVIEW.md
```

## Docs

- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Milestones: [docs/MILESTONES.md](docs/MILESTONES.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Data needing review: [docs/DATA_REVIEW.md](docs/DATA_REVIEW.md)
- Conventions: [CLAUDE.md](CLAUDE.md)
