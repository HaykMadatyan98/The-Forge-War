#!/usr/bin/env bash
# Bootstrap local Postgres + schema for The Forge War
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Starting Postgres (Docker)…"
docker compose up -d postgres

echo "→ Waiting for healthy Postgres…"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-tfw}" -d "${POSTGRES_DB:-tfw}" >/dev/null 2>&1; then
    echo "  ready"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "Postgres did not become ready in time" >&2
    exit 1
  fi
  sleep 1
done

echo "→ prisma migrate deploy…"
npm run db:deploy -w @tfw/api

echo "Done. Start API: npm run dev:api"
