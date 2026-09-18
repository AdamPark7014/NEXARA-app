# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-18
- **Rama:** feat/periodos-actividades (sale de mejora/calidad-y-web @ 6a1ffeb0)
- **HEAD:** ver `git log -1` (commit de este turno)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Periodos de actividades (regla del dueño 18-09)

> «Al crear un proyecto se define el tiempo de ejecución y con base en el mismo se designan
> los periodos de las actividades/tareas asignadas y subsecuentes, para no realizar la carga
> de estas de manera diaria cuando el tiempo se prolonga.»

### Por qué había que cargar a diario (lo que se encontró)

- El formulario de asignar manda `fechaInicio = fechaEntregaEsperada = fechaMaxima` al **mismo
  instante** (día + hora). A la hora citada la actividad ya estaba «vencida»: semáforo rojo,
  pizarra «Atrasado», aviso SLA de vencida a dirección (`ticket-alerts`, cada 5 min) y el
  `sla-breach-escalate` la marcaba a las 24 h (MEDIA) desde la asignación.
- El «Tiempo estimado» (obligatorio en /asignar, `horasPlan`) se mide de reloj corrido desde el
  inicio real: en un trabajo de varios días quedaba «excedida» esa misma noche + aviso
  `ACTIVITY_OVERTIME` a los jefes.
- Asistencia: la sucursal de la actividad solo contaba como sitio válido para checar el día en
  que caía alguna de sus fechas; el día 3 de una obra ya salía «fuera de sitio».
- Lo que **no** obligaba: la pizarra ya muestra lo abierto de días anteriores (no filtra por
  día) y nada cierra actividades solo (el cierre de 23:30 es de jornadas de asistencia).

### Hecho

1. **Modelo:** `Activity.periodoInicio` / `periodoFin` (`DATE`) + `projectMilestoneId` (FK a la
   etapa, `SET NULL`). Migración aditiva `20260918120000_actividades_periodo` (**sin aplicar** en
   ningún servidor).
2. **Reglas puras** `apps/api/src/activities/actividad-periodo.ts`: «Día N de M», etiquetas
   («Día 3 de 10 · termina vie 25 sep», «Empieza lun 28 sep · 5 días», «Terminaba … · 2 días de
   atraso»), empalmes, validación y encadenado de etapas. Con periodo, `fechaMaxima` y
   `fechaEntregaEsperada` = fin del último día (hora de México), así SLA/semáforo/pizarra no la dan
   por tarde antes.
3. **Pizarra / Mis actividades / detalle** devuelven `periodo` (DTO con `etiqueta`). La pizarra no
   muestra una etapa antes de su primer día; semáforo verde si está programada; `excedida` y el
   aviso de tiempo excedido no aplican a periodos de varios días; reprogramar recorre el periodo
   completo; `sla-breach-escalate` y `sla-tracker` miden contra el fin del periodo; asistencia
   acepta la sucursal todos los días del periodo.
4. **Programar actividades del proyecto:** `GET /proyectos/:id/programacion` (propuesta con
   periodos encadenados por etapa) y `POST /proyectos/:id/programar-actividades` (una por etapa, o
   etapa × sitio; responsable + apoyo por etapa; valida todo antes de crear; no duplica). Crea con
   `ActivitiesService.create` (AN-xxxx + aviso) y `ActivityTeamService.addMember`.
   Web: pestaña Actividades del proyecto → «Programar actividades» (mover una etapa recorre las
   siguientes conservando su duración).
5. **Formulario de asignar** (`OpsActivityForm`): rango «Del / Al»; en actividad de proyecto
   propone la etapa que corre (o la ventana del proyecto) y deja elegir etapa.
6. **Apps:** Android e iOS pintan `periodo.etiqueta` en la tarjeta de Mis actividades y en el
   detalle (campos opcionales; API vieja = igual que antes).

### Verificado

- API: `tsc` 0 errores contra un cliente Prisma **aislado** generado con el schema nuevo (no se
  regeneró el cliente compartido de `node_modules`). Jest de activities/me/projects/attendance/
  common/sla-tracker/notifications: 650 ok; 1 falla **previa** (`activities.controller.spec`,
  el mock de Prisma no trae `user`).
- Web: `tsc` 0 errores; vitest de lo tocado ok. Fallas **previas** ajenas: `ops-activity-form`
  «08:00 locales» (la hora por omisión es 09:00) y `lib/rbac/role-modules.spec` (25).
- Android: `:app:compileDebugKotlin` + `ActivityPeriodoTest`, `ActividadesUxTest`,
  `ActivitySemaforoTest` BUILD SUCCESSFUL.

### A medias / sin verificar

- Migración sin aplicar; nada probado contra base real ni en navegador (no hay DB local).
- iOS sin compilar (Windows).
- KPI de eficiencia (plan vs real) sigue midiendo reloj corrido en actividades de varios días.
- Pendientes de Adam que siguen abiertos: rotar la Maps key filtrada; billing/topes en Google Cloud.

### Siguiente

1. Merge a `mejora/calidad-y-web` (ojo: otro agente cambió aceptar/rechazar → «Iniciar
   actividad» en `ActividadesScreen.kt`, `me.controller`, `my-activities.service.ts`; conflictos
   posibles pero chicos).
2. `prisma migrate deploy` en prueba y probar: programar un proyecto con 3 etapas, ver la pizarra
   del día y la del día en que arranca la 2.ª.

### No tocar

Puente NAS.
