# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** cursor/core-ola1-b
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fase B: pizarra + team board API

### Hecho

1. **TeamBoardService** (`apps/api/src/me/team-board.service.ts`): scope company (CEO/superAdmin/roleKey ceo / emails gerencia|developer) vs subtree por `managerId`; status semáforo desde Activity abierta + Attendance hoy + GPS (`LocationTracking`) reciente; `currentActivity` con AN/bucket.
2. **Nest:** `MeModule` registra servicio + PrismaModule; `GET me/board` en `MeController` (JWT + companyId).
3. **Web:** `apps/web/app/(panels)/erp/pizarra/page.tsx` grid semáforo + `apps/web/lib/team-board-api.ts`.
4. No se tocó access-matrix (Agent A). No se crearon páginas asistencias/actividades.

### Verificar

- `GET /api/me/board` con Bearer JWT (gerencia = scope company).
- Web: `/erp/pizarra` (ruta; menú lo registra Agent A).

### A medias / siguiente

- Agent A: registrar módulo/ruta pizarra en shell/access-matrix si aún no.
- Merge de olas cuando A/B/CD listos.

## No tocar

Puente NAS. Credenciales. Worktrees A/CD. Plan acomodado. No fingir EN VIVO.
