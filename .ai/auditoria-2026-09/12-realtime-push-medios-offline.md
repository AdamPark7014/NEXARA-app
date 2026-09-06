# Auditoría 12 — Tiempo real, chat, push, medios y offline

**Fecha:** 2026-09-06
**Alcance:** capas transversales de la app Android v2 (`apps/mobile-native`) y su contraparte en `apps/api`.
**Modo:** read-only. No se modificó ningún archivo fuente.

---

## Respuestas a las cinco preguntas

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Llegan las push a Android 13+? | **Sí.** El permiso se pide en runtime (`MainActivity.kt:174-180`) y está declarado (`AndroidManifest.xml:9`). Pero el *deep link* al tocarlas **no funciona en background** (defecto D6) y todas caen en el canal de importancia normal (D7). |
| 2 | ¿Se comprimen las fotos? | **No. Cero compresión en toda la app.** No existe un solo `Bitmap`, `compress()` ni `inSampleSize` en el código Kotlin. La foto de cámara se sube tal cual sale del sensor. |
| 3 | ¿La cola offline es idempotente? | **No.** `QueuedMutation.id` es un UUID que nunca sale del dispositivo. La API *tiene* `IdempotencyInterceptor` global (Stripe-style), pero el cliente jamás manda la cabecera `Idempotency-Key`. Un reintento tras timeout crea un registro duplicado. |
| 4 | ¿Se limpia la cache al cambiar de usuario? | **No, y además la clave de cache colisiona entre usuarios.** `OfflineApiCache.clear()` no se llama en ningún sitio, y el `authTag` que discrimina la clave es idéntico para todos los usuarios. Fuga de datos entre usuarios y entre empresas en el mismo dispositivo. |
| 5 | ¿El socket autentica y aísla por empresa? | **Sí, y está bien hecho.** JWT verificado en middleware de handshake antes de establecer el socket, salas `company:{id}` / `user:{id}` / `chat:{id}`, y `chat:join` exige membresía real en base de datos con fallo cerrado. Es la capa más sólida de las cinco. |

---

## 1. Tiempo real

### Estado: **sólido**. Es la mejor capa auditada.

**Gateway** — `apps/api/src/realtime/realtime.gateway.ts`

Socket.IO vía `@nestjs/websockets`. La autenticación va en middleware de handshake (`afterInit`, línea 74), no en `handleConnection`: un socket sin token válido nunca llega a establecerse (líneas 87-93). Esto es la decisión correcta y está comentada como tal.

Aislamiento por inquilino:
- `handleConnection` mete el socket en `user:{userId}` y, si hay empresa resuelta, en `company:{companyId}` (líneas 115-118).
- `emitToCompany()` (línea 234) acota la difusión a la sala de empresa.
- `chat:join` (línea 133) verifica membresía real contra `chatChannelMember` y **falla cerrado ante cualquier error** (`isChannelMember`, líneas 252-271). Sin esto cualquier usuario autenticado podría suscribirse al canal de otra empresa.
- `chat:typing` exige que el socket ya esté en la sala (línea 183), así que no se puede saltar el control de `chat:join`.
- `chat:presence` se difunde solo dentro de la empresa (líneas 207-211).

Rate limiting: `wsConnectionGuard` limita conexiones por IP (40 por defecto, `WS_MAX_CONNECTIONS_PER_IP`, líneas 33-37).

**Difusión de `entity:updated`** — `apps/api/src/prisma/prisma.service.ts:388-414`

Emitido desde un middleware de Prisma en cada escritura. Acotado a `company:{id}` cuando hay contexto de inquilino (línea 409). El *fallback* global (línea 413) solo ocurre sin contexto de tenant (cron, seed) y transporta únicamente metadatos (`model`, `action`, `timestamp`) — sin `id` ni payload. Aceptable; está razonado en el comentario.

**Cliente Android** — `data/realtime/RealtimeClient.kt`, `RealtimeBus.kt`

