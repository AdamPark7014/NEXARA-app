# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-14
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Reprogramar despacho (registro de 3 tipos) y Mis actividades dentro de Actividades

### Hecho

1. Petición de Adam: quien reparte un despacho debe poder cambiar día y hora; el registro debe mostrar con día y hora: cuándo se envió, cuándo el encargado la reprogramó y cuándo se cumplió.
2. BD: tabla `activity_schedule_changes` (modelo `ActivityScheduleChange`: activityId, companyId, cambiadoPorId, fechaAnterior, fechaNueva, motivo, createdAt) y valor `ACTIVITY_RESCHEDULED` en `NotificationType`. Migración `20260914050000_activity_schedule_changes`.
3. API: `PATCH /me/activities/:id/reprogramar` (`MyActivitiesService.reprogram`): solo el LEAD activo del despacho, actividad abierta, fecha no pasada; delega en `ActivityTeamService.reschedule`, que actualiza fechaInicio = fechaEntregaEsperada = fechaMaxima, guarda el cambio (de → a, quién, motivo) y avisa (`notifyActivityRescheduled`) al responsable, al equipo y a Christian.
4. Historial (`buildTimeline`): tipo 1 «enviada» (hora de envío + «Programada: …» vigente en ese momento), tipo 2 «reprogramada» («X la reprogramó», «De … a …», motivo), tipo 3 «cumplida» (hora de cierre + programada + «a tiempo» o «N min/h tarde»).
5. Web: componente `components/pizarra/ReprogramarDespacho.tsx` («📅 Programada: … · Cambiar fecha y hora», día, hora, motivo opcional). Se usa en `DespachoPendingPanel` y en «En seguimiento» de Mis actividades (que muestra «Enviada a …» y «🕑 Reprogramada por …»). Team-board expone `fechaInicio` en abiertas; Mis actividades expone `ultimaReprogramacion`.
6. Petición de Adam: Mis actividades va dentro de Actividades, y para quien solo ve lo suyo (Alejandro) la pizarra de una persona es redundante. `/erp/pizarra`: Christian ve solo el tablero (solo asigna, no tiene propias); quien tiene gente a su cargo en su tablero (hoy David, Luis y Antonio) ve pestañas «✅ Mis actividades» / «👥 Mi equipo» (recuerda la última en localStorage `nx-actividades-vista`, o `?vista=`); todos los demás (técnicos, Daniela, Mónica) ven directo su lista. La decisión sale del tablero (`otros > 0`), no de la lista de encargados, para que nadie vea una pestaña de equipo vacía; mientras carga muestra «Cargando actividades…». La vista se movió a `components/pizarra/MisActividadesView.tsx` (`git mv`); `/erp/mis-actividades` redirige a `/erp/pizarra?vista=mias`; el módulo ya no aparece suelto en el menú (`section-views`); auto-asignarse y «← Actividades» del detalle vuelven a `/erp/pizarra`.
7. Pizarra: «En actividad N h» ya no cuenta desde la hora programada; solo si la actividad está En Proceso / Por Validar (a Alejandro le salía 8 h 28 min con la actividad Pendiente).

### Verificado

- VERIFICACION_PENDIENTE

### Falta probar a mano

1. Antonio → Actividades → «Pendiente de despacho» → «Cambiar fecha y hora» con motivo: la programada cambia; Luis y Christian reciben «Actividad reprogramada»; Historial muestra «reprogramada» con de → a.
2. Alejandro → Actividades: ve directo su lista (sin pizarra); ya no dice «En actividad 8 h» si no ha arrancado.
3. Luis → Actividades: pestañas «Mis actividades» / «Mi equipo»; el menú ya no trae «Mis actividades» suelto.
4. Christian → Actividades: solo el tablero del equipo.

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad; ojo: Mis actividades ahora es `components/pizarra/MisActividadesView.tsx` y vive en la pestaña de `/erp/pizarra`). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index`, `20260913190000_assignee_dispatch_log` y `20260914050000_activity_schedule_changes`.

### No tocar

Puente NAS.
