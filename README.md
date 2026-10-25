# Agricultural Cooperative Tycoon

A single-player business simulation of a farmer-owned agricultural cooperative in the U.S. Corn Belt, 1970 onward.

Personal, non-commercial project. Not affiliated with or endorsed by any company named in the game.

## Run

```sh
npm install
npm run dev          # play at http://localhost:5173
npm run build        # static site in dist/
npm run share        # build and share over a Cloudflare quick tunnel (see below)
npm run admin:reset  # give the built-in admin account a new temporary password
npm test             # Vitest: ledger invariants, determinism, data, performance
npm run typecheck    # engine (no DOM), app, tools
npm run lint:engine  # engine purity rules
npm run sim -- --start 1970 --years 55 --policy baseline --seeds 50   # headless runner → runs/
npm run data:review  # regenerate docs/DATA_REVIEW.md
```

## Building facilities

Facilities are made of individual units — each bin, leg, dryer, scale, tank, truck and building,
with its maker, year, capacity and condition (Grain or Farm supply > Facilities > Manage). New
capacity comes from **projects** (Buy or build > Plan a project): pick models from the catalog
for the current year, compare makers' pros and cons, add land, and approve; each line comes into
service as it is finished. Worn units can be rebuilt or taken down. **Consultants** design a
site for its market and can manage construction; not every firm is as good as its reputation.
Sizes, years and makers come from `docs/research/equipment.md`.

## Accounts

When the game runs on its own server (`npm run dev`, `npm run preview`, `npm run share`, or the
Docker `app` service), everyone signs in, and each account has its own saved games, kept on the
server. The built-in **admin** account starts with a temporary password given at setup (or the one
in `COOP_ADMIN_PASSWORD` when the accounts are first created) and must choose its own at first
sign-in. Players can also **create their own account** from the sign-in page. Admins get the **Admin
menu** (title screen, or `M` in a game): choose who may sign up (anyone, anyone after an admin
approves, or nobody); approve or reject waiting sign-ups; add accounts (each new player picks their
own password at first sign-in); reset passwords, disable, make admin, delete; and the **Sharing**
tab for the Cloudflare Tunnel. Sign-ups start open; if you share the game over a public tunnel,
consider "after an admin approves". Sign-ups are always players, at most five an hour from one
address, and at most 500 accounts.

Accounts and saves live in `.coop-data/` (git-ignored; `COOP_DATA_DIR` to move it), in Docker the
`coop-tunnel` volume. Passwords are stored only as salted scrypt hashes; five wrong passwords lock
an account for 15 minutes. Lost the admin password? Run `npm run admin:reset` (Docker:
`docker compose exec app npm run admin:reset`) for a new temporary one. Saves made in a browser
before accounts can be moved into an account from the title screen.

Served as a plain static site (the nginx image, any static host) there are no accounts: one
player, saves in the browser.

## Docker

```sh
docker compose up --build                     # the app service: play at http://localhost:8080
APP_PORT=9090 docker compose up --build       # use another port if 8080 is taken
docker compose --profile static up --build    # also the plain nginx site at http://localhost:8081
```

The `app` service runs the game on its own Node server with accounts, the admin menu and
`cloudflared` built in (see Accounts above and sharing below). Open it from any computer on your
network at `http://<docker machine>:8080` and sign in. Accounts, saves and tunnel settings are kept
in the `coop-tunnel` volume. The image build runs the typecheck, engine lint and test suite first.

Without Compose: `docker build --target app -t ag-coop-tycoon-app . && docker run --rm -p 8080:8080 -v coop-tunnel:/data ag-coop-tycoon-app`,
or the static site with `docker build -t ag-coop-tycoon . && docker run --rm -p 8081:80 ag-coop-tycoon`.

**"Bind for …:8080 failed: port is already allocated":** something else holds port 8080 —
usually the old `web` container, which published 8080 before `app` became the default and keeps
running because `docker compose up` no longer manages it. Stop it, then start again:

```sh
docker compose --profile static down     # stops and removes the old web container (and app)
docker compose up --build
```

To see what holds the port: `docker ps --filter publish=8080`. If it is another program, run on a
different port instead: `APP_PORT=8090 docker compose up --build`.

## Share over the internet (Cloudflare Tunnel)

A Cloudflare Tunnel gives the game a public HTTPS address without opening ports on your router.
Visitors sign in with an account an admin made for them and play their own games.

**From the game:** sign in as an admin and open **Admin menu > Sharing** while running the game
with `npm run dev`, `npm run preview` or `npm run share`. Choose a quick or named tunnel, paste a
named tunnel's token and hostname, tick "start sharing whenever the game server starts" if you
like, and use **Start sharing** / **Stop sharing**; the public address appears with a Copy link
button. The Sharing tab works from your own network but never through the tunnel itself, so the
token is never reachable from the internet. Sharing does not start (by `npm run share` or
auto-start) until the admin has replaced the temporary password. Settings are kept in
`.tunnel.json` (git-ignored, readable only by you). Sharing stops when the game server stops.

**With Docker:** `docker compose up --build` starts the `app` service, which has these controls
and `cloudflared` built in; open http://localhost:8080, sign in as admin, and open the Admin menu. The tunnel settings and
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

Anyone with a quick-tunnel link reaches the sign-in page. The `--profile tunnel` and
`named-tunnel` Docker profiles share the plain static site, which has no accounts. To limit a named tunnel to people you choose,
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
