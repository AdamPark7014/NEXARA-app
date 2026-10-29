#!/usr/bin/env bash
set -Eeuo pipefail

# Un despliegue a la vez. El 28-10-2026 dos sesiones corrieron este script juntas: dos builds subieron el disco del
# 88 % al 99 % y compose chocó con «container name … is already in use». El segundo espera hasta 15 min y si no, sale.
exec 9>/tmp/nexara-update.lock
if ! flock -w 900 9; then
  echo "Ya hay otro despliegue corriendo (/tmp/nexara-update.lock); intenta más tarde." >&2
  exit 1
fi

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
# Antes de cada build: a partir de aquí se vacía la caché de build. El 26-10-2026 el disco (75 GB)
# llegó al 100 % construyendo, nexara-db quedó reiniciándose y Redis en MISCONF.
PRE_BUILD_DISK_THRESHOLD=90

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

# Configuración de go2rtc fuera del repositorio.
#
# go2rtc reescribe su YAML al registrar cada stream, y esas URLs RTSP llevan la
# contraseña del equipo. Versionado, eso deja credenciales en un archivo
# rastreado por git. Aquí vive fuera, y el del repositorio es solo la semilla.
GO2RTC_DIR=/var/lib/nexara/go2rtc
if [[ ! -f "$GO2RTC_DIR/go2rtc.yaml" ]]; then
  mkdir -p "$GO2RTC_DIR"
  cp "$SCRIPT_DIR/go2rtc/go2rtc.yaml" "$GO2RTC_DIR/go2rtc.yaml"
  chmod 600 "$GO2RTC_DIR/go2rtc.yaml"
  echo "Sembrada la configuración de go2rtc en $GO2RTC_DIR"
fi

OLD_REV=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  OLD_REV="$(git rev-parse HEAD)"
  if [[ "$SKIP_PULL" == false ]]; then
    DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git branch --show-current 2>/dev/null || true)}"
    if [[ -z "$DEPLOY_BRANCH" ]]; then
      DEPLOY_BRANCH="main"
    fi

    echo "Pulling latest changes from origin/${DEPLOY_BRANCH}..."
    git pull --ff-only origin "$DEPLOY_BRANCH"
  fi
fi

NEW_REV=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  NEW_REV="$(git rev-parse HEAD)"
fi

build_api=false
build_web=false
# El transcriptor no toma nada del repo salvo su Dockerfile. Sin caché de build, reconstruirlo es
# compilar whisper y bajar el modelo otra vez (GB de disco), así que solo se hace si cambió.
build_transcriptor=false
TRANSCRIPTOR_FILES_RE='^deploy/docker/Dockerfile\.transcriptor$'
# build_mobile eliminado: apps/mobile descontinuada (app nativa en apps/mobile-native).

if [[ "$FORCE_ALL" == true ]]; then
  build_api=true
  build_web=true
  build_transcriptor=true
  # build_mobile desactivado: apps/mobile descontinuada (app nativa)
elif [[ -n "$OLD_REV" && -n "$NEW_REV" && "$OLD_REV" != "$NEW_REV" ]]; then
  CHANGED="$(git diff --name-only "$OLD_REV" "$NEW_REV")"

  if echo "$CHANGED" | grep -Eq '^(package.json|package-lock.json|\.dockerignore|deploy/docker/|deploy/docker-compose\.nexara\.yml|shared/)'; then
    build_api=true
    build_web=true
  fi

  if echo "$CHANGED" | grep -Eq '^apps/api/'; then
    build_api=true
  fi

  if echo "$CHANGED" | grep -Eq '^apps/web/'; then
    build_web=true
  fi

  if echo "$CHANGED" | grep -Eq "$TRANSCRIPTOR_FILES_RE"; then
    build_transcriptor=true
  fi

  # apps/mobile deprecado: cambios ahí ya no forzan rebuild.
else
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    LOCAL_CHANGED="$(git status --porcelain --untracked-files=no | awk '{print $2}')"
    if [[ -n "$LOCAL_CHANGED" ]]; then
      echo "No new git revision detected. Found local changes; rebuilding only affected services."

      if echo "$LOCAL_CHANGED" | grep -Eq '^(package.json|package-lock.json|\.dockerignore|deploy/docker/|deploy/docker-compose\.nexara\.yml|shared/)'; then
        build_api=true
        build_web=true
      fi

      if echo "$LOCAL_CHANGED" | grep -Eq '^apps/api/'; then
        build_api=true
      fi

      if echo "$LOCAL_CHANGED" | grep -Eq '^apps/web/'; then
        build_web=true
      fi

      if echo "$LOCAL_CHANGED" | grep -Eq "$TRANSCRIPTOR_FILES_RE"; then
        build_transcriptor=true
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

# nexara-mobile image removed: app móvil ahora es nativa (apps/mobile-native).

# Revisa el disco justo antes de construir $1. Con --no-auto-prune solo avisa.
check_disk_before_build() {
  local use_pct
  use_pct="$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  echo "Disco antes de construir $1: $(df -h / | awk 'NR==2 {print $5 " usado, " $4 " libres"}')"
  if [[ -n "$use_pct" ]] && (( use_pct >= PRE_BUILD_DISK_THRESHOLD )); then
    if [[ "$AUTO_PRUNE_ON_HIGH_DISK" == true ]]; then
      echo "AVISO: disco al ${use_pct}% (>= ${PRE_BUILD_DISK_THRESHOLD}%) antes de construir $1. Vaciando la caché de build (docker builder prune -f)..."
      docker builder prune -f || true
      echo "Disco tras vaciar la caché: $(df -h / | awk 'NR==2 {print $5 " usado, " $4 " libres"}')"
    else
      echo "AVISO: disco al ${use_pct}% (>= ${PRE_BUILD_DISK_THRESHOLD}%) antes de construir $1 y --no-auto-prune activo: no se limpia nada."
    fi
  fi
}

