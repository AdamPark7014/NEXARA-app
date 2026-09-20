# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-viaticos-double
- **HEAD:** gate double-submit Marcar pagado (ConfirmDialog + filas)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Gate **doble submit** en Marcar pagado (viáticos / gastos / pagos a empleados):

1. `ConfirmDialog`: cerrojo síncrono `busyRef` (el `busy` de React no alcanza a pintar antes del segundo clic). Esc / backdrop respetan el ref. UI sigue con `busy` → «Procesando…» + disabled.
2. **Gastos** y **pagos a empleados**: `rowBusyId` — botón deshabilitado («Pagando…») mientras vuela la acción; toast de éxito ya existía.
3. **Viáticos**: ya tenía `rowBusyId` + toast; añadido early-return si hay fila en vuelo.
4. Test: `apps/web/components/ui/ConfirmDialog.spec.tsx` — Procesando… in-flight + doble clic síncrono solo llama `fn` una vez. **2/2 verde.**

Nota: `.ai/EXEC-PACKET.md` sigue siendo el packet viejo de Core UX (Actividades/Asistencias); **no aplica** a este worktree. Fuente de verdad del turno = pedido del gate + disco.

## A medias / pendiente

- Deploy Hetzner (IP/llave).
- Blindar periodo cerrado en las 7 rutas de escritura (relevo previo).
- Smoke contadora contra datos reales.

## Siguiente

Integrar `feat/gate-viaticos-double` en `mejora/calidad-y-web` cuando Adam lo pida.

## No tocar

Puente NAS.
