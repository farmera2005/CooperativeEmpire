# Agricultural Cooperative Tycoon
#   docker build -t ag-coop-tycoon .
#   docker run --rm -p 8081:80 ag-coop-tycoon        → http://localhost:8081 (static site)
# With accounts and the admin menu (users; sharing over a Cloudflare Tunnel) (D-124, D-127):
#   docker build --target app -t ag-coop-tycoon-app .
#   docker run --rm -p 8080:8080 -v coop-tunnel:/data ag-coop-tycoon-app   → http://localhost:8080
#   (docker compose up --build runs this as the app service)
# Headless balance runner (writes CSVs to ./runs):
#   docker build --target sim -t ag-coop-sim .
#   docker run --rm -v "$PWD/runs:/app/runs" ag-coop-sim --start 1970 --years 55 --seeds 50

# ---- dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: typecheck, test, and produce the static site ----
FROM deps AS build
COPY . .
RUN npm run typecheck && npm run lint:engine && npx vitest run && npx vite build

# ---- headless runner (optional target) ----
FROM deps AS sim
COPY . .
ENTRYPOINT ["npx", "tsx", "tools/sim/run.ts"]
CMD ["--start", "1970", "--years", "55", "--seeds", "10"]

# ---- runtime: static files served by nginx ----
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/99-ready-message.sh /docker-entrypoint.d/99-ready-message.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -q -O /dev/null http://localhost/ || exit 1

# ---- app: the game on its own Node server, with accounts and the admin menu ----
# Vite's preview server carries the accounts and tunnel-control APIs (tools/accounts,
# tools/tunnel), and cloudflared comes from Cloudflare's official image (multi-arch, pinned).
# Accounts, their saves and the tunnel settings live in /data (D-127).
FROM deps AS app
COPY --from=cloudflare/cloudflared:2026.9.3 /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY . .
COPY --from=build /app/dist /app/dist
ENV TUNNEL_CONFIG_FILE=/data/tunnel.json COOP_DATA_DIR=/data NODE_ENV=production ALLOWED_HOSTS=all
RUN mkdir -p /data node_modules/.vite-temp && chown node:node /data node_modules/.vite-temp
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["node", "node_modules/vite/bin/vite.js", "preview", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]
