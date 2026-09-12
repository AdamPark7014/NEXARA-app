# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Evidencia multi-persona

### Hecho

- Schema: `coreKind`, `evidencePhotoRequired`, `ActivityAssignee.indicaciones`, `ActivityEvidence` por `userId`.
- Migración `20260912010000_evidence_per_user_core_kind` aplicada.
- API create/team crea evidencia por persona; flujo con N fotos, PDF solo servicio, finalize cuando todos completan.
- Asignar: generales + notas por chip + stepper 2–8.
- ActivityEvidenceFlow adaptado (helpers web).
- Tablero: `openActivities` + barras %; historial `me/board/:id/history` embebido en perfil.

### A medias / cuidado

- `prisma generate` puede fallar EPERM si Nest tiene el query engine abierto → reiniciar API y regenerar.
- Callers OPS que leían `activityEvidence` singular: API ahora incluye `activityEvidences` (plural); algunos UIs legacy pueden necesitar mapear al responsable.

### Verificar

1. Asignar multi + notas + 3 fotos.
2. Entrar como assignee → pasos; sin PDF si no es servicio.
3. Barras bajo avatar en Actividades.
4. Perfil → historial con fotos/PDF.

## No tocar

Puente NAS. Plan file del usuario. Credenciales.


