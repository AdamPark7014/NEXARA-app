# 16 · Paridad móvil fuera de INTEGRA — ERP, CRM, OPS, STUDIO y PORTAL

**Fecha de medición: 2026-09-07.** Alcance: todo menos INTEGRA (`ui/integra/**` y
`data/integra/**` los llevan otros agentes; ni se leyeron para decidir estados ni se tocaron).

> Este documento **no** repite lo que decían `05-inventario-paridad-movil.md` ni
> `docs/native-parity-matrix.md`. Los dos están desactualizados y el segundo ha mentido: se le
> añadieron ✅ que no correspondían a código. Todo lo de aquí se midió abriendo el `when (key)` de
> cada NavHost, siguiendo la clave hasta el composable que despacha, y buscando en ese composable
> llamadas de **escritura** al API (`create*`, `update*`, `approve*`, `delete*`, `upload*`,
> `post*`, `patch*`). Un módulo que lista pero no permite actuar **no** es paridad.

---

## 0. Definiciones (para que «NATIVO» signifique lo mismo siempre)

| Estado | Qué significa exactamente |
|---|---|
| **NATIVO** | La pantalla ejecuta al menos una mutación real contra el API, y esa mutación es *la función del módulo*. |
| **SOLO_LECTURA** | Lista, filtra, muestra detalle. No escribe. |
| **CASCARÓN** | Placeholder, o despacha a la pantalla de **otro** módulo, de modo que la función propia no existe. |
| **AUSENTE** | No hay clave en el catálogo ni pantalla. |

---

## 1. Estado ANTES (medido hoy, antes de tocar nada)

### 1.1 Presencia — módulos web sin equivalente móvil

La matriz canónica `apps/web/lib/access-matrix.ts` declara **80 módulos** fuera de INTEGRA y LAB
(ERP 33 · CRM 15 · OPS 22 · STUDIO 10). Contra el catálogo Kotlin:

| Módulo web | Panel | Ruta | Estado móvil antes |
|---|---|---|---|
| `reuniones` | ERP | `/erp/reuniones` | **AUSENTE** |
| `facilities-access` | ERP | `/erp/facilities/access` | **AUSENTE** |

Los otros 78 tenían clave en el catálogo. **La presencia ya no era el problema principal; la
profundidad sí.**

### 1.2 Profundidad — lo que **declaraba** el catálogo

| Portal | Entradas | NATIVO | SOLO_LECTURA | CASCARÓN |
|---|---|---|---|---|
| Console (ERP + OPS) | 64 | 47 | 15 | 2 |
| Ventas (CRM) | 20 | 12 | 8 | 0 |
| Contabilidad | 13 | 9 | 2 | 2 |
| Studio | 10 | 8 | 2 | 0 |
| **Total** | **107** | **76** | **27** | **4** |

### 1.3 Profundidad — lo que decía el código

Se verificaron las 107 entradas contra su composable. **Tres claves decían NATIVO sin escribir
nada**, y cuatro más estaban mal etiquetadas en la otra dirección o abrían la pantalla de otro
módulo:

| Clave | Portal | Decía | Es | Evidencia |
|---|---|---|---|---|
| `service-sheets` | Console | NATIVO | **SOLO_LECTURA** | `ui/console/screens/OpsModuleScreens.kt:555` sólo llama `repo.serviceSheetDtos()`. **No existe ningún endpoint de escritura de hojas de servicio en todo `data/`.** La pantalla enseña «Firma del cliente» y «PDF» como texto: no firma, no sube, no crea. (La captura real sí existe, pero vive en Evidencias — pasos 3 y 4.) |
| `exports` | Console | NATIVO | **SOLO_LECTURA** | `repo.exportCsv` es `@GET("exports/{entity}")` (`data/api/ExtraApi.kt:1205`). Descarga y comparte; no genera nada en el servidor. |
| `assets` | Console | NATIVO | **SOLO_LECTURA** | Despacha `MaintenanceModuleScreen(initialTab = 1)`. La pestaña Activos lista y muestra detalle de solo lectura (`OpsModuleScreens.kt:896-919`); las únicas escrituras del archivo (`startWorkOrder`/`completeWorkOrder`) son de la pestaña Órdenes, o sea del módulo `maintenance`. |
| `news` | Console | CASCARÓN | **SOLO_LECTURA** | El catálogo se acusaba de más: es una pantalla real con filtros, KPIs y detalle. |
| `architecture` | Console | CASCARÓN | **SOLO_LECTURA** | Dibuja el `ModuleCatalog` local. No toca API, pero funciona. |
| `pagos` | Contabilidad | CASCARÓN | **NATIVO** | Despacha `EmployeePaymentsRichScreen`, que crea, edita, marca pagado y borra. Es un alias duplicado de `employee-payments`, no un cascarón. |
| `viaticos` | Contabilidad | CASCARÓN | **CASCARÓN confirmado** | Abría `MyViaticsScreen`, que filtra `usuarioId == miId`. Un contador entraba a «Viáticos» y veía **sólo los suyos** — normalmente ninguno. Pantalla vacía sin explicación. |
| `horas` | Contabilidad | SOLO_LECTURA | **CASCARÓN** | Abría `LunchBreaksModuleScreen`: la pantalla de **Comidas**, otro módulo con otros datos. |