Sí se conecta. `io.socket:socket.io-client:2.1.0` (`build.gradle.kts:151`). El token va en `auth.token` del handshake (`RealtimeClient.kt:145`), que es exactamente lo que el gateway lee primero (`realtime.gateway.ts:279`). Se conecta al arrancar sesión (`AuthRepository` llama `RealtimeBus.start(token)`) y se para en `logout()`.

`RealtimeBus` es un singleton con una sola conexión para toda la app, reconexión con backoff exponencial hasta 30 s (`RealtimeBus.kt:191-213`) y re-join automático de los canales al reconectar (`rejoinChannels`, línea 183). Escucha 8 eventos de chat más `entity:updated`.

**Proxy** — `deploy/traefik/nexara.yml`

El router `socket-io` (línea 98) cubre los 11 subdominios del ERP web pero **no** `api.nexara.com.mx`. No es un problema: el router `api-direct` (línea 131) es `Host('api.nexara.com.mx')` **sin `PathPrefix`**, así que captura `/socket.io` y lo manda a `nexara-api`. Traefik hace el upgrade a WebSocket de forma nativa, sin configuración adicional. La app móvil apunta a `https://api.nexara.com.mx` (`build.gradle.kts:29` + `ApiUrls.kt:11-14`), así que su socket enruta correctamente. **Sin defecto.**

---

## 2. Chat

### Estado: **funcional y completo**, con una ineficiencia de red.

`ChatScreen.kt` consume el socket de verdad, no hace polling como mecanismo primario:
- `chat:message`, `chat:message-updated`, `chat:message-deleted`, `chat:channel-updated`, `chat:members-changed`, `chat:typing`, `chat:channel-activity` — todos suscritos (`ChatScreen.kt:401-419`).
- `joinChatChannel` / `leaveChatChannel` al cambiar de canal (líneas 805-812, 900).
- Typing indicator emitido (línea 577); presencia online/away según el ciclo de vida (líneas 1261-1264).

**Polling de respaldo cada 3 s** mientras la pantalla está en primer plano (línea 1275). El problema es que `messagesNewSince` (`ChatRepository.kt:62-65`) **descarga la página completa de 50 mensajes y filtra en el cliente**, porque la API no tiene `sinceId` — solo `beforeId` y `aroundId`. Está documentado como deuda conocida en `docs/CHAT-REALTIME-MOBILE.md`. En campo con 3G eso son ~20 descargas por minuto de datos que casi siempre se tiran.

**Marcado de leídos:** sí. `markRead` en el cliente (`ChatRepository.kt:86-88`) y `lastReadAt` en la API (`chat.service.ts:784-790`).

**Adjuntos:** sí, multipart (`ChatApi.kt:169-171`, `ChatRepository.kt:120-130`). Límite de 20 MB en dos capas (`chat.controller.ts:232` y `chat.service.ts:1250`).

**Historial local:** **no hay.** Lo único persistido es `ChatFavoritesStore.kt` (canales favoritos en `SharedPreferences`). Los mensajes viven en memoria del ViewModel; al matar la app se pierden y hay que re-descargar. Sin señal, el chat solo muestra lo que quede en la cache HTTP genérica — que es precisamente la cache defectuosa del punto 5.

---

## 3. Notificaciones push

### Estado: **la tubería existe y funciona; el aterrizaje en el cliente está roto a medias.**

**Firebase:** presente y completo. `google-services.json` en `apps/mobile-native/android/app/`, plugin `com.google.gms.google-services` (`build.gradle.kts:8`), `firebase-bom:33.5.1` + `firebase-messaging-ktx` (líneas 172-173), y `NexaraFirebaseService : FirebaseMessagingService` declarado en el manifiesto (`AndroidManifest.xml:36-42`).

**La API sí manda push de verdad**, no solo guarda filas. `PushDispatchService.sendToUser()` (`apps/api/src/devices/push-dispatch.service.ts:60`) envía por FCM (`admin.messaging().send`, línea 82) y por Web Push VAPID (línea 120). `NotificationsService.create()` hace las dos cosas: emite `notification:new` por socket **y** dispara la push (`notifications.service.ts:319-335`).

