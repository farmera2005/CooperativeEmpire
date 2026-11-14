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

## The farm economy

Prices follow history, and the co-op feels them through the farms around it. Each year brings
its own local weather (a territory-wide yield shock, county differences, and now and then hail,
a dry pocket, flooding or a derecho in one county). Farmers shift acres between corn and
soybeans with the price ratio, cut nitrogen when it is dear and phosphorus and potash when money
is short, and expand or cut herds with the hog and cattle cycles. Posted prices lag wholesale,
so a spike squeezes margins and a drop widens them. Big crops bring wide harvest basis, good
carry and wider elevator margins; short crops the reverse. A short local crop also adds to bad
debts. The Dashboard's **Farm economy** panel shows where things stand and the years played; the
inbox carries a planting outlook (March), crop conditions (July) and a harvest report (November).

## Building facilities

Facilities are made of individual units — each bin, leg, dryer, scale, tank, truck and building,
with its maker, year, capacity and condition (Grain or Farm supply > Facilities > Manage). New
capacity comes from **projects** (Buy or build > Plan a project): pick models from the catalog
for the current year, compare makers' pros and cons, add land, and approve; each line comes into
service as it is finished. Worn units can be rebuilt or taken down. **Consultants** design a
site for its market and can manage construction; not every firm is as good as its reputation.
Competitors run the same kind of plants: they wear, get rebuilt and replaced, and expand by
building real units (see a competitor's plants on Deals & Competitors). Sizes, years and makers come from `docs/research/equipment.md`.

## A bigger world

Choose a region — the central Corn Belt, the Western Corn Belt & Plains, the Red River Valley or the
Great Lakes, each with its own crops, yields, basis, weather, railroads, regional co-ops and news —
and the size of the world, from a county or two up to a vast map of 30-plus counties
and 200 towns. On larger maps the founders farm around the home town and the outer counties
belong to county-wide co-ops that grow, open new elevators, merge with each other over the decades
(fastest from the 1990s) and can become your merger partners (Deals & Competitors, nearest first).

## Career mode

Tick **Career mode** on the New Game screen to play as a general manager you create, hired either
by the founding board (set up as usual) or by the board of an established co-op drawn at random,
with 5–25 years of history (you pick only the start year and difficulty): a name, an
age, a background (grain merchandiser, ag lender, agronomist, plant manager, outside executive
or farmer-director) and points spent on seven stats — financial acumen, operations,
merchandising & sales, leadership, board relations, member relations and negotiation. Your stats
add to what your managers deliver, cover roles you have not filled, and sway the board. The
**Career** screen (key C) shows your contract (base pay, bonus target, severance, term), your
reputation and earnings, and the offers other co-ops' boards make. Counter an offer or ask your
own board for better terms after a review; ask too much and the offer may be withdrawn. If you
resign or the board lets you go, look for work month by month and take an offer: the game
continues at the new co-op, with its own history. Sources are in `docs/research/career.md`.

## Sugar beets

A co-op can go into beet sugar (**Sugar beets**, key U). A beet factory needs a processing line,
lime kilns and boilers to match, a pulp dryer and sugar silos, and pilers and pile ground at the
factory and at receiving stations near the growers. Growers sign contracts each February, deliver
in September and October, and are paid a share of a ton's value at delivery; the rest of the
factory's savings comes back as patronage on tons. Piled beets lose sugar until they are sliced,
and piles left in late spring spoil. Every game has an investor-owned sugar company that some
years in offers its factory and stations to the growers — or closes. Sell growers **beet
shares** (stock tied to acres) to raise the equity a purchase or a new factory needs.

You can also **start as a sugar beet growers' cooperative** (New Game > Kind of cooperative): the
growers buy the sugar company's factory and stations at the organizing meeting with beet shares
and a term loan, take over the campaign under way, and pay growers from proceeds.
Growers are paid in installments (60% at delivery, the rest by August), and sugar in store can be
pledged for USDA CCC loans, forfeited at the loan rate when the market is lower. On the People
screen, hire a sugar factory manager and an agricultural manager, and set the agriculturists
(field staff) and the campaign crew. Every acre grown needs a beet share: growers buy shares for new acres,
non-member farms join to grow beets, and growers buy and sell shares among themselves each
January on a share market whose price follows beet profitability. On the Sugar > Sales tab, choose
how the sugar is sold: in bulk to food makers, forward under annual contracts or at the market,
bagged for wholesale grocers and foodservice distributors, or packed for grocery shelves under
your brand. Retail packs need the factory's packaging line and shelf space, and pay best when
wholesale prices are weak. Sell through a marketing agency or set up your own sales office.
Sources are in `docs/research/sugar.md` and `docs/research/sugar-sales.md`.

## Debug mode

For testing, tick **Debug mode** on the New Game screen, or enter it in a game under way from
**Settings** (key T) > **Enter debug mode**. The Debug tools screen (key X) can add or remove cash,
set board confidence and member satisfaction, reset the lender, reveal skills, place managers and
cancel a game over. Debug mode cannot be turned off; the game is marked DEBUG GAME from the month
it began.

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
