# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Despacho sin evidencia, registro y avisos a Luis + Christian

### Hecho

1. Petición de Adam: en actividades de despacho quien reparte (Luis, Antonio) no adjunta evidencia, solo la pasa a quien debe y queda un registro; cuando llega al ingeniero de soporte, el seguimiento y estatus es de Luis; todos los avisos conectados también a Christian; lo repartido pasa a «En seguimiento».
2. Regla: en `assignmentCharge = despacho`, el LEAD (incluido el responsable) solo reparte. API: `ActivitiesService.create` y `ActivityTeamService.addMember` ya no crean su `ActivityEvidence`; `getOrCreateActivityEvidence` le responde 403; `maybeFinalizeActivity` ya no le exige evidencia para el cierre automático (antes Luis y Antonio bloqueaban el cierre).
3. Registro de despacho: `ActivityAssignee.asignadoPorId` (migración `20260913190000_assignee_dispatch_log`, con backfill del responsable = creador y borrado de evidencias vacías de quienes reparten). `POST /activities/:id/team` guarda quién asignó. `GET /activities/:id/timeline` agrega eventos `despacho` («Luis la pasó a Antonio», «Antonio la asignó a Carolina», con cupo/indicaciones).
4. Avisos (`notification-hierarchy.service.ts`): helper `getCeoUserIds` (gerencia@). Asignación, despacho (`notifyActivityDispatched`: a quien recibe, al responsable y a Christian), inicio, evidencias enviadas (ahora con el técnico real como autor + responsable + Christian), aprobación/rechazo (responsable + dueño de la evidencia + Christian) y cierre automático (`notifyActivityAutoCompleted`: responsable + Christian).
5. Mis actividades: API devuelve `seguimiento` (despachador que ya la pasó), `porRepartir` y `pasadaA` (cadena con avance del ejecutor). Web: sección «👀 En seguimiento» con «Pasada a Antonio → Carolina», avance del ejecutor y «Ver registro»; en «Por hacer», chip «Te toca repartirla» + botón «Repartir →» a su ficha de pizarra.
6. Detalle Core: pestaña «Historial» (`/erp/actividades/:id/historial`, reusa OPS). En Evidencias, quien reparte ve «Tú repartes esta actividad» y no puede capturar.
7. `DespachoPendingPanel`: el cupo viaja a quien recibe (indicaciones).

### Verificado

- `prisma generate` + `tsc --noEmit` API: limpio.
- `tsc --noEmit` web: sin errores nuevos; siguen 4 previos y ajenos.
- Docker 19:07 UTC: `build api web` + `prisma migrate deploy` (aplicó `20260913190000_assignee_dispatch_log`) + `up -d`; API arrancó sin errores. BD: en AN-0001 Luis quedó `asignadoPorId` = Christian y sin evidencia (borrada por la migración); Antonio sin evidencia y `asignadoPorId` = Luis (relleno manual local: su despacho previo al campo, confirmado en el log del 409). `/api/me/activities` y `/api/activities/1/timeline` → 401 sin sesión; `/erp/actividades/1/historial` 200; el bundle trae «En seguimiento», «Te toca repartirla» y la nota de Evidencias para quien reparte.

### Falta probar a mano

1. Luis → Mis actividades: AN-0001 aparece «Por hacer» con «Te toca repartirla» (o «En seguimiento» si ya la pasó a Antonio).
2. Luis despacha a Antonio → Antonio recibe aviso; Luis y Christian reciben «Despacho registrado»; en la actividad, pestaña Historial muestra «Luis la pasó a Antonio».
3. Antonio asigna a Carolina → Carolina recibe «Nueva actividad asignada»; Evidencias: Antonio no puede capturar, Carolina sí.
4. Carolina termina su evidencia → la actividad se cierra sola y Luis + Christian reciben «Actividad terminada».

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index` y `20260913190000_assignee_dispatch_log`.

### No tocar

Puente NAS.
