# Auditoría de conexión entre módulos — y casos de uso operativos

Base: `refactor/roles-purge-v2`. Todo lo marcado como **hecho** está aplicado y
verificado; el resto es diseño para tu revisión, porque implica cambios de
esquema y reglas de negocio que no me corresponde decidir.

## 1. Lo que ya estaba roto (corregido)

### 1.1 El estado de una actividad estaba partido en dos — **CORREGIDO**

`Activity.estatus` es texto libre. El código usaba dos grafías para el mismo
estado, y la consecuencia no era cosmética:

| Grafía | Quién la escribía | Quién la leía |
|---|---|---|
| `Finalizada` | Cierre de hoja de servicio (`service-sheets.service.ts:245`) — **la única ruta real de cierre** | ticket-alerts, portal de cliente, service-clients |
| `Finalizado` | El contenedor interno de gastos (`expenses.service.ts:77`) y nadie más | **11 sitios**: KPIs de dirección, analítica, cron de SLA, triage IA, buscador, calendario, lab |

Efecto real en producción:

- **Los KPIs de dirección leían cero.** `executive.service.ts` contaba tickets
  completados del mes filtrando por `Finalizado`; ninguna actividad de campo
  lleva ese valor.
- **El SLA contaba como abiertas actividades ya cerradas** (`sla-tracker`,
  `cron`, `ticket-alerts`), inflando incumplimientos y disparando alertas sobre
  trabajo terminado.
- **El buscador marcaba como vencidas** actividades cerradas.

Corrección: módulo `activities/activity-status.ts` con vocabulario canónico y
emparejado tolerante a alias. Los filtros pasan a `IN (…)` con todas las grafías,
de modo que **los datos históricos se leen bien sin migrar nada**. 14 tests.

> Queda una decisión tuya: el flujo de evidencias
> (`activity-evidence.service.ts:457`) marca la actividad como `Pendiente` al
> completarse, con el comentario "queda pendiente hasta revisión
> administrativa". Es decir, una actividad terminada en campo aparece como
> pendiente hasta que alguien la revisa. **No lo he tocado** porque es una regla
> de negocio, pero merecería un estado propio (`Por Validar`) en lugar de
> reutilizar `Pendiente`: hoy no se distingue lo que nadie ha empezado de lo que
> está esperando validación.

### 1.2 El motor de workflows no lo dispara ningún módulo

`WorkflowDefinition` / `WorkflowStep` / `WorkflowInstance` / `WorkflowApproval`
existen, con su servicio y controlador. **Cero llamadas desde otros módulos de la
API**: solo se puede arrancar una instancia a mano desde el panel de
aprobaciones. El motor de aprobaciones está construido y desconectado de los
eventos que deberían dispararlo.

Es la pieza clave para casi todo lo que sigue: los disparos automáticos no hay
que inventarlos, hay que **enchufarlos**.

## 2. Lo que falta en el modelo (confirmado sobre el esquema)

| Necesidad | Estado real | Evidencia |
|---|---|---|
| Varias personas en una actividad | **No existe** | `Activity.responsableId Int` — uno solo, obligatorio |
| Reasignar actividad inconclusa | **No existe** | Cambiar `responsableId` sobrescribe; sin historial ni motivo |
| Actividades secuenciales | **No existe** | Sin `dependsOn` / predecesor en el esquema |
| Facturar al cerrar | **No existe** | `Invoice` no tiene `activityId`: no hay camino de datos operación → facturación |
| Visita de contrato → actividad | **Sí existe** | `MaintenanceContractVisit.activityId` |

## 2.bis Costuras cerradas en el cierre de actividad — **HECHO**

`ActivityLifecycleService` cuelga del único punto del ERP donde una actividad
pasa a finalizada (`service-sheets.service.ts`). Cierra tres costuras que ya
tenían la clave foránea puesta pero **nadie sincronizaba**:

### 2.bis.1 La visita de contrato nunca se cerraba

`materializeVisitAsActivity` crea la actividad y deja la visita en `GENERATED`
con `activityId` apuntando a ella. **Nada la pasaba a `COMPLETED`**, así que
`completedAt` quedaba nulo indefinidamente aunque el técnico hubiera hecho la
visita y firmado la hoja de servicio.

Quien leía mal por esto: `analytics.service.ts:569,576`, `executive.service.ts:129`
(KPIs de contratos) y `alerts.service.ts:183` (alertas de visitas), que seguían
contando como pendientes visitas ya realizadas.

Ahora se marca `COMPLETED` con `completedAt`. El filtro es `status IN
('SCHEDULED','GENERATED')`: idempotente, y no pisa una visita cerrada ni una
marcada `SKIPPED` a propósito.