Corrigiendo esas ocho filas, el estado **real** de partida era:

| Portal | Entradas | NATIVO | SOLO_LECTURA | CASCARÓN |
|---|---|---|---|---|
| Console (ERP + OPS) | 64 | 44 | 20 | 0 |
| Ventas (CRM) | 20 | 12 | 8 | 0 |
| Contabilidad | 13 | 10 | 1 | 2 |
| Studio | 10 | 8 | 2 | 0 |
| **Total real** | **107** | **74** | **31** | **2** |

Es decir: el catálogo se atribuía **76 módulos nativos y tenía 74**, y donde decía «4 cascarones»
había 2, pero distintos de los declarados.

### 1.4 Legibilidad de los errores

`ApiErrors.kt::toUserMessage()` existía desde la ola anterior, pero apenas se usaba. En los
directorios de este encargo quedaban **243 usos de `e.message` crudo repartidos en 52 archivos**:
el usuario pulsaba un botón y leía «HTTP 502 Bad Gateway» o, peor, `null`.

### 1.5 Portal de clientes (tickets)

Verificado y **ya cerrado por olas anteriores** — se comprobó, no se dio por bueno:
`TicketsTicketDetailScreen.kt:285` `postTicketComment` y `:323` `patchTicketStatus`, con los botones
gateados por `isFinished()` y no por `!isOpen()`, que era el bug que los enseñaba en tickets
cancelados. Alta de sucursal con logo, inventarios con fotos, feedback y perfil: nativos.

Lo mismo para las otras prioridades del encargo, todas ya cerradas y reverificadas hoy:
viáticos con alta y comprobante (`ConsoleViaticsScreen.kt:135`), aprobación de vacaciones
(`HrLeavesScreen.kt:221,240`), incidencias (`FinanceRichScreens.kt:921`), documentos con subida
(`CatalogRichScreens.kt:300`), mi perfil (`MyProfileScreen.kt:134`) y usuarios **con roles**
(`ConsoleUsersScreen.kt:120,153` — crea y edita con `roleId` y `deptId` desde el selector de roles).

---

## 2. Qué se cerró en este turno

### 2.1 Reuniones — módulo nuevo completo (era AUSENTE)

El ritmo operativo no existía en el móvil. La junta diaria de las 10:00, los acuerdos que salen de
ella y las lecciones de la junta del viernes sólo se veían desde la web — justo la gente que tiene
acuerdos asignados es la que está en campo con el teléfono.

El turno anterior murió dejando **sólo `data/api/MeetingsApi.kt`, huérfano**: no lo referenciaba
nadie, ni `ApiClient`. Se completó todo lo que faltaba.

| Archivo | Qué es |
|---|---|
| `data/api/MeetingsApi.kt` | Ampliado: `PUT reuniones/{id}/asistencia`, `MeetingAttendeeDto` con `userId`, agenda sugerida por tipo. |
| `data/meetings/MeetingsRepository.kt` | Nuevo. Parseo a mano de todas las respuestas. |
| `ui/console/util/MeetingForms.kt` | Nuevo. Validación pura, sin Android ni red. |
| `ui/console/screens/MeetingsScreen.kt` | Nuevo. ViewModel + 4 pestañas. |
| `ui/console/screens/MeetingsDetailScreens.kt` | Nuevo. Acta completa y convocatoria. |

**Profundidad, no presencia.** Las cuatro pestañas de la web (`/erp/reuniones`), con las reglas del
servidor replicadas del lado del cliente para no descubrirlas en un 400:

- **Mis acuerdos** — pantalla de entrada. Avanza el acuerdo propio vía `PATCH mis-acuerdos/:id`.
- **Reuniones** — convocar (tipo, fecha, hora, título, agenda, convocados), **pasar lista**,
  registrar acuerdos/lecciones/riesgos y **cerrar con minuta**.
- **Vencidos** — el tablero con el que arranca la junta de cierre.
- **Lecciones aprendidas** — buscables.

Reglas que **no** se aplanaron:

1. **Un acuerdo necesita responsable; una lección y un riesgo, no** (`agreementRequiresOwner`). Es
   la regla que da sentido a la junta: un acuerdo sin dueño es un deseo. Además, a la lección se le
   descartan responsable y fecha aunque el formulario los traiga llenos — guardar un compromiso que
   nadie va a cumplir es peor que no guardarlo.
