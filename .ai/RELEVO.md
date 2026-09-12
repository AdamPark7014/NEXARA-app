# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Core ola1 merge A+B (C+D pendiente)

### Hecho

1. **Fase A (shell+seed):** `CORE_SURFACE_ONLY` → sidebar/panels/home ola1; access-matrix ModuleIds; home `/erp/pizarra`; middleware NON_CORE → core; seed → `seed-core-roster.ts`.
2. **Fase B (pizarra):** `GET /api/me/board` + `TeamBoardService` (company/subtree + semáforo); página `/erp/pizarra` + `team-board-api.ts`.
3. Merge de `cursor/core-ola1-a` + `cursor/core-ola1-b` en `mejora/calidad-y-web`.

### Verificar

- Login `gerencia@nexara.com.mx` / `Nexara!NX001` → `/erp/pizarra`; switcher solo Core.
- `npm run prisma:seed --workspace=apps/api`
- `GET /api/me/board` con JWT.

### A medias / siguiente

- Fase C+D (worktree `cursor/core-ola1-cd`): asistencias + actividades 3 buckets — agente en curso.
- Tras C+D: seed local + typecheck + relevo cerrar.

## No tocar

Puente NAS. Credenciales. Plan file. Worktree CD hasta merge.
