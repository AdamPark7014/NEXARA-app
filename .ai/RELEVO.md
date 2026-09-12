# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** cursor/core-ola1-a
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fase A Core-only shell + seed

### Hecho

1. **Core surface filter:** `CORE_SURFACE_ONLY` filtra sidebar/panels/home a ola1 (`pizarra`, `asistencias`, `chat`, `activities-*`, `my-profile`).
2. **access-matrix:** ModuleIds + MODULES ola1; `PANEL_META.erp.entryPath=/pizarra`; `getAllowedPanels`/`getHomeUrl` core-only.
3. **access-tree:** core panel = ola1 toggles; otros paneles ocultos si CORE.
4. **user-access / panel-home / PanelSwitcher:** solo ERP; home `/erp/pizarra`; lab exception off bajo core-only.
5. **middleware:** soft redirect `NON_CORE_SUBDOMAINS` → `core.nexara.com.mx`.
6. **RBAC:** `CORE_OLA1_PAGE_PATHS` / `CORE_OLA1_URL_RULES` + navigation-module-map hints.
7. **Seed:** `prisma seed` → `seed-core-roster.ts` (managerId, isActive, DEACTIVATE_EMAILS, moduleAccess).

### Verificar (manual Adam)

- Login `gerencia@nexara.com.mx` → aterriza `/erp/pizarra`; switcher solo Core.
- `npm run prisma:seed --workspace=apps/api` (o `cd apps/api && npx prisma db seed`).

### A medias / siguiente

- Páginas pizarra/asistencias/actividades (otros agentes).
- No merge a main.

## No tocar

Puente NAS. Credenciales. Plan file. Páginas pizarra/asistencias/actividades de otros worktrees.
