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
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

psql_db() {
  load_env
  compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
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
  audit-users)
    cat "$REPO_ROOT/apps/api/scripts/audit-org-users.sql" | psql_db
    ;;
  validate)
    compose config >/dev/null
    echo "docker-compose.nexara.yml OK"
    ;;
  help|*)
    echo "Usage: ./deploy/nexara.sh <command>"
    echo "Commands: up | up:fast | rebuild | ps | logs | restart | down | migrate | seed | cleanup-users | audit-users | validate"
    ;;
esac
