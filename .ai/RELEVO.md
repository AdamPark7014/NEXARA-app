# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Integra Eventos ACS (negocio)

Vista de negocio sobre empuje local: accesos concedidos/denegados con foto,
puerta, persona y hora. **No** toqué FieldDetection / ISAPI discovery / AcuSense
(sibling concurrente, ya en commits WIP).

### Qué hay

1. **`push/events`** — filtros `scope=acs|noise|all`, `outcome=granted|denied`,
   `personName`, `deviceIp`, `from`/`to`, `beforeId` (paginación sin OFFSET),
   latencia `ms` en respuesta. UI default = ACS (no heartBeat/VMD).
2. **`push/events/stats`** — KPIs del día: entradas, denegados, únicos, en sitio.
3. **Índices** — migración `20260904160000_integra_push_events_acs_indexes`
   (`companyId+major+occurredAt`, `siteId+major+occurredAt`, `companyId+id`,
   `siteId+eventType+occurredAt`).
4. **UI `/integra/events`** — KPI strip, Hoy/Denegados/7d/Ruido, persona/puerta,
   CSV, live SSE + poll `afterId`+`live=1`, tarjetas con foto y tono
   concedido/denegado. Fuente = push (rápido), no sondeo Artemis.
5. **DTO** — `major`/`minor`/`outcome` en PushEventDto (SSE/overlay compat).

### Concurrente (siblings — no pisar)

AcuSense Field/Line/Face/Motion XML · Face ACS JPEG / Personas · CRM OC PDF ·
stock · PTZ · hybrid attendance · ERP chrome · `integra_room_bookings` (untracked).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web; aplica
migración índices)

### Verificar (hard refresh)

1. `/integra/events` — KPIs del día; default sin VMD/heartBeat.
2. Filtro Denegados + Exportar CSV.
3. Pase real en terminal → tarjeta en vivo &lt;4 s con foto.
4. Overlay video / RecentAccess siguen vivos (`scope` all / `live=1`).
5. Migración índices aplicada en deploy.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. go2rtc.yaml en disco corruptible — streams viven en RAM.
4. FieldDetection re-apply tras sync/push install (sibling AcuSense).

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ / Personas CRUD / hybrid attendance /
stock detail / OC PDF / FieldDetection camera XML / room_bookings untracked.
