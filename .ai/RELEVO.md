# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Plan arreglo P0 post-auditoría (olas 0–3)

Adam autorizó Traefik. Se implementó el plan priorizado completo.

### Wave 0 — 502 / infra
- Timeouts Node: request 120s, keepAlive 95s, headers ≥96s (`main.ts`).
- Migraciones fuera del CMD API; healthchecks compose + Traefik healthCheck.
- Traefik: filtro go2rtc por path (ya no filtra RTSP con password); aliases rotos
  retirados del redirect HTTP permanente; `/api`+socket en aliases vivos.
- Env `CORS_ORIGIN` / `MAX_FILE_SIZE` inyectados; `X-Company-Id` en CORS.
- Tope `take: 200` activities/viatics; dashboard Android degradación suave.
- URL evidencias → `WebPanelUrl` / core (no `consola`).

### Wave 1 — seguridad
- Evidencias approve/reject: reviewer JWT + `EVIDENCES_REVIEW`.
- Metrics: no público; chat/mobile-crm con StaffOnly+Rbac.
- Offline: Idempotency-Key, cache por hash de token, multipart binario, clear on logout.
- Compresión JPEG `ImageDataUrl`. IP rate-limit desde `req.ip`.

### Wave 2 — RBAC
- `roleKey` sync en create/update desde `Role.orgRoleKey`.
- page-matrix + section-views: administrativo, vendedor, arquitecto, ing_soporte.
- PanelAccessResolver: claves v2 + tokens (rh ya no queda en cero paneles).

### Wave 3 — compliance / Play / docs
- Asistencia foto obligatoria; lunch TZ México; GPS 0,0 rechazado.
- Play: VERSION_CODE=6, sin Analytics/AD_ID, SessionStore fallback, cámara API&lt;29.
- Informes 07/09 escritos; 11 completado con fichas de proceso.

### Auditoría
Salvada en `be7f0a53` + docs nuevos bajo `.ai/auditoria-2026-09/`.

## A medias / verificar en prod

1. **Desplegar** compose + Traefik dinámico; confirmar curl a `/go2rtc/api/streams` → 404.
2. **Rotar passwords de cámaras** después del filtro Traefik.
3. go2rtc.yaml servidor / cámara 601 (turnos INTEGRA previos).
4. `DELETE devices/push-token` aún ausente en API.
5. Unificar matrices RBAC a largo plazo (`GET /me/navigation`).

## No tocar

Puente NAS. Credenciales en repo. No inventar ANPR/ISAPI. No hls.js CDN.
