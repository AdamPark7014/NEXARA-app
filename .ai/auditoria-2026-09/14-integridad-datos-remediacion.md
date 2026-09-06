# 14 — Integridad de datos: remediación

Rama `mejora/calidad-y-web`. Agente: claude-code. Fecha: 2026-09-06.

Cuatro defectos que metían datos falsos en las tablas de las que sale la
nómina. Cursor ya había cerrado parte en el turno anterior; esto documenta qué
seguía vivo al empezar, qué se cambió y qué queda por decidir.

Estado al cerrar: `npm run typecheck:api` limpio, `npm run test:api` en verde
(110 suites, 911 pruebas), `:app:compileDebugKotlin` limpio.

---

## Regla que gobernó todos los cambios

**Endurecer una validación del servidor rompe la app que la gente ya tiene
instalada.** Ninguno de los arreglos rechaza una petición que la versión
publicada en Play sepa hacer. Donde el dato venía mal, se acepta el registro y
se guarda lo que de verdad hubo (ausencia de ubicación), en vez de guardar el
valor inventado. El rechazo duro queda anotado abajo como pendiente para cuando
la v2 esté desplegada.

---

## Defecto 1 — La ventana de comida medida en UTC

**Seguía vivo.** Sí.

`lunch-breaks.service.ts` ya importaba `workday.js` y `createCheckin` /
`createCheckout` ya usaban `workDateColumn` y `workDayAtClock`. Pero el barrido
del archivo encontró tres cosas más:

| Dónde | Qué pasaba |
|---|---|
| `lunch-breaks.service.ts:188` (`getTodayLunchBreaks`) | `today.setHours(0,0,0,0)` sobre la hora del contenedor, que es UTC. A las 18:00 de México el panel de comidas se vaciaba y empezaba a mostrar las del día siguiente. |
| `lunch-breaks.cron.service.ts:68` (`notifyLunchBreakExpired`) | El mismo `setHours`. El cron buscaba el día UTC y no encontraba las comidas abiertas de la tarde mexicana. |
| `lunch-breaks.cron.service.ts` — los dos `@Cron` | Sin `timeZone`, el cron usa la del proceso. El aviso de «tu comida es en 10 minutos» salía a las **08:50** de México, y el de expiración a las **10:05**. |

Además, dos datos falsos que quedaban escritos en `notes`:

- La nota de entrada tardía medía los minutos contra las **15:00** (inicio de la
  ventana) cuando la condición que la dispara es rebasar las **16:00** (fin).
  Guardaba un retraso inflado en 60 minutos: quien entraba a las 16:30 tenía en
  la base «90 minutos después».
- `createCheckout` concatenaba sobre `lunch.notes`, que es nullable. Sin `??
  ''`, las notas quedaban empezando literalmente por la cadena `"null"`.

Y el rango de consulta: el controlador hacía `new Date(startDate)` antes de
pasarlo al servicio. Para un `AAAA-MM-DD` eso da medianoche UTC, que casualmente
coincide con lo que guarda `workDateColumn`; pero con un ISO completo el rango
salía corrido. Ahora la cadena viaja cruda y el servicio la ancla con
`parseWorkDate`.

### Qué se cambió

- `apps/api/src/attendance/lunch/lunch-breaks.service.ts` — helpers privados
  `dayColumn()` y `rangeDayColumn()`; `getTodayLunchBreaks` usa el día de
  México; rangos anclados con `parseWorkDate`; nota de retraso medida contra el
  fin de la ventana; `lunch.notes ?? ''`.
- `apps/api/src/attendance/lunch/lunch-breaks.cron.service.ts` — `workDateColumn`
  y `{ timeZone: WORKDAY_TIMEZONE }` en los dos `@Cron`.
- `apps/api/src/attendance/lunch/lunch-breaks.controller.ts` — pasa las cadenas
  sin convertir.

### Con qué prueba queda fijado

`apps/api/src/attendance/lunch/lunch-ventana-mexico.spec.ts` — 13 casos. Los que
importan:

- A las 19:00 de México (01:00Z del día siguiente) el «hoy» del panel sigue
  siendo el día correcto.
- Lo que escribe `createCheckin` y lo que consulta `getTodayLunchBreaks` es el
  **mismo** día; si no, el panel nunca encuentra la comida que se acaba de
  registrar.
- Entrar a las 15:30 de México no es tarde; a las 16:30 son 30 minutos, no 90.
- **Guarda de regresión:** lee el código de los tres archivos, quita los
  comentarios y falla si reaparece `setHours`, `setMinutes` o
  `getTimezoneOffset`. Otra falla si algún `@Cron` pierde el `timeZone`.

