# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-datatable-aria
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-datatable-aria`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

- `DataTable` ya tenía `role="region"` + prop `ariaLabel` (default `"Tabla"`) desde el rescue / commit previo.
- `ConfirmDialog` ya tenía `whiteSpace: "pre-line"` (conserva saltos de línea en el mensaje; equivalente al pedido de pre-wrap).
- Añadí `ariaLabel` específico en las DataTable de finanzas/contabilidad que solo heredaban el default genérico:
  - finance: gastos, viáticos, pagos a empleados
  - cartera, facturas, detalle de reportes
  - movimientos, conciliación, cierres, auditoría, reportes, pre-nómina (hub + panel)
- Viatics se restauró en commit previo tras corrupción por Ollama (`cdf4285e`).

## A medias

- Nada en esta rama.

## Siguiente

- Integrar `feat/gate-datatable-aria` en la rama de calidad cuando toque el gate a11y.
- Un solo writer por worktree (evitar `implement -Apply` en páginas grandes: Ollama las vacía).

## No tocar

Puente NAS.
