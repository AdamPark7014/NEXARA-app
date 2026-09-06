# 03 — El 502 del dashboard en la app móvil Android

Auditoría de solo lectura. Rama `mejora/calidad-y-web`, árbol limpio en `bd6143ce`.
Ningún archivo fuente fue modificado.

Síntoma reportado por Adam:

> «en la app movil ni se diga, entré y decía en david por ejemplo, error 502 y así
> no entraba ni a su dashboard»

Resumen de una línea: **no hay un endpoint roto**. El dashboard pide dos rutas que
sí existen; el 502 lo emite Traefik cuando el proceso de la API no está
escuchando, y la app lo pinta crudo porque el ViewModel imprime `e.message` en vez
de traducir el código HTTP. Las dos cosas son defectos distintos y se arreglan por
separado.

---

## 1. La traza completa de la petición

### 1.1 Cliente Android

Base URL, fija en tiempo de compilación:

- `apps/mobile-native/android/app/build.gradle.kts:29` →
  `API_BASE_URL = "https://api.nexara.com.mx/api"`
- `.../data/api/ApiClient.kt:52` → `baseUrl(API_BASE_URL + "/")`
- Timeouts OkHttp: `ApiClient.kt:26-28` → connect 18 s, **read 22 s**, write 22 s.

Pantalla → ViewModel → Repositorio → API:

| Paso | Archivo:línea | Qué hace |
|---|---|---|
| Pantalla | `ui/console/screens/ConsoleDashboardScreen.kt:158` | `ConsoleDashboardScreen(...)` |
| Disparo | `ConsoleDashboardScreen.kt:177-179` | llama `vm.refresh()` |
| ViewModel | `ConsoleDashboardScreen.kt:112-138` | `refresh()` — 5 llamadas en serie |
| Repositorio | `data/console/ConsoleRepository.kt:307` | `viaticsFetch() = api.getViatics()` |
| Repositorio | `data/console/ConsoleRepository.kt:21` | `activitiesFetch() = api.getActivities(scope)` |
| Retrofit | `data/api/ConsoleApi.kt:282-283` | `@GET("viatics")` |
| Retrofit | `data/api/ConsoleApi.kt:301-304` | `@GET("activities")` con `@Query("scope")` |

`refresh()` lanza **cinco** peticiones, y solo tres están protegidas:

```kotlin
// ConsoleDashboardScreen.kt:118-122
val viatics    = withContext(Dispatchers.IO) { repo.viaticsFetch() }                       // ← SIN runCatching
val activities = withContext(Dispatchers.IO) { repo.activitiesFetch() }                    // ← SIN runCatching
val attendance = withContext(Dispatchers.IO) { runCatching { repo.attendanceRange(from,to) }.getOrNull() }
val executive  = withContext(Dispatchers.IO) { runCatching { extraRepo.executiveCLevelDto() }.getOrElse { ExecutiveCLevelDto() } }
val approvals  = withContext(Dispatchers.IO) { runCatching { extraRepo.workflowApprovals() }.getOrElse { emptyList() } }
```

URLs exactas que salen del teléfono, en este orden:

```
GET https://api.nexara.com.mx/api/viatics
GET https://api.nexara.com.mx/api/activities
GET https://api.nexara.com.mx/api/attendance/hierarchy/range?from=…&to=…   (fallback: /api/attendance/range)
GET https://api.nexara.com.mx/api/executive/c-level
GET https://api.nexara.com.mx/api/workflow/my-pending
```

Todas con `Authorization: Bearer <jwt>` (`ApiClient.kt:35-37`).

**Cualquier fallo en las dos primeras aborta el dashboard entero.** Las otras tres
degradan a vacío sin ruido.

### 1.2 Servidor NestJS

Prefijo global: `apps/api/src/main.ts:528-530` → `app.setGlobalPrefix('api', { exclude: ['/uploads', '/uploads/(.*)'] })`.
Puerto 3001 (`main.ts:533`).

Las rutas **existen y coinciden**. No hay desajuste de prefijo, versión ni
camelCase. Descartado el 404 disfrazado:

