# 15 · INTEGRA móvil: brecha de profundidad frente a la web

**Fecha:** 2026-09-07 · **Rama:** `mejora/calidad-y-web` · **Agente:** claude-code
**Alcance:** los 10 módulos que ya existían en la app nativa —`integra-home`,
`integra-access`, `integra-events`, `integra-people`, `integra-attendance`,
`integra-visitors`, `integra-alarms`, `integra-occupancy`, `integra-devices` y
el detalle de persona.

---

## Por qué existe este informe

Adam se quejó de que la app «se puso toda verde» sin cumplir los procesos
exhaustivos de la web. Al medir se confirmó el diagnóstico: **`nativeImplemented`
sólo significaba «no usa pantalla de relleno»**. Los diez módulos estaban
marcados `NATIVO` en el catálogo y ocho de ellos eran una lista plana con un
buscador de texto.

Ejemplos de lo que había antes de este turno, todos verificados en disco:

- **Eventos** pintaba `str(ev, "eventTime", "time", "occurredAt")` — la marca ISO
  cruda. Un acceso de las 13:24 de Puebla se leía «2026-09-06T19:24:11.000Z».
  No usaba `label`, ni `outcome`, ni `eventState`, ni paginaba: pedía 60 y ahí
  se acababa la bitácora.
- **Asistencia** enseñaba `firstAt → lastAt` en crudo y no decía nunca que una
  jornada estaba sin cerrar.
- **Personas** no enseñaba vigencia, ni tipo, ni credenciales: nombre, ID y
  puertas.
- **Alarmas** clasificaba con cuatro `when` privados duplicados de `common/`, y
  atendía o cerraba sin confirmación.
- **Equipos**, **Ocupación** y **Visitantes**: listas de tres líneas.
- `IntegraScreens.kt` redeclaraba en privado `str`, `bool`, `nestedPerson`,
  `alarmStatusLabel`, `alarmSeverityLabel`, `alarmSeverityTone` e
  `isAlarmPending`, que ya existían en `ui/integra/common/`. Era la sexta copia
  del patrón que ya había fallado cinco veces con los códigos ACS.

Lo que **sí** estaba bien y se ha conservado tal cual: `IntegraApi.kt`,
`IntegraRepository.kt` y todo `ui/integra/common/` (reglas, formato, JSON
tolerante, caché de sitios, diálogo de puerta). El trabajo del turno anterior
—`IntegraAccessScreen.kt` unificado— es el que ha servido de patrón.

---

## Método

Por cada módulo se leyó la página web equivalente en
`apps/web/app/(panels)/integra/**` **y** el servicio de la API que la alimenta
(`apps/api/src/integra/**`), para no copiar de la web un comportamiento que el
servidor ya resuelve mejor. La tabla de brecha se produjo antes de tocar código.

---

## Tabla de brecha por módulo

### `integra-access` — Acceso

| | Antes | Después |
|---|---|---|
| Estado | Ya profundizado en el turno anterior | **Sin cambios** |

Se dejó intacto a propósito: listado con `live`/espejo, filtros de estado y
región, paginación local honesta, capacidad `canControlDoors`, y el diálogo de
control con motivo obligatorio que no se cierra con la orden en vuelo.

---

### `integra-events` — Bitácora ACS

| Aspecto | Antes | Después |
|---|---|---|
| Hora | Marca ISO cruda (`…T19:24:11.000Z`) | `06/09/2026 13:24` en la zona del sitio |
| Resultado | `eventType` en crudo | `label` + `outcome` del servidor, con tono |
| `eventState` | Ignorado | Insignia «En curso» / «Finalizado» + filtro de servidor |
| Paginación | Ninguna: 60 y fin | **Cursor real** `beforeId` / `nextBeforeId`, «Ver más» |
| Vistas rápidas | Ninguna | Hoy · Denegados · 7 días · Ruido (`scope` + `outcome` + rango) |
| KPI | Ninguno | `push/events/stats`: entradas, denegados, únicos, en sitio |
| Verificación | No se veía | `verifyMode` traducido sólo si se conoce |
| Equipo | `doorName` o nada | `deviceName` → IP → `Puerta N` |
| Sitio | Implícito | Barra de sitio |
| Pendiente | — | Vista correlada por secuencias, filtro por terminal (`deviceIp`), export CSV |

