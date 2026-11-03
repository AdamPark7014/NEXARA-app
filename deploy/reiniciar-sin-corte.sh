#!/bin/bash
# Reinicia `api` o `web` sin dejar a nadie sin servicio. Con `up -d` a secas la web cortaba 2 s y la API
# 21 s (502 y 503 de Traefik, medido el 03-11-2026), y hay varios despliegues al día en horario de trabajo.
#
# Un contenedor de relevo con la imagen nueva responde al mismo nombre en la red de Traefik mientras se
# recrea el principal. Traefik prueba cada dirección que le da el DNS de Docker, así que nunca se queda
# sin a quién llamar. Si la imagen nueva no arranca, se aborta y sigue la versión anterior.
#
# Uso: deploy/reiniciar-sin-corte.sh api|web
#   FORZAR_SIN_RELEVO=1  el `up -d` de siempre, con corte (por ejemplo, si cambió una variable obligatoria)
#   FORZAR_RECREAR=1     recrea aunque la imagen no haya cambiado (para probar)
set -u

SVC="${1:-}"
case "$SVC" in
  api) PRINCIPAL=nexara-api; PUERTO=3001; RUTA=/api/health/live ;;
  web) PRINCIPAL=nexara-web; PUERTO=3000; RUTA=/robots.txt ;;
  *) echo "uso: $0 api|web" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.." || exit 1
C=(docker compose --env-file "${ENV_FILE:-deploy/.env.nexara}" -f "${COMPOSE_FILE:-deploy/docker-compose.nexara.yml}")
RELEVO="${PRINCIPAL}-relevo"
RED_PUBLICA=proxy
ESPERA_S="${RELEVO_ESPERA_S:-180}"
CONSERVAR_RELEVO=0

log() { echo "[relevo $SVC] $*"; }

responde() {
  docker exec "$1" node -e "require('http').get({host:'127.0.0.1',port:$PUERTO,path:'$RUTA',timeout:3000},(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))" >/dev/null 2>&1
}

esperar() {
  local fin=$((SECONDS + ESPERA_S))
  while ((SECONDS < fin)); do
    responde "$1" && return 0
    sleep 1
  done
  return 1
}

recrear() {
  if [ "${FORZAR_RECREAR:-0}" = 1 ]; then
    "${C[@]}" up -d --no-build --no-deps --force-recreate "$SVC"
  else
    "${C[@]}" up -d --no-build --no-deps "$SVC"
  fi
}

limpiar() {
  [ "$CONSERVAR_RELEVO" = 1 ] && return
  docker rm -f "$RELEVO" >/dev/null 2>&1
}

# Un relevo olvidado por un despliegue anterior nunca debe seguir atendiendo.
limpiar

if [ "${FORZAR_SIN_RELEVO:-0}" = 1 ] || [ "$(docker inspect -f '{{.State.Running}}' "$PRINCIPAL" 2>/dev/null)" != true ]; then
  log "sin relevo: se recrea directo"
  recrear
  exit $?
fi

trap limpiar EXIT

IMAGEN="$(docker inspect -f '{{.Config.Image}}' "$PRINCIPAL")"
PRIVADAS=()
while IFS= read -r red; do
  [ -n "$red" ] && [ "$red" != "$RED_PUBLICA" ] && PRIVADAS+=("$red")
done < <(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$PRINCIPAL")
if [ "${#PRIVADAS[@]}" -eq 0 ]; then
  log "ERROR: $PRINCIPAL no tiene red interna; no se toca nada"
  exit 1
fi

ARGS=()
while IFS= read -r -d '' var; do
  case "$var" in
    # El relevo solo atiende peticiones: las colas, las tareas programadas y el precalentado siguen en el principal.
    NEXARA_RELEVO=* | JOBS_RUN_WORKERS=* | INTEGRA_WARMUP_ENABLED=*) continue ;;
  esac
  ARGS+=(-e "$var")
done < <(docker inspect -f '{{range .Config.Env}}{{.}}{{"\x00"}}{{end}}' "$PRINCIPAL")
ARGS+=(-e NEXARA_RELEVO=1)
[ "$SVC" = api ] && ARGS+=(-e JOBS_RUN_WORKERS=0 -e INTEGRA_WARMUP_ENABLED=0)

while IFS= read -r anfitrion; do
  [ -n "$anfitrion" ] && ARGS+=(--add-host "$anfitrion")
done < <(docker inspect -f '{{range .HostConfig.ExtraHosts}}{{println .}}{{end}}' "$PRINCIPAL")

log "levantando relevo con $IMAGEN"
if ! docker create --name "$RELEVO" --restart no \
  --network "${PRIVADAS[0]}" --network-alias "$PRINCIPAL" --network-alias "$SVC" \
  --volumes-from "$PRINCIPAL" \
  --memory "$(docker inspect -f '{{.HostConfig.Memory}}' "$PRINCIPAL")" \
  --stop-timeout 20 --log-opt max-size=10m --log-opt max-file=1 \
  "${ARGS[@]}" "$IMAGEN" >/dev/null; then
  log "ERROR: no se pudo crear el relevo; sigue la versión anterior"
  exit 1
fi
for red in "${PRIVADAS[@]:1}"; do
  docker network connect --alias "$PRINCIPAL" --alias "$SVC" "$red" "$RELEVO"
done
docker start "$RELEVO" >/dev/null

if ! esperar "$RELEVO"; then
  log "ERROR: la imagen nueva no respondió en ${ESPERA_S} s; sigue la versión anterior"
  docker logs --tail 30 "$RELEVO" 2>&1
  exit 1
fi

# Solo ya sano entra a la red de Traefik.
docker network connect --alias "$PRINCIPAL" --alias "$SVC" "$RED_PUBLICA" "$RELEVO"
log "relevo atendiendo a los ${SECONDS} s; recreando $PRINCIPAL"

if ! recrear || ! esperar "$PRINCIPAL"; then
  CONSERVAR_RELEVO=1
  log "ERROR: $PRINCIPAL no quedó sano; $RELEVO se queda atendiendo. Revisar y volver a correr este script."
  exit 1
fi

docker stop "$RELEVO" >/dev/null
docker rm -f "$RELEVO" >/dev/null
log "listo en ${SECONDS} s"
