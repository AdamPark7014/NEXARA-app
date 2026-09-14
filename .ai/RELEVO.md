# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-14
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Evidencias del equipo y revisión jerárquica (aprobar / devolver / calificar)

Pedido de Adam (14-09): los encargados ven fotos, formularios y PDF embebidos de su cadena aunque la actividad esté cerrada (Christian todo; Luis ve a Antonio y al ingeniero; Antonio a su ingeniero); quien la creó también ve, sin editar. Cualquier superior de la cadena puede devolver pasos o todo, con observaciones y calificación de eficiencia; la actividad solo queda 100 % finalizada cuando se aprueba.

### Hecho

1. **API `GET /me/activities/:id/evidencias`** (`MyActivitiesService.teamEvidence`): personas en orden de la cadena (el responsable entra aunque no tenga fila de equipo), con su evidencia completa (fotos + GPS por foto, PDF, formulario, entrada/salida), estado de revisión, pasos por corregir, calificación e historial de revisiones. Alcance:
   - Todo: Christian, developer, `console.admin`/`evidences.review`, responsable y quien la creó (creador = solo lectura).
   - Encargado (LEAD activo): él y quienes la recibieron después (o a la vez, si no son encargados).
   - Jefe por organigrama (`managerId` hacia arriba) de alguien de la cadena: lo ve y lo revisa.
   - Los demás: solo lo suyo.
2. **API `POST /me/activities/:id/evidencias/:userId/revision`** `{decision: aprobar|devolver, pasos?, todo?, observaciones (≥5), calificacion 1–5}`. Puede revisar: todo/responsable/jefe por organigrama/encargado por encima. Nadie se revisa a sí mismo; quien solo reparte no tiene evidencia. Sin `ACTIVITIES_MANAGE` ni `EVIDENCES_REVIEW` (Antonio sí puede).
3. **Cierre por aprobación** (`ActivityEvidenceService`): cuando todos envían, la actividad pasa a **Por Validar** (antes quedaba Finalizada sola). `finalizeIfAllApproved`: Finalizada + `fechaFinalizacion` solo cuando la evidencia de cada ejecutor está aprobada; guarda `Activity.eficienciaScore` = promedio (1–5 → 0–100). Devolver (pasos o todo) deja la actividad **En Proceso** (ya no «Rechazada», que contaba como cerrada) y borra `fechaFinalizacion`. Devolver todo vacía la evidencia; los pasos devueltos respetan el tipo (tarea no pide PDF). Se puede devolver aunque ya esté aprobada.
4. **Registro de revisiones**: tabla `activity_evidence_reviews` (decisión, pasos, observaciones, calificación, copia de lo revisado) + `activity_evidences.eficienciaScore`. Migración `20260914160000_evidence_reviews`. Los endpoints viejos `approve`/`reject` (RBAC, los usa la app móvil) también registran, sin calificación.
5. **Avisos**: «lista para revisión» ahora llega también a los encargados (LEAD) y al jefe directo de quien envió; URL `/erp/actividades/:id/evidencias`. Aprobada/devuelta dice pasos, calificación, observaciones y si la actividad quedó finalizada. «Actividad lista para revisión» sustituye a «Actividad terminada».
6. **Historial**: eventos «Aprobada por…», «Devuelta para corregir por…», «Devuelta completa por…» con estrellas; «Cumplida» usa la hora de la última evidencia enviada (la aprobación llega después).
7. **Web `components/ops/EquipoEvidencias.tsx`**: tarjeta por persona (reparte/ejecuta, recibió de quién y cuándo, a quién la pasó, avance por paso con hora), fotos en visor grande (anterior/siguiente, teclado, «Ver en mapa»), PDF embebido + «Abrir PDF», formulario con etiquetas por tipo; barra «Aprobar / Devolver» para quien puede revisar; «↩️ Devolver este paso» en cada sección; ventana de revisión (aprobar/devolver, pasos o toda la actividad, estrellas con texto, observaciones obligatorias); historial con «Ver lo que se devolvió». Pestaña Evidencias: flujo de captura (solo si la ejecutas) + equipo. Pestaña Detalle: resumen compacto (reemplaza `ActivityEvidenceReviewPanel`, que leía `activity.activityEvidence` inexistente y nunca mostraba nada).
8. Web evidencias: `canUpload` en Core exige ser del equipo o responsable (antes cualquier superior veía el flujo y la API le creaba una evidencia vacía); el responsable de un despacho sin fila cuenta como «reparte».

### Verificado

- `prisma generate` + `tsc --noEmit` API limpio. Web: sin errores nuevos (siguen los 4 previos: CommandPalette ×2, evidence-flow-helpers, module-guides).
- Docker: `build api` + `prisma migrate deploy` («All migrations have been successfully applied») + `up -d api`; «Nest application successfully started»; `activity_evidence_reviews` existe (0 filas). `GET …/evidencias` y `POST …/revision` → 401 sin sesión.

### Falta probar a mano

1. Antonio → actividad de Alejandro con evidencia enviada → Evidencias: ve fotos/PDF/formulario, «Aprobar» con estrellas y observaciones → actividad Finalizada; Luis y Christian reciben aviso.
2. Luis → «Devolver este paso» en fotos → Alejandro ve «Corrigiendo: Fotos en sitio» y solo repite ese paso.
3. «Toda la actividad» → Alejandro rehace desde la foto de entrada; en el historial «Ver lo que se devolvió» muestra lo anterior.
4. Quien creó la actividad sin ser superior: ve todo, sin botones.

### A medias

App móvil (Android + iOS) al día con Core solo-ERP: pedido de Adam en el mismo mensaje, se hace en el siguiente commit.

### Siguiente

App móvil. Luego Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad Actividades/Asistencia). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index`, `20260913190000_assignee_dispatch_log`, `20260914050000_activity_schedule_changes`, `20260914100000_evidence_photos_geo` y `20260914160000_evidence_reviews`.

### No tocar

Puente NAS.
