# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** gate/money2
- **HEAD:** (pendiente commit money2)
- **Worktree:** C:\dev\apps\_worktrees\nexara-gate-money2

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Money2 — bare `toLocaleString` currency → `<Money>` en Contabilidad (4 archivos):

- `contabilidad/proyectos/page.tsx` — footer de categoría, presupuesto en lista,
  hints MetricStrip, párrafo de presupuesto; eliminado helper `pesos`
- `contabilidad/proveedores/page.tsx` — por vencer / monto órdenes / hint; `pesos`
  solo queda para `StatusDot title=`
- `contabilidad/movimientos/page.tsx` — Importe del modal detalle; `DetailRow`
  acepta `ReactNode`
- `contabilidad/conciliacion/page.tsx` — rango, subtitle saldo, EmptyState,
  `textoDiferenciaMonto`; `formatPesos` solo para `InlineAlert message=`

EXEC-PACKET en disco sigue stale (Actividades 13-09); no ejecutado (tarea
explícita money2).

## A medias / pendiente real

- Deploy Hetzner bloqueado (`HostName REEMPLAZA_CON_IP_HETZNER`)
- `InlineAlert.message` y `StatusDot.title` siguen siendo `string` → no admiten
  `<Money>`; quedan helpers de texto plano mínimos
- Smoke navegador con datos reales

## Siguiente

1. Merge `gate/money2` → `mejora/calidad-y-web` cuando Adam diga
2. Opcional: ampliar `InlineAlert.message` a `ReactNode` y retirar `formatPesos`/`pesos`
3. Claude: regenerar EXEC-PACKET si hace falta

## No tocar

Puente NAS.
