# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Mis actividades + auto-asignación de encargados

### Hecho

1. Módulo Core **Mis actividades** (`/erp/mis-actividades`) para todos menos Christian (CEO): cola personal numerada con prioridad, tipo (+subtipo de tarea), estatus en español, día/hora, tiempo estimado y tope, cliente/proyecto, quién la asignó o «Auto-asignada», y «Hechas hoy».
2. **Encargados de área** (David, Luis, Antonio, Josué, Daniela, Mónica + developer) pueden: a) **auto-asignarse** actividades solo a sí mismos en `/erp/mis-actividades/nueva` (tipos que ya tienen, con día, hora y tiempo); b) **ordenar su cola** con Subir/Bajar/Hacerla primero, y cada cambio pide **justificación obligatoria** (mín. 10 caracteres) que se muestra en la tarjeta. Técnicos solo ven su lista.
3. API: `GET /me/activities`, `PATCH /me/activities/order` y `POST /me/activities` (fuerza responsable y creador = uno mismo, ejecución directa; no requiere ACTIVITIES_MANAGE porque Antonio/Daniela/Mónica no lo tienen) en `apps/api/src/me/my-activities.service.ts`. Orden: orden personal → prioridad (Alta/Urgente, Media, Baja) → fecha → asignación.
4. Migración `20260913170000_assignee_execution_order`: `activity_assignees.ordenEjecucion`, `ordenJustificacion` (500), `ordenActualizadoAt`.
5. Registro del módulo: `access-matrix.ts`, `core-surface.ts`, `page-matrix.ts` y `url-matrix.ts` (CORE_OLA1), `navigation-module-map.ts`, `section-views.ts` (oculto a gerencia@), `module-guides.ts`, `legacy-path-remap.ts` (no traducir `mis-actividades`→`my-activities`).
6. `OpsActivityForm` acepta `selfAssign` (usa POST /me/activities y tolera 403 de proyectos/AN). Espejo de encargados en web: `isAreaManagerEmail` / `isCeoEmail` en `lib/activity-kinds.ts`.
7. EXEC-PACKET listo para Cursor: pasada de usabilidad de Actividades (pizarra, ficha, asignar, formulario) y Asistencias.

### Verificado

- `tsc --noEmit` API: limpio (tras `prisma generate`).
- `tsc --noEmit` web: sin errores nuevos; siguen 4 previos y ajenos.
- `vitest lib/rbac/role-modules.spec.ts`: 25 fallos en HEAD y los mismos 25 ahora (0 nuevos; la spec ya estaba desactualizada).
- Docker 17:45 UTC: `build api web` + `prisma migrate deploy` (aplicó `20260913170000_assignee_execution_order`; columnas `orden*` presentes) + `up -d`. API arrancó sin errores; `GET`/`POST /api/me/activities` y `PATCH /api/me/activities/order` → 401 sin sesión (rutas vivas); `/erp/mis-actividades` 200 y el bundle trae «Auto-asignarme» y «Te la regresaron».

### Falta probar a mano

1. Entrar como David: menú «Mis actividades», «＋ Auto-asignarme», crear Tarea con tipo, ver la tarjeta resaltada.
2. Subir/Bajar pide motivo; el motivo aparece en la tarjeta.
3. Entrar como Carolina o Joan: ve su lista sin botones de ordenar ni auto-asignarse.
4. Christian no ve el módulo en el menú.
5. Antonio / Daniela / Mónica pueden auto-asignarse (antes el formulario los bloqueaba).

### A medias

Nada de este turno. Pasada de usabilidad → EXEC-PACKET para Cursor (`.ai/EXEC-PACKET.md`, Estado LISTO PARA CURSOR).

### Siguiente

Cursor ejecuta el EXEC-PACKET. Pendiente conocido: reintentar tras error de equipo en asignar duplica la actividad.

### No tocar

Puente NAS.
