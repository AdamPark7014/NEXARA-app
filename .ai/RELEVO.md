# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Foto de entrada rota (Equipo del día)

### Hecho

Causa: `resolveAssetUrl` → `getApiAssetOrigin()` en local caía a `NEXT_PUBLIC_API_URL` (`:3001`). El `<img>` pedía la foto cross-origin sin cookie de sesión → **401** → icono roto. El archivo en disco sí existía (`uploads/attendance/...`).

Fix: en local (`localhost` / `127.0.0.1` / `*.localhost`) `getApiAssetOrigin()` usa `window.location.origin` (same-origin → rewrite Next `/uploads` → API con cookie).

Archivo: `apps/web/lib/api-base.ts`.

### Verificar

1. Hard refresh `/erp/asistencias` (sesión abierta).
2. En la tarjeta de quien tiene entrada, la miniatura debe verse (no icono roto).
3. Network: request a `http://localhost:3000/uploads/attendance/...` → **200**, no a `:3001`.

## A medias

Nada.

## Siguiente

Lo que Adam diga. (Pendiente previo: reinicio API si Prisma client no tiene `assignmentCharge`.)

## No tocar

Puente NAS. Plan files bajo `.cursor/plans/`.