2. **Pasar lista manda la lista COMPLETA.** El servidor reemplaza el acta (`setAttendance`), no
   fusiona. Mandar sólo las casillas marcadas borraba a los ausentes, que es justo la parte que se
   quiere poder demostrar después. Por eso `MeetingAttendeeDto` lleva `userId` y no sólo el nombre.
3. **Quién puede escribir lo decide el rol**, espejo de `MEETINGS_LEAD_URL_RULES`: todo el personal
   mueve lo suyo; sólo quien conduce convoca, cierra y registra acuerdos ajenos. Enseñar «Convocar»
   a quien va a recibir un 403 es peor que no enseñarlo.
4. **El tipo rellena título, hora y agenda por defecto**, igual que `MEETING_DEFAULTS` /
   `MEETING_AGENDA`. La diaria se convoca en un toque y la junta del viernes arranca con «Lecciones
   aprendidas» ya escrito en la agenda — que es justo el punto que se olvida.
5. **`vencido` y `diasVencido` se leen del servidor**, no se recalculan: dos verdades sobre la
   misma fecha es peor que una.
6. **Campos nulables.** `facilitador`, `responsable`, `meeting` y `activity` vienen de `include` de
   Prisma y pueden ser `null`. Todo se parsea a mapas con `fromRaw` en vez de `data class` con
   campos no nulables — el patrón que ya dejó pantallas en blanco varias veces en esta app.
7. **El error nunca borra la pantalla.** `refresh()` pide acuerdos y reuniones por separado; si una
   falla, el mensaje sale **arriba** y la lista conserva lo que ya tenía.

### 2.2 Contabilidad — dos claves que abrían la pantalla de otro módulo

| Clave | Antes | Ahora |
|---|---|---|
| `viaticos` | `MyViaticsScreen` — sólo los del propio contador | `ConsoleViaticsScreen` — revisión del equipo, cadena de aprobación por monto, comprobante y marcado de pagado |
| `horas` | `LunchBreaksModuleScreen` — la pantalla de **Comidas** | `ConsoleAttendanceScreen` — jornadas del equipo, total de horas del período y exportación `Usuario,Horas,Días registrados` |

### 2.3 Errores legibles — 243 sitios en 52 archivos

Barrido de `e.message` crudo → `toUserMessage()` en los diez directorios del encargo, conservando
cada texto de respaldo. Ahora un 400 de NestJS enseña el español que ya escribe el servidor
(«Un acuerdo necesita responsable…»), un 401 dice «Sesión expirada», un 5xx dice «Error del
servidor» y una caída de red dice «Sin conexión» — en vez de `HTTP 502 Bad Gateway` o `null`.

### 2.4 Accesos del módulo nuevo

`ui/console/ConsoleAccessRules.kt`: `reuniones` añadido al grupo «Mi espacio de trabajo», a la
lista del ingeniero, a la del vendedor y a `ADMINISTRATIVO_ERP_MODULE_KEYS` — espejo de
`MEETINGS_STAFF_URL_RULES`, que cubre a `ing_campo`, `ing_soporte`, `vendedor`, `administrativo`,
`contabilidad` y `disenador`.

---

## 3. Estado DESPUÉS

| Portal | Entradas | NATIVO | SOLO_LECTURA | CASCARÓN |
|---|---|---|---|---|
| Console (ERP + OPS) | 65 (+1 `reuniones`) | 45 | 20 | 0 |
| Ventas (CRM) | 20 | 12 | 8 | 0 |
| Contabilidad | 13 | 11 | 2 | 0 |
| Studio | 10 | 8 | 2 | 0 |
| **Total** | **108** | **76** | **32** | **0** |

Comparado contra el estado **real** de partida (no contra el declarado):

| | Antes (real) | Después |
|---|---|---|
| Entradas | 107 | 108 |
| NATIVO | 74 | **76** |
| SOLO_LECTURA | 31 | 32 |
| **CASCARÓN** | **2** | **0** |
| Módulos web ausentes | 2 | **1** |
| Estados de catálogo que mienten | 8 | **0** (tras aplicar §6) |
| `e.message` crudo | 243 en 52 archivos | **0** |

Se ganaron `reuniones` (nuevo), `viaticos` y `horas` de contabilidad (abrían la pantalla de otro
módulo) y `pagos` (ya escribía y estaba mal etiquetado); se perdieron `service-sheets`, `exports` y
`assets`, que nunca fueron nativos. **La cifra de antes era falsa; la de ahora está medida.**

De los 80 módulos web fuera de INTEGRA queda **1 ausente**: `facilities-access`.

`horas` se cuenta como SOLO_LECTURA aunque la pantalla que abre ahora sí escribe (registro de
jornada con foto): para contabilidad la función del módulo es **leer** horas de nómina, y contarlo
como nativo sería inflar la cifra otra vez.

