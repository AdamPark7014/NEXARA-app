# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fix GPS tras entrada (David)

### Hecho

- Causa: entrada OK; fallaba `PATCH /gps/consent` + `POST /gps` porque exigían `GPS_VIEW` y `coord_operaciones` solo tenía `GPS_MANAGE`.
- `auth.service.ts`: ops managers también reciben `GPS_VIEW`.
- `gps.controller.ts`: create / me / consent aceptan `GPS_VIEW` **o** `GPS_MANAGE`.
- `SELF_ATTENDANCE_URL_RULES`: POST/PATCH GPS propio + heartbeat.
- `AttendanceForm`: soft-fail GPS si la checada ya quedó.

### Verificar

1. Reiniciar API si hace falta.
2. **Cerrar sesión y volver a entrar** como David (`operaciones@…`) — el JWT cachea permisos.
3. Entrada → verde sin «No tienes permisos»; ubicación compartida.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