| URL cliente | Controller | Servicio | Consultas |
|---|---|---|---|
| `GET /api/viatics` | `src/viaticos/viaticos.controller.ts:31,38-43` `findAll()` | `viaticos.service.ts:315-350` | 1 `findMany` **sin `take`** + 4 `include` |
| `GET /api/activities` | `src/activities/activities.controller.ts:195-218` `findAll()` | ver §1.3 | depende del **rol** |
| `GET /api/executive/c-level` | `src/executive/executive.controller.ts:13-17` | `executive.service.ts:22-71` | **27 queries en un `Promise.all`** |
| `GET /api/workflow/my-pending` | módulo workflow | — | ligera |
| `GET /api/attendance/...` | módulo attendance | — | media |

### 1.3 La rama que difiere por rol — y david está en el lado caro

`activities.controller.ts:195-218`:

```ts
if (scope === 'mine')                    return findByResponsible(user.id, companyId);
if (user.isSuperAdmin)                   return findAll(query, companyId);         // sin límite
else if (this.hasTeamActivitiesScope(u)) {                                          // ← david cae aquí
  const scopeUsers = await this.usersService.findUsersForConsoleActivityScope();
  return findByAllowedUsers(scopeUsers.map(u => u.id), companyId);
} else                                   return findByResponsible(user.id, companyId); // barato
```

Quién entra en la rama cara — `activities.controller.ts:294-309`:

```ts
V2_OPS_MANAGER_ROLES = { 'ceo','dir_admin','dir_operaciones','arquitecto',
                         'coord_operaciones','coord_admin' }
hasTeamActivitiesScope = isOpsManager(user) || roleKey === 'ing_soporte'
```

**David Morales Zenón — `prisma/seed-demo-users.ts:109-117` — tiene
`roleKey: 'coord_operaciones'`, departamento Operaciones, NX-302.** Está en el
conjunto. No es un usuario de campo: es un coordinador, y por eso toma la rama de
alcance de equipo, no la barata.

Sus permisos se conceden en `src/auth/auth.service.ts:511-540`: `CONSOLE_ACCESS`,
`ACTIVITIES_VIEW`, `VIATICS_VIEW`, `VIATICS_MANAGE`. **Pasa el RBAC de las dos
rutas críticas** — no es un 403 disfrazado.

Lo que ejecuta la rama de equipo:

1. `src/users/users.service.ts:903-910` — `findUsersForConsoleActivityScope()`:
   `findMany` sobre **todos** los usuarios salvo los superadmin, **sin filtro de
   `companyId`**. Devuelve N ids.
2. `src/activities/activities.service.ts:240-262` — `findByAllowedUsers()`:
   `findMany` con `responsableId: { in: [N ids] }`, **sin `take`, sin `orderBy`**, y
   con `include: { creador, responsable, client, serviceSheet, activityEvidence: { include: { reviewedBy } } }`.

Es decir: para david, `GET /api/activities` es una consulta sin cota superior con
cinco relaciones anidadas, una de ellas una colección (`activityEvidence`). Un
ingeniero de campo (`ing_campo`, p. ej. NX-401) ejecuta en cambio
`findByResponsible(user.id)` — acotada a sus propias OT. **Esa es la rama de
código que difiere por rol.**

Lo mismo en viáticos: `viaticos.service.ts:58-83` `buildListWhere()` — david tiene
`VIATICS_MANAGE`, así que entra en la rama de departamento (línea 63-81) en vez de
`usuarioId: currentUser.id` (línea 82). Más filas, y en `findAll` (línea 344-348)
**sin `take`** porque el móvil no manda `limit`.

Detalle menor pero real: `GET /api/executive/c-level` exige `CONSOLE_ADMIN`,
`SALES_REPORTS_VIEW` o `CONTABILIDAD_VIEW` (`executive.controller.ts:14`). David no
tiene ninguno. **Cada carga del dashboard de david dispara una petición que está
garantizada a devolver 403.** No rompe nada (va en `runCatching`), pero es una
llamada inútil por refresco.