### 2.bis.2 La solicitud del cliente quedaba abierta para siempre

`ClientTicketRequest.activityId` enlaza la solicitud del portal con la actividad,
pero al terminar el servicio la solicitud seguía en `NEW`/`ASSIGNED`. El cliente
veía su ticket abierto indefinidamente. Ahora pasa a `CLOSED`.

### 2.bis.3 El motor de aprobaciones queda enchufado

Si la empresa define un `WorkflowDefinition` activo con `entityType =
ACTIVITY_CLOSURE`, el cierre abre la instancia y notifica al primer aprobador.
Sin definición no ocurre nada: **es el caso normal, no un error**. No duplica
instancias abiertas.

Esta es la base sobre la que montar los disparos que pediste —reporte extra,
facturación del contador— sin inventar un mecanismo paralelo: se definen como
pasos del workflow.

### Nota de diseño

Propagar es **best-effort y aislado**: la actividad ya se cerró en campo, así que
un fallo al sincronizar no revierte el cierre. `onActivityFinished` nunca lanza;
devuelve qué se hizo y qué falló, y el llamador lo registra. 10 tests cubren cada
costura, incluido el caso de fallo parcial.

## 3. Casos de uso propuestos

Cada uno indica qué hace falta y qué se apoya en lo que ya hay.

### 3.1 Varias personas en una misma actividad

Hoy una instalación de CCTV con tres técnicos se modela como una actividad con un
responsable, y los otros dos no figuran. Eso rompe: reparto de viáticos,
cómputo de horas, y el "quién estuvo ahí" de la evidencia.

**Propuesta:** modelo `ActivityAssignee` (actividad, usuario, rol en la actividad
—`LEAD` / `TECNICO` / `APOYO`—, horas asignadas, alta y baja). `responsableId` se
conserva como el líder, para no romper las ~40 consultas que lo usan.

Implicaciones que conviene decidir contigo:

- ¿Los viáticos se prorratean entre asignados o cada uno solicita el suyo?
- ¿La evidencia obligatoria la cubre cualquiera del equipo o cada uno la suya?
- ¿El SLA se mide contra el líder o contra el primero que llega?

### 3.2 Reasignación de una actividad inconclusa

Hoy es un `UPDATE` que pisa el responsable. Se pierde quién la tenía, por qué se
movió y cuánto tiempo consumió cada uno — y el SLA sigue midiendo desde
`fechaAsignacion` original, que ya no corresponde a nadie.

**Propuesta:** modelo `ActivityReassignment` (actividad, de quién, a quién, quién
la movió, motivo, momento). Con dos consecuencias operativas:

- El SLA de respuesta se recalcula desde la reasignación (o se conserva: es
  decisión tuya, y cambia mucho los números).
- Notificación automática a ambos técnicos y al supervisor.

Se apoya en la auditoría que ya dejamos con autor (`AuditLog.userId`), pero
merece modelo propio: la auditoría es genérica y no sirve para consultas
operativas.

### 3.3 Actividades secuenciales con disparo en cadena

Tu ejemplo: al cerrar una actividad, alguien debe generar un reporte extra, o el
contador debe facturar.

**Propuesta:** `ActivityDependency` (actividad predecesora, actividad sucesora,
tipo de vínculo) más un disparador en el cierre. Al pasar una actividad a
`Finalizada`:

1. Se desbloquean las sucesoras (`Pendiente` → `Asignada`) y se notifica.
2. Si la sucesora es de tipo `FACTURACION`, se crea la tarea al contador con los
   datos del ticket ya cargados.
3. Si el contrato o el cliente exige reporte de cierre, se genera la actividad de
   reporte automáticamente.

El punto de enganche **ya existe y es único**: `service-sheets.service.ts:245`.
Ese es el sitio donde hoy una actividad pasa a `Finalizada`, y donde debe colgar
el disparo. Tenerlo centralizado es lo que hace esto viable.

### 3.4 Facturación al cerrar el servicio

Falta el eslabón: `Invoice` no sabe de qué actividad nace, así que no se puede
responder "¿qué trabajo terminado sigue sin facturar?", que es la pregunta que
más dinero mueve.

**Propuesta:** `Invoice.activityId` (opcional) y una vista de *trabajo cerrado
pendiente de facturar*: actividades `Finalizada` con cliente, sin factura
asociada, ordenadas por antigüedad. Con la corrección del punto 1.1 esa consulta
por fin devuelve datos reales.

### 3.5 Variables operativas para el cálculo

Ya existen `tiempoEstimadoMin` y `tiempoMaximoMin` pero no se usan para nada más
que mostrarse. Con multi-asignación y reasignación se puede calcular de verdad:

