# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fix 401 pizarra / Core fetches

### Hecho

1. Causa: cliente enviaba `Bearer session-cookie` (sentinel) **sin** `credentials: "include"` → la cookie HttpOnly `nexara_token` no viajaba a `:3001` → JWT guard 401.
2. Fix: `credentials: "include"` en `erp-api.ts`, `ops-activities-api.ts`, `OpsActivitiesBoard.tsx`, `asistencias/page.tsx`.
3. Pizarra: `formatApiError` en vez de JSON crudo.

### Verificar

- Hard refresh `/erp/pizarra` logueado como gerencia → grid semáforo (no 401).
- Asistencias + actividades igual.

### A medias / siguiente

- Ola E encargados/instaladores.
- Worktrees core-* pendientes de borrar.

## No tocar

Puente NAS. Credenciales. Plan file.
