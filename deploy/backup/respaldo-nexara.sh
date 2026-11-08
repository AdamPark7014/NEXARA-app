#!/usr/bin/env bash
# Respaldo diario de la base de NEXARA (07-11-2026, pedido de Adam: «implementa todo»).
#
# - Diario: todo menos los datos de `integra_push_events` y `audit_logs` (bitácoras que pesan
#   casi el 90 % de la base y se regeneran solas). Semanal (domingo): completo.
# - Formato custom de pg_dump (-Fc, ya comprimido): se restaura con
#   `pg_restore --clean --if-exists -d <base>` en un contenedor desechable, nunca encima de producción.
# - Retención: 7 diarios y 4 semanales. Si el disco pasa de 90 %, no respalda y lo dice.
# - Instalar: `install -m 755 deploy/backup/respaldo-nexara.sh /root/respaldo-nexara.sh` y
#   `/etc/cron.d/respaldo-nexara` con `30 9 * * * root /root/respaldo-nexara.sh >> /var/log/respaldo-nexara.log 2>&1`
#   (09:30 UTC = 03:30 de México).
set -Eeuo pipefail

DESTINO="${DESTINO:-/root/db-backups/nexara}"
CONTENEDOR="${CONTENEDOR:-nexara-db}"
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

USO="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [[ "${USO:-0}" -ge 90 ]]; then
  echo "$(date -Is) Disco al ${USO} %: no se respalda hoy." >&2
  exit 1
fi

HOY="$(date +%F)"
if [[ "$(date +%u)" == "7" ]]; then
  TIPO=semanal
  EXCLUIR=()
else
  TIPO=diario
  EXCLUIR=(--exclude-table-data=integra_push_events --exclude-table-data=audit_logs)
fi
ARCHIVO="$DESTINO/nexara-${TIPO}-${HOY}.dump"
TMP="${ARCHIVO}.parcial"

docker exec "$CONTENEDOR" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc "$@"' sh "${EXCLUIR[@]}" > "$TMP"

# Un respaldo vacío o corrupto no cuenta: se valida con pg_restore --list antes de quedarse.
TAM="$(stat -c %s "$TMP")"
if [[ "$TAM" -lt 1000000 ]] || ! docker exec -i "$CONTENEDOR" pg_restore --list < "$TMP" > /dev/null; then
  rm -f "$TMP"
  echo "$(date -Is) Respaldo inválido (${TAM} bytes): se descartó." >&2
  exit 1
fi
mv "$TMP" "$ARCHIVO"
chmod 600 "$ARCHIVO"

# Retención (find no falla cuando todavía no hay archivos de un tipo).
podar() { find "$DESTINO" -maxdepth 1 -name "nexara-$1-*.dump" -printf '%T@ %p\n' | sort -rn | tail -n +"$2" | cut -d' ' -f2- | xargs -r rm -f; }
podar diario 8
podar semanal 5

echo "$(date -Is) Respaldo ${TIPO} listo: ${ARCHIVO} ($(du -h "$ARCHIVO" | cut -f1))."
