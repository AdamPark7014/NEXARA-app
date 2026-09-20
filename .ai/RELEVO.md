# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-metric-href
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-metric-href`
- **HEAD (antes):** rescue WIP `ef87cfb2`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Gate MetricStrip `href` en contabilidad/finance (solo navegación):

- Busqué usos de `MetricStrip` bajo `erp/contabilidad` y `erp/finance`.
- Únicos `onClick` que solo navegaban: dashboard `apps/web/app/(panels)/erp/contabilidad/page.tsx` — Disponible → conciliación, Por cobrar → CxC, Por pagar → CxP.
- Convertidos a `href`; quitados `useRouter` y su dependencia del `useMemo`.
- En finance, los `onClick` de gastos/pagos solo filtran estado en sitio → se dejaron.

## A medias

- Nada de este gate.

## Siguiente

1. Integrar `feat/gate-metric-href` cuando el resto de gates del wall estén listos.
2. Pendientes globales de la ola contadora (deploy Hetzner, blindar periodo cerrado, smoke real) siguen fuera de este worktree.

## No tocar

Puente NAS. Otros worktrees del gate wall.
