# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Arreglo: despachar a una 2.ª persona daba 409

### Hecho

1. Síntoma: Luis despachaba AN-0001 a Antonio y salía `{"statusCode":409,"errorCode":"DUPLICATE"...,"path":"/api/activities/1/team"}`.
2. Causa: la migración `20260912010000_evidence_per_user_core_kind` solo borraba *constraints* únicos, pero Prisma había creado la unicidad vieja como *índice* `activity_evidences_activityId_key`. Sobrevivió junto al nuevo `(activityId, userId)`, así que el `activityEvidence.upsert` de `ActivityTeamService.addMember` fallaba (P2002) al sumar a cualquier 2.ª persona a un equipo. La fila de assignee sí se creaba; la evidencia no.
3. Arreglo: migración nueva `20260913180000_drop_evidence_activity_unique_index` (DROP INDEX + barrido de índices únicos solo por activityId). Aplicada en Docker. Único dato afectado: actividad 1 / Antonio (assignee sin evidencia); se corrige solo al reintentar «Asignar al equipo».
4. «Pendiente de despacho» ya no se queda pegado: la API manda `teamEmails` en `openActivities` (`team-board.service.ts`) y `DespachoPendingPanel` solo lo muestra si nadie del grupo del encargado está asignado (Luis → Antonio; Antonio → Carolina/Alejandro; David → instaladores). Antes Antonio nunca lo veía como pendiente y Luis lo veía para siempre.
5. Checkbox gigante en el panel de despacho: estilo propio 20×20 (el input global ocupa 100% de ancho).
6. Sigue vigente el turno anterior (commit 2e5732c2): Mis actividades + auto-asignación; EXEC-PACKET de usabilidad LISTO PARA CURSOR (no empezado).

### Verificado

- `prisma migrate deploy` aplicó `20260913180000_drop_evidence_activity_unique_index`; en `activity_evidences` ya solo queda el único `(activityId, userId)`.
- `tsc --noEmit` API: limpio.
- `tsc --noEmit` web: sin errores nuevos; siguen 4 previos y ajenos.
- Docker 18:04 UTC: `build api web` + `up -d`. API arrancó sin errores; `dist/me/team-board.service.js` trae `teamEmails` y la imagen incluye la migración nueva; el bundle de `pizarra/[userId]` trae el filtro; `/api/me/board` y `/api/activities/1/team` → 401 sin sesión; `/erp/pizarra/7` 200.

### Falta probar a mano

1. Luis → su ficha → «Pendiente de despacho» → AN-0001 → Antonio → «Asignar al equipo»: sin error y desaparece del panel de Luis.
2. Antonio → su ficha: AN-0001 aparece en su «Pendiente de despacho»; elige Carolina o Alejandro y desaparece.
3. Checkbox del panel de tamaño normal.

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad Actividades + Asistencias). Al desplegar a producción, la migración `20260913180000_drop_evidence_activity_unique_index` debe ir junto con `20260912010000`, o el 409 aparecerá allá también.

### No tocar

Puente NAS.
