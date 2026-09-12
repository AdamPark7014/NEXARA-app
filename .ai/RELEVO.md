# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Foto entrada sigue rota

### Hecho

Causa real (tras el fix parcial de `getApiAssetOrigin`):

1. `/uploads` + cookie vía rewrite Next → API **sí funciona** (probado 200).
2. Archivo existe: `/uploads/attendance/1789240640561-s9rxke6e5.jpg`.
3. En **SSR**, `getApiAssetOrigin()` no ve `window` y cae a `NEXT_PUBLIC_API_URL` → `http://localhost:3001`. El `<img>` arranca cross-origin **sin cookie** → 401.

Fix: `resolveAssetUrl()` para rutas `/uploads/...` devuelve **path relativo** (nunca origen API). Misma estrategia que el historial del checador.

Archivos: `apps/web/lib/evidence-display.ts` (+ `api-base.ts` local same-origin del turno anterior).

### Verificar

1. **Hard refresh** (Ctrl+Shift+R) en `/erp/asistencias`.
2. Miniatura de entrada en tarjeta de David debe verse.
3. Network: `GET /uploads/attendance/...` en origen `:3000` → **200**.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan files.
