# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Homologación ACS eventos (Ops + alarma + router)

Glue que faltaba tras abortos de siblings: alarmas SOC y orquestador Nest.

### Qué hay

1. **`IntegraEventRouterService`** — clasifica + despacha desde
   `IntegraPushService.ingest` (`INTEGRA_EVENT_ROUTER=1`).
2. **Ops presencia OT** — `ops_activity` → `AcsOpsBridgeService` (ya existía;
   ahora pasa por el router). Acceso concedido + `employeeNumber` → sello OT.
3. **Denegado → alarma** — `IntegraAcsAlarmsService` en module + hook push;
   cola `/alarms/queue` mezcla `integra_soc_alarms` (ISAPI).
4. **API** — `GET/POST /api/integra/event-router/{matrix,route,recent}`.
5. **Stubs limpios** — employee_entry/exit sin escribir Attendance (hybrid
   lectura). Visita/sala/gerencia → audit stub.
6. **Docs** — `docs/INTEGRA-ACS-BUSINESS-MATRIX.md` alineado al glue real.
7. **`nest build` + jest** router/alarms/ops-match OK.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `bash deploy/update.sh --force-all`

### Verificar

1. Denegado real en terminal → fila en `integra_soc_alarms` / cola SOC.
2. Entrada Acceso General con employeeNumber en OT del día → `acsEnteredAt`.
3. `GET /api/integra/event-router/matrix` y `/recent` tras un evento.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Rutas stub del router (visita CRM, host notify, checador ERP write).
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado. Attendance hybrid
(no reescribir).
