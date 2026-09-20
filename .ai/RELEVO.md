# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** gate/ds-gastos
- **HEAD:** (pendiente commit) cerrojo anti doble-submit Marcar pagado en gastos
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-ds-gastos`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Cerrojo anti doble-submit en ERP Gastos (`expenses/page.tsx`):

- Estado `rowBusyId` en filas
- `runMarkPagado` / `remove`: early-return si hay acción en vuelo; `setRowBusyId` + `finally` clear
- Botón «Marcar pagado» deshabilitado + label «Pagando…» mientras corre
- Botón «Eliminar» deshabilitado mientras la fila está ocupada
- `ConfirmDialog` ya tenía `busy` en esta base — no se tocó

## A medias / pendiente real

- Rama `gate/ds-gastos` está 12 commits detrás de `origin/mejora/calidad-y-web` (WT creado en 4a268528); merge/rebase a elección de Adam
- Deploy Hetzner sigue bloqueado por IP placeholder

## Siguiente

1. Merge `gate/ds-gastos` → `mejora/calidad-y-web` cuando convenga
2. Opcional: mismo patrón en employee-payments si aún no está en mainline

## No tocar

Puente NAS.
