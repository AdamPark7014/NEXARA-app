# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fix Unauthorized pizarra (127 vs localhost)

### Hecho

1. Causa real: página en `127.0.0.1:3000` + `NEXT_PUBLIC_API_URL=http://localhost:3001/api` → cookie HttpOnly en jar `localhost`, fetch desde `127.0.0.1` no la manda → 401.
2. `getApiBase()` local ahora siempre `${currentOrigin}/api` (rewrite Next).
3. Login `credentials: include`.
4. Spec: caso 127.0.0.1.

### Verificar (Adam)

1. Cerrar sesión / borrar cookies del sitio.
2. Entrar de nuevo en **la misma URL** (`http://127.0.0.1:3000` o `http://localhost:3000`, no mezclar).
3. `/erp/pizarra` debe mostrar el grid.

## No tocar

Puente NAS. Credenciales. Plan file.
