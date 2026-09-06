# 10 — Lanzamiento de la v2 en Google Play

**Fecha:** 06-09-2026 · **Rama:** `mejora/calidad-y-web` · **Turno:** remediación (Claude Code)

Este documento **reemplaza** la auditoría de solo lectura anterior. Aquella se escribió
sobre el estado del 31-08 y **quedó obsoleta**: entre medias hubo un turno de remediación
grande. Todo lo que sigue está reverificado contra el código de hoy, y varios de los
bloqueantes de la versión anterior ya no existen.

No se abrió `key.properties` ni `nexara-upload.jks`. No se ejecutó ninguna build de release
ni se firmó nada. No se transcribe ningún secreto.

---

## 0. Resumen en diez líneas

La configuración de release está **mejor que nunca**: Crashlytics ya integrado, Firebase
Analytics fuera (y con él los tres permisos de publicidad), permisos reducidos a los seis que
la app realmente usa, `targetSdk=36`, cleartext bloqueado, 16 KB verificado, y `VERSION_CODE`
ya en 7.

Lo que queda **no es configuración**: es **un AAB obsoleto en disco** que cualquiera puede
subir por error, **una declaración de Data Safety que ya no coincide con la app**, y **tres
defectos de runtime** que solo se ven en release o en teléfonos concretos.

Y una cosa que sí estaba a punto de hundir la v2 y ya no: las reglas de R8 eran correctas
**por coincidencia**, no por diseño. Ver §4.

---

## 1. Qué cambió desde la auditoría del 31-08

Reverificado uno por uno. Esto importa porque el documento anterior sigue circulando.

| Hallazgo anterior | Estado hoy | Evidencia |
|---|---|---|
| **B2** — `AD_ID` + `ACCESS_ADSERVICES_*` en el manifiesto por `firebase-analytics-ktx` | ✅ **RESUELTO** | `firebase-analytics-ktx` ya no está en `build.gradle.kts`. El informe de fusión **del 06-09** (`manifest-merger-debug-report.txt`) no contiene `AD_ID`, `ADSERVICES`, ni `BIND_GET_INSTALL_REFERRER_SERVICE`. Solo queda `firebase-measurement-connector`, que no aporta permisos |
| **R1** — Cero telemetría de fallos | ✅ **RESUELTO** | Plugin `com.google.firebase.crashlytics` 3.0.2 + `firebase-crashlytics-ktx`. La tarea `injectCrashlyticsMappingFileIdRelease` aparece en el grafo de `bundleRelease` → el `mapping.txt` se sube solo |
| **R9** — `VIBRATE` y `READ_EXTERNAL_STORAGE` declarados sin usarse | ✅ **RESUELTO** | Ninguno de los dos aparece ya ni en el manifiesto fuente ni en el fusionado |
| **R2** — Crash al arranque si falla el Keystore | ✅ **RESUELTO** (con matiz) | `SessionStore.openPrefs()` ya envuelve `EncryptedSharedPreferences.create` en `try/catch`. **Matiz nuevo:** el fallback guarda el token en `SharedPreferences` **sin cifrar** → ver R-C |
| **R3** — Cámara rota en Android 7–9 | ⚠️ **PARCIAL** | Ya hay gate `SDK_INT >= Q` para `RELATIVE_PATH`. Pero sigue el `insert()` sobre `EXTERNAL_CONTENT_URI` → ver R-B |
| **R4** — Banner offline bajo la barra de estado | ❌ **ABIERTO** | `grep` de `statusBarsPadding\|systemBarsPadding\|safeDrawingPadding\|WindowInsets\.` sobre todo `app/src/main/java` → **0 resultados** |
| **R7** — Sin reglas de transferencia D2D | ✅ **ARREGLADO ESTE TURNO** | Ver §7 |
| **R5/R6** — Placeholder de Maps y firma de debug silenciosa | ✅ **ARREGLADO ESTE TURNO** | Ver §7 |
| **R12** — Sin `values-night` ni icono monocromo | ❌ **ABIERTO** | `res/values-night/` no existe; `mipmap-anydpi-v26/ic_launcher.xml` sin `<monochrome>` |
| **B1** — Versionado | ⚠️ **CAMBIÓ DE FORMA** | `VERSION_CODE=7` ya está puesto. Pero el AAB en disco sigue siendo el del 31-08 → ver **B1** abajo |

