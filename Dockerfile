# Agricultural Cooperative Tycoon
#   docker build -t ag-coop-tycoon .
#   docker run --rm -p 8080:80 ag-coop-tycoon        → http://localhost:8080
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
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -q -O /dev/null http://localhost/ || exit 1
