# Reuniones simple (aprobado por Adam, 2026-10-12)

Objetivo: que una junta se use de verdad. Un toque para empezar, la IA escribe el acta,
y cada acuerdo cae como actividad del responsable. Todo queda guardado y con PDF.

Motor de código: Cursor Agent. Claude revisa el diff, corre pruebas y despliega.
No reescribir desde memoria: partir de `main` actual (03cb48a ya trae menú Core y PDF).

## 1. «Empezar reunión ahora» (web + API)

- En `apps/web/app/(panels)/erp/reuniones/page.tsx`, botón principal grande en el encabezado
  para quien puede convocar (`puedeConvocar`): **Empezar reunión ahora**.
  «Convocar reunión» (programar a futuro) queda como botón secundario.
- Al tocarlo: `POST /api/reuniones` con tipo por defecto (el último usado, guardado en
  localStorage; si no hay, el primero de `MEETING_TYPES`), fecha = hoy, horaInicio = ahora,
  estado en curso si el modelo lo permite. Sin formulario.
- Abre directo el detalle de esa reunión con `GrabarReunion` arrancado (pedir micrófono en
  ese mismo toque, porque el navegador exige gesto del usuario).
- Asistentes: se pueden marcar después en el detalle; no bloquean el inicio.

## 2. Al terminar: acta y acuerdos solos

- Al detener la grabación, cuando la transcripción termina, `ActaIA` genera la propuesta
  sola (hoy ya autollena el texto; falta disparar «Generar acta» automáticamente).
- Cada acuerdo de tipo ACUERDO con responsable trae marcado **«Crear actividad»** (casilla,
  por defecto activada).
- Al guardar el acta (`POST /api/reuniones/:id/acuerdos` o el endpoint que use ActaIA), si la
  casilla viene activa, el API crea una `Activity` con:
  `activityType: INTERNAL`, `titulo` = descripción del acuerdo (recortada a 200),
  `responsableId` = responsable del acuerdo, `periodoFin` = `fechaCompromiso` (de ahí salen `fechaMaxima` y `fechaEntregaEsperada`, ver `actividad-periodo.ts`),
  `indicaciones` = «Acuerdo de la reunión <título> del <fecha>», creadoPorId = quien guarda.
  Reutilizar `ActivitiesService.create` (mismo camino que «Asignar con IA») para que lleguen
  la notificación push y las reglas de folio. Guardar `activityId` en el acuerdo.
- Todo en una transacción; si falla crear la actividad, el acuerdo se guarda igual y se avisa.
- Prueba en `meetings.service.spec.ts`: acuerdo con `crearActividad: true` crea actividad
  INTERNAL ligada; sin la casilla no crea nada; un acuerdo sin responsable nunca crea.

## 3. Menos pestañas

- Quedan 3: **Reuniones** (por defecto, con botón PDF por fila), **Mis acuerdos**, **Agenda**.
- «Fuera de fecha» pasa a filtro (chip) dentro de Mis acuerdos y, para líderes, un chip
  «Todos los vencidos» en Reuniones.
- «Lecciones aprendidas» pasa a buscador dentro de Reuniones (mismo endpoint `lecciones`).
- Mantener `?tab=` compatible: `vencidos` → mios con filtro, `lecciones` → reuniones con buscador.

## 4. IA de reuniones solo para encargados de área (pendiente de antes)

- `apps/api/src/common/rbac/url-matrix.ts`: quitar de `MEETINGS_STAFF_URL_RULES` las 4 reglas
  para todo el personal (ai/voz estado y transcribir, `/api/reuniones/*/acta-ia` POST,
  `/api/grabaciones-reuniones/**`).
- ENC_SOPORTE recibe `MEETINGS_LEAD_URL_RULES`; web: agregar `ROLES.ENC_SOPORTE` a
  `MEETING_LEAD_ROLES` en `apps/web/lib/meetings-api.ts`.
- `ActaIA` y `GrabarReunion` solo se muestran si `puedeConvocar`.
- Contabilidad queda fuera. Instaladores e ingenieros de soporte no ven la IA.
- Actualizar `voz-ia-rbac.spec.ts`: ING_CAMPO negado, ENC_SOPORTE permitido.

## Verificación antes de subir

- `npm run typecheck` en api y web, `jest` de meetings, rbac y voz, y pruebas web.
- Commit a `main` con el trailer de Cursor; `git pull --rebase origin main && git push origin main`.
- Desplegar con `./deploy/update.sh` y probar en nexara.com.mx como CEO y como encargado.