---

## 2. Por qué es 502 y no 500 — el mecanismo

Un 502 es Traefik diciendo «el upstream no me contestó bien». Verificado que **una
excepción dentro de la petición NO produce 502**: hay un filtro global
(`src/app.module.ts:198` → `src/common/errors/all-exception.filter.ts:11-12`,
`@Catch()`) que convierte cualquier excepción en una respuesta HTTP con estado. Eso
sale como 500, no como 502.

Para que el móvil vea 502 **en menos de 22 s** (el `readTimeout` de OkHttp,
`ApiClient.kt:27`), Traefik tiene que contestar sin esperar a la API. Eso solo pasa
si el proceso no está escuchando o si cerró la conexión de golpe.

Y no hay nada que impida a Traefik enrutar hacia una API muerta:

- `deploy/traefik/nexara.yml:305-308` — el servicio `nexara-api` apunta a
  `http://nexara-api:3001` **sin bloque `healthCheck:` y sin middleware `retry`**.
- `deploy/docker-compose.nexara.yml:30-34` — el servicio `api` **no tiene
  `healthcheck:`** (el compose de desarrollo sí lo tiene para `db` y `redis`; el de
  producción no lo tiene para la API).
- `deploy/docker/Dockerfile.api:45` — **no hay `HEALTHCHECK`**.
- Existe `/api/health/ready` (`src/health/health.controller.ts:44-50`) y **nadie lo
  consume**.

Traduciendo: en cuanto el contenedor `nexara-api` deja de aceptar en el 3001,
**todos** los usuarios reciben 502 instantáneo. No es específico de david — a david
le tocó.

---

## 3. Causas raíz candidatas, por probabilidad

### A. (Alta) El proceso de la API no estaba escuchando — ventana de arranque o crash-loop

Evidencia:

1. **`deploy/docker/Dockerfile.api:45`**
   ```
   CMD ["sh","-c","cd /app/apps/api && npx prisma migrate deploy && node /app/apps/api/dist/main.js"]
   ```
   Cada arranque ejecuta `prisma migrate deploy` **antes** de escuchar. Durante ese
   tiempo el 3001 está cerrado.
2. **`deploy/docker-compose.nexara.yml:36-40`** — `depends_on: [db, redis, go2rtc]`
   **sin `condition: service_healthy`** (compárese con `docker-compose.yml:63-68`,
   el de desarrollo, que sí lo usa). Si Postgres aún no acepta conexiones, el
   `migrate deploy` falla, el `CMD` sale con código distinto de cero, y con
   `restart: unless-stopped` entra en **crash-loop**: 502 sostenido.
3. **88 módulos** en `src/app.module.ts`. El arranque de Nest no es instantáneo.
4. **`deploy/update.sh:161-163`** — `docker compose up -d --no-build api web`
   recrea el contenedor **sin drenado ni compuerta de readiness**. Cada despliegue
   es una ventana de 502 de decenas de segundos.
5. **`src/main.ts:581-584`**
   ```ts
   process.on('uncaughtException', (error) => {
     console.error('[process] uncaughtException:', error);
     gracefulShutdown('uncaughtException');   // ← tumba TODO el proceso
   });
   ```
   Y `main.ts:589-591`: `ENABLE_CLUSTER_MODE` no está definido en
   `docker-compose.nexara.yml`, así que **corre un solo proceso, sin cluster**. Una
   excepción no capturada en cualquier rincón (un `res.json()` que revienta al
   serializar, un timer, un callback de socket) apaga la API entera. Con
   `SHUTDOWN_GRACE_MS = 15_000` (`main.ts:551`) más el arranque, cada incidente son
   30-60 s de 502 para todos.

**Experimento que la confirma** (ejecutar en el droplet, o desde fuera para el
primer comando):