`Hoy` arranca a medianoche local, no 24 h atrás, igual que cuenta el servidor.

---

### `integra-people` — Directorio

| Aspecto | Antes | Después |
|---|---|---|
| Vigencia | No se veía | Chip por tarjeta con las 5 clasificaciones de la web |
| «Indefinida» | — | `validTo ≥ 2036` no se pinta «vence en 4 000 días» |
| Credenciales | No se veían | Rostro / tarjeta / huella contadas; «Sin credenciales» explícito |
| Vínculo ERP | No se veía | Se lee `erpUser` del servidor (la web lo re-deduce pidiendo `GET users` entero) |
| Filtros | Sólo texto | Vigencia (5), rostro sí/no, ERP sí/no, tipo de usuario, puerta |
| Orden | Ninguno | Nombre · Vigencia urgente · Credenciales incompletas |
| Live/espejo | No | Interruptor `?live=1` |
| Paginación | Todo de golpe | 40 + «Ver más» con cuenta honesta |
| Alta | Sólo nombre | Nombre + código manual o automático, con la explicación del enlace ERP |
| Pendiente | — | Alta unificada (crea usuario ERP), filtro por organización Artemis, foto en el alta |

---

### Detalle de persona

| Aspecto | Antes | Después |
|---|---|---|
| Campos | 7 líneas crudas | Identidad, vigencia con fechas formateadas, terminal, puertas, credenciales, nº de tarjeta, ERP completo |
| Edición | Sólo nombre + «toggle vigencia» | Nombre, tipo, género, `validFrom`, `validTo`, `validEnable` |
| Rostro | Botón sin confirmación, `image/*` | JPEG explícito, aviso LFPDPPP, borrado con confirmación por su nombre |
| Baja | Confirmación en línea, **siempre `force = true`** | Confirmación con el texto real, `force` es una casilla que el operador decide, y se ofrece sola tras un fallo parcial |
| `!!` | 6 usos (`s.message!!`, `s.error!!`) | Ninguno |
| Pendiente | — | Vincular/desvincular ERP, huella, `people/:id/access` (puertas y planes por terminal) |

**El defecto más serio corregido aquí:** la baja mandaba `force = true` sin
decirlo. Se saltaba el mecanismo que existe justamente para no dejar a una
persona borrada en NEXARA pero viva en un terminal caído.

---

### `integra-attendance` — Asistencia

| Aspecto | Antes | Después |
|---|---|---|
| Agrupación | Lista plana | Un encabezado por día, con resumen (personas, accesos, denegados) |
| Horas | ISO crudo | `Entrada 08:12 · Último paso 17:40` en zona local |
| Jornada sin cerrar | No se decía | Chip «Entrada sin salida registrada» + filtro «Sin salida (N)» |
| Último paso | Siempre | **Sólo si `passes > 1`**: con un pase, `lastAt` es el mismo evento |
| Rango | 7 / 14 locales | 1 / 7 / 14 / 30, y **cada cambio es otra petición** al servidor |
| Aviso | Ninguno | `AVISO_SIN_SALIDA` fijo en pantalla |
| Pendiente | — | Filtro por `personId` (el servidor lo acepta), enriquecimiento `attendance/hybrid` |

**No se inventa ningún cierre de jornada.** `ACS_EXIT_MINORS` está vacía a
propósito porque el único `minor` que producía una «salida» era en realidad un
fallo de reconocimiento facial. El `minutes = null` del servidor se enseña como
lo que es.

---

### `integra-visitors` — Visitantes