---

## Defecto 2 — Coordenadas `0.0, 0.0`

**Seguía vivo a medias.**

Cursor ya había arreglado el guard `hasGps` (añadió `!(lat === 0 && lng === 0)`)
y el DTO de Android ya era nullable. Pero el cero **se seguía guardando**:

- `attendance.service.ts:496` escribía `entryLatitude: dto.latitude ?? null` —
  fuera del guard. Es decir: `hasGps` decidía correctamente que no había GPS, y
  aun así la fila de asistencia se quedaba con el `0,0`.
- La salida usaba `dto.latitude || null`, que descarta el cero por accidente
  (`0` es falsy) pero no cubre `NaN` ni valores fuera de rango, y no coincidía
  con el criterio de la entrada.
- `gps.service.ts::create` (el ping `POST /gps`) no filtraba nada: cualquier
  `0,0` entraba en `LocationTracking` como una medición más.
- En Android, `DeviceLocation.toCoords()` construía un `DeviceCoords(0.0, 0.0)`
  si el proveedor fusionado devolvía un `Location` vacío.

### Qué se cambió

- `attendance.service.ts` — helper `realCoords()` (rechaza no-números, no
  finitos, el par `(0,0)` exacto y valores fuera de rango). Se lee **una sola
  vez** por petición y alimenta a la vez lo que se guarda, la decisión de si hay
  GPS y el punto de rastreo. Entrada y salida usan el mismo criterio. Si llegan
  coordenadas y no son reales, se registra un `warn` con lo recibido.
- `gps.service.ts` — helper `realPoint()`. El ping malo **se descarta sin lanzar
  excepción** y devuelve `{ skipped: true, reason }`.
- `util/DeviceLocation.kt` — `toCoords()` devuelve `null` en vez de un punto
  inventado, y `current()` cae a la última ubicación conocida si la lectura
  fresca no sirve.

Nota deliberada: el cero de **una sola** de las dos coordenadas no descarta el
punto. Latitud 0 con longitud real es el ecuador, un sitio legítimo. Sólo el par
`(0,0)` exacto es el valor por defecto de un teléfono sin permiso.

### Compatibilidad

Ningún cambio rechaza nada. La app instalada que mande `0,0` sigue fichando; lo
que cambia es que la fila queda con la ubicación en `NULL`, que es lo que de
verdad hubo. Lo mismo con el ping GPS: se descarta el punto, no la petición.

### Con qué prueba queda fijado

`apps/api/src/attendance/asistencia-ubicacion-consentimiento.spec.ts` y
`apps/api/src/gps/gps-ubicacion-real.spec.ts`. Incluyen explícitamente el caso
«el fichaje SÍ se registra» y «no lanza excepción», para que nadie endurezca
esto sin darse cuenta de que rompe los teléfonos.

---

## Defecto 3 — `locationConsent = true` incondicional

**Seguía vivo.** Cursor lo había atado a `hasGps`, pero eso no arregla el
problema: **fichar no es consentir el rastreo**. La app pedía el permiso del
sistema para poner una coordenada en un fichaje concreto, y el servidor lo
convertía en una autorización permanente que dejaba al usuario visible en el
mapa del equipo el resto de la jornada. Nadie otorgó eso.

Había además una segunda fuente: `ConsoleAttendanceScreen.kt` llamaba a
`gpsUpdateConsent(enabled = true)` por su cuenta en cada entrada con GPS.

### Qué se cambió

- `attendance.service.ts` — se quitó la escritura de `locationConsent: true`.
  El punto de la entrada **sí** se sigue guardando en `LocationTracking`: es el
  sitio desde el que fichó, y para eso pidió el permiso. Lo que no se guarda es
  la autorización que no dio.
- `ConsoleAttendanceScreen.kt` — se quitó la llamada automática.
- El `locationConsent: false` de la salida **se mantiene**, con un comentario
  que explica por qué: revocar no es fabricar. Apagar el rastreo al cerrar la
  jornada es el comportamiento conservador y deja al usuario donde estaría si
  nunca hubiera consentido. Quitarlo habría sido una regresión de privacidad —
  `GET /gps/:id` usa esa columna como guard.

El único camino que enciende el consentimiento es ahora `PATCH /gps/consent`,
que cuelga del interruptor de `ConsoleGpsScreen`.

### Efecto operativo a vigilar

