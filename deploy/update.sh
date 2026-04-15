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

for arg in "$@"; do
  case "$arg" in
    --force-all) FORCE_ALL=true ;;
    --with-migrate) RUN_MIGRATE=true ;;
    --with-prune) RUN_PRUNE=true ;;
    --no-pull) SKIP_PULL=true ;;
    --no-stop-legacy) STOP_LEGACY=false ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./deploy/update.sh [--force-all] [--with-migrate] [--with-prune] [--no-pull] [--no-stop-legacy]"
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
  echo "No new git revision detected. Running safe restart without rebuild."
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
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec api npm run prisma:deploy --workspace=apps/api
fi

if [[ "$RUN_PRUNE" == true ]]; then
  echo "Pruning old images/build cache (7 days old only)..."
  docker image prune -f --filter "until=168h"
  docker builder prune -f --filter "unused-for=168h"
fi

echo "Done. Service status:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
