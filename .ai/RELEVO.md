# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-filter-scale (worktree `nexara-gate-filter-scale`)
- **HEAD:** (pendiente commit FilterScale)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

FilterScale en listados/escalas de contabilidad que seguían con MetricStrip ad-hoc:

- `CarteraView` CalendarioCxP: escala «Qué sale de caja» → `FilterScale` ligada a `aging`
- `ContabilidadInvoicesView`: calendario CxP → `FilterScale` que filtra la lista
- `proveedores/page.tsx` detalle «Antigüedad del saldo» → `FilterScale` que filtra facturas

Worktree: `C:\dev\apps\_worktrees\nexara-gate-filter-scale` desde `origin/mejora/calidad-y-web`.

## A medias

- EXEC-PACKET del hub sigue stale (Actividades 13-09); no es este gate
- IIFE en CalendarioCxP se puede bajar a variables locales (cosmético)

## Siguiente

1. Merge `feat/gate-filter-scale` → `mejora/calidad-y-web` cuando pase review
2. Smoke CxP + expediente proveedor porPagar

## No tocar

Puente NAS.