Los usuarios que nunca toquen ese interruptor dejarán de aparecer en el mapa del
equipo. Es lo correcto, pero es un cambio visible para quien use ese mapa a
diario. **Conviene avisar antes de desplegar.**

---

## Defecto 4 — Los fichajes de la app se registraban como «Escritorio · PC»

**Seguía vivo.** `ApiClient.kt` no fijaba `User-Agent` y OkHttp no pone uno por
su cuenta, así que el servidor recibía la cadena vacía y
`detectDeviceFromUserAgent` caía en su rama por defecto: `Escritorio` / `PC`.
Todos los fichajes del teléfono quedaban indistinguibles de los del navegador de
una computadora.

### Qué se cambió

Sólo `apps/mobile-native/android/.../data/api/ApiClient.kt`. **No hizo falta
tocar `device-detector.ts`**: el detector ya interpreta bien lo que ahora se le
manda.

Tres cabeceras, en **todas** las peticiones — también en las que no llevan token,
que es donde el servidor registra `lastLoginDevice` (antes el interceptor hacía
`return` temprano si no había token y no ponía nada):

| Cabecera | Valor | Cómo lo lee el servidor |
|---|---|---|
| `User-Agent` | `NexaraApp/<versionName> (Android <release>; <fabricante modelo>) OkHttp` | La palabra «Android» hace que `kind` sea `Móvil` y `os` sea `Android`. |
| `X-Device-Model` | `<fabricante> <modelo>` | Alimenta `model` en la ficha de dispositivo. |
| `X-Device-Browser` | `NEXARA App` | Es lo que separa un fichaje hecho desde la app de uno hecho con Chrome en el mismo teléfono. |

Resultado en `Attendance.deviceInfo`: **`Móvil · Android · NEXARA App`** en vez
de `Escritorio · PC`.

Las tres cabeceras ya estaban en la lista `allowedHeaders` del CORS de
`main.ts`, así que no hace falta tocar infraestructura.

### Con qué prueba queda fijado

En `asistencia-ubicacion-consentimiento.spec.ts`, bloque «el fichaje dice de qué
aparato salió»: pasa el User-Agent real de la app por `register()` y comprueba
que `deviceInfo` dice `Móvil` y `Android` y **no** dice `Escritorio` ni `PC`. Un
tercer caso deja documentado que sin User-Agent el resultado seguía siendo
`Escritorio`.

---

## Arreglos colaterales encontrados al verificar

**`gps.service.ts::getTodayDateOnly` devolvía un instante que no casaba nunca.**
Devolvía `workDayStart(new Date())`, o sea las 06:00 UTC, y se comparaba contra
`AttendanceDay.date`, que es una columna `@db.Date`. Postgres compara una fecha
contra medianoche, así que la igualdad era **siempre falsa**: `GET /gps/me`
decía que no había consentimiento aunque lo hubiera, y `GET /gps/team` devolvía
lista vacía. Ahora usa `workDateColumn`, igual que lo escribe
`AttendanceService`. Fijado en `gps-ubicacion-real.spec.ts`.

**`attendance-duplicados.spec.ts` estaba en rojo antes de que yo empezara.** Las
5 pruebas del archivo pasaban un DTO sin `photoBase64`, y el guard de foto
obligatoria (que ya estaba en `main` al arrancar mi turno, no es mío) cortaba
antes de llegar a lo que querían fijar. Añadido el `photoBase64` al DTO de
prueba. Es la única razón por la que toqué ese archivo.

---

## Pendiente de decisión humana

### 1. Los registros históricos ya escritos — Adam decide, yo no

Nada de lo anterior corrige el pasado. Abajo van las consultas **de sólo
lectura** que dimensionan el daño. Ninguna modifica datos. No hay ningún
`UPDATE`, `DELETE` ni `INSERT` en este documento, ni lo habrá sin que Adam diga
qué hacer.

Las tablas sin `@@map` en el esquema conservan el nombre PascalCase y hay que
citarlas entre comillas. `LunchBreak` sí está mapeada, a `lunch_breaks`.

Las columnas `DateTime` de Prisma son `timestamp` sin zona con el valor en UTC,
de ahí el doble `AT TIME ZONE`.

#### 1a. Comidas marcadas fuera de ventana por el desfase de seis horas

