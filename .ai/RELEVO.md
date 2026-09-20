# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-datatable-aria
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-datatable-aria`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

- `DataTable` (`apps/web/components/ui/DataTable.tsx`): prop opcional `ariaLabel` con default `"Tabla"` (mismo patrón que `PanelTabs` / `MetricStrip` / `ContextRail`). La región usa `aria-label={ariaLabel}` en lugar de `?? "Tabla de datos"`.

## A medias

- Nada en esta rama.

## Siguiente

- Integrar `feat/gate-datatable-aria` en la rama de calidad cuando toque el gate de a11y.
- El EXEC-PACKET del repo sigue siendo el de Core UX Actividades/Asistencias (viejo); no aplica a este worktree.

## No tocar

Puente NAS.