**Registro del token:** en tres puntos — al hacer login (`LoginViewModel.kt:86`), en `MainActivity.onCreate` (`MainActivity.kt:59`, `refreshFcmToken()`) y en `onNewToken` cuando FCM rota el token (`NexaraFirebaseService.kt:20-29`). El backend hace `upsert` por `fcmToken` (`devices.service.ts:15-19`), así que es idempotente y además **reasigna el token al nuevo usuario** si otro se loguea en el mismo dispositivo — eso mitiga la fuga en dispositivos compartidos.

**Borrado al cerrar sesión: NO.** Ver defecto D5. `AuthRepository.logout()` (`data/AuthRepository.kt:163-166`) solo limpia la sesión y para el socket. `DevicesApi.revokePushToken` existe (`DevicesApi.kt:25-26`) pero **no se llama desde ningún sitio**, y además **el endpoint no existe en la API**: `DevicesController` tiene `@Delete('web-push')` pero no `@Delete('push-token')` (`devices.controller.ts:30-34`).

**Permiso Android 13+: sí se pide.** `askNotificationPermissionIfNeeded()` (`MainActivity.kt:174-180`) comprueba `SDK_INT >= TIRAMISU` y lanza el contrato `RequestPermission`. Correcto.

**Deep links:** `NotificationDeepLinkResolver.kt` cubre 18 tipos de entidad y 17 categorías — cobertura amplia. Pero ver defectos D6 y D7: en la práctica solo se usa la rama `relatedUrl`, y solo con la app en primer plano.

---

## 4. Medios: fotos y adjuntos

### Estado: **el punto más débil junto con offline.**

**Cómo sube una foto:** `MediaPickerBar.kt` ofrece cámara (`TakePicture`), galería (`PickMultipleVisualMedia`, el Photo Picker moderno — bien, no requiere `READ_MEDIA_*`) y documentos. El `Uri` resultante se copia a un temporal y se manda como `MultipartBody.Part` (patrón repetido en 9 sitios: `ChatRepository.kt:129`, `CrmRepository.kt:129`, `TicketsRepository.kt:112/148/164/299`, `ConsoleRepository.kt:465/502`, `StudioRepository.kt:105`).

**Compresión: ninguna.** Confirmado por búsqueda exhaustiva: `Bitmap`, `compress`, `inSampleSize`, `BitmapFactory` no aparecen en ningún `.kt` del proyecto. Una foto de 12 MP de un móvil moderno son 4-8 MB que salen enteros por la red. En 3G de campo (~200 kbps reales) eso son 3-5 minutos por foto, y el `writeTimeout` del cliente es de 22 s (`ApiClient.kt:28`) y 25 s en el replay (`OfflineSyncCoordinator.kt:38`). **La subida va a fallar por timeout de forma sistemática.** Esto además alimenta el defecto de duplicados (D2).

**Dónde aterrizan:** `uploads/` en la raíz del proyecto, servido por `express.static` (`main.ts:489`) bajo protección JWT (`main.ts:433-461`). Nota: la protección solo **verifica la firma** del token; no comprueba propiedad ni empresa, así que cualquier usuario autenticado de cualquier inquilino puede leer cualquier ruta de `/uploads` que adivine o le filtren. Lo dejo señalado como D12 por si al agente de RBAC no le entra en su alcance.

**Límites de tamaño: inconsistentes.**
- Chat: 20 MB en interceptor y servicio. Correcto.
- Logo de cliente: 5 MB + `fileFilter` (`client-portal.controller.ts:240-246`). Correcto.
- **Evidencias: sin límite** (`evidences.controller.ts:60` — `FilesInterceptor('files', 15)` sin `limits`).
- **Branch portal: sin límite** (`branch-portal.controller.ts:317, 383` — hasta 30 archivos).
- **Pagos a empleados: sin límite** (`employee-payments.controller.ts:121, 147`).