```bash
# 1. ¿El 502 viene de Traefik sin llegar a la API? Debe responder en <100 ms.
curl -s -o /dev/null -w 'code=%{http_code} tiempo=%{time_total}s\n' \
  https://api.nexara.com.mx/api/health/live
# Si code=502 con tiempo<0,2 s → la API no está escuchando. Causa A confirmada.
# Si code=200 → la API está viva ahora; sigue con el paso 3.

# 2. Historial de reinicios y motivo de la última muerte.
docker inspect -f 'Restarts={{.RestartCount}} Estado={{.State.Status}} Salida={{.State.ExitCode}} OOM={{.State.OOMKilled}} Arrancó={{.State.StartedAt}}' nexara-api

# 3. ¿Se está muriendo por excepción o por memoria?
docker logs nexara-api --since 48h 2>&1 | grep -nE 'uncaughtException|shutdown\] signal|heap out of memory|Invalid string length|FATAL ERROR'
```

`Restarts` alto, o `OOMKilled=true`, o líneas `[shutdown] signal received:
uncaughtException`, cierran el caso.

### B. (Alta) La API murió por memoria sirviendo precisamente la ruta de david

Es el caso particular de A con culpable identificado. `NODE_OPTIONS:
--max-old-space-size=2048` (`deploy/docker-compose.nexara.yml:44`). Contra ese techo:

- `activities.service.ts:243-261` — `findMany` **sin `take`** con cinco `include`,
  uno de ellos una colección de evidencias.
- `viaticos.service.ts:344-348` — `findMany` **sin `take`** con cuatro `include`.
- La serialización a JSON duplica el pico: si el `JSON.stringify` supera el máximo
  de string de V8 lanza `RangeError: Invalid string length` **dentro de
  `res.json()`**, fuera del alcance del filtro de excepciones de Nest → cae en el
  `uncaughtException` de `main.ts:581` → apaga la API → 502 para todos.

**Experimento — medir antes de tocar nada.** Cuánto pesa realmente la respuesta de
david, con su propio token:

```bash
TOKEN='<jwt de operaciones@nexara.com.mx>'
for r in viatics activities; do
  curl -s -o /tmp/$r.json -w "$r → code=%{http_code} bytes=%{size_download} tiempo=%{time_total}s\n" \
    -H "Authorization: Bearer $TOKEN" "https://api.nexara.com.mx/api/$r"
done
# Comparar con un ing_campo (ivan.tapia@nexara.com.mx) para ver el salto por rol.
```

Y el conteo de filas del lado servidor:

```sql
-- Cuántas OT arrastra la rama de equipo (todos los no-superadmin)
SELECT count(*) AS ot, count(DISTINCT "responsableId") AS responsables
FROM "Activity"
WHERE "responsableId" IN (SELECT id FROM "User" WHERE email NOT IN (/* superAdminEmails */));

-- Y el multiplicador real: las evidencias que el include trae anidadas
SELECT count(*) FROM "ActivityEvidence" ae
JOIN "Activity" a ON a.id = ae."activityId"
WHERE a."responsableId" IN (SELECT id FROM "User" WHERE email NOT IN (/* superAdminEmails */));
```

Si la suma de filas × evidencias da megabytes, B queda confirmada.

### C. (Media) El socket se destruye a los 30 s, y el 408 amable es código muerto

```
main.ts:145  APP_REQUEST_TIMEOUT_MS  = 120_000   → responde 408 con JSON limpio
main.ts:536  HTTP_REQUEST_TIMEOUT_MS =  30_000
main.ts:541  server.setTimeout(requestTimeoutMs)
```

El timeout de socket (30 s) es **cuatro veces más corto** que el de aplicación
(120 s). Node, sin listener `'timeout'` en el servidor, **destruye el socket** al
cumplirse. Traefik ve la conexión abortada sin respuesta → **502**. El handler de
408 de `main.ts:156-168` nunca puede llegar a ejecutarse: es inalcanzable por
construcción.

Matiz honesto: para el móvil, el `readTimeout` de OkHttp son 22 s
(`ApiClient.kt:27`), así que en una petición lenta el teléfono se rinde antes y ve
un `SocketTimeoutException`, no un 502. **Esta causa explica los 502 de la consola
web, no tanto los del móvil.** Aun así es un bug de configuración real y hay que
arreglarlo.

