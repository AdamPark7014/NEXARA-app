# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-08
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — 403 en Resumen ejecutivo (`coord_operaciones`)

Adam mandó captura del Samsung: home OPS «Resumen ejecutivo» (semana
2026-09-07 → 2026-09-13) con:

> Tu rol (coord_operaciones) no puede acceder a GET /api/viatics

### Causa (dos capas)

1. **RBAC API:** `PAGE_MATRIX` da `/ops/**` a `coord_operaciones` (incluye
   viáticos de equipo y el comentario «aprueba viáticos»), pero
   `url-matrix.ts` **no** tenía `/api/viatics/**`. La web/app abrían el home y
   el guard de URL respondía 403.
2. **Android home:** `ConsoleDashboardScreen` trataba cualquier fallo de
   `viaticsFetch()` como error duro y hacía `return@LazyColumn` — pantalla en
   blanco solo con el banner, aunque actividades/asistencia hubieran cargado.

### Qué se cambió

- `apps/api/src/common/rbac/url-matrix.ts` — `COORD_OPERACIONES`:
  `/ops/viatics/**`, `/api/viatics/**`, `/api/viaticos/**` con scope `approve`.
  Verificado local: `checkUrlAccess(coord_operaciones, GET /api/viatics)` →
  `allowed`.
- `ConsoleDashboardScreen.kt` — solo las **actividades** tumbaron el home;
  viáticos degradan a lista vacía.
- `ApiErrors.kt` — helper `isForbidden()` (403) para reutilizar en secciones
  opcionales.

### Para que el teléfono deje de fallar YA

Hay que **desplegar la API** en Hetzner (`nexara-api`). Con solo el fix RBAC
en prod, «Reintentar» en la app publicada basta; el soft-fail Android llega en
el próximo build de Play.

## Heredado vivo

- Demo store: `play.review@nexara.com.mx`; creds en `C:\dev\secrets\nexara-store\`.
- Enrollment Apple `49J96Q3WQ3` — esperando correo/pago.
- Paridad iOS CI / 64 endpoints Android-behind: ver turno claude-code anterior.
- Rotar contraseñas de cámaras (fuga de go2rtc cerrada).

## A medias

Nada de este bug. Despliegue API pendiente de Adam.

## No tocar

Puente NAS. Credenciales Apple. No fingir EN VIVO en INTEGRA. Contraseña del
revisor fuera de git. **No marcar `NATIVO` lo que solo lista.**
