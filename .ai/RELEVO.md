# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Antonio no podía repartir (403 al despachar)

### Hecho

1. Síntoma: Antonio (ing_soporte) en «Pendiente de despacho» elegía a Alejandro y `POST /api/activities/1/team` respondía 403 «No tienes permisos». Ese endpoint exige ACTIVITIES_MANAGE y ing_soporte no lo tiene.
2. Endpoint nuevo `POST /me/activities/:id/despacho` (`me.controller.ts` → `MyActivitiesService.dispatch`): solo si el usuario es LEAD activo de ese despacho y solo hacia su grupo (`DISPATCH_POOLS`: Luis → Antonio; Antonio → Carolina/Alejandro; David y Josué → Joan/Israel/Juan). La API decide el rol (si quien recibe también reparte entra como LEAD; si no, TECNICO) y usa `ActivityTeamService.addMember`, así que conserva registro de despacho (`asignadoPorId`) y avisos a Luis y Christian.
3. `ActivitiesModule` exporta `ActivityTeamService`.
4. Web: `DespachoPendingPanel` usa `dispatchMyActivity` (`lib/my-activities-api.ts`) en lugar de `addActivityTeamMember`; los errores se muestran con `formatApiError` (antes salía el JSON crudo).

### Verificado

- `tsc --noEmit` API: limpio. Web: sin errores nuevos; siguen 4 previos y ajenos.
- Docker 04:18 UTC (14-09) `build api web` + `up -d`; API arrancó sin errores de inyección (`MyActivitiesService` usa `ActivityTeamService`). El endpoint de despacho de Mis actividades y `GET /api/me/activities` responden 401 sin sesión (rutas vivas); los bundles de la ficha de pizarra y de Mis actividades ya llaman al endpoint nuevo.

### Falta probar a mano

1. Antonio → su ficha → «Pendiente de despacho» → AN-0001 → Alejandro → «Asignar al equipo»: sin error; Historial muestra «José Antonio la asignó a Alejandro»; Luis y Christian reciben «Despacho registrado».
2. Alejandro recibe «Nueva actividad asignada» y puede capturar evidencias.

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index` y `20260913190000_assignee_dispatch_log`.

### No tocar

Puente NAS.