---

## 2. Bloqueantes

Impiden publicar, o publican algo distinto de lo que crees.

### B1 — El AAB en disco tiene seis días y le falta una semana de trabajo

**Verificado ejecutando el smoke:**

```
AAB    : 31/08/2026 14:06:10   app-release.aab  (24.85 MB)
Fuente : 06/09/2026 17:38:49   ui/console/ConsoleAccessRules.kt
```

Ese bundle se compiló con `versionCode 5` y **no contiene** ninguno de los commits del 06-09
(las tres olas de paridad móvil, `/me/navigation`, INTEGRA, portal de sucursal…). Si se sube,
se publica código de hace una semana con un número de versión nuevo — y Play consume ese
`versionCode` para siempre.

Peor: hasta este turno, `scripts/mobile-smoke-checklist.ps1` **daba ese AAB por bueno**. Solo
comprobaba que el fichero existiera.

**Acción:** recompilar. El script de build ahora borra el bundle anterior antes de compilar,
y el smoke falla si el AAB es más viejo que la fuente.

```powershell
pwsh -File scripts/build-play-aab.ps1 -BumpVersionCode -Clean
```

### B2 — La declaración de Data Safety ya no coincide con la app

La v1 se declaró (según `PLAY-STORE-CHECKLIST.md` §6.5 tal como estaba) con **«Interacciones
en la app — Firebase Analytics»**. Analytics **ya no está en el build**. Y Crashlytics, que sí
está ahora, obliga a declarar **«Registros de fallos»** y **«Diagnósticos»**, que antes no
figuraban.

Declarar datos que ya no recoges es tan sancionable como omitir los que sí. Y la respuesta a
*Contenido de la app → **ID de publicidad*** pasa de **Sí** a **No**.

**Acción:** rehacer el formulario con el borrador de §5. Ya está redactado y cruzado contra
el código.

### B3 — Confirmar el `versionCode` real contra Play Console

`VERSION_CODE=7` es una suposición del repositorio, no un dato. Play no reutiliza un
`versionCode` **subido**, aunque el bundle se descartara o nunca se publicara — y el historial
dice que hubo al menos dos rechazos con bundles intermedios.

**Acción:** *Play Console → Versiones → Panel de la app* → anotar el mayor **subido** y poner
ese número + 1. Es un minuto y evita un ciclo de subida perdido.

---

## 3. Riesgos

Pasan la revisión, pero rompen la app en campo. **Los tres primeros son Kotlin: no los toqué**
(este turno tenía prohibido tocar `.kt`). Quedan para el siguiente turno.

