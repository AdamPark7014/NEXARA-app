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
9. **Push que faltaba (commit aparte):** entrada/salida propias, entrada sugerida por ACS y aviso a admins (`AttendanceService.avisar`), hora de comida próxima/vencida y aviso a admins (`LunchBreaksCronService.pushAll`) y «Nuevo acceso detectado» (`AuthService`, resuelve `NotificationsService` con `ModuleRef` porque NotificationsModule importa AuthModule) se escribían con `prisma.notification.create/createMany`: quedaban en la campana sin push ni socket. Ahora pasan por `NotificationsService.createNotification` con `relatedUrl` `/erp/asistencias` o `/erp/my-profile`. En pruebas sin el servicio, asistencia cae al `create` de antes.

10. **Archivos que se borraban en Docker (reporte de Adam 12:24: fotos en negro y PDF vacío en AN-0001).** La API guarda en `/app/uploads` (raíz del proyecto en el contenedor) y el compose de desarrollo solo montaba `./apps/api/uploads`: cada `docker compose build api` + `up -d` borraba todo lo subido. Las fotos, el PDF y la salida de Alejandro en AN-0001 (13–14 sep) se perdieron en los rebuilds de hoy (11:28 y 12:01) y no se pueden recuperar; en BD siguen las rutas (la API responde 404). `docker-compose.yml` ahora monta `./uploads:/app/uploads` como `deploy/docker-compose.nexara.yml` (producción ya lo tenía). Para AN-0001 un superior debe «Devolver → Toda la actividad» para que Alejandro vuelva a subir.
11. **Visor en `EquipoEvidencias`:** fotos, avatar y visor grande descargan con la sesión y, si el archivo no existe, muestran «Esta foto ya no está en el servidor» (antes cuadro negro). El PDF se descarga con la sesión y se dibuja con `components/PDFViewer.tsx` (pdf.js, `/pdf.worker.min.js`): `<object>` nunca iba a verse porque la CSP trae `object-src 'none'`.

12. **Hora de comida con justificación y aprobación (pedido de Adam 12:38).** En `/erp/asistencias` → Comidas no se podía registrar. Ahora:
   - API `lunch-breaks`: `GET mi-dia` (qué sigue: salida/regreso/listo, si ya es a destiempo), `POST checkin` / `PUT checkout` aceptan `justificacion`; fuera de 15:00–16:00 (regreso después de 16:05) sin justificación ≥5 → 400; con ella queda `revisionEstado` PENDIENTE y avisa a sus jefes por organigrama + Christian (`notifyLunchLate`). La hora del teléfono solo se acepta a ±10 min de la del servidor. `GET equipo?fecha=` (Christian/plataforma: todos; jefes: su organigrama; incluye «sin registrar»). `PATCH :id/revision` aprobar/rechazar (rechazar exige motivo; nadie se aprueba a sí mismo) → avisa a quien comió. Christian (gerencia@) ya no puede registrar (403). Migración `20260914190000_lunch_break_review` (columnas en `lunch_breaks`). `appUrls.erpLunchBreaks` → `/erp/asistencias?tab=comidas`.
   - Web `components/asistencias/ComidasPanel.tsx`: tarjeta «Tu hora de comida» (Salir a comer / Ya regresé, cámara en vivo → vista previa → justificación si es a destiempo), lista del equipo con filtros (Por aprobar, A destiempo, En comida, Sin registrar), fotos, justificaciones y Aprobar/Rechazar. La página ya no llama `lunch-breaks/today` (exigía ATTENDANCE_MANAGE) y abre la pestaña con `?tab=comidas`.
   - Spec `lunch-ventana-mexico`: las entradas fuera de ventana llevan justificación; 4 pruebas nuevas (sin justificación rechaza, con ella queda PENDIENTE, a tiempo sin revisión, hora de teléfono no esquiva la regla).

13. **Pizarra con más detalle (pedido de Adam 14:13).** Alejandro salía «Atrasado» con AN-0001 ya entregada: `team-board.service` tomaba como actividad actual cualquiera de su lista, aunque ya hubiera enviado su evidencia; «Inactivo» solo medía si checó entrada.
   - Ahora cuenta como en curso solo lo propio sin terminar (quien reparte un despacho no cuenta; terminada = envió su evidencia o la actividad se cerró). Estados: `activo`, `atrasado` (+ `currentLateMinutes`), `libre` (hoy terminó y no tiene nada abierto: `idleSinceAt` + `lastFinished` con `lateMinutes` contra `fechaMaxima`), `sin_actividad` (hoy no tuvo nada). `inactivo` ya no se asigna. Además `enEsperaAprobacion` (entregó y nadie aprueba) y `enCorreccion` (evidencia devuelta).
   - El «hoy» del tablero usa `workDayBounds` (México): con `toLocaleDateString` en el contenedor UTC cambiaba a las 18:00.
   - Web `/erp/pizarra`: «Atrasado 1 h 20 min», «Sin actividad desde hace 2 h 05 min» + «Finalizó a las 10:49 con 1 h 20 min de atraso» (rojo) o «a tiempo» (verde), etiquetas chicas «⏳ En espera de aprobación» / «↩️ Corrigiendo evidencia»; «Sin actividades hoy»; filtro «Terminó»; «Inactivo» solo si una API vieja lo manda.
14. **Reinicio de Docker/sesión (≈14:10):** los rebuilds de API y web de las 13:05 se cortaron (exit 4); se rehicieron con comidas + pizarra. El trabajo a medias de los agentes móviles quedó rescatado por `relevo salvar` en `c64bc09a` (sin compilar ni revisar).

