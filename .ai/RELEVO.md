# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-act-photos
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-act-photos`
- **HEAD:** (este commit)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

UX evidencia fotos enterprise-visual:

1. **EvidenciaPorCampos** — heroes ~320px, stack full-width Antes/En progreso/Después; click → `Visor` (ya existía). ZIP intacto.
2. **EquipoEvidencias** — `Miniatura` default 300px; entrada/salida/sitio ~300–320; lightbox `Visor` a ~viewport (`maxHeight: calc(100dvh - 140px)`), nav ≥44px.
3. **ActivityEvidenceReviewPanel** — thumbs 120→300 + `FotoProtegida`/`Visor` (prev/next/counter/ESC); ZIP intacto.
4. Peer requests: **no tocado** (`rejectionReason` / motivo rechazo sigue como estaba).

## A medias

- Vitest en este worktree: sin `node_modules` local (deps en main). QA visual pendiente en detalle/aprobaciones.

## Siguiente

- QA visual móvil/desktop en `/ops/activities/:id` evidencias y cola de revisión.
- Merge a `mejora/calidad-y-web` cuando Adam diga.

## No tocar

Puente NAS. Peer-request reject UI salvo pedido explícito.
