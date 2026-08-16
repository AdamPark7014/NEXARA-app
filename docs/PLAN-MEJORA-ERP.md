# Plan de mejora del ERP NEXARA

Rama base: `refactor/roles-purge-v2` (commit `f1a3e58`).

## Contexto y método

La revisión se hizo sobre `refactor/roles-purge-v2`, no sobre `main`: `main` está
404 commits por detrás, no tiene multi-tenancy (`companyId` no existe en su
schema) y conserva fallos ya resueltos en la rama activa (endpoint
`GET /auth/debug/verify-user` de enumeración de usuarios, Swagger expuesto en
producción). Parchear `main` habría sido trabajo perdido.

Estado de partida medido, no supuesto:

| Métrica | Antes | F1 | F5 | F8 | F9 |
|---|---|---|---|---|---|
| Errores TypeScript (API) | 0 | 0 | 0 | 0 | 0 |
| Errores TypeScript (web) | 0 | 0 | 0 | 0 | 0 |
| Suites que pasan | 32 / 35 | 34 / 37 | 40 / 40 | 44 / 44 | **48 / 48** |
| Tests que pasan | 81 | 102 | 156 | 197 | **226** |
| Tests que fallan | 6 | 6 (preexistentes) | 0 | 0 | **0** |

Los 6 tests que estaban en rojo se verificaron primero contra la copia de trabajo
sin modificar en el mismo commit: fallaban igual, no los introdujo este trabajo.
Quedaron reparados en la Fase 2.

---

## Fase 1 — Ejecutada

Prioridad acordada: seguridad y control de acceso primero, después correctitud.

### 1.1 Lectura de `/uploads` sin autenticación — **crítico**

`apps/api/src/main.ts`. El guard decía proteger `/uploads` con JWT, pero
cortocircuitaba en `GET`/`HEAD`/`OPTIONS`:

```js
if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
  next(); return;   // lectura sin ninguna comprobación
}
```

Consecuencia: cualquiera con la URL leía CVs, recibos de nómina, documentos de
cliente, evidencias fotográficas y documentación de RRHH. Sin sesión, sin
tenant, sin rastro.

Corrección:

- Las lecturas exigen JWT válido.
- El token se acepta también desde la cookie de sesión `nexara_token`, porque el
  navegador no manda cabeceras en `<img src="/uploads/...">`; sin esto, exigir
  token habría roto toda imagen del ERP.
- Lista blanca explícita de lo público (`hero`, `page-media`, `news`,
  `case-studies`) para no tumbar el sitio de marketing. **Deny by default**:
  cualquier carpeta nueva nace protegida.