| # | Riesgo | Sev. | Evidencia | Arreglo |
|---|---|---|---|---|
| **R-A** | **Edge-to-edge obligatorio y cero gestión de insets.** `MainActivity` llama `enableEdgeToEdge()` y `NexaraScaffold` pone `OfflineBanner` como primer hijo de una `Column(fillMaxSize())` sin padding. Con `targetSdk=36`, Android 15+ **fuerza** edge-to-edge sin escapatoria | **Alta** | 0 resultados de `statusBarsPadding\|systemBarsPadding\|safeDrawingPadding\|WindowInsets\.` en todo `app/src/main/java` | `Modifier.statusBarsPadding()` en la `Column` de `NexaraScaffold`. Los 62 `Scaffold(` internos sí están bien (Material3 aplica insets por defecto) |
| **R-B** | **Captura de evidencias en Android 7–9.** El gate de `RELATIVE_PATH` ya está, pero `freshCameraOutputUri()` sigue haciendo `insert()` sobre `MediaStore.Images.Media.EXTERNAL_CONTENT_URI`, que en API 24–28 exige `WRITE_EXTERNAL_STORAGE` — permiso **no declarado** (y que no conviene declarar). `minSdk=24` | **Alta** | `ui/common/MediaPickerBar.kt` | Migrar a `FileProvider` + `getExternalFilesDir`. El provider ya existe y `xml/nexara_file_paths.xml` ya está configurado. Probar en emulador API 24 **y** 28 |
| **R-C** | **El fallback de sesión guarda el token sin cifrar.** Si el Keystore falla, `SessionStore.openPrefs()` cae a `getSharedPreferences("nexara_session_fallback", MODE_PRIVATE)` — texto plano. Ya no crashea (bien), pero degrada en silencio la seguridad de la sesión | **Media-alta** | `data/SessionStore.kt:207-209` | Mejor forzar re-login que persistir el token en claro. Como mínimo, marcarlo y no persistir el token en esa rama. Ya lo excluí de backup y D2D (§7), pero eso no lo cifra |
| **R-D** | **`security-crypto` en `1.1.0-alpha06`.** Una versión alfa sosteniendo el token de sesión en producción | **Media** | `app/build.gradle.kts` | Evaluar salida a una estable, o asumirlo conscientemente. Cambiar la versión toca el árbol de dependencias: no lo hice sin poder probar el release |
| **R-E** | **Artefacto de build versionado con la API key de Maps.** `apps/mobile-native/android/base/manifest/AndroidManifest.xml` está **en git** (`git ls-files` lo lista) y es el manifiesto descompilado del AAB de la v1: lleva la clave de Maps en claro y `versionCode=4` | **Media** | `git ls-files apps/mobile-native/android/base` | La clave viaja igual dentro de cualquier APK, así que el control real **no** es ocultarla sino **restringirla** por *package name* + SHA-1 (ver C-4). Aun así ese fichero no pinta nada en el repo: es basura de build. Borrarlo y añadir `base/` al `.gitignore`. **No lo toqué: está fuera de mi propiedad de ficheros en este turno** |
| **R-F** | **Sin CI de Android.** 51 `@Test` JVM existen y nadie los ejecuta automáticamente. `.github/workflows/ci.yml` no tiene ningún paso de Android | **Media** | `ci.yml` | Job con `setup-java@v4` (JDK 17) + `gradlew testDebugUnitTest lintRelease` |
| **R-G** | **Sin `values-night` ni icono monocromo.** `windowBackground` es `@color/white`: destello blanco al abrir en modo oscuro, antes de que Compose pinte | **Baja** | `res/values/themes.xml:6`; `mipmap-anydpi-v26/*.xml` sin `<monochrome>` | Calidad de ficha, no bloqueo. `res/values/` está fuera de mi propiedad este turno |

---

## 4. Veredicto ProGuard / R8

### Antes de este turno: **correcto por coincidencia, no por diseño**

El riesgo era real y sigue siendo el más caro posible. La app usa Moshi con
**`KotlinJsonAdapterFactory`** — adaptador **reflexivo**, no generado por KSP — en **ocho
sitios distintos**:

```
data/api/ApiClient.kt              data/crm/CrmRepository.kt
data/extra/ExtraRepository.kt      data/integra/IntegraRepository.kt
data/offline/OfflineMutationQueue.kt   data/ops/OpsRepository.kt
data/studio/StudioRepository.kt    ui/studio/StudioMoreScreens.kt
```

Ese adaptador deriva las claves JSON de los nombres de propiedad que lee de
`@kotlin.Metadata`. Si R8 renombra un DTO, **no falla al compilar ni al arrancar**: las listas
salen vacías o con campos nulos, **solo en release**. El debug nunca lo detecta porque el
debug no pasa por R8.

**Por qué funcionaba:** las reglas cubrían cuatro paquetes (`data.api`, `data.console`,
`data.realtime`, `data.tickets`) y resulta que **todos los DTOs viven en `data.api`** —
verificado: los `import` de `crm`, `extra`, `studio`, `integra`, `ops`, `console`, `tickets`,
`offline` y `realtime` traen sus tipos exclusivamente de `mx.nexara.mobile.nativeapp.data.api`.
Los `parseList<reified T>` se instancian siempre con tipos de ahí, y el resto parsea a
`Map<String, Any?>`, inmune por definición.

**Por qué era frágil:** el día que alguien declare un DTO fuera de esos cuatro paquetes —y hay
16 paquetes bajo `data/`— R8 lo ofusca, la app no se queja, y el listado sale vacío en
producción. La garantía dependía de una convención que nadie hacía cumplir.