15. **Fotos con nombre en el historial por persona** (`/erp/pizarra/[userId]`, pedido 14:32): cada foto lleva «📍 Entrada», «📷 Evidencia N» o «🏁 Salida» y usa `FotoProtegida` (aviso si ya no existe); el PDF usa `VisorPdf` (pdf.js, 400 px) en vez de `<object>` bloqueado por la CSP. `FotoProtegida` y `VisorPdf` ahora se exportan desde `EquipoEvidencias.tsx`.
16. **Volver a revisar una corrección (pedido 14:34, 15-09):** la API ya dejaba aprobar/devolver otra vez cuando la persona reenvía todo lo devuelto (queda COMPLETED + PENDING); lo que no se veía era que era una corrección. AN-0001 en BD: Christian devolvió «Fotos en sitio» 14:30 y Alejandro corrigió 14:31 → hoy está «Por Validar» esperando revisión (la captura de pantalla era la vista de Alejandro, que no puede revisarse a sí mismo).
   - API: `teamEvidence` devuelve `correctionSubmittedAt`; el aviso tras corregir dice «🔁 Corrección lista para revisión … Revísalo de nuevo» (`notifyEvidenceReadyForReview(…, correccion)`).
   - Web `EquipoEvidencias`: estado «🔁 Corrección por revisar», barra «Corrigió lo que se le devolvió (Fotos en sitio) · fecha. Revisa la corrección y apruébala o devuélvela de nuevo», pasos corregidos en azul «🔁 Corregido · hora»; mientras corrige: «Cuando envíe la corrección podrás aprobarla o devolverla otra vez».

### Verificado

- `prisma generate` + `tsc --noEmit` API limpio. Web: sin errores nuevos (siguen los 4 previos: CommandPalette ×2, evidence-flow-helpers, module-guides).
- Docker: `build api` + `prisma migrate deploy` («All migrations have been successfully applied») + `up -d api`; «Nest application successfully started»; `activity_evidence_reviews` existe (0 filas). `GET …/evidencias` y `POST …/revision` → 401 sin sesión.
- Web: `build web` + `up -d`; `/erp/actividades/1/evidencias` 200; el bundle trae «Devolver este paso» y «Ver lo que se devolvió».
- Cadena real AN-0001 en BD: Luis (responsable, LEAD) → Antonio (LEAD) → Alejandro (TECNICO); jefe de Alejandro y Carolina = Antonio. Con las reglas: Antonio ve y revisa a Alejandro, no ve a Luis. AN-0001 quedó «Finalizada» por el cierre automático viejo con evidencia sin aprobar: no se migraron datos; la pestaña la muestra «Por revisar».
- Push: `tsc` API limpio; `jest src/attendance src/auth` 6 suites / 49 pruebas OK; `build api` + `up -d` arrancó sin errores de dependencias.
- Archivos (12:30): `up -d api` con `./uploads:/app/uploads` montado (se ven los 11 archivos viejos de `uploads/activities`). `tsc` web sin errores nuevos; `build web` + `up -d`; `/erp/actividades/1/evidencias` 200, `/pdf.worker.min.js` 200 (pdf.js 3.11.174 = `pdfjs-dist`); el bundle trae «Esta foto ya no está en el servidor» y «El PDF ya no está en el servidor».
- Comidas + pizarra (14:29): `tsc` API limpio, `jest src/me` 3 suites / 39 OK, `tsc` web sin errores nuevos. Docker: `build api` + `migrate deploy` (aplicó `20260914190000_lunch_break_review`; `lunch_breaks` tiene `checkinJustificacion`, `revisionEstado`, `revisadoPorId`) + `up -d api` («Nest application successfully started»); `lunch-breaks/mi-dia`, `lunch-breaks/equipo`, `me/board` → 401 sin sesión. `build web` + `up -d`; `/erp/pizarra` y `/erp/asistencias` 200; bundle con «Sin actividad desde hace», «En espera de aprobación», «Corrigiendo evidencia», «Salir a comer». Dato real AN-0001: fechaMaxima 14-09 02:00, Alejandro envió 10:49 (1249 min) → la tarjeta dirá «Finalizó a las 10:49 con 20 h 49 min de atraso» + «En espera de aprobación».

### Falta probar a mano

1. Antonio → actividad de Alejandro con evidencia enviada → Evidencias: ve fotos/PDF/formulario, «Aprobar» con estrellas y observaciones → actividad Finalizada; Luis y Christian reciben aviso.
2. Luis → «Devolver este paso» en fotos → Alejandro ve «Corrigiendo: Fotos en sitio» y solo repite ese paso.
3. «Toda la actividad» → Alejandro rehace desde la foto de entrada; en el historial «Ver lo que se devolvió» muestra lo anterior.
4. Quien creó la actividad sin ser superior: ve todo, sin botones.

### A medias

App móvil (Android + iOS) al día con Core solo-ERP: pedido de Adam en el mismo mensaje, se hace en el siguiente commit.

### Siguiente

App móvil. Luego Cursor ejecuta `.ai/EXEC-PACKET.md` (usabilidad Actividades/Asistencia). Al desplegar a producción subir juntas `20260913180000_drop_evidence_activity_unique_index`, `20260913190000_assignee_dispatch_log`, `20260914050000_activity_schedule_changes`, `20260914100000_evidence_photos_geo`, `20260914160000_evidence_reviews` y `20260914190000_lunch_break_review`.

### No tocar

Puente NAS.
