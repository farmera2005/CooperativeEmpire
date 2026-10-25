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
docker compose up --build                     # the app service: play at http://localhost:8080
APP_PORT=9090 docker compose up --build       # use another port if 8080 is taken
docker compose --profile static up --build    # also the plain nginx site at http://localhost:8081
```

The `app` service runs the game on its own Node server with the Settings sharing controls and
`cloudflared` built in (see below). It is published on this computer only (127.0.0.1); to play
from other devices on your network, use the `static` profile (`HOST_PORT` sets its port) or share
over a tunnel. The image build runs the typecheck, engine lint and test suite first. Saves live in
the browser's IndexedDB, so they survive container restarts (export JSON to move them).

Without Compose: `docker build --target app -t ag-coop-tycoon-app . && docker run --rm -p 127.0.0.1:8080:8080 -v coop-tunnel:/data ag-coop-tycoon-app`,
or the static site with `docker build -t ag-coop-tycoon . && docker run --rm -p 8081:80 ag-coop-tycoon`.

## Share over the internet (Cloudflare Tunnel)

A Cloudflare Tunnel gives the game a public HTTPS address without opening ports on your router.
The game is a static site: each visitor plays their own game, and saves stay in their browser.

**From the game:** open **Settings** (title screen, or `T` in a game) while running the game with
`npm run dev`, `npm run preview` or `npm run share`. Choose a quick or named tunnel, paste a named
tunnel's token and hostname, tick "start sharing whenever the game server starts" if you like, and
use **Start sharing** / **Stop sharing**; the public address appears with a Copy link button. The
controls answer only on this computer (at localhost): visitors coming through the tunnel cannot
see them or the token. Settings are kept in `.tunnel.json` (git-ignored, readable only by you).
Sharing stops when the game server stops.

**With Docker:** `docker compose up --build` starts the `app` service, which has these controls
and `cloudflared` built in; open http://localhost:8080 and go to Settings. The tunnel settings and
token are kept in the `coop-tunnel` Docker volume. The tunnel profiles below instead run
`cloudflared` in its own container in front of the plain nginx site (`web`).

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
