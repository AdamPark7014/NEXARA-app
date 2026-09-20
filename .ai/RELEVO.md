# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-datatable-aria
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-datatable-aria`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

- `DataTable`: prop opcional `ariaLabel` con default `"Tabla"` (patrón PanelTabs/MetricStrip/ContextRail).
- Restauró `apps/web/app/(panels)/erp/finance/viatics/page.tsx` que el commit anterior había dejado como mensaje de rechazo de Ollama (colisión de workers).

## A medias

- Nada en esta rama.

## Siguiente

- Integrar `feat/gate-datatable-aria` cuando toque el gate de a11y.
- Evitar más de un writer Ollama sobre el mismo worktree (hubo corrupción cruzada en viatics/CarteraView).

## No tocar

Puente NAS.
