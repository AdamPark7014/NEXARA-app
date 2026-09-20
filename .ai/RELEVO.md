# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-warehouse
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-warehouse`
- **HEAD:** (este commit)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno (warehouse audit TOP)

1. **ScannerAlmacenPanel**: buffer HID (ráfaga + Enter), min length 3, ignore Enter mientras loading/saving; ops RECEIPT|DISPATCH|TRANSFER|ADJUSTMENT(+baja)|RETURN; from/to según tipo; padding densificado.
2. **VistaAlmacen**: opción RETURN en create movement + toWarehouse como RECEIPT.
3. **page.spec** `/erp/almacen`: 6 tabs con Escáner; mock scanner; 8 tests OK.

## Siguiente

- Resto del warehouse audit (DISPATCH+activityId / sin CONSUME enum).
- Merge `feat/hard-warehouse` → rama principal cuando Adam lo pida.

## No tocar

Puente NAS · main `NEXARA-app` (este trabajo es solo worktree).
