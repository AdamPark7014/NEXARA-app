# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-labels-con
- **Worktree:** `C:\dev\apps\_worktrees\nexara-gate-labels-con`
- **HEAD:** ui(conciliacion): etiquetas ES para MATCHED/PENDING

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

- Worktree `nexara-gate-labels-con` desde `origin/mejora/calidad-y-web`, rama `feat/gate-labels-con`.
- En `apps/web/app/(panels)/erp/contabilidad/conciliacion/page.tsx`:
  - `RECON_STATUS_LABEL` para enums crudos `MATCHED` / `PENDING` / `UNMATCHED` / `IGNORED` / `PARTIAL` / `VARIANCE`.
  - Helper `estadoTexto()` (UI states + enums API) en StatusDot y aria-live.
  - Los filtros (`ESTADO_LABEL` / FilterScale) ya estaban en español; no se tocaron.

## A medias / pendiente real

- Merge de `feat/gate-labels-con` → `mejora/calidad-y-web` (otras WTs de labels en paralelo).
- Deploy Hetzner sigue bloqueado por HostName placeholder.
- EXEC-PACKET en disco sigue stale (Actividades 13-09); no ejecutado.

## Siguiente

1. Revisar/mergear con otras ramas `feat/gate-labels-*`.
2. Adam: IP/llave Hetzner o deploy manual.

## No tocar

Puente NAS.