Había además **un DTO que ya estaba fuera**: `data.offline.QueuedMutation`, salvado únicamente
por la regla `-keep @com.squareup.moshi.JsonClass class * { *; }`, es decir, por una anotación
decorativa (no hay procesador KSP que la implemente). **Y esa clase se persiste en disco**
(`nexara_offline_queue.json`) y sobrevive a las actualizaciones: si un cambio en las reglas la
hubiera ofuscado, las mutaciones que la v1 dejó encoladas serían ilegibles para la v2 y **el
trabajo de campo pendiente se perdería en silencio al actualizar**.

### Después de este turno: **correcto por diseño**

Reescribí `proguard-rules.pro` para que la garantía sea estructural (§7). Ahora protege por
**forma del nombre** (`**Dto`, `**Request`, `**Response`, `**Body`, `**Payload`, `**Event` en
cualquier paquete) y por **anotación**, no por una lista de paquetes que se queda obsoleta.
`data.offline` queda protegido explícitamente, no por accidente.

### Veredicto

**La deserialización JSON no se rompe en release.** Pero esto sigue siendo verificable solo de
una forma, y no hay atajo: **instalar el AAB minificado en un teléfono real y recorrer un
listado por panel.** Un listado vacío en release y lleno en debug es la firma exacta de una
regla `keep` que falta. Está en el checklist de §6 como paso no omitible.

---

## 5. Permisos

### 5.1 Declarados en `AndroidManifest.xml` — los seis

Cruzado por `grep` contra el uso real en `app/src/main/java`.

| Permiso | ¿Usado? | Evidencia en código | ¿Declaración en la ficha? |
|---|---|---|---|
| `INTERNET` | **Sí** | Retrofit/OkHttp — `data/api/ApiClient.kt` | No |
| `ACCESS_NETWORK_STATE` | **Sí** | `data/offline/NetworkMonitor.kt:21-38` (`registerNetworkCallback`) | No |
| `ACCESS_FINE_LOCATION` | **Sí** | `util/DeviceLocation.kt`, `ui/console/screens/ConsoleGpsScreen.kt`, `ui/common/LocationPermissionBanner.kt` | **Sí** → Data Safety: *Ubicación precisa*, opcional. **No** dispara el formulario de ubicación en segundo plano |
| `ACCESS_COARSE_LOCATION` | **Sí** | Mismos ficheros | **Sí** → *Ubicación aproximada*, opcional |
| `CAMERA` | **Sí** | `ui/common/BarcodeScannerScreen.kt` (CameraX + ML Kit), `ui/common/MediaPickerBar.kt` (`TakePicture`) | **Sí** → *Fotos y videos*, opcional |
| `POST_NOTIFICATIONS` | **Sí** | `MainActivity.kt`, `push/NexaraNotifications.kt` | No, pero conviene justificar el push en la descripción (ya está) |

**Ningún permiso declarado está sin usar.** Los dos que sobraban (`VIBRATE`,
`READ_EXTERNAL_STORAGE`) ya se quitaron en el turno anterior.

### 5.2 Heredados de librerías — manifiesto fusionado del 06-09