| Aspecto | Antes | Después |
|---|---|---|
| Alta recurrente | **No existía** | Formulario completo: nombre, teléfono, anfitrión, puertas, días, horario, vigencia |
| Validación | — | `validarVisitaRecurrente` antes de gastar la llamada (el DTO devuelve 400 por un campo de más) |
| Cancelar | **No existía** | Con confirmación explícita que no se cierra con la orden en vuelo |
| Estado | `syncStatus` crudo | En terminales / Pendiente / Vencida / Cancelada, con la regla de la web |
| Ritmo | `str(rec,"weekdays","timeFrom","timeTo")` — leía **un solo campo** | «Lun–Vie · 09:00–18:00» |
| Puertas | No se veían | Chips seleccionables, preselección por sala de juntas / acceso general |
| Citas puntuales | Formulario que falla en ISAPI sin decirlo | Aviso de que es módulo cloud Artemis y que el camino es «Nueva» |
| Pendiente | — | Foto JPEG en el alta, selector de anfitrión desde el directorio, QR |

Tras crear se limpian nombre y teléfono, pero **se conservan puertas, días,
horario y vigencia**: dar de alta a cuatro visitantes del mismo grupo es el caso
normal.

---

### `integra-alarms` — Cola SOC

| Aspecto | Antes | Después |
|---|---|---|
| Duplicados | Una fila por repetición | Agrupadas en ventanas de 5 min con `×N`, y se puede desagrupar |
| Filtros | Pendientes / Todas | Estado (6), severidad mínima (3), ventana 8/24/72/168 h, búsqueda |
| Severidad | 3 casos, resto neutro | 4 cajas con rango, «Sin clasificar» explícito |
| `kind` | 6 etiquetas, faltaban 4 | 9 etiquetas + cola de `eventType` + humanizado; un tipo nuevo **no** se pinta «acceso denegado» |
| Acciones | Atender/Cerrar si «pendiente» | Atender sólo si `OPEN`, cerrar si no está `CLEARED`, escalar sólo si no hay ticket |
| Ticket OPS | **No existía** | Título + descripción prellenada con lo que un técnico necesita |
| Confirmación | Ninguna | Diálogo por acción, sin doble envío, sin cierre en vuelo |
| Alcance | Una alarma | Se aplica a **todos** los miembros del grupo fusionado |
| Estado | «Abierta» / «Con ticket» | «Nueva» / «Escalada a ticket» (vocabulario de la consola) |
| Pendiente | — | Sondeo automático (la web refresca cada 7 s), aviso sonoro, salto a playback de cámara, búsqueda histórica Artemis |

**Divergencia deliberada con la web:** allí un clic atiende o cierra sin
preguntar. En un móvil, con el pulgar sobre una lista que se desplaza, eso es
una alarma cerrada por accidente. Aquí se confirma.

---

### `integra-occupancy` — En sitio

| Aspecto | Antes | Después |
|---|---|---|
| Ficha de persona | **No existía** | `presence/:personId`: pasos de hoy, órdenes abiertas, CRM, usuario ERP |
| Horas | ISO crudo | `hace 12 min` + hora local |
| Cómo entró | No se veía | `verifyMode` traducido |
| Aviso | Genérico | La nota del propio servidor, y `AVISO_SIN_SALIDA` si falta |
| Día | No se veía | Encabezado con el día que el servidor considera «hoy» |
| Paginación | Todo | 25 + «Ver más» con cuenta honesta |

Es el cambio con más valor operativo del turno: en una caseta, «quién está
dentro» sólo sirve si puedes tocar un nombre y ver por dónde pasó.

---

### `integra-devices` — Equipos

| Aspecto | Antes | Después |
|---|---|---|
| Orden | Alfabético | **Los caídos primero** |
| `online = null` | Se pintaba «Offline» | «Sin dato» — no es lo mismo que caído |
| Filtros | Sólo texto | «Solo caídos (N)» + tipo ACS/Encode |
| Antigüedad del espejo | No se veía | `sync/last` con edad relativa, y aviso si no hay dato |
| KPI | Ninguno | Total + sin conexión |
| Paginación | Todo | 30 + «Ver más» |

---

### `integra-home` — Hub

| Aspecto | Antes | Después |
|---|---|---|
| Contenido | Rejilla de tarjetas de colores, sin datos | Sigue igual — **el hub vive en `IntegraNavHost.kt`, que no es mío** |
| Entregado | — | `IntegraHomeSummary()` en `ui/integra/IntegraHomeSummary.kt`, listo para engancharse |

