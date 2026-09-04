# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Business events ROI (ops/CRM, no Integra push)

Elevé streams que más mueven el negocio: SLA/OT, tickets portal,
cotizaciones por expirar, seguimientos CRM y OC pendientes. Inbox +
dashboards accionables. **No toqué** Integra push/FieldDetection ni
PDF OC / stock detail.

Nota: en paralelo hubo polish Integra Video/Personas/Accesos/Eventos
Face (chrome CTAs) — no pisar ese trabajo.

### Qué hay

1. **Inbox notificaciones visible** — soft-scope (`companyId` null
   legacy) + stamp al crear + heal al marcar leída. Antes hard-scope
   dejaba el centro casi vacío.
2. **`client-ticket-requests` RBAC** — SUPPORT_*/ACTIVITIES_* (no solo
   CONSOLE_ADMIN). `/ops/support` y dashboard dejan de fallar en silencio.
3. **`activity-feed`** — OT SLA vencidas, tickets NEW/APPROVED,
   seguimientos CRM vencidos, cotiz SENT por expirar, OC DRAFT.
4. **Centro notificaciones** — Acción ahora / Inbox / Señales; filtro
   Ops·CRM·ERP; densidad sin KPIs vanity.
5. **Ops dashboard** — «Decisiones ahora» + KPI SLA + tickets deep-link.
6. **CRM dashboard** — fix `leads`→`ventas/leads`; decisiones comerciales
   (vencidos + notifs ventas).
7. **CommandCenterRail** — Ops: SLA+notifs; Sales: notifs.
8. **Ticket SLA alerts** — stamp `companyId` desde Activity.

### Concurrente (siblings — no pisar)

Integra Video/Personas/Eventos Face chrome · FieldDetection · Face ACS
JPEG / Personas biometrics · CRM OC PDF · stock historial · PTZ · hybrid
attendance · identity-link WIP.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web)

### Verificar (hard refresh)

1. `/erp/notifications-center` — inbox con filas; Acción ahora.
2. `/ops/dashboard` — Decisiones ahora + tickets (rol soporte).
3. `/ops/support` — listado sin 403.
4. `/crm/dashboard` — leads + seguimientos vencidos.
5. Feed `?view=feed` — OT/cotiz/OC según permisos.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. go2rtc.yaml en disco corruptible — streams viven en RAM.
4. FieldDetection re-apply tras sync/push install.
5. Backfill masivo `notifications.companyId` (heal parcial al marcar).
6. identity-link WIP (rescate) — no cableado a AppModule.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ / Personas biometrics CRUD /
hybrid attendance / stock detail / OC PDF / FieldDetection /
Integra push del sibling.
