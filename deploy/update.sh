#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.nexara.yml"
ENV_FILE="$SCRIPT_DIR/.env.nexara"

FORCE_ALL=false
RUN_MIGRATE=false
RUN_PRUNE=false
SKIP_PULL=false
STOP_LEGACY=true
AUTO_PRUNE_ON_HIGH_DISK=true
HIGH_DISK_THRESHOLD=85

for arg in "$@"; do
  case "$arg" in
    --force-all) FORCE_ALL=true ;;
    --with-migrate) RUN_MIGRATE=true ;;
    --with-prune) RUN_PRUNE=true ;;
    --no-pull) SKIP_PULL=true ;;
    --no-stop-legacy) STOP_LEGACY=false ;;
    --no-auto-prune) AUTO_PRUNE_ON_HIGH_DISK=false ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./deploy/update.sh [--force-all] [--with-migrate] [--with-prune] [--no-pull] [--no-stop-legacy] [--no-auto-prune]"
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it first: cp deploy/.env.nexara.example deploy/.env.nexara"
  exit 1
fi

cd "$REPO_ROOT"

OLD_REV=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  OLD_REV="$(git rev-parse HEAD)"
  if [[ "$SKIP_PULL" == false ]]; then
    git pull --ff-only origin main
  fi
fi

NEW_REV=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  NEW_REV="$(git rev-parse HEAD)"
fi

build_api=false
build_web=false
build_mobile=false

if [[ "$FORCE_ALL" == true ]]; then
  build_api=true
  build_web=true
  build_mobile=true
elif [[ -n "$OLD_REV" && -n "$NEW_REV" && "$OLD_REV" != "$NEW_REV" ]]; then
  CHANGED="$(git diff --name-only "$OLD_REV" "$NEW_REV")"

  if echo "$CHANGED" | grep -Eq '^(package.json|package-lock.json|\.dockerignore|deploy/docker/|deploy/docker-compose\.nexara\.yml|shared/)'; then
    build_api=true
    build_web=true
    build_mobile=true
  fi

  if echo "$CHANGED" | grep -Eq '^apps/api/'; then
    build_api=true
  fi

  if echo "$CHANGED" | grep -Eq '^apps/web/'; then
    build_web=true
  fi

  if echo "$CHANGED" | grep -Eq '^apps/mobile/'; then
    build_mobile=true
  fi
else
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    LOCAL_CHANGED="$(git status --porcelain --untracked-files=no | awk '{print $2}')"
    if [[ -n "$LOCAL_CHANGED" ]]; then
      echo "No new git revision detected. Found local changes; rebuilding only affected services."

      if echo "$LOCAL_CHANGED" | grep -Eq '^(package.json|package-lock.json|\.dockerignore|deploy/docker/|deploy/docker-compose\.nexara\.yml|shared/)'; then
        build_api=true
        build_web=true
        build_mobile=true
      fi

      if echo "$LOCAL_CHANGED" | grep -Eq '^apps/api/'; then
        build_api=true
      fi

      if echo "$LOCAL_CHANGED" | grep -Eq '^apps/web/'; then
        build_web=true
      fi

      if echo "$LOCAL_CHANGED" | grep -Eq '^apps/mobile/'; then
        build_mobile=true
      fi
    else
      echo "No new git revision detected and no local changes. Running safe restart without rebuild."
    fi
  else
    echo "No git metadata available. Running safe restart without rebuild."
  fi
fi

# If image tags were removed by prune, force-build missing service images
# so `up --no-build` does not fail with "No such image".
if ! docker image inspect nexara-api:latest >/dev/null 2>&1; then
  echo "Image missing: nexara-api:latest -> forcing api rebuild"
  build_api=true
fi

if ! docker image inspect nexara-web:latest >/dev/null 2>&1; then
  echo "Image missing: nexara-web:latest -> forcing web rebuild"
  build_web=true
fi

if ! docker image inspect nexara-mobile:latest >/dev/null 2>&1; then
  echo "Image missing: nexara-mobile:latest -> forcing mobile rebuild"
  build_mobile=true
fi

cd "$SCRIPT_DIR"

if [[ "$STOP_LEGACY" == true ]]; then
  bash "$SCRIPT_DIR/stop-legacy-host.sh"
fi

if [[ "$build_api" == true ]]; then
  echo "Building api image..."
  DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api
fi

if [[ "$build_web" == true ]]; then
  echo "Building web image..."
  DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build web
fi

if [[ "$build_mobile" == true ]]; then
  echo "Building mobile image..."
  DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build mobile
fi

echo "Starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans db
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans --no-build api web mobile

if [[ "$RUN_MIGRATE" == true ]]; then
  echo "Running Prisma migrate deploy..."
  # Usar `run --rm` en lugar de `exec`: si nexara-api está en crash-loop (restarting),
  # `exec` falla; un contenedor one-off con la misma imagen y env sí puede aplicar migraciones.
  # Sin package.json raíz en la imagen API: migrar desde apps/api con npx prisma
  if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm -T api \
    sh -c "cd apps/api && npx prisma migrate deploy"; then
    echo ""
    echo "ERROR: migrate deploy falló. Estado del contenedor API:"
    docker inspect -f 'Status={{.State.Status}} Exit={{.State.ExitCode}} Error={{.State.Error}}' nexara-api 2>/dev/null || true
    echo "Últimas líneas de log (nexara-api):"
    docker logs nexara-api --tail 120 2>&1 || true
    echo ""
    echo "Revisa DATABASE_URL en deploy/.env.nexara, que la DB esté arriba, y JWT_SECRET."
    exit 1
  fi
fi

if [[ "$RUN_PRUNE" == true ]]; then
  echo "Pruning old images/build cache (7 days old only)..."
  docker image prune -f --filter "until=168h"
  docker builder prune -f --filter "unused-for=168h"
fi

if [[ "$AUTO_PRUNE_ON_HIGH_DISK" == true ]]; then
  ROOT_USE_PCT="$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  if [[ -n "$ROOT_USE_PCT" ]] && (( ROOT_USE_PCT >= HIGH_DISK_THRESHOLD )); then
    echo "Root filesystem at ${ROOT_USE_PCT}% (>= ${HIGH_DISK_THRESHOLD}%). Running safe Docker auto-prune..."
    # Keep currently running images/containers untouched and trim only dangling image refs + excess build cache.
    docker image prune -f || true
    docker builder prune -f --keep-storage 2GB || true
  fi
fi

echo "Done. Service status:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