---

## 4. Lo que queda abierto, y por qué

| Qué | Estado | Motivo |
|---|---|---|
| `facilities-access` (ERP `/facilities/access`) | AUSENTE | Es control de accesos de las sedes NEXARA: consume el mismo ACS que INTEGRA. Construirlo obliga a entrar en `data/integra/**`, que es de otros agentes. |
| `service-sheets` | SOLO_LECTURA | **No hay endpoint de escritura en el API.** No es una omisión del móvil: la captura real vive en Evidencias (pasos `SERVICE_SHEET_PDF` y `SERVICE_SHEET_DATA`), que sí es nativa. Este módulo es su índice. Cerrarlo de verdad exige tocar `apps/api`, fuera de este encargo. |
| `exports` | SOLO_LECTURA | El endpoint es un `GET` que devuelve un CSV. Descargar y compartir **es** la función del módulo; el estado honesto es SOLO_LECTURA, no un defecto que cerrar. |
| `assets` | SOLO_LECTURA | El API de activos en campo no expone alta ni edición desde el móvil; sólo se leen. |
| Dashboards, BI, analítica, auditoría, NOC, SLA, organigrama, KPIs de personas, calendario, KB, licitaciones, metas, catálogo de productos, newsletter, mensajes de contacto, noticias, arquitectura | SOLO_LECTURA | Son de consulta por diseño, o su escritura vive en el módulo dueño. **Ninguno finge escribir.** |
| `~100` usos de `!!` preexistentes en los directorios propios | Deuda | Todos van precedidos de `!= null` o `isNullOrBlank()`, así que no revientan; es estilo. Reescribirlos en 40 archivos ya verificados metía más riesgo del que quitaba. El código nuevo de este turno no lleva ninguno. |
| Claves que comparten pantalla | Deuda de catálogo | `cvs`/`recruiting`, `support`/`client-tickets`, `proyectos`/`work-projects`, `pagos`/`employee-payments`, `bi`/`analytics`, `stock`/`warehouse`. Funcionan, pero son alias: dos entradas de menú que llevan al mismo sitio. |

---

## 5. Verificación

El árbol de trabajo compartido **no compila hoy**, y no por este turno: mientras corría este
encargo, otro agente añadió a `ui/integra/` los archivos `IntegraAlarmsScreen.kt`,
`IntegraAttendanceScreen.kt`, `IntegraDevicesScreen.kt`, `IntegraEventsScreen.kt` y
`IntegraOccupancyScreen.kt`, que duplican composables ya declarados en `IntegraScreens.kt`
(«Conflicting overloads»). Es trabajo vivo de INTEGRA y **no se tocó**.

Para poder verificar sin interferir, se compiló en un `git worktree` aparte sobre `HEAD`
(`df749076`, con INTEGRA limpio) con **todos** los cambios de este turno copiados encima:

```
./gradlew :app:compileDebugKotlin :app:testDebugUnitTest
BUILD SUCCESSFUL in 43s
```

**291 pruebas · 0 fallos · 0 errores · 0 saltadas**, de las cuales 31 son nuevas:
`MeetingFormsTest` (16) y `MeetingsDtoTest` (15).

---

## 6. Cambios de catálogo que tiene que hacer Adam

`ui/catalog/ModuleCatalog.kt` es suyo; aquí no se tocó. Hacen falta estos cambios, y también
`access/ModulePanelMap.kt`, que tampoco se tocó.

### 6.1 Entrada nueva en `ModuleCatalog.console`

```kotlin
mod("reuniones", "Reuniones", "📅", "/erp/reuniones", ParityStatus.NATIVO),
```

### 6.2 Correcciones de estado en `ModuleCatalog.console`

| Clave | De | A |
|---|---|---|
| `service-sheets` | `NATIVO` | `SOLO_LECTURA` |
| `exports` | `NATIVO` | `SOLO_LECTURA` |
| `assets` | `NATIVO` | `SOLO_LECTURA` |
| `news` | `CASCARON` | `SOLO_LECTURA` |
| `architecture` | `CASCARON` | `SOLO_LECTURA` |

### 6.3 Correcciones en `ModuleCatalog.contabilidad`

| Clave | De | A |
|---|---|---|
| `viaticos` | `CASCARON` | `NATIVO` |
| `horas` | `SOLO_LECTURA` | `SOLO_LECTURA` (sin cambio de estado, pero la etiqueta ahora sí corresponde: abre asistencia/jornadas) |
| `pagos` | `CASCARON` | `NATIVO` |

### 6.4 `access/ModulePanelMap.kt`

Añadir `"reuniones"` a `ERP_KEYS`. Sin eso el módulo no aparece en el panel ERP aunque exista la
entrada de catálogo y la ruta.
