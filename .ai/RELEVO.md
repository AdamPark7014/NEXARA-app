# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-status-labels
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-status-labels`
- **HEAD:** etiquetas español para enums de contabilidad (incl. match 3-way en cartera)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Enums crudos (`SENT` / `PENDING` / `MATCHED` / `DRAFT` / …) → etiquetas en español en UI de contabilidad:

- `apps/web/lib/finance-status-labels.ts` — un mapa `FINANCE_STATUS_LABELS` + `financeStatusLabel`.
- `proyectos` / `proveedores`: `EstatusDot` usa el helper (sin mapas locales).
- `movimientos`: columna Estado y detalle pasan por el helper.
- `CarteraView` (CxC/CxP): `factura.match` y títulos de historial tipo match traducen `MATCHED`/`PENDING`/`VARIANCE`/`WAIVED`/`NOT_REQUIRED`.

Conciliación ya tenía `ESTADO_LABEL` propio; no tocada. Facturas genéricas ya tenían `statusLabel` local.

## A medias

- EXEC-PACKET del repo sigue siendo el de Core Actividades (13-09); no aplica a este gate.
- Ollama `implement -Apply` rompe archivos grandes (reescribe con mensajes de error); en este turno se restauró y se parcheó a mano lo mecánico.

## Siguiente

1. Integrar `feat/gate-status-labels` a `mejora/calidad-y-web` cuando Adam lo pida.
2. Smoke visual en proyectos, proveedores, movimientos y detalle de cartera (campo Conciliación).

## No tocar

Puente NAS.
