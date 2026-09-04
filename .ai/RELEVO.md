# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Business events ROI (ops/CRM, no Integra)

Elevé los streams de eventos que más mueven el negocio: SLA/OT,
tickets portal, cotizaciones por expirar, seguimientos CRM y OC
pendientes. Inbox + dashboards accionables. **No toqué** Integra
push/FieldDetection ni PDF OC / stock detail.

### Qué hay

1. **Inbox de notificaciones roto → visible** — listado usaba
   `companyWhere` hard y ocultaba filas con `companyId` null (casi
   todas las creadas por hierarchy/cron). Ahora soft-scope + stamp
   de `companyId` al crear + heal al marcar leída.
2. **`client-ticket-requests` list RBAC** — ya no exige solo
   `CONSOLE_ADMIN`; Ops/Soporte con SUPPORT_* / ACTIVITIES_* ven y
   gestionan el inbox (dashboard + `/ops/support` dejaban de fallar
   en silencio).
3. **`activity-feed`** — señales de negocio: OT SLA vencidas, tickets
   NEW/APPROVED, seguimientos CRM vencidos, cotizaciones SENT por
   expirar, OC DRAFT. Prioridad alta primero.
4. **Centro de notificaciones** — tabs densas Acción ahora / Inbox /
   Señales; filtro Ops·CRM·ERP; sin KPIs vanity con emoji.
5. **Ops dashboard** — panel «Decisiones ahora» (SLA + notifs alta) +
   KPI SLA respuesta + tickets con deep-link.
6. **CRM dashboard** — fix `leads`→`ventas/leads`; panel decisiones
   (seguimientos vencidos + notifs ventas); KPI vencidos.
7. **CommandCenterRail** — Ops: SLA + notifs; Sales: notifs.
8. **Ticket SLA alerts** — stamp `companyId` desde Activity.

### Concurrente (siblings — no pisar)

Face ACS JPEG / Personas biometrics · CRM OC PDF · stock movements ·
PTZ · hybrid attendance · Integra push/FieldDetection.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web)

### Verificar (hard refresh)

1. `/erp/notifications-center` — inbox deja de verse vacío; Acción ahora.
2. `/ops/dashboard` — Decisiones ahora + tickets portal visibles (rol soporte).
3. `/ops/support` — listado tickets sin 403.
4. `/crm/dashboard` — leads recientes + seguimientos vencidos.
5. Feed `?view=feed` — OT/cotiz/OC según permisos.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. go2rtc.yaml en disco corruptible — streams viven en RAM.
4. FieldDetection re-apply tras sync/push install.
5. Backfill masivo `notifications.companyId` (heal parcial al leer/marcar).

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ pad / Personas CRUD / hybrid
attendance / stock detail / OC PDF renderer / Integra push.