cd "$SCRIPT_DIR"

if [[ "$STOP_LEGACY" == true ]]; then
  if [[ -f "$SCRIPT_DIR/stop-legacy-host.sh" ]]; then
    bash "$SCRIPT_DIR/stop-legacy-host.sh"
  else
    echo "stop-legacy-host.sh not found; skipping legacy host cleanup."
  fi
fi

if [[ "$build_api" == true ]]; then
  check_disk_before_build api
  echo "Building api image..."
  DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api
fi

if [[ "$build_web" == true ]]; then
  check_disk_before_build web
  echo "Building web image..."
  DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build web
fi

# build mobile omitido: servicio deprecado.

# Transcriptor propio (whisper): se activa poniendo TRANSCRIPTOR_URL en el .env. Con el perfil
# exportado, `--remove-orphans` no lo borra en cada deploy.
TRANSCRIPTOR_ON=false
if grep -Eq '^TRANSCRIPTOR_URL=.+' "$ENV_FILE"; then
  TRANSCRIPTOR_ON=true
  export COMPOSE_PROFILES="${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}transcriptor"
fi

echo "Starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans db
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans --no-build api web
if [[ "$TRANSCRIPTOR_ON" == true ]]; then
  # Se reconstruye solo si cambió su Dockerfile, si cambió su build en el compose o en el .env
  # (WHISPER_MODEL), si falta la imagen o con --force-all. Antes iba `up --build` en cada deploy:
  # con la caché de build vacía eso rehacía whisper y el modelo entero, y llenó el disco el 26-10-2026.
  # La configuración de build con la que se hizo la imagen viva se anota en TRANSCRIPTOR_BUILD_STAMP.
  TRANSCRIPTOR_BUILD_STAMP=/var/lib/nexara/transcriptor-build.conf
  transcriptor_build_conf="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config transcriptor 2>/dev/null \
    | awk '/^    build:/ {on=1; print; next} on && /^    [^ ]/ {on=0} on' || true)"
  if ! docker image inspect nexara-transcriptor:latest >/dev/null 2>&1; then
    echo "Image missing: nexara-transcriptor:latest -> forcing transcriptor rebuild"
    build_transcriptor=true
  elif [[ -z "$transcriptor_build_conf" ]]; then
    echo "No se pudo leer la configuración de build del transcriptor; se compara solo por git."
  elif [[ ! -f "$TRANSCRIPTOR_BUILD_STAMP" ]]; then
    # Primer deploy con esta lógica: la imagen viva salió de la configuración actual (antes se
    # reconstruía en cada deploy), así que solo se anota.
    mkdir -p "$(dirname "$TRANSCRIPTOR_BUILD_STAMP")"
    printf '%s\n' "$transcriptor_build_conf" > "$TRANSCRIPTOR_BUILD_STAMP"
    echo "Anotada la configuración de build del transcriptor en $TRANSCRIPTOR_BUILD_STAMP"
  elif [[ "$(cat "$TRANSCRIPTOR_BUILD_STAMP")" != "$transcriptor_build_conf" ]]; then
    echo "Cambió la configuración de build del transcriptor (compose o .env) -> rebuild"
    build_transcriptor=true
  fi

  if [[ "$build_transcriptor" == true ]]; then
    check_disk_before_build transcriptor
    # La primera vez compila whisper y baja el modelo (varios minutos).
    echo "Building transcriptor image..."
    DOCKER_BUILDKIT=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build transcriptor
    if [[ -n "$transcriptor_build_conf" ]]; then
      mkdir -p "$(dirname "$TRANSCRIPTOR_BUILD_STAMP")"
      printf '%s\n' "$transcriptor_build_conf" > "$TRANSCRIPTOR_BUILD_STAMP"
    fi
  else
    echo "Transcriptor sin cambios: se levanta sin reconstruir."
  fi
  echo "Starting transcriptor..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-build transcriptor
  # Whisper `small` solo para dictado: sin --build (la imagen casi nunca cambia); si falta, se construye.
  if grep -Eq '^TRANSCRIPTOR_DICTADO_URL=.+' "$ENV_FILE"; then
    echo "Starting transcriptor-dictado..."
    DOCKER_BUILDKIT=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d transcriptor-dictado
  fi
fi

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

# --- ARTA/guest Traefik safety (do not remove) ---
# El servidor es COMPARTIDO: además de NEXARA aloja ARTA, School, Ágora,
# Family y otros. La configuración real de Traefik NO es la de este repo, vive
# en /opt/traefik/config, y `deploy/traefik/nexara.yml` solo se copia allí a
# través de estos scripts, que refrescan lo de NEXARA y **re-afirman todas las
# rutas de invitados sin borrarlas**.
#
# Sin este bloque, un despliegue de NEXARA puede dejar sin rutas a las apps de
# otros clientes. Vivía sin versionar en el servidor —solo en su copia de
# trabajo— y un `git pull` que tocara este fichero lo habría borrado sin que
# nadie se enterara hasta que un cliente ajeno se cayera. Por eso está aquí.
#
# Detalle en /opt/traefik/README.md del servidor.
if [[ -x /opt/traefik/sync-nexara-routes.sh ]]; then
  bash /opt/traefik/sync-nexara-routes.sh || true
fi
if [[ -x /opt/traefik/ensure-guest-routes.sh ]]; then
  bash /opt/traefik/ensure-guest-routes.sh || true
fi
# --- end Traefik safety ---

echo "Done. Service status:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
