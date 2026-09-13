# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Despacho ya no se muestra como trabajo propio de quien reparte

### Hecho

1. Síntoma (Adam): AN-0001 se asignó como despacho a equipo y en la actividad/pizarra salía como si fuera trabajo de Luis.
2. Historial (`ActivityTeamService.buildTimeline`): `fechaInicio` se llena al programar (día/hora del formulario); si la actividad no ha arrancado se muestra «📅 Programada» (kind `agenda`) en vez de «Inicio en campo». `historial/page.tsx`: tiempos futuros dicen «En 40 min» en lugar de «Justo ahora».
3. Detalle (`ops/activities/[id]/page.tsx`, usado también en `/erp/actividades/:id`): si `assignmentCharge = despacho` muestra etiqueta «Despacho a equipo», campo «Encargo», KPI «Ejecuta» (no LEAD del equipo o «Por asignar») con nota «coordina <responsable>», y en Información general «Coordina (despacho)» (LEAD en cadena) + «Ejecuta» en lugar de «Responsable».
4. Pizarra (`team-board.service.ts`): cada actividad abierta trae `reparte` (LEAD en despacho). «Actividad en curso» y estado activo/atrasado salen solo de lo que la persona ejecuta; la lista de abiertas se conserva para el panel de despacho.

### Verificado

- `tsc --noEmit` API: limpio. Web: sin errores nuevos; siguen 4 previos y ajenos.
- Docker 19:28 UTC `build api web` + `up -d`; API arrancó sin errores. `dist/activities/activity-team.service.js` trae «Programada» y `dist/me/team-board.service.js` trae `reparte`; el bundle web trae «Despacho a equipo», «Encargo» y «Coordina (despacho)»; `/erp/actividades/1` 200; `/api/me/board` 401 sin sesión.

### Falta probar a mano

1. Luis → ficha en pizarra: AN-0001 ya no sale como «Actividad en curso».
2. `/erp/actividades/1`: «Despacho a equipo», «Ejecuta: Por asignar», «Coordina: Luis → José Antonio».
3. Historial de AN-0001: «📅 Programada» con «En …» si la hora es futura.

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index` y `20260913190000_assignee_dispatch_log`.

### No tocar

Puente NAS.