**Validación de contenido:** el chat usa una **lista negra** de extensiones (`chat.service.ts:25-27`: `.exe .bat .cmd .com .msi .scr .ps1 .sh .vbs .js .jar .app`). Es un enfoque frágil — `.svg`, `.html`, `.htm`, `.phtml` pasan. No se validan magic bytes en ningún punto de subida. El propio `main.ts:463-470` reconoce el problema en un comentario y mitiga sirviendo con tipo de una lista blanca + `nosniff`, lo cual reduce el riesgo de ejecución pero no impide almacenar el archivo.

**`OfflineMediaStore.kt` — supervivencia al cierre de la app:** los blobs van a `filesDir` (persistente, no `cacheDir`) y la cola a `filesDir/nexara_offline_queue.json`, así que **en teoría sí sobreviven**. En la práctica **este componente es código muerto en Android**: solo actúa sobre data URLs `base64` en cuerpos JSON (`externalizeDataUrls`, línea 19), y la app móvil nunca genera data URLs — sube todo por multipart. Es un port literal del cliente web (`apps/web/lib/offline-queue.ts`) que no aplica aquí. Y lo que sí pasa con multipart offline es peor: ver D3.

**Detalle menor pero visible para el usuario:** las fotos de cámara se escriben en `MediaStore.Images.Media.EXTERNAL_CONTENT_URI` bajo `Pictures/NEXARA` (`MediaPickerBar.kt:29-40`), es decir, **en la galería pública del teléfono**. Evidencias de trabajo (que pueden incluir instalaciones de clientes, documentos, matrículas) quedan en el carrete personal del operario y se sincronizan con Google Fotos.

---

## 5. Offline

### Estado: **la arquitectura es correcta; tres defectos de implementación la vuelven peligrosa.**

**Qué hay:** `NexaraOffline` (registro de singletons), `NetworkMonitor` (StateFlow sobre `ConnectivityManager`), `OfflineApiCache` (cache de GET en disco), `OfflineHttpInterceptor` (interceptor de OkHttp), `OfflineMutationQueue` (cola JSON persistente) y `OfflineSyncCoordinator` (replay con backoff). Instalado en `MainActivity.onCreate` (`MainActivity.kt:56`) y enganchado a todos los clientes HTTP (`ApiClient.kt:44-46`).

**Qué se cachea:** toda respuesta GET exitosa, hasta 512 KB por entrada (`OfflineHttpInterceptor.kt:48-51`). Sin TTL ni invalidación — una entrada cacheada se sirve indefinidamente mientras no haya red.

**Cola de mutaciones:** sí. POST/PUT/PATCH/DELETE se encolan cuando `NetworkMonitor` dice que no hay red, o cuando `chain.proceed` lanza `IOException` (`OfflineHttpInterceptor.kt:40-43, 66-69`). Se devuelve un 202 sintético con `X-Nexara-Offline: queued`.

**Al reconectar:** `OfflineSyncCoordinator.replay()` se dispara desde `NexaraScaffold.kt:43-49` cuando `isOnline` cambia a true, más botones manuales en `OfflineQueueScreen.kt`. Backoff exponencial 2^intentos con techo de 5 min, máximo 8 intentos, y descarte de errores 4xx permanentes (`OfflineSyncCoordinator.kt:28-29, 62-66`). Hay pantalla de gestión de cola con reintento individual. Todo eso está bien pensado.

**Los tres problemas:**

**a) Sin idempotencia (D2).** El replay construye la petición con solo `Authorization` y `Content-Type` (`OfflineSyncCoordinator.kt:70-75` y `171-176`). El `item.id` (UUID) nunca se manda. La API **sí** tiene `IdempotencyInterceptor` registrado como `APP_INTERCEPTOR` global (`audit.module.ts:17-20`), que lee la cabecera `idempotency-key`, la acota por `companyId` y devuelve la respuesta guardada si se repite (`idempotency.interceptor.ts:57, 103, 135`). La infraestructura existe entera y el cliente no la usa.

