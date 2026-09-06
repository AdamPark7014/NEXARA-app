# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Notificaciones portal tickets / support / workflow

### Qué se cableó
- Hierarchy: `notifyPortalTicketComment`, `notifyPortalTicketClientAction`, `notifySupportRequestCreated`, `notifySupportRequestStatusChanged`.
- Helpers + armor: `portal-ticket-notify.ts` (+ `.spec.ts`); `appUrls.portalTicket`.
- Client-portal: comment / ACK / CONFIRM_RESOLVED / REQUEST_REOPEN / `POST requests` → hierarchy (push + canal `tickets`).
- Ops support status PATCH → notifica responsable OT vinculada (`opsSupport` URL).
- Workflow approve/reject/pending: `relatedUrl` `erpApprovals` + canal `approvals`.
- `ACTIVITY_STARTED` ya existía y sigue cableado en `activities.service` al pasar a En Proceso.

### Nota
Portal cliente **no** tiene `User.id` (JWT portal) → no hay inbox FCM al cliente; solo staff.

### Verificación
- `portal-ticket-notify.spec` + `notification-push-meta.spec` OK.

## A medias / Adam

1. **Desplegar** Traefik/API P0 → `/go2rtc/api/streams` 404; rotar passwords + migrar `ACTIVITY_STARTED`.
2. AAB Play VERSION_CODE 7+.
3. Portal **sucursal**: comments/status API aún no.
4. Employee-payments / work-projects mutaciones; INTEGRA people CRUD+face.
5. DomainNotify facade formal (diseñado; hierarchy shortcuts ya cubren portal).
6. INTEGRA video/ANPR/mapa = Bloque 2.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
