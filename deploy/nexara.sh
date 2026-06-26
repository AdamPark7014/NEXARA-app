#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
    compose run --rm -T api sh -c "cd apps/api && npx prisma migrate deploy"
    ;;
  validate)
    compose config >/dev/null
    echo "docker-compose.nexara.yml OK"
    ;;
  help|*)
    echo "Usage: ./deploy/nexara.sh <command>"
    echo "Commands: up | up:fast | rebuild | ps | logs | restart | down | migrate | validate"
    ;;
esac
