# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-labels-fac
- **HEAD:** (pending commit) labels ES facturas
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-labels-fac`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

### Gate labels — facturas (`contabilidad/facturas`)

En `ContabilidadInvoicesView` (usado por `/erp/contabilidad/facturas`):

- Mapa `ESTATUS_FACTURA`: DRAFT/STAMPING/SENT/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED/CREDITED → español
- `statusLabel` ya no deja enums crudos; SENT→Enviada, STAMPING→Timbrando, etc.
- «Parcial» alineado a «Pago parcial»
- Columna **Tipo** solo en `mode=all`: Emitida / Recibida (no ACCOUNTS_*)

## A medias

- Merge de `feat/gate-labels-fac` → `mejora/calidad-y-web` (coordinar con otras gate-labels-*)
- Ollama `implement -Apply` reescribió basura MUI; se restauró con checkout y edición quirúrgica

## Siguiente

1. Parent: merge feat/gate-labels-* tras revisar
2. Smoke UI facturas con datos reales

## No tocar

Puente NAS.