**Experimento**: `curl -w '%{http_code} %{time_total}\n'` contra un endpoint pesado
con el token de un superadmin. Si corta exactamente a ~30 s con 502, confirmada.

### D. (Media-baja) Agotamiento del pool de conexiones de Prisma

`src/executive/executive.service.ts:22-71` lanza **27 consultas en un solo
`Promise.all`** (el `Promise.all` gigante que había que buscar). El pool por
defecto de Prisma es `núcleos × 2 + 1` — típicamente 9-17. Una sola carga de
dashboard de un admin lo satura; `pool_timeout` por defecto son 10 s y devuelve
`P2024`. Con varios usuarios a la vez, las consultas sin cota de A/B retienen
conexiones y **todas** las rutas empiezan a fallar. No produce 502 por sí sola
(sale 500), pero alimenta C y B.

**Experimento**: `docker logs nexara-api --since 48h | grep -c P2024`.

### E. (Baja) Amplificación de peticiones desde el propio cliente

`ConsoleDashboardScreen.kt:177-179`:

```kotlin
if (state.activities.isEmpty() && state.isLoading && state.error == null) {
    vm.refresh()
}
```

Esto llama `refresh()` **desde el cuerpo del composable**, no desde un
`LaunchedEffect`. Es un efecto secundario en composición. No es un bucle infinito
—`MutableStateFlow` colapsa emisiones iguales— pero sí dispara la tanda completa de
5 peticiones **dos a cuatro veces** por entrada a la pantalla: la primera
composición, la emisión que cambia `weekFrom`/`weekTo` (línea 114), y cada
recomposición provocada por `nocAlerts` (líneas 168-174) mientras sigue cargando.
Multiplica por 2-4 la carga de las consultas sin cota. Es un bug real
independientemente del 502.

### F. Descartadas, con motivo

- **Ruta inexistente / prefijo mal puesto** — descartada. `setGlobalPrefix('api')`
  en `main.ts:528` y los controllers `@Controller('viatics')`
  (`viaticos.controller.ts:31`) y `@Controller('activities')` casan exactamente con
  lo que pide Retrofit.
- **403 por módulo no habilitado para el rol** — descartada para las dos rutas
  críticas: `auth.service.ts:511-540` concede a `coord_operaciones` tanto
  `ACTIVITIES_VIEW` como `VIATICS_VIEW`/`VIATICS_MANAGE`. (Sí aplica a
  `/api/executive/c-level`, que degrada en silencio.)
- **Payload de subida o cabecera excesiva** — descartada en la dirección
  entrante: son peticiones `GET` sin cuerpo, y `main.ts:76-84` admite 10 MB. El
  problema de tamaño está en la **respuesta**, que es la causa B.
- **`infra/proxy/docker-compose.yml`** define únicamente el entrypoint `web` (:80),
  mientras `deploy/traefik/nexara.yml` enruta todo por `websecure`. Ese fichero
  está obsoleto — `deploy/docker-compose.nexara.yml:3-4` dice que Traefik lo
  gestiona `traefik-main` aparte. No es la causa, pero es una trampa para el
  siguiente que lo lea.
- **`apps/api/logs/`** — `combined.log` y `error.log` son de desarrollo, del 14 de
  julio, y no contienen `uncaughtException`, `502`, `heap` ni `ECONNREFUSED`. No
  aportan nada a este incidente; los logs vivos están en `docker logs nexara-api`.

---

## 4. El defecto de degradación — lo que david NO debería haber visto

Tres fallos encadenados, todos del cliente, todos independientes de la causa del
502. Aunque el servidor se arregle mañana, esto vuelve a pasar al primer hipo de
red.

### 4.1 Se imprime el error crudo del protocolo

`ConsoleDashboardScreen.kt:134-137`:

```kotlin
} catch (e: Exception) {
    it.copy(isLoading = false,
            error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el dashboard")
}
```

