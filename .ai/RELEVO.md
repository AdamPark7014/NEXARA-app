# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
<<<<<<< HEAD
- **Rama:** cursor/core-ola1-a
=======
- **Rama:** cursor/core-ola1-b
>>>>>>> cursor/core-ola1-b
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

<<<<<<< HEAD
## Este turno — Fase A Core-only shell + seed

### Hecho

1. **Core surface filter:** `CORE_SURFACE_ONLY` filtra sidebar/panels/home a ola1 (`pizarra`, `asistencias`, `chat`, `activities-*`, `my-profile`).
2. **access-matrix:** ModuleIds + MODULES ola1; `PANEL_META.erp.entryPath=/pizarra`; `getAllowedPanels`/`getHomeUrl` core-only.
3. **access-tree:** core panel = ola1 toggles; otros paneles ocultos si CORE.
4. **user-access / panel-home / PanelSwitcher:** solo ERP; home `/erp/pizarra`; lab exception off bajo core-only.
5. **middleware:** soft redirect `NON_CORE_SUBDOMAINS` → `core.nexara.com.mx`.
6. **RBAC:** `CORE_OLA1_PAGE_PATHS` / `CORE_OLA1_URL_RULES` + navigation-module-map hints.
7. **Seed:** `prisma seed` → `seed-core-roster.ts` (managerId, isActive, DEACTIVATE_EMAILS, moduleAccess).
=======
## Este turno — Fase B: pizarra + team board API

### Hecho

1. **TeamBoardService** (`apps/api/src/me/team-board.service.ts`): scope company (CEO/superAdmin/roleKey ceo / emails gerencia|developer) vs subtree por `managerId`; status semáforo desde Activity abierta + Attendance hoy + GPS (`LocationTracking`) reciente; `currentActivity` con AN/bucket.
2. **Nest:** `MeModule` registra servicio + PrismaModule; `GET me/board` en `MeController` (JWT + companyId).
3. **Web:** `apps/web/app/(panels)/erp/pizarra/page.tsx` grid semáforo + `apps/web/lib/team-board-api.ts`.
4. No se tocó access-matrix (Agent A). No se crearon páginas asistencias/actividades.
>>>>>>> cursor/core-ola1-b

### Verificar

<<<<<<< HEAD
- Login `gerencia@nexara.com.mx` → aterriza `/erp/pizarra`; switcher solo Core.
- `npm run prisma:seed --workspace=apps/api` (o `cd apps/api && npx prisma db seed`).

### A medias / siguiente

- Páginas pizarra/asistencias/actividades (otros agentes).
- No merge a main.

## No tocar

Puente NAS. Credenciales. Plan file. Páginas pizarra/asistencias/actividades de otros worktrees.
=======
- `GET /api/me/board` con Bearer JWT (gerencia = scope company).
- Web: `/erp/pizarra` (ruta; menú lo registra Agent A).

### A medias / siguiente

- Agent A: registrar módulo/ruta pizarra en shell/access-matrix si aún no.
- Merge de olas cuando A/B/CD listos.

## No tocar

Puente NAS. Credenciales. Worktrees A/CD. Plan acomodado. No fingir EN VIVO.
>>>>>>> cursor/core-ola1-b