`IntegraHomeSummary` trae: barra de sitio, aviso de sitio sin enlace, KPI
(puertas en línea, alarmas pendientes, en sitio, denegados hoy), inventario y
antigüedad del espejo con aviso a partir de una hora. Se engancha con **una
línea** dentro del `LazyColumn` de `IntegraHomeScreen`:

```kotlin
item { IntegraHomeSummary() }
```

Hasta que esa línea exista, `integra-home` es una rejilla muda y su etiqueta
debería decirlo.

---

## División del fichero

`IntegraScreens.kt` (1 608 líneas) **se eliminó** y su contenido se repartió por
módulo dentro del mismo paquete `mx.nexara.mobile.nativeapp.ui.integra`:

| Fichero nuevo | Contenido |
|---|---|
| `IntegraEventsScreen.kt` | Bitácora ACS |
| `IntegraPeopleScreen.kt` | Directorio |
| `IntegraPersonDetailScreen.kt` | Ficha de persona |
| `IntegraAttendanceScreen.kt` | Asistencia |
| `IntegraVisitorsScreen.kt` | Visitantes |
| `IntegraAlarmsScreen.kt` | Cola SOC |
| `IntegraOccupancyScreen.kt` | En sitio + ficha de presencia |
| `IntegraDevicesScreen.kt` | Inventario |
| `IntegraHomeSummary.kt` | Cabecera viva del hub (sin cablear) |

**No afecta al cableado:** todos los composables conservan nombre, firma y
paquete, así que `IntegraNavHost.kt` no cambia ni una línea.

Se eliminó también `IntegraSitesScreen` (~110 líneas), que era código muerto:
`integra-sites` resuelve desde el 07-09 a `integra/settings`, en el paquete
`detection`. No lo referenciaba nadie.

---

## Catálogo — cambios que debe hacer Adam

`ModuleCatalog.kt` es suyo. Un único cambio recomendado:

| Clave | Valor actual | Valor propuesto | Motivo |
|---|---|---|---|
| `integra-home` | `ParityStatus.NATIVO` | `ParityStatus.PARCIAL` (o el valor equivalente del enum) | La rejilla de tarjetas no tiene ningún dato vivo. **Vuelve a `NATIVO` en cuanto añadas `item { IntegraHomeSummary() }` a `IntegraHomeScreen`**, en `IntegraNavHost.kt` línea ~412. |

Los otros nueve (`integra-access`, `integra-events`, `integra-people`,
`integra-attendance`, `integra-visitors`, `integra-alarms`, `integra-occupancy`,
`integra-devices` y el detalle de persona) **sí sostienen `NATIVO`** después de
este turno.

`ModulePanelMap.kt`, `IntegraNavHost.kt` y `DeepLinkParser.kt` no necesitan
ningún cambio.

---

## Calidad

- **Sin `!!`** en los nueve ficheros nuevos (había 6 en el detalle de persona).
- **Sin `GlobalScope`**; todo en `viewModelScope` con `withContext(Dispatchers.IO)`
  para la red.
- **Sin bloqueos del hilo principal**: la lectura del JPEG del rostro pasa por
  `runCatching` y sólo el `Base64` queda en el hilo de UI (una operación de
  microsegundos sobre unos cientos de KB).
- **Nulables donde la API puede devolver nulo**: `online`, `eventState`,
  `minutes`, `validEnable`, `erpUser`, `ticketRequestId`, `personName`. En los
  tres casos donde `null` significa algo distinto de `false` —equipo sin dato,
  evento sin duración, vigencia desconocida— se pinta un tercer estado.
- **Textos en español**, incluidos los mensajes de error y los avisos.
- **Ninguna tabla de códigos ACS en Kotlin.** `label`, `outcome` y `eventState`
  se consumen tal como los manda `hikvision-isapi/acs-codes.ts`.

---

## Pruebas

Tres ficheros nuevos en `app/src/test/java/mx/nexara/mobile/nativeapp/ui/integra/`:

