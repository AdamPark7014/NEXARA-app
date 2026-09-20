# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/opt-opt-org
- **HEAD:** (este commit) worktree `nexara-opt-org` — no tocar `C:\dev\apps\NEXARA-app`
- **Migraciones:** sin cambios

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

1. **Organigrama UI denser** (`OrgChartView.tsx` only):
   - KPIs densos (`minmax(100px)`) + «Por departamento» como barra apilada horizontal + leyenda en una sola franja.
   - Nodos ~204px, padding/avatar/tag más compactos; `Section dense`; menos padding del árbol y bloque huérfanos.
2. No se tocó API orgchart ni exclusión Christian/Claudia; no se tocó `orgchart-layout.ts`.

## A medias

- Vitest en este worktree no corre (falta `@vitejs/plugin-react` en `node_modules`); helpers no cambiaron.

## Siguiente

- QA visual `/erp/organigrama` en el worktree build.
- Merge de `feat/opt-opt-org` cuando Adam lo pida.

## No tocar

Puente NAS · `C:\dev\apps\NEXARA-app` (este turno es solo worktree).
