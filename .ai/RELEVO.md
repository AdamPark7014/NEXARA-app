# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** feat/hard-act-flow
- **Worktree:** `C:\dev\apps\_worktrees\nexara-hard-act-flow`
- **HEAD:** (este commit)

## Hecho este turno (audit hard-act-flow)

1. **Web field-photo capture:** `ActivityEvidenceFlow` carga `campos` del GET evidence; si hay campos, captura ANTES/EN_PROGRESO/DESPUES vía `POST activity-evidence/:id/campos/:fieldId/foto` (`guardarFotoDeCampo` / `quitarFotoDeCampo` en `evidencia-campos.ts`). Avance del paso manda `photoUrls: []` para no duplicar en ZIP.
2. **Gallery UX:** click en miniatura abre lightbox; borrar solo con ✕ / «Quitar foto».
3. **Peer reject:** `SolicitudesEquipoView` deshabilita Rechazar hasta `rejectReason.trim().length >= 3` + hint inline.
4. **AsignadasPorMiView:** chips cliente semáforo / excedida / terminada + select persona; helper `filtrarAsignadasPorMi` + spec.
5. Tests: `evidencia-campos.spec.ts` (+faltanFotosDeCampos) y `AsignadasPorMiView.spec.ts` — 27 verdes.

## No tocado (por diseño / conflicto)

- Mis actividades → PersonaPhotoCard (dos layouts se mantienen).
- EquipoEvidencias (otro worktree hard-act-photos).
- CFDI, ZIP download intacto.

## Siguiente

- Merge con hard-act-photos / rama base cuando Adam diga.
- QA manual: actividad con campos en web + rechazo peer + filtros asignadas.
- EXEC-PACKET del repo sigue siendo el de Core UX 13-09 (stale); este turno siguió el brief del audit.

## No tocar

Puente NAS Synology `192.168.9.32` / `nas-nexara`.