El escenario concreto que pidió el encargo: el operario marca asistencia en una zona con señal intermitente. La petición sale, el servidor la procesa y crea la asistencia, pero la respuesta se pierde antes de llegar (timeout de lectura a 25 s). El cliente ve `IOException` → encola → reintenta → **segunda asistencia**. Si vuelve a fallar la respuesta, tercera. Sin cabecera de idempotencia no hay nada que lo impida.

**b) Multipart corrompido en la cola (D3).** Cuando el interceptor encola una mutación hace:

```kotlin
val buffer = okio.Buffer()
b.writeTo(buffer)
buffer.readUtf8()          // OfflineHttpInterceptor.kt:76-78
```

y en el replay lo re-codifica con `expanded?.toRequestBody(...)` (`OfflineSyncCoordinator.kt:69`). Para un cuerpo multipart con un JPEG dentro, `readUtf8()` decodifica bytes binarios como UTF-8 y **sustituye cada secuencia inválida por U+FFFD**. Verificado:

```
original bytes : ffd8ffe000104a4649460001c328ffd9   (16 bytes)
round-tripped  : efbfbdefbfbdefbfbdefbfbd00104a4649460001efbfbd28efbfbdefbfbd   (30 bytes)
IDENTICAL      : false
```

Toda foto o adjunto que se capture sin señal se sube **corrupto e irrecuperable** al reconectar, y el servidor lo acepta con 200 porque el multipart sigue siendo sintácticamente válido. El operario ve "sincronizado" y el archivo es basura. Afecta a los 9 puntos de subida multipart.

