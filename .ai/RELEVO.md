# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Pizarra limpia + fix logout

### Hecho

1. **Logout loop:** `auth/profile` + notifs + `apiRequest` con `credentials: include`.
2. **Guía basura:** `ModuleGuideBanner` oculto si `CORE_SURFACE_ONLY`.
3. **Pizarra limpia:** grid fotos + semáforo + OT; click → drawer (entrada, tiempos, asignar).
4. **Board API:** `clockInAt`, `workedMinutes`, `activityStartedAt`, `activityElapsedMinutes` + `GET me/board/:userId`.

### Verificar

- Hard refresh `http://127.0.0.1:3000` → login → pizarra sin bloque "Guía · no producción".
- Click persona → drawer; no kick a login cada segundos.

## No tocar

Puente NAS. Credenciales. Plan file.
