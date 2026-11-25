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
    # Solo agrega roles y departamentos que falten; no crea ni cambia cuentas. `seed --simular` no escribe.
    case "${1:-}" in
      "") extra="" ;;
      --simular) extra=" -- --simular" ;;
      *) echo "Opción desconocida: $1 (solo --simular)"; exit 1 ;;
    esac
    # Una imagen anterior al 25-11-2026 trae el seed que reescribía cuentas: ahí no se corre.
    compose exec -T api sh -c "cd /app/apps/api && { test -f prisma/seed-estructura.ts || { echo 'La imagen trae el seed viejo, que reescribe cuentas: despliega antes.'; exit 1; }; } && npx prisma db seed${extra}"
    ;;
  close-attendance)
    email="${1:-}"
    if [[ -z "$email" ]]; then
      echo "Usage: ./deploy/nexara.sh close-attendance <email>"
      echo "Example: ./deploy/nexara.sh close-attendance soporte@nexara.com.mx"
      exit 1
    fi
    cat "$REPO_ROOT/apps/api/scripts/close-open-attendance.sql" | psql_db -v user_email="'${email}'"
    ;;
  validate)
    compose config >/dev/null
    echo "docker-compose.nexara.yml OK"
    ;;
  help|*)
    echo "Usage: ./deploy/nexara.sh <command>"
    echo "Commands: up | up:fast | rebuild | ps | logs | restart | down | migrate | seed | close-attendance | validate"
    ;;
esac
