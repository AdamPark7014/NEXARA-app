# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-status-labels
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-status-labels`
- **HEAD:** helpers de estatus en español para UI de contabilidad

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Etiquetas humanas para enums de factura/pago en contabilidad:

- Nuevo `apps/web/lib/finance-status-labels.ts` con `invoiceStatusLabel`, `paymentStatusLabel`, `financeStatusLabel` (y `financeMatchLabel`).
- `proyectos` y `proveedores`: quitaron mapas locales `ESTATUS_LABEL`; `EstatusDot` usa `financeStatusLabel`.
- `movimientos`: columna Estado y detalle pasan por `financeStatusLabel` (SENT/PENDING/MATCHED/DRAFT/PAID/CANCELLED → español; texto ya en español se deja igual).

Cartera / facturas CxC-CxP ya tenían etiquetas derivadas (`estadoEtiqueta` / `statusLabel` local); no tocadas.
Conciliación ya tenía `ESTADO_LABEL` propio (CONCILIADO/PENDIENTE…); no tocada.

## A medias

- Ollama `implement -Apply` reescribió páginas enteras con basura en este turno; se restauró desde HEAD y se parcheó a mano. El worker local sigue frágil con archivos grandes.
- EXEC-PACKET del repo sigue siendo el de Core Actividades (13-09), no este gate; no se ejecutó ese packet.

## Siguiente

1. Integrar `feat/gate-status-labels` a `mejora/calidad-y-web` cuando Adam lo pida.
2. Opcional: reutilizar `invoiceStatusLabel` en `ContabilidadInvoicesView` / CRM facturas para un solo mapa.
3. Smoke visual en `/erp/contabilidad/proyectos`, `proveedores`, `movimientos`.

## No tocar

Puente NAS.