```sql
-- Cuántas comidas tienen la marca de "tarde" que NO les corresponde
-- si la ventana se mide en hora de México (15:00-16:00).
SELECT
  COUNT(*)                                                   AS total,
  COUNT(*) FILTER (WHERE lb."isCheckinLate" AND NOT real_late) AS falsos_positivos,
  COUNT(*) FILTER (WHERE NOT lb."isCheckinLate" AND real_late) AS falsos_negativos
FROM (
  SELECT
    "isCheckinLate",
    (("checkinTime" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::time
      NOT BETWEEN TIME '15:00' AND TIME '16:00' AS real_late
  FROM lunch_breaks
) lb;
```

```sql
-- El detalle, para poder mirar caso por caso antes de decidir nada.
SELECT
  lb.id,
  lb."userId",
  u.nombre,
  lb.date                                                        AS dia_guardado,
  (("checkinTime" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date AS dia_real_mx,
  (("checkinTime" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::time AS hora_mx,
  lb."isCheckinLate"                                             AS marcado_tarde,
  lb.notes
FROM lunch_breaks lb
JOIN "User" u ON u.id = lb."userId"
WHERE lb."isCheckinLate" IS DISTINCT FROM (
  (("checkinTime" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::time
    NOT BETWEEN TIME '15:00' AND TIME '16:00'
)
ORDER BY lb.date DESC;
```

```sql
-- Comidas cuya columna `date` no coincide con el día mexicano de su checkin:
-- son las que el panel del día no encuentra.
SELECT COUNT(*) AS filas_con_dia_corrido
FROM lunch_breaks
WHERE date::date <>
  (("checkinTime" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date;
```

```sql
-- Notas con el retraso inflado en 60 min, y notas que empiezan por "null".
SELECT
  COUNT(*) FILTER (WHERE notes LIKE 'null%')                       AS notas_con_null,
  COUNT(*) FILTER (WHERE notes LIKE '%después del horario permitido (3 PM)%')
                                                                   AS notas_retraso_inflado
FROM lunch_breaks;
```

#### 1b. Coordenadas `0,0`

```sql
-- Fichajes con el punto inventado en el golfo de Guinea.
SELECT
  COUNT(*) FILTER (WHERE "entryLatitude" = 0 AND "entryLongitude" = 0) AS entradas_cero,
  COUNT(*) FILTER (WHERE "exitLatitude"  = 0 AND "exitLongitude"  = 0) AS salidas_cero,
  COUNT(*)                                                             AS total_fichajes
FROM "Attendance";
```

```sql
-- Cuánta gente y desde cuándo. Sirve para saber si esto es un caso raro
-- o una práctica sistemática de algún equipo.
SELECT
  a."userId",
  u.nombre,
  COUNT(*)          AS fichajes_con_cero,
  MIN(a."timestamp") AS primero,
  MAX(a."timestamp") AS ultimo
FROM "Attendance" a
JOIN "User" u ON u.id = a."userId"
WHERE (a."entryLatitude" = 0 AND a."entryLongitude" = 0)
   OR (a."exitLatitude"  = 0 AND a."exitLongitude"  = 0)
GROUP BY a."userId", u.nombre
ORDER BY fichajes_con_cero DESC;
```

```sql
-- Puntos de rastreo inventados.
SELECT
  COUNT(*)                        AS puntos_cero,
  COUNT(DISTINCT "usuarioId")     AS usuarios_afectados,
  MIN("ultimaActualizacion")      AS primero,
  MAX("ultimaActualizacion")      AS ultimo
FROM "LocationTracking"
WHERE latitud = 0 AND longitud = 0;
```

```sql
-- Y los que están fuera de rango por otras razones (no sólo el 0,0).
SELECT COUNT(*) AS puntos_imposibles
FROM "LocationTracking"
WHERE ABS(latitud) > 90 OR ABS(longitud) > 180;
```

#### 1c. Consentimientos que nadie otorgó

No hay bitácora de `PATCH /gps/consent`, así que **no se puede distinguir con
certeza** un consentimiento real de uno fabricado. Lo que sí se puede es acotar:
como el servidor lo encendía en cada entrada y lo apagaba en cada salida, un
`true` con la jornada abierta casi con seguridad lo puso el defecto.

```sql
-- Cuánta gente tiene el consentimiento encendido ahora mismo.
SELECT
  COUNT(*) FILTER (WHERE "locationConsent")     AS con_consentimiento,
  COUNT(*) FILTER (WHERE NOT "locationConsent") AS sin_consentimiento,
  COUNT(*)                                      AS total_usuarios
FROM "User";
```

```sql
-- De esos, cuáles tienen jornada abierta: el `true` se lo puso el fichaje,
-- no el usuario.
SELECT
  u.id,
  u.nombre,
  u.email,
  ad.date         AS jornada_abierta_del_dia,
  ad."lastEntryAt"
FROM "User" u
JOIN "AttendanceDay" ad
  ON ad."userId" = u.id AND ad."isOpen" = TRUE
WHERE u."locationConsent" = TRUE
ORDER BY ad."lastEntryAt" DESC;
```