**c) Cache compartida entre usuarios y nunca limpiada (D1).** La clave de cache es `SHA-256(url + "|" + authTag)` donde `authTag = request.header("Authorization")?.take(48)` (`OfflineHttpInterceptor.kt:25`, `OfflineApiCache.kt:14-18`). La cabecera es `"Bearer " + JWT`. Eso son 7 caracteres de `"Bearer "` + 36 del header base64url de un JWT HS256 (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`) + 1 del punto = 44. Quedan **4 caracteres del payload**, que para cualquier payload que empiece por `{"sub"` son siempre `eyJz`. Verificado:

```
userA authTag: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJz"
userB authTag: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJz"
COLLIDE (identical cache key): true
```

**El `authTag` es idéntico para todos los usuarios del sistema.** No discrimina nada. Y `OfflineApiCache.clear()` no se invoca en ningún punto del código — `logout()` no lo llama (`AuthRepository.kt:163-166`). Combinando ambas cosas: el usuario A trabaja sin señal, cierra sesión; el usuario B (otra empresa, otro rol) entra en el mismo dispositivo, se queda sin señal, y **ve los datos cacheados de A** en nóminas, clientes, cotizaciones o lo que A hubiera consultado. Es una fuga de datos entre usuarios y entre inquilinos.

**d) Pérdida silenciosa por 401.** `PERMANENT_CLIENT` incluye 401 (`OfflineSyncCoordinator.kt:29`). Si el token caduca mientras el operario está sin cobertura —lo normal en una jornada de campo— al reconectar el replay recibe 401 y **descarta la mutación** en vez de reintentarla tras renovar sesión. Las asistencias y evidencias de la jornada se pierden sin aviso. También un 413 (probable, dado que no hay compresión y el límite JSON es 10 MB, `main.ts:78`) no está en la lista de permanentes, así que reintenta 8 veces y luego también se descarta.

---

## Tabla de defectos

| ID | Severidad | Defecto | Evidencia | Arreglo propuesto |
|----|-----------|---------|-----------|-------------------|
| D1 | **BLOQUEANTE** | Cache offline compartida entre usuarios: el `authTag` colisiona para todos, y `clear()` nunca se llama. Fuga de datos entre usuarios y empresas. | `OfflineHttpInterceptor.kt:25`; `OfflineApiCache.kt:14-18, 31-33`; `AuthRepository.kt:163-166` | Derivar el `authTag` de `SHA-256(token completo)` o, mejor, de `userId+companyId` de la sesión. Y llamar `NexaraOffline.apiCache().clear()` + `mutationQueue().clear()` en `logout()` y al detectar cambio de usuario. |
| D2 | **BLOQUEANTE** | Cola offline no idempotente: se crean registros duplicados al reintentar. La API ya soporta `Idempotency-Key` y el cliente no la manda. | `OfflineSyncCoordinator.kt:70-75, 171-176`; `idempotency.interceptor.ts:57`; `audit.module.ts:17-20` | Añadir `.header("Idempotency-Key", item.id)` en ambas construcciones de `Request`. El UUID ya existe y es estable entre reintentos. Arreglo de una línea por sitio. |
| D3 | **BLOQUEANTE** | Multipart encolado offline se corrompe: `readUtf8()` destruye los bytes binarios de fotos y adjuntos. | `OfflineHttpInterceptor.kt:74-89`; `OfflineSyncCoordinator.kt:68-69` | Persistir el cuerpo como **bytes** (`buffer.readByteArray()` → archivo en `filesDir`) y en el replay usar `File.asRequestBody(contentType)`. Nunca pasar cuerpos binarios por `String`. |
| D4 | **BLOQUEANTE** | Sin compresión de imágenes. Fotos de 4-8 MB con timeouts de 22-25 s: la subida falla de forma sistemática en 3G de campo. | Ausencia total de `Bitmap`/`compress`/`inSampleSize` en `apps/mobile-native`; `ApiClient.kt:26-28`; `OfflineSyncCoordinator.kt:36-38` | Redimensionar el lado mayor a ~1600 px y `JPEG.compress(80)` antes de construir el `MultipartBody.Part`. Reduce ~20×. Un único helper reutilizable en los 9 puntos de subida. |
| D5 | ALTA | El token FCM nunca se revoca al cerrar sesión, y el endpoint que el cliente declara no existe en la API. Un ex-empleado sigue recibiendo notificaciones. | `DevicesApi.kt:25-26` (sin llamadas); `devices.controller.ts:30-34` (no hay `@Delete('push-token')`); `AuthRepository.kt:163-166` | Añadir `@Delete('push-token')` en `DevicesController` + `deleteMany` en el servicio, y llamarlo desde `logout()` antes de limpiar la sesión. |
| D6 | ALTA | El deep link desde push **no funciona con la app en background**, que es el caso normal. Los extras del intent no llevan el prefijo `nexara_` que el parser exige. | `MainActivity.kt:162-172` (filtra `startsWith("nexara_")`); `NexaraNotifications.kt:51` (solo la ruta foreground pone el prefijo); FCM auto-muestra en background y no llama `onMessageReceived` | Aceptar también claves sin prefijo en `pushDataFromIntent`, o quitar el prefijo y leer las claves tal cual las manda la API. |
| D7 | ALTA | Todas las push caen en el canal `nexara_default` (importancia normal). El servidor nunca manda la clave `channel` que el cliente busca, así que alertas urgentes no suenan como tales. | `NexaraFirebaseService.kt:34-39` lee `data["channel"]`; `push-dispatch.service.ts:67-74` nunca la envía | Añadir `channel` al `data` en `PushDispatchService` derivándolo de `category`/`priority`, y mapear `priority: 'high'` → `CHANNEL_ALERTS`. |
| D8 | ALTA | Un 401 en el replay **descarta** la mutación. Si el token caduca sin cobertura, se pierde la jornada de asistencias y evidencias. | `OfflineSyncCoordinator.kt:29` (401 en `PERMANENT_CLIENT`) | Sacar 401 de la lista de permanentes: al recibirlo, parar el replay, renovar sesión y reintentar. Considerar también 413 como permanente para no gastar 8 intentos. |
| D9 | ALTA | La API no envía `entityType`/`relatedEntityId`/`category` en el payload FCM, así que las ramas correspondientes del resolver son código muerto: solo funciona `relatedUrl`. | `push-dispatch.service.ts:67-74, 85-92`; `NotificationDeepLinkResolver.kt:57-60, 102-178` | Incluir `entityType`, `relatedEntityId` y `category` en el `data` del mensaje FCM. |
| D10 | ALTA | Tokens FCM inválidos nunca se purgan: el error se registra y se sigue. La tabla crece con endpoints muertos indefinidamente. | `push-dispatch.service.ts:105-109` | Al capturar `messaging/registration-token-not-registered` o `invalid-argument`, borrar la fila de `userPushEndpoint`. |
| D11 | ALTA | Varios puntos de subida sin límite de tamaño: evidencias (15 archivos), branch portal (30), pagos a empleados (10). | `evidences.controller.ts:60`; `branch-portal.controller.ts:317, 383`; `employee-payments.controller.ts:121, 147` | Añadir `limits: { fileSize: N * 1024 * 1024 }` en todos los `FilesInterceptor`, igual que ya hace chat. |
| D12 | MEDIA | `/uploads` solo verifica la firma del JWT; no comprueba propiedad ni empresa. Cualquier usuario autenticado lee cualquier archivo cuya ruta conozca. | `main.ts:433-461` (solo `jwt.verify`) | Resolver el recurso propietario a partir de la ruta y comprobar `companyId` contra el token. Coordinar con el agente de RBAC. |
| D13 | MEDIA | Las fotos de cámara se guardan en la galería pública del teléfono (`Pictures/NEXARA`), no en almacenamiento privado de la app. | `MediaPickerBar.kt:29-40` | Usar `FileProvider` sobre `context.filesDir` (el provider ya está declarado en `AndroidManifest.xml:50-58`) en vez de `MediaStore.EXTERNAL_CONTENT_URI`. |
| D14 | MEDIA | `OfflineMediaStore` es código muerto en Android: solo procesa data URLs, y la app sube todo por multipart. Da falsa sensación de que los medios offline están resueltos. | `OfflineMediaStore.kt:19-32, 89-94`; ningún `Base64.encode` fuera de este archivo | Eliminarlo o reorientarlo al almacenamiento de cuerpos binarios que pide D3. |
| D15 | MEDIA | Lista **negra** de extensiones en adjuntos de chat, sin validación de magic bytes. `.svg`, `.html`, `.htm` pasan. | `chat.service.ts:25-27, 1253-1256` | Cambiar a lista blanca de extensiones y verificar magic bytes del contenido real. |
| D16 | MEDIA | El polling de chat cada 3 s descarga la página completa de 50 mensajes y filtra en cliente, porque la API no tiene `sinceId`. Consumo de datos innecesario en campo. | `ChatRepository.kt:61-65`; `ChatScreen.kt:1271-1276`; `docs/CHAT-REALTIME-MOBILE.md` | Añadir `sinceId`/`afterId` a `GET /chat/channels/:id/messages`. Con el socket funcionando, subir además el intervalo de 3 s a 30 s. |
| D17 | MEDIA | `NetworkMonitor` comprueba `NET_CAPABILITY_INTERNET` pero no `NET_CAPABILITY_VALIDATED`: con portal cautivo o datos agotados se cree online. | `NetworkMonitor.kt:22-24, 37-39` | Añadir `NET_CAPABILITY_VALIDATED`. Mitigado en parte porque el `IOException` también encola, pero el usuario ve el banner en verde. |
| D18 | MEDIA | Sin historial local de chat: al matar la app se pierden los mensajes y sin señal solo queda la cache HTTP genérica (defectuosa por D1). | `ChatFavoritesStore.kt` solo guarda favoritos; no hay persistencia de mensajes | Persistir las últimas N páginas por canal en Room o en un JSON por canal, con la clave de usuario correcta. |
| D19 | MEDIA | Cache de GET sin TTL ni invalidación: una entrada se sirve indefinidamente sin red. | `OfflineApiCache.kt:25-29` | Guardar timestamp junto al cuerpo y descartar entradas por encima de un umbral (p. ej. 24 h), o al menos marcar la antigüedad en la UI. |

---

## Resumen

**Las cinco respuestas, primero:**

1. **¿Llegan las push a Android 13+?** Sí — el permiso se pide correctamente en runtime (`MainActivity.kt:174-180`). Pero tocarlas no navega a ningún sitio con la app en background (D6) y todas suenan como notificación normal, nunca como alerta (D7).
2. **¿Se comprimen las fotos?** No. Cero compresión en toda la app. Con timeouts de 22-25 s y fotos de 4-8 MB, la subida en 3G de campo falla de forma sistemática (D4).
3. **¿La cola offline es idempotente?** No (D2). Lo llamativo es que la API tiene `IdempotencyInterceptor` global funcionando y el cliente simplemente no manda la cabecera. Es el arreglo más barato de todo el informe: una línea en dos sitios.
4. **¿Se limpia la cache al cambiar de usuario?** No, y además la clave de cache es idéntica para todos los usuarios (D1) — verificado empíricamente. Fuga de datos entre usuarios y entre empresas.
5. **¿El socket autentica y aísla por empresa?** Sí, y bien. JWT en middleware de handshake antes de establecer el socket, salas por empresa/usuario/canal, y `chat:join` con verificación de membresía en base de datos y fallo cerrado.

**Lectura de conjunto.** Hay una asimetría clara entre las capas. El tiempo real y el chat están bien construidos: el gateway es de los componentes más cuidados del repositorio, con las decisiones difíciles (auth en handshake, no en `handleConnection`; fallo cerrado en la membresía) tomadas correctamente y documentadas. El cliente Android lo consume de verdad, con reconexión y re-join. El proxy enruta bien: comprobé que `api-direct` captura `/socket.io` aunque el router `socket-io` no liste el host de la API.

El problema está en offline y medios, y no es de diseño sino de implementación. La arquitectura offline es la correcta —interceptor, cola persistente, backoff, pantalla de gestión— pero tiene tres defectos que la vuelven activamente peligrosa: duplica registros, corrompe fotos y filtra datos entre usuarios. Los tres son de una capa de profundidad: la cabecera que no se manda, el `readUtf8()` sobre binario, el `take(48)` que no discrimina nada. Ninguno requiere rediseño.

**Cuatro defectos son BLOQUEANTES para v2 en Play** (D1 a D4), y conviene verlos como un conjunto: los cuatro convergen en el operario de campo con mala señal, que es exactamente el usuario para el que se hizo la app. Marca asistencia y se duplica; sube la foto y no sube, o sube corrupta; y si el teléfono pasa por dos manos, un usuario ve datos del otro.

**Orden de arreglo sugerido, por coste/impacto:**
1. **D2** — añadir `Idempotency-Key` en dos sitios. Una línea cada uno; la infraestructura del servidor ya está.
2. **D1** — corregir el `authTag` y limpiar cache y cola en `logout()`. Media hora, y cierra la fuga de datos.
3. **D4** — helper de compresión antes del `MultipartBody.Part`. Reduce el peso ~20× y desactiva buena parte de los timeouts que alimentan D2.
4. **D3** — persistir cuerpos binarios como bytes en vez de `String`. El más invasivo de los cuatro, pero acotado a `OfflineHttpInterceptor` y `OfflineSyncCoordinator`.

Después, D5/D6/D7 son baratos y arreglan que las notificaciones se sientan rotas: hoy llegan pero no llevan a ninguna parte, no distinguen urgencia y siguen llegando a quien ya no trabaja aquí.

**Nota sobre `docs/CHAT-REALTIME-MOBILE.md`:** el documento es honesto y está al día. Reconoce la deuda del polling y la falta de `sinceId`. No encontré contradicciones entre lo documentado y el disco en esta área.
