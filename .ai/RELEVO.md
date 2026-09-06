# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Push eficiente + paridad Wave A

### Push / notificaciones
- FCM: `collapseKey`, `channel`, `event`, `entityType`, `relatedEntityId`, `category`.
- `createNotification`: dedupe 120s + no auto-notif al actor.
- Android canales: ops / chat / approvals + ID estable por tag.
- `ACTIVITY_STARTED` (enum + migración) al pasar OT a En Proceso.
- Portal cliente: comentarios/ACK/confirm/reopen → hierarchy → FCM (ya no prisma crudo).
- Support request status change → notifica responsable OT.
- Workflow approve/reject: `relatedUrl` + canal approvals.

### Paridad móvil
- Vehicles admin + dispatch → **NATIVO** (approve/flotilla CRUD; board + bulk reassign).
- Campo: Iniciar/Finalizar en lista; statuses web; GPS con `actividadId`.
- EP / work-projects → **SOLO_LECTURA** (sin mutaciones aún).

### Verificación
- `:app:compileDebugKotlin` OK.
- `notification-push-meta` + `portal-ticket-notify` specs OK.

## A medias / Adam

1. **Desplegar** Traefik/API P0 → `/go2rtc/api/streams` 404; rotar passwords + migrar `ACTIVITY_STARTED`.
2. AAB Play VERSION_CODE 7+.
3. Portal **sucursal**: comments/status API aún no.
4. Employee-payments / work-projects mutaciones; INTEGRA people CRUD+face.
5. DomainNotify facade formal (diseñado; hierarchy shortcuts ya cubren portal).
6. INTEGRA video/ANPR/mapa = Bloque 2.

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