| Fichero | Qué fija |
|---|---|
| `IntegraRulesTest.kt` | **43 pruebas**: estado de puerta (el equipo caído gana), órdenes de control, `eventState` nulo, rango de las vistas rápidas, jornada sin salida, vigencia (2037 = indefinida, suspensión gana sobre fecha), credenciales, orden por urgencia, acciones de alarma, severidad mínima, `kind` desconocido, agrupación de duplicados (misma ventana, distinto estado, sin hora), orden de equipos, ritmo semanal, estado de visita, validación del alta, antigüedad del espejo |
| `IntegraFormatTest.kt` | **11 pruebas**: los tres formatos de marca de tiempo del servidor, ilegible → `—`, edades relativas, reloj adelantado, duración `null`, día absoluto sin arrastrar husos |
| `IntegraJsonTest.kt` | **11 pruebas**: `Double` de Moshi sin `.0`, alias, la cadena `"null"`, objetos anidados, `bool`/`int` tolerantes, listas mixtas, ficha envuelta o plana, búsqueda sin acentos |

**65 pruebas nuevas.** No se tocó `IntegraWiringTest.kt`, que sigue pasando sus 6.

Una de ellas encontró un defecto real mientras se escribía: `agruparAlarmas`
pisaba el grupo anterior al cerrarse la ventana de cinco minutos, así que dos
rachas separadas del mismo incidente se contaban como una. Corregido antes de
cerrar el turno.

---

## Pendiente

Ordenado por valor, no por módulo:

1. **Cablear `IntegraHomeSummary()`** (una línea, `IntegraNavHost.kt`) y subir
   `integra-home` a `NATIVO`.
2. **Sondeo en alarmas.** La web refresca la cola cada 7 s; el móvil sólo con
   gesto de arrastre. Para un SOC eso importa.
3. **Vincular / desvincular ERP** desde la ficha de persona
   (`POST/DELETE integra/people/:id/link`).
4. **Puertas y planes por terminal** en la ficha (`GET integra/people/:id/access`)
   — responde «¿por qué esta persona no abre esta puerta?».
5. **Huella** (`people/:id/fingerprint`) — la web la enrola, el móvil no.
6. **Filtro por terminal en eventos** (`deviceIp`, con el catálogo de
   `integra/devices`) y filtro por `personId`.
7. **Foto JPEG en el alta de visita recurrente** (`faceBase64`).
8. **Vista correlada de eventos** por secuencias de 60 s — es lo que convierte
   «tres denegados» en «tres intentos y luego entró».
9. **Alta unificada de persona** (usuario ERP + ACS + JPEG). Requiere el dominio
   de usuarios, que está fuera de INTEGRA.
10. **Salto a playback** desde una alarma con cámara
    (`POST integra/cameras/:id/playback`).

---

## Verificación

Ejecutado en esta máquina (Windows, `gradlew.bat`, JDK 17.0.18):

```
cd apps/mobile-native/android
./gradlew :app:compileDebugKotlin   → BUILD SUCCESSFUL — cero avisos en ui/integra
./gradlew :app:testDebugUnitTest    → BUILD SUCCESSFUL — 401 pruebas, 0 fallos, 0 errores
```

Desglose de las suites de INTEGRA en esa ejecución:

| Suite | Pruebas | Fallos |
|---|---|---|
| `IntegraRulesTest` | 43 | 0 |
| `IntegraFormatTest` | 11 | 0 |
| `IntegraJsonTest` | 11 | 0 |
| `IntegraWiringTest` (de Adam, intacta) | 6 | 0 |

**Aviso sobre el total:** las 401 incluyen las pruebas de otros agentes que
trabajan la misma rama en paralelo (`data/integra/map`, `meetings`). El árbol de
trabajo tenía sus cambios sin commitear durante toda esta sesión; no se tocó
ninguno.

**Trampa de entorno, por si reaparece:** la primera ejecución falló con
`ClassNotFoundException` en seis clases de `access` que sí estaban compiladas.
Era estado incremental viciado por haber borrado `IntegraScreens.kt`, no un
defecto de código. Se resuelve con `--rerun-tasks` una vez (tarda), y después el
ciclo normal vuelve a ser de segundos.
