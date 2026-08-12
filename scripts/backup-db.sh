#!/usr/bin/env bash
# Manual Postgres backup (local docker or remote via DATABASE_URL)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%d_%H%M%S)"
file="$OUT_DIR/tfw_${ts}.dump"

if docker compose -f "$ROOT/docker-compose.prod.yml" ps postgres 2>/dev/null | grep -q postgres; then
  # shellcheck disable=SC1091
  if [[ -f "$ROOT/.env.prod" ]]; then set -a; source "$ROOT/.env.prod"; set +a; fi
  docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ROOT/.env.prod" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-tfw}" -d "${POSTGRES_DB:-tfw}" -Fc > "$file"
  echo "Wrote $file"
  exit 0
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump "$DATABASE_URL" -Fc -f "$file"
  echo "Wrote $file"
  exit 0
fi

echo "No production postgres container or DATABASE_URL" >&2
exit 1