- La normalización de ruta rechaza travesías (`/hero/../cvs/...`, `%2e%2e`, `\`)
  para que un prefijo público no sirva de puerta a uno privado.

### 1.2 `X-Content-Type-Options` eliminado en contenido subido — **alto**

El mismo fichero borraba la cabecera `nosniff` en todo `/uploads`, con este
comentario: los avatares antiguos se guardaron sin extensión y así el navegador
los renderiza. El efecto colateral es XSS almacenado: un fichero subido con HTML
dentro se interpreta como HTML en el origen de la API.

Corrección: `nosniff` vuelve a aplicarse siempre; los ficheros sin extensión se
fijan como `image/jpeg`. Los avatares antiguos siguen viéndose —los navegadores
decodifican imágenes por contenido, no por subtipo declarado— y un payload HTML
ya no puede ejecutarse.

### 1.3 `chat:join` sin comprobación de membresía — **crítico**

`apps/api/src/realtime/realtime.gateway.ts` metía a cualquier socket en la sala
`chat:<channelId>` que pidiera, sin verificar nada. `chat.service.ts` emite
`chat:message` y `chat:message-updated` a esa sala. Cualquier usuario
autenticado —incluido uno de otra empresa, porque `channelId` es un entero
global— podía leer la conversación de cualquier canal.

Corrección: `chat:join` verifica `ChatChannelMember` y falla cerrado ante
cualquier error. `chat:typing` exige estar ya en la sala.

### 1.4 Sockets anónimos y CORS abierto en el gateway — **alto**

El gateway declaraba `cors: { origin: true }` (refleja cualquier origen) y
`handleConnection` dejaba conectados los sockets sin token. Esos sockets sí
recibían el `emit` global `entity:updated`, es decir, un feed en vivo de toda la
actividad de escritura de todas las empresas.

Corrección:

- La autenticación pasa a middleware de handshake (`server.use`), no a
  `handleConnection`: la identidad se resuelve **antes** de que el socket pueda
  emitir nada, y un socket sin token nunca llega a establecerse.
- El origen se valida con la misma lista blanca que HTTP (`isOriginAllowed`).
- Se conecta `createInMemoryWsConnectionGuard`, que existía en el repo pero no se
  usaba en ningún sitio, como límite de conexiones por IP.

### 1.5 `entity:updated` difundido globalmente — **medio**

`prisma.service.ts` hacía `server.emit` en cada escritura. Doble problema: filtra
metadatos de actividad entre tenants, y obliga a cada panel conectado a recargar
ante cualquier escritura ajena.

Corrección: la difusión va a la sala `company:<id>` cuando hay contexto de
tenant. Sin contexto (cron, seed) se mantiene la difusión global de solo
metadatos, documentado en el código.

### 1.6 Hashes de contraseña en `AuditLog.changes` — **alto**

`changes: params.args?.['data']` guardaba el payload tal cual. Un
`user.update({ data: { password } })` dejaba el hash en una tabla que consultan
los visores de auditoría.

Corrección: `redactAuditPayload` recorre el payload y sustituye claves
sensibles (contraseñas, tokens, API keys, secretos 2FA…) por `[redacted]`,
insensible a mayúsculas y separadores, recursivo sobre objetos y arrays.

### 1.7 Falso positivo en la detección de scope de tenant — **alto**

`whereAlreadyHasCompanyScope` daba por scoped cualquier `where` con un objeto
anidado que tuviera `companyId`. Un filtro de relación como
`{ client: { companyId: 5 } }` restringe la *relación*, no el modelo consultado,
pero bastaba para que el middleware se saltara la inyección de tenant por
completo y devolviera filas de otras empresas.

Corrección: solo cuentan un `companyId` de primer nivel o una clave única
compuesta que lo incluya como segmento (`companyId_section`, `userId_companyId`,
`key_companyId` — las tres formas presentes en el schema).

### 1.8 Propagación al cliente web

Cerrar el gateway rompía el realtime de 42 componentes que creaban el socket sin
token. Se añadió `apps/web/lib/realtime-socket.ts` con `createRealtimeSocket()`,
que inyecta el token (del llamador o de la cookie compartida), y se migraron los
42 puntos de creación. Los que ya pasaban `auth` conservan su token.

### 1.9 Tests

21 tests nuevos en dos suites:

- `apps/api/src/common/security/uploads-access.spec.ts` — lista blanca pública,
  denegación por defecto, travesías, extracción de token de cabecera y cookie.
- `apps/api/src/prisma/prisma-tenant-audit.spec.ts` — detección de scope de
  tenant (con el caso de regresión del filtro de relación) y redacción de
  auditoría.

---

## Fase 2 — Ejecutada (P1 · Correctitud)

### 2.1 Las 3 suites de tests rotas — **reparadas**

No era solo cableado de dependencias: los specs probaban contratos que ya no
existen.

- `excel-import.console.spec.ts` esperaba que la importación masiva de viáticos
  devolviera `importados`. Esa carga **está deshabilitada a propósito** desde
  `excel-import.service.ts:372`, sustituida por el flujo de solicitud con
  evidencia. El spec ahora verifica el contrato real: viáticos rechazados,
  modelo desconocido rechazado, y —lo relevante— que un modelo con tenant sin
  empresa activa falle cerrado sin escribir nada.
- `excel-import.controller.spec.ts` inyectaba `PrismaService` cuando el
  controlador ya depende de `ExcelImportService`. Se inyecta el servicio real
  con Prisma simulado y se añade una comprobación de que la empresa activa se
  propaga al servicio (el tenant nunca debe salir del fichero subido).
- `activities.controller.spec.ts` no resolvía `NotificationHierarchyService`,
  `UsersService`, `ExcelExportService` ni `ExcelImportService`, y llamaba a
  `findAll` con una firma antigua. Reescrito sobre el enrutado vigente:
  super admin → `findAll`, manager OPS → `findByAllowedUsers` con el conjunto de
  usuarios de consola, staff → `findByResponsible`, y `scope=mine` por encima de
  todo lo anterior. Cada caso comprueba además que la empresa activa se propaga.

### 2.2 Auditoría sin autor — **corregido**

`AuditLog` ya tenía columnas `userId`, `ipAddress` y `userAgent`; el middleware
simplemente no las rellenaba. Se añadió `userId` al contexto de tenant
(`TenantStore`), lo propaga `TenantInterceptor` desde `req.user.id`, y el
middleware de Prisma lo sella en cada entrada. Las entradas de auditoría ya
dicen **quién**, no solo qué.

### 2.3 Operaciones masivas no rastreables — **corregido**

`updateMany`/`deleteMany` no devuelven `id`, así que toda operación masiva se
auditaba con `entityId: 0` y sin ninguna pista de qué filas se tocaron. Ahora
`buildAuditChanges()` guarda también el filtro aplicado y el número de filas
afectadas, con la misma redacción de secretos que el resto del payload.

### 2.4 Aserción no nula en descuento de stock — **endurecido**

`decrementStockLevel` hacía `level!.id` tras comprobar `available < quantity`.
**No era un fallo alcanzable**: el llamador rechaza `quantity <= 0` en
`warehouse.service.ts:208`, así que con `level` nulo siempre se lanzaba antes.
Aun así, la seguridad dependía de una validación situada 100 líneas más arriba;
se sustituyó por una comprobación explícita de `level` para que no se rompa si
aparece un segundo llamador.

### 2.5 Fin de línea corruptos en `tenant.interceptor.ts`

El fichero estaba **commiteado** con `CR CR LF` (doble retorno de carro), lo que
rompe herramientas de edición y ensucia los diffs. Es el único fichero del repo
afectado. Normalizado a LF, que es lo que git espera con `core.autocrlf=true`.
Por eso ese fichero aparece completo en el diff.

### 2.6 Tests añadidos en esta fase

`buildAuditChanges` cubierto con 5 casos: payload de fila única, redacción de
secretos, filtro y conteo en operaciones masivas, redacción dentro del filtro, y
tolerancia a un `count` ausente.

---

## Fase 3 — Ejecutada (P2 · Rendimiento)

### 3.1 Un `INSERT` de auditoría por cada escritura — **corregido**

El middleware emitía `auditLog.create()` por cada operación de escritura,
duplicando el volumen de escritura del ERP. Ahora las entradas pasan por
`AuditBuffer` (`apps/api/src/prisma/audit-buffer.ts`), que agrupa en
`createMany` por intervalo (1 s) o por tamaño (200 entradas), configurables vía
`AUDIT_FLUSH_INTERVAL_MS` y `AUDIT_FLUSH_MAX_BUFFER`.

Decisiones de diseño, porque hay un compromiso real:

- **Se vuelca al apagar** (`onModuleDestroy`, antes de `$disconnect`), y el
  temporizador lleva `unref()` para no mantener vivo el proceso.
- **Tope duro de memoria** (20× el tamaño de lote): ante una tormenta de
  escrituras se descartan las entradas más antiguas y se avisa por log, en vez
  de crecer sin límite.
- **Sigue siendo best-effort**, igual que antes: un fallo al volcar no tumba la
  petición que lo originó, pero ahora **queda registrado** en vez de tragarse en
  un `.catch(() => {})` vacío.

La ventana de pérdida ante una caída dura del proceso es de como mucho un
intervalo de volcado. Si la auditoría necesitara garantía transaccional, habría
que escribirla en la misma transacción que la operación auditada — un cambio
mayor que no se ha hecho.

### 3.2 El volcado de auditoría se difundía por socket — **corregido**

Cada escritura en `AuditLog` disparaba un `entity:updated` a todos los clientes.
Ningún componente del front escucha ese modelo (se verificó uno a uno), así que
era ruido puro que además se realimentaba con el propio middleware. Se excluye
`AuditLog` de la difusión. Cuidado al tocar esto: `LocationTracking` **sí** se
escucha, así que no vale con excluir todos los modelos de `AUDIT_EXCLUDED`.

### 3.3 `ipAddress` / `userAgent` en auditoría — **corregido**

Completa lo empezado en 2.2: el contexto de tenant transporta ahora también IP y
user-agent, recortados a la longitud de columna (45 / 500) para que una cabecera
larga no tumbe el `INSERT`.

### 3.4 Directorio completo cargado en cada resolución de alcance de chat — **corregido**

`listDescendantIds` hacía `user.findMany({ where: { isActive: true } })` en cada
llamada. Y esto **no era solo rendimiento**: `User` no tiene columna `companyId`
—la pertenencia va por `UserCompany`— y por eso tampoco entra en el middleware
de tenant. La consulta cargaba el directorio de **todas las empresas**, y un
`managerId` que cruzara empresas habría arrastrado subordinados ajenos al
alcance del chat. Ahora se acota por `companyMemberships.some.companyId`, con la
empresa propagada desde los 4 puntos de llamada.

### 3.5 Tests añadidos

7 casos para `AuditBuffer`: umbral de tamaño, volcado por intervalo, no-op en
vacío, descarte por tope duro, fallo de volcado sin propagar excepción, y —el
más importante— que **no se pierdan entradas añadidas mientras un volcado está
en vuelo**.

---

## Fase 4 — Ejecutada (P3 · Deuda técnica)

### 4.1 Diseño de la migración a cookie `HttpOnly` — **entregado, sin implementar**

En [DISENO-COOKIE-HTTPONLY.md](./DISENO-COOKIE-HTTPONLY.md). Requiere tu visto
bueno: toca el camino de login de producción.

Lo que la medición de la superficie reveló, y que decide el diseño:

- **300 cabeceras `Authorization` en 152 ficheros** del web.
- El cliente decodifica el JWT en **un solo sitio** (`UserContext.tsx:106`) y
  **solo para comprobar caducidad** — los permisos vienen de `nexara_user`, no
  del token. Esto es lo que hace la migración viable.
- La **app nativa Android no tiene cookie jar**: la cabecera debe seguir
  funcionando.
- El middleware de Next ya usa `nx_session=1`, no el token: **no se toca**.

La idea central es que la API acepte la cookie **además** de la cabecera, con la
cabecera teniendo precedencia. Así los 300 puntos de llamada no hay que tocarlos
para que la migración funcione, y el cambio deja de ser big-bang.

### 4.2 Aritmética de cotizaciones extraída y cubierta — **hecho**

Era la lógica que decide cuánto se factura al cliente y **no tenía ni un test**.
Extraída a `cotizacion-totals.ts` (el servicio delega, sin cambio de
comportamiento) y cubierta con 17 casos: orden de aplicación descuento →
impuestos → retención, acotado de porcentajes a [0, 100] frente a payloads
manipulados, cantidad mínima 1, importes no numéricos que antes podían producir
`NaN`, y descuento del 100 % sin totales negativos.

### 4.3 Hallazgo abierto: la mano de obra no se factura

`laborHours` × `laborRate` se **imprime en el PDF** de la cotización como línea
informativa (`cotizacion-pdf.ts:286`, "MO: Xh x $Y") pero **no entra en ningún
total**.

**No lo he cambiado**: si la mano de obra va incluida en el `unitPrice`, el
comportamiento es correcto; si debe cobrarse aparte, es una fuga de ingresos en
cada cotización con mano de obra. Tocar la aritmética de facturación sin conocer
la regla de negocio podría empezar a cobrar de más a tus clientes.

El comportamiento vigente queda fijado en un test explícito, de modo que si algún
día se decide facturarla, el test falle y obligue a una decisión consciente.

---

## Fase 5 — Ejecutada (migración `HttpOnly`)

Implementada por completo; detalle en [DISENO-COOKIE-HTTPONLY.md](./DISENO-COOKIE-HTTPONLY.md).
**Compila y la suite pasa, pero no se ha probado contra un entorno levantado.**
Toca el camino de login: no desplegar sin la lista de comprobación de ese
documento.

### 5.1 Corrección al diagnóstico — y un fallo de la Fase 1 que esto repara

Al implementar se descubrió que en el navegador el JWT **no vivía en una cookie**
sino en `sessionStorage`; la cookie `nexara_token` solo se escribía en la app
nativa (guard `isCapacitorNative()`).

La conclusión de seguridad no cambia —`sessionStorage` es igual de legible por
XSS— pero sí la implementación: había que dejar de persistir el JWT allí.

Y tiene una consecuencia directa: **la protección de `/uploads` de la Fase 1
tenía un fallo latente**. Aceptaba el token desde la cookie `nexara_token`
asumiendo que el navegador la tenía, y no la tenía. Tal cual, cada
`<img src="/uploads/...">` privado habría dado 401: avatares, evidencias y
adjuntos rotos. Al emitir ahora el servidor la cookie para todos los clientes,
esa vía funciona. **La Fase 1 no debe desplegarse sin la Fase 5.**

### 5.2 Cómo se evitó tocar 300 ficheros

`readBearerToken` descarta cualquier `Bearer` que no tenga forma de JWT. Los ~300
puntos que construyen la cabecera siguen ahí, enviando un marcador que la API
ignora para caer a la cookie. Sin ese filtro, un `Bearer undefined` habría
abortado la autenticación en vez de continuar.

### 5.3 Cierre de sesión

Con la cookie en `HttpOnly` el cliente ya no puede borrarla: se añadieron
`POST /auth/logout` y `POST /portal/logout`. Sin ellos los usuarios no habrían
podido cerrar sesión.

---

## Fase 6 — Ejecutada (conexión entre módulos)

Auditoría completa en [CONEXION-MODULOS.md](./CONEXION-MODULOS.md).

### 6.1 El estado de actividad estaba partido en dos — **corregido**

`Activity.estatus` es texto libre y el código usaba dos grafías del mismo estado.
La única ruta real de cierre escribe `Finalizada`; **once puntos de lectura**
filtraban por `Finalizado`, valor que ninguna actividad de campo lleva nunca.

Consecuencias reales, no teóricas:

- Los **KPIs de dirección leían cero** tickets completados.
- El **SLA contaba como abiertas** actividades ya cerradas, inflando
  incumplimientos y alertando sobre trabajo terminado.
- El **buscador marcaba como vencidas** actividades cerradas.

Corregido con `activities/activity-status.ts`: vocabulario canónico y filtros
tolerantes a alias, de modo que los datos históricos se leen bien **sin migrar
nada**. 14 tests.

### 6.2 El motor de workflows está desconectado

`WorkflowDefinition` / `Instance` / `Approval` existen con servicio y controlador,
pero **ningún módulo de la API los invoca**. El motor de aprobaciones está
construido y sin enchufar a los eventos que deberían dispararlo. Es la pieza
sobre la que apoyar los disparos en cadena, en vez de crear un mecanismo nuevo.

### 6.3 Huecos de modelo confirmados

Sin soporte en el esquema: varias personas por actividad, historial de
reasignación, dependencias entre actividades, y enlace actividad → factura
(`Invoice` no tiene `activityId`). Diseño propuesto para cada uno en el documento
de conexión; requieren migración y decisiones de negocio previas.

---

## Fase 7 — Ejecutada (barrido transversal de los 85 módulos)

Detalle en [CONEXION-MODULOS.md](./CONEXION-MODULOS.md), sección 3.bis.

### 7.1 Los portales externos alcanzaban módulos internos — **corregido**

`AuthGuard('jwt')` acepta cualquier token firmado, y los portales de cliente y
sucursal usan el mismo secreto. Cuatro controladores estaban protegidos **solo**
con `AuthGuard`: `hero-slides`, `hero-video`, `social-posts` (contenido del sitio
público) e `internal-comunicados` (comunicados internos).

Un usuario del portal de un cliente podía modificar el carrusel de la web pública
y leer o borrar comunicados internos. Corregido con `StaffOnlyGuard`. 6 tests.

### 7.2 Las multas se pagaban en dos idiomas — **corregido**

RRHH escribía `"Pagado"`; la tabla de multas, `"Pagada"`. Una multa pagada desde
un panel seguía apareciendo pendiente en el otro y el KPI contaba la mitad.
Vocabulario canónico con normalización en la escritura. 11 tests.

### 7.3 Lo que el barrido confirmó que está bien

Vale la pena decirlo: **aislamiento multi-tenant impecable** (106 de 109 modelos
auto-acotados, y las 3 excepciones son correctas), **precisión monetaria
correcta** (89 de 92 campos en `Decimal`) y **concurrencia de inventario
correcta**. No había nada que arreglar ahí.

---

## Fase 8 — Ejecutada (costuras del cierre de actividad)

`ActivityLifecycleService` cuelga del único punto donde una actividad pasa a
finalizada y cierra tres costuras que **ya tenían la clave foránea puesta pero
nadie sincronizaba**. Detalle en [CONEXION-MODULOS.md](./CONEXION-MODULOS.md) §2.bis.

- **La visita de contrato nunca se cerraba.** Quedaba en `GENERATED` con
  `completedAt` nulo aunque el técnico la hubiera hecho y firmado la hoja.
  Analítica, KPIs de dirección y alertas contaban como pendientes visitas ya
  realizadas. Ahora pasa a `COMPLETED`.
- **La solicitud del portal de cliente quedaba abierta para siempre.** Ahora se
  cierra al terminar el servicio.
- **El motor de aprobaciones queda enchufado.** Si la empresa define un flujo
  activo para `ACTIVITY_CLOSURE`, el cierre abre la instancia. Sin definición no
  pasa nada — es el caso normal. Ésta es la base para los disparos en cadena
  (reporte extra, facturación) sin montar un mecanismo paralelo.

Propagar es best-effort: la actividad ya se cerró en campo, así que un fallo al
sincronizar no revierte el cierre. 10 tests.

---

## Fase 9 — Ejecutada (verificación en producción y observabilidad)

### 9.1 Verificación con usuarios reales

Se probaron **241 rutas GET con los 8 roles** (1928 peticiones): **ningún 5xx en
ningún módulo**.

> Aviso metodológico: el primer intento de matriz por rol **fue invalidado y
> descartado**. Las propias pruebas dispararon el rate limiter y los 429 se
> contaban como "denegado". Se repitió con ritmo controlado (0 rate-limited).
> El limitador funciona; la medición inicial no.

Resultado con datos limpios: el mínimo privilegio funciona —nómina, roles,
auditoría, CVs y multas solo CEO— con dos huecos:

- `hero-slides`, `social-posts` e `internal-comunicados` responden **200 a los 8
  roles**: un técnico de campo puede modificar el sitio público y los
  comunicados internos.
- `coord_operaciones` no alcanza vehículos, viáticos ni gastos, lo que para un
  coordinador de operaciones parece un olvido de la matriz.

### 9.2 Fuga del esquema en errores — **corregido**

`/api/warehouse/abc` casaba con `/api/warehouse/:id`, el `NaN` llegaba a Prisma y
el filtro global **devolvía al cliente el mensaje interno**: tabla, columnas y
tipos. Son 87 los puntos que convierten parámetros sin validar, así que se
resolvió en el filtro: errores de Prisma traducidos a 400/404/409 y mensaje
genérico para lo no controlado; el detalle queda en el log.

### 9.3 Camino *fail-open* en los roles — **corregido**

`RbacGuard` solo consultaba la matriz si podía resolver el rol. Si no —un rol con
clave desconocida— se la saltaba entera. Los 8 roles reales resuelven bien, así
que era latente. Ahora falla cerrado, y **todo rol nace de una plantilla** que
aporta el `orgRoleKey` que la matriz necesita. El borrado comprueba usuarios
asignados.

Incluye un test que verifica que **toda plantilla publicada tenga puente a la
matriz v2** (`LEGACY_TO_V2`): si alguien añade una plantilla sin mapear, el rol
nacería sin permisos y el test lo detecta.

### 9.4 Fallos silenciosos — **corregidos los dos que importan**

Barrido: 136 puntos con `.catch` sin log ni comentario.

- **`autoJournalForStampedInvoice`** se ejecutaba con `.catch(() => undefined)`.
  Si fallaba, la factura quedaba **timbrada ante el SAT sin póliza contable** y
  los libros descuadraban sin que nadie lo supiera. Ahora deja registro con
  folio, UUID, total y empresa para rehacer el asiento. No se revierte el
  timbrado: ya ocurrió.
- **Los tableros usaban `.catch(() => 0)`**, así que un KPI roto se veía igual
  que uno sin datos. Es exactamente por eso que dirección estuvo contando cero
  tickets completados sin que nada lo delatara. `kpiFallback` conserva la
  resiliencia pero deja advertencia: 38 indicadores instrumentados.

### 9.5 Tareas programadas sin atribución — **corregido**

Más de veinte `@Cron` y, si el cuerpo lanza, `@nestjs/schedule` no lo captura:
acaba como `unhandledRejection` anónimo. `runScheduledJob` registra el fallo con
el nombre de la tarea y su duración, sin propagarlo. Aplicado primero a
`ticket-alerts`, que corre **cada minuto sin ninguna captura**.

---

## Fase 10 — Pendiente

1. **Verificar la Fase 5 contra un entorno levantado** (lista en el diseño).
2. **Confirmar la regla de negocio de la mano de obra** (4.3).
3. **Decidir las reglas de 3.1 y 3.2** de [CONEXION-MODULOS.md](./CONEXION-MODULOS.md)
   antes de generar la migración.
4. **Decidir qué roles gestionan contenido y comunicados** (3.bis.1) para poder
   añadir esas rutas a la matriz RBAC y cerrar el reparto fino por rol.
3. **Cobertura de tests del resto del negocio.** 39 suites para 456 ficheros.
   Cubiertos: aislamiento de tenants (~30 suites), auditoría y aritmética de
   cotizaciones. Sin cubrir: movimientos de inventario y costeo WAC, nómina, y
   contabilidad. El inventario tiene la lógica correcta de concurrencia
   (decremento atómico con guarda `quantity: { gte: quantity }`) pero vive dentro
   de transacciones de Prisma, así que cubrirlo pide tests de integración con
   base de datos, no unitarios.
4. **Sin índice en `User.managerId`.** El árbol de jerarquía se resuelve en
   memoria porque no hay índice que soporte un recorrido por niveles. Añadirlo
   requiere migración de base de datos, que no se ha generado aquí.
5. **`build:lowmem` desactiva la comprobación de tipos** (`NEXT_IGNORE_TYPE_ERRORS=1`).
   Hoy no se usa en el despliegue, así que es una vía de escape manual; si algún
   día entra en el pipeline, los errores de tipo pasarían silenciosamente.

### Riesgos latentes (no son defectos hoy)

- **Rate limiting y baneo de IP en memoria.** Correctos ahora: un único contenedor
  de API, sin réplicas, `ENABLE_CLUSTER_MODE` sin activar en ningún sitio. En
  cuanto se escale a varios procesos o contenedores, cada uno tendrá sus propios
  contadores y el límite efectivo se multiplicará. Ya hay Redis en el
  `docker-compose` para respaldarlo cuando toque.

---

## Verificación

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd apps/web && npx tsc --noEmit -p tsconfig.json
cd apps/api && npx jest --config jest.config.js --runInBand
```

Resultado tras la Fase 9: **0 errores de tipos** en ambas apps y **226 tests en
verde de 226, en las 48 suites**.

Aviso: la Fase 5 toca el camino de login y **no se ha probado contra un entorno
levantado**. Ver la lista de comprobación de
[DISENO-COOKIE-HTTPONLY.md](./DISENO-COOKIE-HTTPONLY.md) antes de desplegar.

### Comprobación manual recomendada antes de desplegar

1. Abrir una URL de `/uploads` privada (por ejemplo un CV) en ventana anónima →
   debe responder 401.
2. Abrir una imagen de `hero`/`news` en ventana anónima → debe seguir cargando.
3. Con sesión iniciada, comprobar que avatares, evidencias y adjuntos siguen
   viéndose en los paneles (validación de la vía por cookie).
4. Confirmar que el chat de workspace y las notificaciones en vivo siguen
   funcionando tras la migración de sockets.
