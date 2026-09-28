#!/usr/bin/env bash
# Activa en UNA empresa las políticas del perfil del CEO. Se corre EN EL SERVIDOR, después del despliegue:
#
#   cd /var/www/nexara-app
#   bash apps/api/scripts/activar-perfil-ceo.sh                       # solo lista las empresas y sus ids
#   COMPANY_ID=<id> bash apps/api/scripts/activar-perfil-ceo.sh       # muestra qué haría (no escribe)
#   COMPANY_ID=<id> APLICAR=1 bash apps/api/scripts/activar-perfil-ceo.sh          # lo aplica
#   COMPANY_ID=<id> APLICAR=1 HORAS=72 bash apps/api/scripts/activar-perfil-ceo.sh # web abierta 72 h
#
# Aplica, en este orden (cada una es idempotente y se relee sola en ≤30 s, sin reiniciar nada):
#   1. set-module-policy.sql        «Pagos a personal» solo para el CEO
#   2. set-payroll-schedule.sql     nómina quincenal (avisos de «Tu día»)
#   3. set-user-creation-grants.sql Antonio/Luis → soporte, David → instaladores
#   4. set-web-checkin-window.sql   checar desde la web, TEMPORAL (HORAS, 48 por omisión; se cierra sola)
#   5. seed:plantillas              las 9 plantillas de cotización de NEXARA
#
# NO activa los topes de aprobación (Christian aún no da los montos) ni el timbrado CFDI.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-nexara-db}"
API_CONTAINER="${API_CONTAINER:-nexara-api}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HORAS="${HORAS:-48}"

psql_db() { docker exec -i "$DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 "$@"' sh "$@"; }

if [ -z "${COMPANY_ID:-}" ]; then
  echo "Empresas (id | nombre | slug | activa):"
  psql_db -At -F ' | ' -c 'select id, coalesce("tradeName", "legalName"), slug, "isActive" from company_profile order by id'
  echo
  echo "Vuelve a correrlo con COMPANY_ID=<id>."
  exit 0
fi
case "$COMPANY_ID" in ''|*[!0-9]*) echo "COMPANY_ID debe ser un número." >&2; exit 2;; esac
case "$HORAS" in ''|*[!0-9]*) echo "HORAS debe ser un número entero." >&2; exit 2;; esac

echo "Empresa $COMPANY_ID: $(psql_db -At -c "select coalesce(\"tradeName\", \"legalName\") from company_profile where id = $COMPANY_ID")"
if [ "${APLICAR:-0}" != "1" ]; then
  echo "SIMULACIÓN (no se escribe nada). Con APLICAR=1 se harían:"
  echo "  · política de módulos (Pagos solo CEO) · nómina quincenal · quién da de alta a quién"
  echo "  · checar en la web por $HORAS h · plantillas de cotización"
  exit 0
fi

for f in set-module-policy.sql set-payroll-schedule.sql set-user-creation-grants.sql; do
  echo "→ $f"
  psql_db -v "company_id=$COMPANY_ID" -f - < "$DIR/$f"
done
echo "→ set-web-checkin-window.sql (por $HORAS h)"
psql_db -v "company_id=$COMPANY_ID" -v "hours=$HORAS" -f - < "$DIR/set-web-checkin-window.sql"

echo "→ plantillas de cotización"
docker exec "$API_CONTAINER" sh -c "cd /app/apps/api && npm run seed:plantillas -- --company-id=$COMPANY_ID --apply"

echo
echo "Listo. Lo que quedó activo en la empresa $COMPANY_ID:"
psql_db -At -F ' | ' -c "select key, value from system_settings where \"companyId\" = $COMPANY_ID and key in ('rbac.module_roles','payroll.schedule','users.creation_grants','attendance.web_checkin_until') order by key"