Con Retrofit 2.11.0, `HttpException.message` es literalmente `"HTTP 502 Bad
Gateway"`. Eso es lo que Adam leyó en la pantalla.

Y lo irónico: **ya existe el traductor y nadie lo llama aquí**.
`data/api/ApiErrors.kt:74-85` define `Throwable.toUserMessage()`, que para `in
500..599` devuelve *«Error del servidor. Intenta más tarde.»* — exactamente el
mensaje correcto.

No es un caso aislado: **56 archivos bajo `ui/` usan `e.message` crudo, frente a
solo 6 que usan `toUserMessage()`.** Es el patrón por defecto de la app, no un
descuido puntual.

### 4.2 El error borra el dashboard entero

`ConsoleDashboardScreen.kt:217-222`:

```kotlin
if (!state.error.isNullOrBlank()) {
    item { NxErrorBlock(state.error!!, onRetry = { vm.refresh() }) }
    return@LazyColumn        // ← no se renderiza NADA más
}
```

Ese `return@LazyColumn` es el «no entraba ni a su dashboard» literal. La pantalla
queda con una única tarjeta roja (`ui/enterprise/EnterpriseComponents.kt:386-400`:
«No se pudo cargar» + el texto crudo + «Reintentar») y cero contenido. Y como
`viaticsFetch()` y `activitiesFetch()` no van en `runCatching` (líneas 118-119),
**un fallo en cualquiera de las dos vacía la pantalla completa**, aunque asistencia,
aprobaciones y ejecutivo hubieran respondido perfectamente.

### 4.3 La caché offline existe, tiene los datos, y no se usa en un 502

`data/offline/OfflineHttpInterceptor.kt:46-71` solo recurre a la caché en dos
supuestos: `NetworkMonitor.isOnline == false` (línea 27) o `IOException` (línea 53).
**Un 502 es una transacción HTTP exitosa**: hay red, hay respuesta, no hay
`IOException`. Así que el último dashboard bueno está en disco y la app no lo mira.

Bonus del mismo archivo, línea 49: `response.peekBody(512 * 1024)`. La caché guarda
como mucho 512 KB. La respuesta de `/api/activities` para un `coord_operaciones`
(§1.3) supera eso con facilidad, así que lo que se cachea es **JSON truncado, es
decir, inválido**, que reventará al parsearse en el siguiente uso offline.

### Lo que debería haber visto david

> **Sin conexión con el servidor.** Mostrando datos del martes a las 18:40.
> [Reintentar]

Es decir: los KPI de la última carga buena, atenuados, con una cinta de aviso
arriba y un botón de reintento. Nunca la cadena `HTTP 502 Bad Gateway`, y nunca una
pantalla vacía.

---

## 5. Arreglo propuesto, por causa

### Servidor

**A — que Traefik deje de enrutar hacia una API que no está lista** (es el arreglo
que borra el síntoma para todos los usuarios):

1. `deploy/traefik/nexara.yml:305-308` — añadir al servicio `nexara-api`:
   ```yaml
   healthCheck:
     path: /api/health/ready
     interval: 10s
     timeout: 3s
   ```
   y un middleware `retry` (`attempts: 2`) en el router `api-direct`.
2. `deploy/docker-compose.nexara.yml:30` — añadir `healthcheck:` al servicio `api`
   contra `/api/health/live`, y cambiar `depends_on` a
   `db: { condition: service_healthy }` (copiando lo que ya hace
   `docker-compose.yml:63-68`).
3. `deploy/docker/Dockerfile.api:45` — **sacar `prisma migrate deploy` del `CMD`**.
   Las migraciones ya se ejecutan aparte en `deploy/update.sh:165-170` con
   `run --rm`. Que estén en las dos partes es lo que convierte una base lenta en un
   crash-loop.
4. `src/main.ts:581-584` — no apagar el proceso entero ante cualquier
   `uncaughtException`. Registrar, y apagar solo si el error es irrecuperable. Si se
   mantiene el apagado, entonces `ENABLE_CLUSTER_MODE=true` en el compose para que
   queden workers vivos mientras uno se reinicia.

