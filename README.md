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

## Docker

```sh
docker compose up --build        # play at http://localhost:8080
# or
docker build -t ag-coop-tycoon . && docker run --rm -p 8080:80 ag-coop-tycoon
```

The image build runs the typecheck, engine lint and test suite, then serves the static site with nginx.
Saves live in the browser's IndexedDB, so they survive container restarts (export JSON to move them).

Headless balance runner in Docker (CSV output to `./runs`):

```sh
docker build --target sim -t ag-coop-sim .
docker run --rm -v "$PWD/runs:/app/runs" ag-coop-sim --start 1970 --years 55 --seeds 50
```

## Docs

- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Milestones: [docs/MILESTONES.md](docs/MILESTONES.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Data needing review: [docs/DATA_REVIEW.md](docs/DATA_REVIEW.md)
- Conventions: [CLAUDE.md](CLAUDE.md)
