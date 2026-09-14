# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-14
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Reprogramar despacho, Actividades unificado y fotos con vista previa + GPS

El trabajo sin commitear del turno anterior (reprogramar + pestañas) se rescató en `656d4ba2` al abrir sesión; este cierre lo completa.

### Hecho

1. **Reprogramar despacho (registro de 3 tipos).** Tabla `activity_schedule_changes` + valor `ACTIVITY_RESCHEDULED` (migración `20260914050000_activity_schedule_changes`). `PATCH /me/activities/:id/reprogramar` (solo LEAD activo del despacho, actividad abierta, fecha no pasada) → `ActivityTeamService.reschedule` (fechaInicio = entrega = máximo, guarda de → a, quién, motivo; avisa a responsable, equipo y Christian). Historial: «enviada» (hora de envío + programada vigente), «reprogramada» (de → a, motivo), «cumplida» (hora de cierre vs programada: a tiempo / N tarde). Web: `components/pizarra/ReprogramarDespacho.tsx` en `DespachoPendingPanel` y en «En seguimiento».
2. **Mis actividades dentro de Actividades.** Vista movida a `components/pizarra/MisActividadesView.tsx`. `/erp/pizarra`: Christian solo tablero; quien tiene gente a su cargo en su tablero (hoy David, Luis, Antonio) ve pestañas «✅ Mis actividades» / «👥 Mi equipo» (recuerda la última, o `?vista=`); todos los demás ven directo su lista. La decisión sale del tablero (`otros > 0`), no de la lista de encargados. `/erp/mis-actividades` redirige a `?vista=mias`; ya no aparece suelto en el menú.
3. **Pizarra:** «En actividad N h» solo cuenta si la actividad está En Proceso / Por Validar (antes contaba desde la hora programada).
4. **Fotos con vista previa (entrada, evidencias, salida).** `ActivityEvidenceFlow`: tomar foto ya no la envía; abre «Tu foto de …» con la imagen, «📍 Ubicación capturada … · Ver en mapa», y botones «✓ Enviar/Usar esta foto», «📷 Tomar otra», «Cancelar». Foto y GPS se capturan juntos (`captureWithLocation`); entrada/salida envían esas mismas coordenadas; sin GPS muestra «activa el GPS y da permiso».
5. **GPS por foto de evidencia.** Columna `activity_evidences.evidencePhotosGeo` (JSONB, migración `20260914100000_evidence_photos_geo`). `POST activity-evidence/:id/evidence-photos` y el `resubmit` de EVIDENCE_PHOTOS aceptan `photoGeo` (opcional para clientes viejos); `sanitizePhotoGeo` alinea al número de fotos y descarta coordenadas inválidas.
6. **Paso de evidencias:** el error se repite junto a «Siguiente Paso» (con 4 fotos el aviso de arriba quedaba fuera de vista y parecía que el botón no hacía nada).
7. **Causa real de «no me deja ir al siguiente paso» (Alejandro, AN-0001):** la API respondió 400 «Se requieren exactamente 2 fotos de evidencia» (la actividad pide 2) pero la web exigía 4: `ActivityEvidenceFlow` leía `data.evidencePhotoRequired` y la API lo manda en `data.activity.evidencePhotoRequired`, así que caía en 4. Web ya lo lee de la actividad; la API ahora acepta **al menos** las requeridas (`saveEvidencePhotos` y `resubmit`).
8. **Docker Desktop no arrancaba** al abrir sesión: no podía borrar el socket viejo `%LOCALAPPDATA%\Docker\run\sailor-ingest.sock` y ofrecía «Reset to factory defaults» (NO usar: borra volúmenes y la BD). Se cerraron sus procesos y se reinició; arrancó aunque el socket siguió sin poder borrarse.

### Verificado

- `prisma generate` + `tsc --noEmit` API: limpio. Web: sin errores nuevos; siguen 4 previos y ajenos.
- BD: existen `activity_schedule_changes`, la columna `activity_evidences.evidencePhotosGeo` y el valor `ACTIVITY_RESCHEDULED`; AN-0001 pide 2 fotos (confirma la causa del bloqueo).
- Log del intento de Alejandro (contenedor previo): tres 400 «Se requieren exactamente 2 fotos de evidencia» en `POST /api/activity-evidence/1/evidence-photos`.
- Docker (10:16 UTC-6): `build api web` + `prisma migrate deploy` + `up -d`; API arrancó sin errores. `dist` de evidencias trae «al menos» y `evidencePhotosGeo`; la ruta de reprogramar y `evidence-photos` → 401 sin sesión. Bundle web trae «Tomar otra», «Ver en mapa», «Mi equipo», «Cambiar fecha y hora», «Cargando actividades»; `/erp/mis-actividades` redirige (NEXT_REDIRECT 307) a `/erp/pizarra?vista=mias`.

### Falta probar a mano

1. Alejandro → AN-0001 → Evidencias: cada foto abre la vista previa con ubicación; «Tomar otra» repite; al completar 4, «Siguiente Paso» avanza o muestra el motivo junto al botón.
2. Foto de salida: vista previa con ubicación antes de enviar.
3. Antonio → Actividades → «Pendiente de despacho» → «Cambiar fecha y hora»: Historial muestra «reprogramada»; Luis y Christian reciben el aviso.
4. Alejandro → Actividades: directo su lista. Luis/David/Antonio: pestañas. Christian: tablero.

### A medias

Nada.

### Siguiente

Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad; Mis actividades vive en `components/pizarra/MisActividadesView.tsx`). Mostrar la ubicación de cada foto en la revisión de evidencias (hoy solo se guarda). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index`, `20260913190000_assignee_dispatch_log`, `20260914050000_activity_schedule_changes` y `20260914100000_evidence_photos_geo`.

### No tocar

Puente NAS.