- **Coste real de la actividad** = horas por técnico × su tarifa + viáticos +
  materiales de almacén consumidos.
- **Desviación** frente a lo estimado, que es lo que alimenta el margen del
  proyecto (`SalesProject` ya tiene `costProducts` y `costViaticos`).
- **Eficiencia por técnico**, hoy en `eficienciaScore` sin fórmula que lo llene.

## 3.bis Barrido transversal de los 85 módulos

Además del flujo de actividades, se auditaron clases de fallo en todo el
backend. **Lo que salió bien conviene decirlo igual que lo que salió mal:**

| Comprobación | Resultado |
|---|---|
| Aislamiento multi-tenant | **Impecable.** De 109 modelos con `companyId`, 106 están auto-acotados. Los 3 restantes (`FeatureFlag`, `SystemSetting`, `UserCompany`) son excepciones correctas |
| Precisión monetaria | **Correcta.** 89 de 92 campos de dinero usan `Decimal`. Los 3 `Float` son precios de catálogo externo, no importes transaccionales |
| Concurrencia de inventario | **Correcta.** Descuento atómico con guarda `quantity: { gte: … }` dentro de transacción |
| Autorización de endpoints mutantes | **1 hueco real** (abajo) |
| Estados en texto libre | **21 columnas**; 2 con colisión real, ambas corregidas |

### 3.bis.1 Los portales externos alcanzaban módulos internos — **CORREGIDO**

`AuthGuard('jwt')` acepta **cualquier** token firmado, y los portales de cliente
y de sucursal emiten tokens con el mismo secreto (`jwt.strategy.ts` valida los
payloads `isClient` / `isBranchUser` sin lanzar). Cuatro controladores estaban
protegidos **solo** con `AuthGuard`:

- `hero-slides`, `hero-video`, `social-posts` — contenido del **sitio público**
- `internal-comunicados` — **comunicados internos** al personal

Es decir: un usuario del portal de un cliente tuyo podía modificar el carrusel de
la web pública y leer o borrar comunicados internos.

Corregido con `StaffOnlyGuard`: rechaza tokens de portal en esos controladores.
Es deliberadamente estrecha —no decide **qué** rol interno puede hacer qué, solo
que quien llama sea del personal— porque el reparto por rol es la matriz RBAC. 6
tests.

> **Lo que NO hice, y por qué.** El arreglo "completo" sería aplicar `RbacGuard`
> como en `news` / `case-studies` / `page-content`. Lo implementé, y al revisarlo
> vi que **habría roto el panel de diseño**: `RbacGuard` consulta además una
> matriz de URLs *fail-closed*, y `hero-slides`, `hero-video`, `social-posts` e
> `internal-comunicados` **no están en la matriz** para ningún rol. Los
> diseñadores habrían perdido el acceso. Lo reverti.
>
> Para cerrarlo bien hay que añadir esas rutas a la matriz por rol, y eso es
> decisión tuya: ¿`LIDER_DISENO` y `DISENADOR` gestionan el carrusel y las redes?
> ¿Qué rol gestiona los comunicados internos, RRHH o dirección?

### 3.bis.2 Las multas se pagaban en dos idiomas — **CORREGIDO**

Mismo patrón que el estatus de actividad, en `Fine.estatusPago`:

- El panel de RRHH escribía y leía `"Pagado"`.
- La tabla de multas escribía y leía `"Pagada"`.

Una multa marcada como pagada desde RRHH **seguía apareciendo pendiente** en la
tabla de multas, y el KPI "Pagadas" contaba solo la mitad.

Corregido con vocabulario canónico (`common/status/operational-status.ts` en la
API y su espejo en el web): la API **normaliza en la escritura** y rechaza
valores no reconocidos, y la lectura tolera las grafías históricas. 11 tests.

## 4. Orden recomendado

1. **Ya hecho:** estado canónico. Sin esto ningún disparo por "actividad
   finalizada" funcionaría, y los informes seguirían en cero.
2. Decidir el estado `Por Validar` (1.1) — cambia el significado de "pendiente".
3. `ActivityAssignee` + `ActivityReassignment`: son aditivos, no rompen nada.
4. `ActivityDependency` + disparadores en el punto de cierre.
5. `Invoice.activityId` y la vista de pendiente de facturar.
6. Enchufar el motor de workflows a esos disparadores en vez de crear un
   mecanismo paralelo.

Los pasos 3 a 5 requieren **migración de base de datos**, que no he generado:
necesita aplicarse contra tu Postgres y prefiero que decidas antes las reglas de
negocio de 3.1 y 3.2, porque cambian las columnas.
