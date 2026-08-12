# The Forge War

Monorepo: **Next.js** (web) + **NestJS** (API) + shared **@tfw/game** engine.

## Structure

```
apps/web      → Next.js 15 — UI, battle
apps/api      → NestJS — auth, email verify, cloud save, PvP
packages/game → shared game logic
```

## Local development

```bash
cd "/home/dev/The Forge War"
npm install

# Postgres (Docker, bound to 127.0.0.1:5433 only)
npm run db:up

cp -n apps/api/.env.example apps/api/.env
cp -n apps/web/.env.example apps/web/.env.local

# Apply migrations
npm run db:deploy

# API http://localhost:8787/v1
npm run dev:api

# Web http://localhost:3000
npm run dev:web
```

Default local DB: see `apps/api/.env.example` / `docker-compose.yml`.

### Local env files (gitignored)

| Path | Role |
|------|------|
| `apps/api/.env` | Loaded by API (`src/env.ts`) — secrets for Nest/Prisma |
| `apps/api/.env.example` | Template only |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_URL` for Next |
| `apps/web/.env.example` | Template only |
| `.env.prod` | Production docker compose secrets (create from `.env.prod.example`) |

**Do not commit** `.env`, `.env.local`, `.env.prod`.

### API env (summary)

| Variable | Dev | Prod |
|----------|-----|------|
| `DATABASE_URL` | local Postgres | managed / compose internal |
| `WEB_ORIGIN` | `http://localhost:3000` | `https://game…` |
| `WEB_PUBLIC_URL` | same | public site for email links |
| `NODE_ENV` | `development` | `production` |
| `SMTP_*` | optional (logs links) | **required** (unless `REQUIRE_SMTP=0`) |
| `ALLOW_DEV_EMAIL_TOKEN` | default on | **forbidden** |
| `COOKIE_SAMESITE` | `Lax` | `None` if web/api separate hosts |
| `COOKIE_SECURE` | `0` | `1` |
| `GOOGLE_CLIENT_ID` / `APPLE_*` | optional OAuth | same |

### Web env

| Variable | |
|----------|--|
| `NEXT_PUBLIC_API_URL` | API base including `/v1` — **baked in at `next build`** |

---

## Production deploy (Docker Compose + Caddy)

### 1. Server prep

- Node not required on host if using only Docker
- Domains A-records → VPS
- Open **80/443** only (Caddy); never expose Postgres to the internet

### 2. Secrets

```bash
cp .env.prod.example .env.prod
# edit: POSTGRES_PASSWORD, WEB_ORIGIN, NEXT_PUBLIC_API_URL, SMTP_*, domains
```

### 3. Build & run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Services:

- `postgres` — internal network only  
- `api` — `127.0.0.1:8787` + `prisma migrate deploy` on start  
- `web` — `127.0.0.1:3000`  
- `db-backup` — daily dump into `./backups/`

### 4. TLS

```bash
# set WEB_HOST / API_HOST env or edit Caddyfile
export WEB_HOST=game.example.com
export API_HOST=api.example.com
caddy run --config Caddyfile
```

### 5. OAuth (optional)

Google Web client origins + Apple return URL must match production domains.

### 6. Smoke test

1. `https://api…/v1/health`  
2. Register → email arrives → verify → session cookie set  
3. Play → progress survives refresh (auth cloud save)  
4. Arena post defense + fight  
5. Confirm register JSON has **no** `devVerifyToken`

### Manual backup

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

---

## Security model (current)

- **Password email**: required verification before login  
- **Guest cloud saves**: removed  
- **Sessions**: HttpOnly cookie (`tfw_session`) + optional bearer in dev body  
- **Rate limits**: per-IP middleware  
- **PvP defense**: from server cloud save only; W/L needs challenge match  
- **Save clamps**: gold/sparks/level caps on cloud put  
- **Still client-trusted**: campaign economy & battle outcomes for local rewards — do not sell currency against save integrity without further server authority  

---

## Scripts

| npm | |
|-----|--|
| `dev:web` / `dev:api` | Local |
| `db:up` / `db:down` | Local Postgres |
| `db:deploy` | `prisma migrate deploy` |
| `build` | game + api + web |

---

## Google / Apple sign-in

API env `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `APPLE_REDIRECT_URI`.  
Buttons appear when API `GET /v1/auth/oauth-config` reports them enabled.
