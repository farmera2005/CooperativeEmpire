# Agricultural Cooperative Tycoon

A single-player business simulation of a farmer-owned agricultural cooperative in the U.S. Corn Belt, 1970 onward.

Personal, non-commercial project. Not affiliated with or endorsed by any company named in the game.

## Run

```sh
npm install
npm run dev          # play at http://localhost:5173
npm run build        # static site in dist/
npm run share        # build and share over a Cloudflare quick tunnel (see below)
npm test             # Vitest: ledger invariants, determinism, data, performance
npm run typecheck    # engine (no DOM), app, tools
npm run lint:engine  # engine purity rules
npm run sim -- --start 1970 --years 55 --policy baseline --seeds 50   # headless runner → runs/
npm run data:review  # regenerate docs/DATA_REVIEW.md
```

## Docker

```sh
docker compose up --build        # play at http://localhost:8080
HOST_PORT=9090 docker compose up --build   # use another port if 8080 is taken
# or
docker build -t ag-coop-tycoon . && docker run --rm -p 8080:80 ag-coop-tycoon
```

The image build runs the typecheck, engine lint and test suite, then serves the static site with nginx.
Saves live in the browser's IndexedDB, so they survive container restarts (export JSON to move them).

## Share over the internet (Cloudflare Tunnel)

A Cloudflare Tunnel gives the game a public HTTPS address without opening ports on your router.
The game is a static site: each visitor plays their own game, and saves stay in their browser.

**Quick tunnel** (no Cloudflare account; a random `https://*.trycloudflare.com` address that lasts
until you stop it):

```sh
npm run share                      # build, serve, tunnel; prints the public address
npm run share -- --dev             # tunnel the dev server instead (hot reload)
docker compose --profile tunnel up --build   # same with Docker; the address is in the tunnel log
```

`npm run share` needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
installed (`brew install cloudflared`, `winget install --id Cloudflare.cloudflared`); the Docker
profile uses the official `cloudflare/cloudflared` image.

**Named tunnel** (your own hostname, e.g. `coop.example.com`):

1. In the Cloudflare dashboard (Zero Trust > Networks > Tunnels) create a tunnel and copy its token.
2. Add a public hostname for it pointing to `http://web:80` (Docker) or `http://localhost:4173` (`npm run share`).
3. Copy `.env.example` to `.env` and set `CLOUDFLARE_TUNNEL_TOKEN` and `TUNNEL_HOSTNAME`.
4. Run `docker compose --profile named-tunnel up --build -d`, or `npm run share`.

Anyone with a quick-tunnel link can open the game. To limit a named tunnel to people you choose,
put a Cloudflare Access policy on its hostname. `.env` is git-ignored; never commit the token.

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
