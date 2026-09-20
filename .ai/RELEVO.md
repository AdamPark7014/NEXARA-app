# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-org-ux
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-org-ux`
- **HEAD:** (este commit)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

1. **OrgChartView UX** (`apps/web/components/organigrama/OrgChartView.tsx`):
   - Búsqueda por nombre/puesto (normaliza acentos): matches con borde/glow primary; no-matches atenuados (`opacity 0.28`).
   - Chips de filtro por área (datos `byDept` existentes) + chip «Todas».
   - Zoom − / % / + (0.5–1.5) vía `transform: scale` en el canvas; pan con overflow scroll + drag en fondo (ignora botones/inputs).
   - KPI strip denso + barra por depto intactos.
   - `trueRoots` / `danglingRoots` (Christian-as-root / huérfanos) sin cambios de API.

## A medias

- Nada en este worktree.

## Siguiente

- QA visual: buscar, filtrar área, zoom/pan en `/erp/organigrama`.
- Merge `feat/hard-org-ux` → rama de integración cuando Adam lo pida.

## No tocar

Puente NAS · API orgchart · props `OrgChartViewProps`.