| Permiso | Origen | ¿Declaración? |
|---|---|---|
| `USE_BIOMETRIC` | `androidx.biometric` — usado en `security/AppLock.kt` | No |
| `USE_FINGERPRINT` | `androidx.biometric` (legacy API < 28) | No |
| `WAKE_LOCK` | FCM / Play Services | No |
| `com.google.android.c2dm.permission.RECEIVE` | FCM — usado en `push/NexaraFirebaseService.kt` | No |
| `mx.nexara...DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | `androidx.core`, `protectionLevel="signature"` | No |

**Once permisos en total en el manifiesto fusionado. Ninguno es sensible.**

### 5.3 Lo que **no** está — y por eso no hay formularios extra

`QUERY_ALL_PACKAGES`, `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`, `MANAGE_EXTERNAL_STORAGE`,
`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE*`, `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`,
`WRITE_EXTERNAL_STORAGE`, SMS, registro de llamadas, `REQUEST_INSTALL_PACKAGES`, accesibilidad.

Y, nuevo desde el 31-08: **`AD_ID`, `ACCESS_ADSERVICES_AD_ID` y `ACCESS_ADSERVICES_ATTRIBUTION`
tampoco están** (verificado en el informe de fusión del 06-09). No hace falta el formulario de
permisos restringidos, y el **ID de publicidad se declara «No»**.

El único `<queries>` es `com.google.android.apps.maps`, inyectado por el SDK de Maps. Inocuo.

---

## 6. Borrador de Seguridad de los datos (Data Safety)

Redactado para copiar al formulario. **Lo llena Adam.** La versión de referencia, con las
rutas de código de cada fila, vive en `docs/PLAY-STORE-CHECKLIST.md` §6.5 — que también se
actualizó en este turno.

### Datos recopilados

| Categoría Play | Tipo | Recopila | Comparte | Oblig./Opc. | Fin |
|---|---|---|---|---|---|
| Información personal | Nombre | Sí | No | Obligatorio | Funciones de la app; gestión de la cuenta |
| Información personal | Correo electrónico | Sí | No | Obligatorio | Funciones de la app; gestión de la cuenta |
| Información personal | Otros ID de usuario | Sí | No | Obligatorio | Funciones de la app |
| Ubicación | Ubicación precisa | Sí | No | **Opcional** | Funciones de la app (asistencia, trabajo en campo) |
| Ubicación | Ubicación aproximada | Sí | No | **Opcional** | Funciones de la app |
| Fotos y videos | Fotos | Sí | No | **Opcional** | Funciones de la app (evidencias) |
| Archivos y documentos | Archivos y documentos | Sí | No | **Opcional** | Funciones de la app (adjuntos) |
| Actividad en la app | Otras acciones | Sí | No | Obligatorio | Funciones de la app (asistencia y actividad operativa) |
| Info. y rendimiento | **Registros de fallos** | **Sí — NUEVO** | No | Obligatorio | Análisis de fallos |
| Info. y rendimiento | **Diagnósticos** | **Sí — NUEVO** | No | Obligatorio | Análisis de fallos |
| ID de dispositivo | ID del dispositivo | Sí | No | Obligatorio | Funciones de la app (push) |

### Responder «No» explícitamente

- **Interacciones en la app / analítica de producto** — *estaba en «Sí» en la v1; ahora es
  **No***: Firebase Analytics ya no está en el build.
- **ID de publicidad** — *ahora es **No***.
- Información financiera o de pago, contactos, calendario, SMS, salud, mensajes, historial de
  navegación, audio.

### Transversales

| Pregunta | Respuesta | Sustento |
|---|---|---|
| ¿Cifrado en tránsito? | **Sí** | `network_security_config.xml` → `cleartextTrafficPermitted="false"` |
| ¿Se puede pedir la eliminación de datos? | **Sí** | https://nexara.com.mx/legal/eliminar-cuenta |
| ¿Se comparten con terceros? | **No** | Google (FCM, Crashlytics) es **encargado del tratamiento**, no destinatario — en el formulario de Play eso no cuenta como «compartir» |
| ¿Recopilación opcional? | **Parcial** | Ubicación, fotos y archivos se piden en runtime; identidad y push son necesarios |
| Ubicación en segundo plano | **No aplica** | Sin `ACCESS_BACKGROUND_LOCATION` ni `FOREGROUND_SERVICE` |
| ¿Auditoría de seguridad externa? | **No** | No es requisito |

**Antes de enviar:** confirmar que https://nexara.com.mx/legal/privacidad menciona ubicación,
fotos, identificadores de dispositivo **y registros de fallos**. Si el aviso no los nombra, el
formulario y la política se contradicen — y eso sí es motivo de retirada.

---

## 7. Qué se arregló en código en este turno

Todo verificado: `gradlew help`, `gradlew bundleRelease --dry-run` (dispara el preflight sin
compilar ni firmar) y `gradlew :app:processDebugResources` pasan. Los dos scripts pasan el
parser de PowerShell y el smoke se ejecutó de verdad.

| Fichero | Cambio | Por qué |
|---|---|---|
| `app/proguard-rules.pro` | **Reglas de Moshi estructurales**: `**Dto`, `**Request`, `**Response`, `**Body`, `**Payload`, `**Event` en cualquier paquete + `@Json` en campos. `keep` explícito de `data.offline` (cola persistida), `data.crm`, `data.extra`, `data.integra`, `data.ops`, `data.studio` | La garantía dependía de una convención no verificada. Ver §4 |
| `app/proguard-rules.pro` | `-keepattributes SourceFile,LineNumberTable` + `-renamesourcefileattribute SourceFile` | Sin esto los stack traces de Crashlytics llegan sin número de línea. Se acababa de integrar Crashlytics; habría reportado a ciegas |
| `app/proguard-rules.pro` | Reglas estándar que faltaban: enums (Moshi los serializa por nombre), `Parcelable.CREATOR`, `Serializable`, métodos nativos, `DefaultConstructorMarker` | Huecos clásicos de R8. Los enums son el más peligroso con Moshi |
| `app/proguard-rules.pro` | `keep` + `dontwarn` de `com.google.crypto.tink.**` y `com.google.protobuf.**` | `security-crypto` empaqueta Tink, que resuelve primitivas por reflexión. Si R8 recorta ahí, `EncryptedSharedPreferences` revienta al abrir la sesión — crash al arranque solo en release |
| `res/xml/data_extraction_rules.xml` (nuevo) | Excluye `nexara_session`, `nexara_session_fallback`, `nexara_offline_queue.json` y `nexara_device` de `<cloud-backup>` y `<device-transfer>` | `allowBackup="false"` corta la nube pero **no** la transferencia D2D en Android 12+. El fichero de sesión cifrado viajaría a un teléfono nuevo **sin su clave maestra** (vive en el Keystore y no se transfiere) |
| `AndroidManifest.xml` | `android:dataExtractionRules="@xml/data_extraction_rules"` | Referencia del anterior. Verificado que enlaza con `processDebugResources` |
| `app/build.gradle.kts` | **Preflight de release**: aborta `bundleRelease`/`assembleRelease` si falta `key.properties`, si `GOOGLE_MAPS_API_KEY` está vacía o es el placeholder, o si falta `VERSION_CODE`/`VERSION_NAME` | Los tres producían un AAB que compilaba bien y fallaba después: firmado en debug, mapas en blanco, o `versionCode=1`. Debug y tests no se tocan. **Probado con `--dry-run`: imprime `Preflight de release OK — versionCode=7 versionName=1.0.1`** |
| `app/build.gradle.kts` | Deduplicadas `datastore-preferences` (1.1.1 + 1.1.7) y `activity-compose` (x2); bloque `lint` con `checkReleaseBuilds` | Ruido que confunde al leer el árbol de dependencias |
| `scripts/build-play-aab.ps1` | `-BumpVersionCode`, `-VersionCode`, `-VersionName`; **borra el AAB anterior antes de compilar**; archiva `mapping.txt` con su `versionCode` en `play-releases/` (con `.gitignore` propio) | El bump y la compilación ya no pueden desincronizarse. Y si el build falla, no queda un bundle viejo en disco al que subir por error — que es exactamente **B1** |
| `scripts/mobile-smoke-checklist.ps1` | **Falla si el AAB es más viejo que el último fichero fuente** | Antes solo comprobaba que existiera, y por eso dio por bueno un bundle de hace seis días. Ejecutado: detecta el AAB obsoleto actual |
| `docs/PLAY-STORE-CHECKLIST.md` §6.5 | Data Safety rehecho: fuera Analytics, dentro Crashlytics, `AD_ID` → «No» | La tabla anterior describía una app que ya no existe |
| `docs/ANDROID-RELEASE.md` | Versionado real (7 / 1.0.1), sección de preflight, y la regla de que Play no reutiliza un `versionCode` **subido** | Documentaba `VERSION_CODE=1` / `0.1.0` |
| `docs/STORE-UPLOAD-READY.md` | Versión real y aviso sobre el AAB obsoleto | Documentaba `VERSION_CODE=2` |

**No se tocó ningún `.kt`, ni `apps/web/`, ni `apps/api/`.** Los hallazgos que requieren Kotlin
están en §3 como R-A, R-B y R-C.

---

## 8. Cumplimiento técnico — verificado hoy

| Requisito | Estado | Evidencia |
|---|---|---|
| Salida AAB, no APK | ✅ | `bundleRelease` → `app-release.aab` |
| `targetSdk` vigente | ✅ | `targetSdk = 36`, `compileSdk = 36`, `minSdk = 24`. Es el nivel estable más alto. **Confirmar en Play Console el nivel exigido vigente**: el corte es anual y no conviene deducirlo |
| 16 KB page size | ✅ | `packaging.jniLibs.useLegacyPackaging = false`; CameraX 1.4.2 (trae `libimage_processing_util_jni.so` alineado) y ML Kit 17.3.0. Los `.so` presentes: `libbarhopper_v3`, `libimage_processing_util_jni`, `libandroidx.graphics.path`, `libdatastore_shared_counter`, `libsurface_util_jni` |
| Tráfico en claro bloqueado | ✅ | `src/main/res/xml/network_security_config.xml` → `cleartextTrafficPermitted="false"`. El overlay que permite HTTP a `localhost`/`10.0.2.2` vive en `src/debug/` y **no entra en release** |
| `allowBackup` | ✅ nube **y** ✅ D2D | `allowBackup="false"` + `dataExtractionRules` añadido este turno |
| R8 activo + símbolos nativos | ✅ | `isMinifyEnabled = true`, `isShrinkResources = true`, `ndk.debugSymbolLevel = "SYMBOL_TABLE"` |
| Telemetría de fallos | ✅ | Crashlytics integrado; `injectCrashlyticsMappingFileIdRelease` en el grafo de `bundleRelease` |
| Secretos fuera de git | ✅ con salvedad | `key.properties`, `*.jks`, `local.properties` y `*.aab` están en `.gitignore` y no aparecen en `git ls-files`. **Salvedad:** `android/base/manifest/AndroidManifest.xml` sí está versionado — ver R-E |
| Predictive back | ✅ | `android:enableOnBackInvokedCallback="true"` |
| Política de privacidad y borrado de cuenta | ✅ existen en código | `apps/web/app/legal/privacidad/` y `apps/web/app/legal/eliminar-cuenta/`. **Falta confirmar que responden 200 en producción** — ver C-3 |

---

## 9. Checklist final — en el orden exacto de ejecución

Cada bloque depende del anterior. No saltes de bloque.

### A · Antes de compilar (Play Console y web, 15 min)

- [ ] **C-1** — *Play Console → Versiones → Panel de la app*: anotar el **`versionCode` más alto
      SUBIDO** (incluidos bundles descartados). Si es ≥ 7, poner `VERSION_CODE` a ese + 1.
- [ ] **C-2** — *Contenido de la app → ID de publicidad*: cambiar a **NO**. Analytics ya no está.
- [ ] **C-3** — Confirmar que las dos URLs responden **200** en producción:
      ```bash
      curl -o /dev/null -w "%{http_code}\n" https://nexara.com.mx/legal/privacidad
      curl -o /dev/null -w "%{http_code}\n" https://nexara.com.mx/legal/eliminar-cuenta
      ```
- [ ] **C-4** — Confirmar que el **SHA-1 de la llave de distribución de Play** (*Play Console →
      Configuración → Integridad de la app*) está en las restricciones de la API key de Maps
      **y** en Firebase. Sin eso el mapa sale en blanco **solo** en la versión de la tienda.
- [ ] **C-5** — Confirmar que el aviso de privacidad menciona ubicación, fotos, ID de
      dispositivo **y registros de fallos** (Crashlytics es nuevo).

### B · Compilar (10 min)

- [ ] **C-6** — Regenerar la cuenta de revisores y **guardar la contraseña**:
      `cd apps/api && npm run seed:play-reviewer`
- [ ] **C-7** — Compilar. El script sube el `versionCode`, borra el AAB viejo y archiva el
      `mapping.txt`:
      ```powershell
      pwsh -File scripts/build-play-aab.ps1 -BumpVersionCode -Clean
      ```
      Debe imprimir `Preflight de release OK — versionCode=N versionName=…`. **Si el preflight
      aborta, léelo: te está diciendo exactamente qué falta.**
- [ ] **C-8** — `npm run mobile:smoke`. Ahora falla si el AAB es más viejo que la fuente.

### C · Verificar el AAB **minificado** en un teléfono real — no omitible

Esto es lo único que prueba R8. El debug no pasa por R8 y no vale como prueba.

- [ ] **C-9** — Instalar: `bundletool build-apks --local-testing` sobre el `.aab`.
- [ ] **C-10** — Login con `play.review@nexara.com.mx`.
- [ ] **C-11** — **Un listado por panel** (ERP, Ventas, OPS, Contabilidad, STUDIO, LAB, Portal,
      CRM, INTEGRA). Confirmar que **traen datos**. Un listado vacío en release y lleno en
      debug es la firma de una regla `keep` que falta. *Este paso es el que justifica §4.*
- [ ] **C-12** — Push FCM recibido + deep link abriendo la pantalla correcta.
- [ ] **C-13** — Mapa renderizando (prueba del SHA-1 de distribución, C-4).
- [ ] **C-14** — Escáner de códigos con permiso **concedido y denegado**.
- [ ] **C-15** — Visor PDF abriendo un documento.
- [ ] **C-16** — Cola offline: modo avión → crear algo → reconectar → sincroniza. **Y actualizar
      sobre la v1 instalada** para confirmar que la cola persistida se sigue leyendo (§4).
- [ ] **C-17** — Rechazar ubicación y cámara: la app no debe truenar. El texto que se entrega a
      los revisores lo promete explícitamente.
- [ ] **C-18** — Abrir con el teléfono en **modo oscuro** y comprobar el banner de sin-conexión
      bajo la barra de estado (R-A). Si se ve mal, decidir si bloquea o se acepta para la v2.

### D · Play Console (20 min)

- [ ] **C-19** — Subir el AAB a **prueba interna** primero. Nunca directo a producción.
- [ ] **C-20** — Rehacer **Seguridad de los datos** con §6. Sacar «Interacciones en la app»,
      meter «Registros de fallos» y «Diagnósticos».
- [ ] **C-21** — *Acceso a la app*: pegar las credenciales de C-6.
- [ ] **C-22** — Revisar que la ficha, el icono y las capturas siguen coincidiendo con lo
      instalado. Un icono distinto al de la ficha **ya causó un rechazo** en esta app.
- [ ] **C-23** — Promover a producción solo cuando el bloque C esté completo.

### E · Después de publicar

- [ ] **C-24** — Archivar `play-releases/mapping-vN-*.txt` junto al `versionCode` subido.
- [ ] **C-25** — Vigilar Crashlytics las primeras 48 h. Es la primera versión con telemetría:
      va a enseñar cosas que la v1 escondía.
- [ ] **C-26** — Abrir el siguiente turno con R-A, R-B y R-C (los tres son Kotlin).

---

## 10. Notas de método

- Se ejecutaron: `gradlew help`, `gradlew bundleRelease --dry-run` (construye el grafo de
  tareas y dispara el preflight **sin compilar ni firmar**), `gradlew :app:processDebugResources`
  (valida que el nuevo XML compila y que el manifiesto lo enlaza) y
  `scripts/mobile-smoke-checklist.ps1 -SkipCompile -SkipTests`. **Ninguna build de release,
  ninguna firma.**
- El cruce «permiso declarado ↔ permiso usado» se hizo por `grep` de las APIs equivalentes
  (`FusedLocationProviderClient`, `ProcessCameraProvider`, `ConnectivityManager`,
  `performHapticFeedback`) sobre `app/src/main/java`, no por la lista del manifiesto.
- El manifiesto fusionado citado es
  `app/build/outputs/logs/manifest-merger-debug-report.txt`, **del 06-09-2026 11:38** — es
  decir, posterior a la remediación. El informe de *release* del mismo directorio es del 31-08
  y **está obsoleto**: es el que sostenía el bloqueante `AD_ID` de la auditoría anterior.
- `apps/mobile-native/android/base/` es un artefacto descompilado del AAB de la v1
  (`versionCode=4`), no código fuente. Se leyó como evidencia histórica.
- No se abrió `key.properties` ni `nexara-upload.jks`. No se transcribe ninguna contraseña,
  clave ni token.