```sql
-- Usuarios con consentimiento encendido y SIN jornada abierta: son los únicos
-- candidatos a haberlo otorgado de verdad por el interruptor.
SELECT u.id, u.nombre, u.email
FROM "User" u
WHERE u."locationConsent" = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM "AttendanceDay" ad
    WHERE ad."userId" = u.id AND ad."isOpen" = TRUE
  );
```

#### 1d. Atribución de dispositivo

```sql
-- Cuántos fichajes hay atribuidos a "Escritorio" y cuántos usuarios sólo
-- fichan desde el móvil. Todo lo anterior al despliegue de la v2 con
-- User-Agent está mal atribuido y no se puede reconstruir.
SELECT
  "deviceInfo",
  COUNT(*)                    AS fichajes,
  COUNT(DISTINCT "userId")    AS usuarios,
  MIN("timestamp")            AS primero,
  MAX("timestamp")            AS ultimo
FROM "Attendance"
GROUP BY "deviceInfo"
ORDER BY fichajes DESC;
```

**Lo que hay que decidir, en cada caso:** si se corrigen las filas, si se dejan
como están con una nota, o si se marcan como no fiables. Yo no lo decido, y
tampoco hay hoy una columna donde marcar «dato degradado» — añadirla es una
migración de esquema y no la hice.

### 2. Endurecimientos que esperan a la v2

Cuando la v2 esté desplegada en los teléfonos y se pueda exigir una versión
mínima, estos tres cambios pasan de «aceptar y degradar» a «rechazar»:

1. `POST /attendance` con `latitude`/`longitude` presentes pero `(0,0)` →
   `400`, en vez de guardar `NULL` en silencio.
2. `POST /gps` con `(0,0)` → `400`, en vez de devolver `{ skipped: true }`.
3. Exigir la cabecera `X-Device-Browser` o un `User-Agent` de la app en los
   fichajes que digan venir del móvil, para que no se pueda falsificar el origen.

Los tres puntos están marcados con un comentario en el código que apunta a este
documento.

### 3. Cosa que anoto en vez de tocar

**No necesito ningún permiso nuevo en `AndroidManifest.xml`.** Todo lo que hice
usa `android.os.Build`, que no requiere permiso, y los permisos de ubicación ya
declarados. No toqué el manifiesto, ni `build.gradle.kts`, ni `data/offline/**`,
ni los NavHost, ni nada de `apps/web/`.

---

## Nota de coordinación

Al arrancar mi turno el estado del relevo mostraba dos archivos sin commitear
(`activity-evidence.service.ts` y `PanelLogin.tsx`). **No ejecuté
`relevo.ps1 salvar`** porque el agente que me lanzó dijo estar editando
`activity-evidence.service.ts` en ese momento, y porque me pidió expresamente no
hacer commits. Los protegí no tocándolos.

Durante mi turno entró el commit `e2f0e9f8` y otro agente siguió editando en
paralelo sobre la misma copia de trabajo (`access/**`, `apps/web/**`,
`build.gradle.kts`, `AndroidManifest.xml`, `url-matrix.ts`). No toqué ninguno de
esos archivos. **Esto viola la regla 5 del protocolo — un agente a la vez sobre
la misma rama — y conviene que Adam lo sepa**, porque el siguiente `git status`
va a mezclar el trabajo de dos agentes en un mismo commit.

### Archivos que toqué

```
apps/api/src/attendance/attendance.service.ts
apps/api/src/attendance/attendance-duplicados.spec.ts
apps/api/src/attendance/asistencia-ubicacion-consentimiento.spec.ts   (nuevo)
apps/api/src/attendance/lunch/lunch-breaks.service.ts
apps/api/src/attendance/lunch/lunch-breaks.controller.ts
apps/api/src/attendance/lunch/lunch-breaks.cron.service.ts
apps/api/src/attendance/lunch/lunch-ventana-mexico.spec.ts            (nuevo)
apps/api/src/gps/gps.service.ts
apps/api/src/gps/gps-ubicacion-real.spec.ts                           (nuevo)
apps/mobile-native/android/.../data/api/ApiClient.kt
apps/mobile-native/android/.../ui/console/screens/ConsoleAttendanceScreen.kt
apps/mobile-native/android/.../util/DeviceLocation.kt
```