**B — poner cota a las consultas del dashboard** (elimina la causa de muerte):

5. `activities.service.ts:243-261` y `viaticos.service.ts:344-348` — imponer un
   `take` por defecto (p. ej. 200) aunque el cliente no mande `limit`, más
   `orderBy: { fechaAsignacion: 'desc' }` en `findByAllowedUsers`, que hoy no tiene
   orden ninguno.
6. `activities.service.ts:245-260` — quitar `activityEvidence` del `include` del
   listado. Un listado no necesita las evidencias anidadas; que se carguen en el
   detalle (`findOne`, línea 264).
7. `users.service.ts:903-910` — añadir el filtro por `companyId`. Hoy devuelve
   usuarios de **todas** las empresas: además del peso, es una fuga entre
   inquilinos.

**C — coherencia de timeouts:**

8. `main.ts:536` — subir `HTTP_REQUEST_TIMEOUT_MS` por encima de
   `APP_REQUEST_TIMEOUT_MS` (p. ej. 130 s), o bajar el de aplicación por debajo del
   de socket. Mientras el de socket sea el más corto, el 408 amable de
   `main.ts:156-168` es código muerto y el usuario recibe un 502 mudo.

**D — pool:**

9. `executive.service.ts:71` — trocear el `Promise.all` de 27 consultas en lotes de
   6-8, o cachear el resultado en Redis (ya está desplegado) con TTL de 60 s. Es un
   panel ejecutivo: no necesita ser exacto al segundo.

### Cliente Android

10. `ConsoleDashboardScreen.kt:136` — usar `e.toUserMessage("No se pudo cargar el
    dashboard")` en vez de `e.message`. El helper ya existe en `ApiErrors.kt:74`.
    Aplicar el mismo cambio a los otros 55 archivos de `ui/` con el mismo patrón.
11. `ConsoleDashboardScreen.kt:118-119` — envolver `viaticsFetch()` y
    `activitiesFetch()` en `runCatching`, y mostrar el error como una **cinta**
    sobre los datos que sí llegaron, en vez de vaciar la pantalla.
12. `ConsoleDashboardScreen.kt:220` — quitar el `return@LazyColumn`. El dashboard
    debe seguir dibujándose con lo que tenga.
13. `OfflineHttpInterceptor.kt:46-52` — recurrir a la caché también cuando
    `response.code in 500..599`, marcando la respuesta con el
    `X-Nexara-Offline: cache` que ya se usa, para que la UI pueda decir «datos del
    martes a las 18:40».
14. `OfflineHttpInterceptor.kt:49` — subir el tope de `peekBody`, o no cachear en
    absoluto cuando el cuerpo excede el límite. Guardar JSON truncado es peor que no
    guardar nada.
15. `ConsoleDashboardScreen.kt:177-179` — mover el disparo a
    `LaunchedEffect(Unit) { vm.refresh() }`. Llamar `refresh()` desde el cuerpo del
    composable multiplica por 2-4 la carga.

### Orden sugerido

Los puntos **1, 2 y 3** hacen desaparecer el 502 visible aunque no se toque nada
más. Los puntos **10, 11 y 12** son media hora de trabajo y garantizan que la
próxima caída se vea como un aviso legible y no como una pantalla en blanco con
jerga de protocolo. El resto es la deuda de fondo.

---

## 6. Lo que no se pudo verificar desde aquí

Esta auditoría es estática: leyó el código del repositorio. Tres cosas requieren el
droplet, y son justo las que convierten «candidata» en «confirmada»:

- `docker inspect nexara-api` — `RestartCount` y `OOMKilled`.
- `docker logs nexara-api --since 48h` — presencia de `[shutdown] signal received:
  uncaughtException` o `heap out of memory`.
- El tamaño real en bytes y el tiempo de `/api/activities` con el token de david
  frente al de un `ing_campo`.

Los tres comandos están escritos literalmente en §3.A y §3.B.
