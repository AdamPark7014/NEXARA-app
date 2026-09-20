# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/gate-toast-pre (desde origin/mejora/calidad-y-web)
- **HEAD:** (pendiente commit toast pre-nómina)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Worktree `C:\dev\apps\_worktrees\nexara-gate-toast-pre` · rama `feat/gate-toast-pre`.

Toast en fallos de acciones de pre-nómina (`PrenominaPanel`):

- Sync OT (`upsertOvertimeCandidates`): ya no traga el error con `.catch(() => null)`;
  `toast.error` + sigue cargando preview/lista OT.
- Lote de borradores: cuenta `skipped` (array del API); `toast.warning` si hubo
  omisiones con creates, `toast.error` si no se creó nada / solo skips.
- Fallos duros de batch siguen en `toast.error` (sin cambio).

## A medias / pendiente real

- Merge a `mejora/calidad-y-web` (rama WT va detrás del origin base).
- Deploy Hetzner sigue bloqueado por IP placeholder.

## Siguiente

1. Revisar/merge del gate toast-pre.
2. Adam: IP Hetzner o deploy.

## No tocar

Puente NAS.
