#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.nexara.yml"
ENV_FILE="$SCRIPT_DIR/.env.nexara"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Run: cp deploy/.env.nexara.example deploy/.env.nexara"
  exit 1
fi

cmd="${1:-help}"
shift || true

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

load_env() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    export "$line"
  done < "$ENV_FILE"
}

# Usa POSTGRES_* del contenedor db (evita depender de source .env con CRLF Windows).
psql_db() {
  compose exec -T db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' -- "$@"
}

case "$cmd" in
  up)
    bash "$SCRIPT_DIR/update.sh" --with-migrate "$@"
    ;;
  up:fast)
    bash "$SCRIPT_DIR/update.sh" --with-migrate --no-pull "$@"
    ;;
  rebuild)
    bash "$SCRIPT_DIR/update.sh" --force-all --with-migrate "$@"
    ;;
  ps)
    compose ps
    ;;
  logs)
    compose logs -f --tail 200 api web db
    ;;
  restart)
    compose restart api web
    ;;
  down)
    compose down
    ;;
  migrate)
    compose run --rm -T api sh -c "cd /app/apps/api && npx prisma migrate deploy"
    ;;
  seed)
    compose exec -T api sh -c "cd /app/apps/api && npx prisma db seed"
    ;;
  cleanup-users)
    cat "$REPO_ROOT/apps/api/scripts/cleanup-ghost-users.sql" | psql_db
    ;;
  delete-ghost-users)
    cat "$REPO_ROOT/apps/api/scripts/delete-ghost-users.sql" | psql_db
    ;;
  audit-users)
    cat "$REPO_ROOT/apps/api/scripts/audit-org-users.sql" | psql_db
    ;;
  validate)
    compose config >/dev/null
    echo "docker-compose.nexara.yml OK"
    ;;
  help|*)
    echo "Usage: ./deploy/nexara.sh <command>"
    echo "Commands: up | up:fast | rebuild | ps | logs | restart | down | migrate | seed | cleanup-users | delete-ghost-users | audit-users | validate"
    ;;
esac
