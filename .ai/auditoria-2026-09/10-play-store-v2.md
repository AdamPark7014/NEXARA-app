# 10 — Preparación de la v2 para Google Play

Auditoría de **solo lectura**. Rama `mejora/calidad-y-web`, árbol limpio en `bd6143ce`.
Ningún archivo fuente fue modificado. No se abrió el keystore ni `key.properties`, y no
se transcribe ningún secreto.

Alcance: `apps/mobile-native/android/`, `apps/mobile-native/play-assets/`,
`docs/ANDROID-RELEASE.md`, `docs/PLAY-STORE-CHECKLIST.md`, `docs/PLAY-STORE-LISTING.md`,
`docs/STORE-UPLOAD-READY.md`, `docs/PLAY-SCREENSHOTS-GUIDE.md`, `scripts/build-play-aab.ps1`,
`scripts/mobile-smoke-checklist.ps1`, `CHANGELOG-MOBILE.md`, `.github/workflows/ci.yml`.

---

## 0. Resumen ejecutivo

La configuración de release es **sólida**: AAB firmado, R8 con reglas correctas para Moshi,
cleartext bloqueado, `allowBackup=false`, `targetSdk=36`, alineación de 16 KB verificada en
los cuatro ABIs, assets de ficha completos y con las medidas exactas, y **ningún secreto
versionado**. Eso ya está resuelto y no hay que volver a tocarlo.

Lo que bloquea la v2 no es la configuración: es **el versionado** y **una declaración de
la ficha que nadie llenó**. Y lo que la puede hundir en campo son tres defectos de
runtime que ninguna prueba del repo detecta, porque **no hay telemetría de fallos ni CI
que compile Android**.

Historial relevante que encontré en `git log` — la app ya fue rechazada **dos veces**:

| Fecha | Bundle | Motivo del rechazo | Estado |
|---|---|---|---|
| 31-08-2026 | 3 (Producción) | `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` | Resuelto sin cambios (el manifiesto ya usaba Photo Picker) |
| 31-08-2026 | — | «Afirmaciones engañosas»: el icono instalado no coincidía con el de la ficha | Corregido en `1a8f8051` |

---

## 1. Tabla de bloqueantes

Impiden publicar o garantizan rechazo.

| # | Bloqueante | Evidencia | Qué hacer |
|---|---|---|---|
| **B1** | **`VERSION_CODE=5` ya está consumido y el AAB en disco está obsoleto respecto al código.** El commit `1a8f8051` dice literalmente «VERSION_CODE 4 -> 5; el 4 ya se habia subido a Play». Peor: el AAB (`app-release.aab`, 26 MB) se escribió el **31-08-2026 a las 14:06**, y el commit `c8bccea5` (*paridad de rutas app-web*) tocó `DeepLinkParser.kt`, `ModulePanelMap.kt`, `WebPanelUrl.kt` y `PlaceholderScreen.kt` a las **14:08** — dos minutos después. Ese AAB **no lleva** la corrección de rutas. | `apps/mobile-native/android/gradle.properties:8` → `VERSION_CODE=5`; manifiesto fusionado de release → `android:versionCode="5"`; `git show c8bccea5` | Verificar en Play Console el `versionCode` más alto **subido** (no publicado: Play tampoco reutiliza los de bundles descartados) y poner `VERSION_CODE` en ese número **+1** — previsiblemente `6`. Subir también `VERSION_NAME` a `1.1.0` (hoy sigue en `1.0.0` con cinco bundles a cuestas). **Recompilar**: el AAB de disco no sirve. |
| **B2** | **Declaración de «ID de publicidad» pendiente o incoherente.** El manifiesto fusionado de release trae `com.google.android.gms.permission.AD_ID`, `android.permission.ACCESS_ADSERVICES_AD_ID` y `ACCESS_ADSERVICES_ATTRIBUTION`. Play exige responder **sí** en *Contenido de la app → ID de publicidad*; si la declaración dice que no, bloquea la versión. `docs/PLAY-STORE-CHECKLIST.md` §6 **no menciona esta declaración en ningún punto**. Lo irónico: **`FirebaseAnalytics` no se invoca ni una sola vez en todo el código Kotlin** — los tres permisos entran solos con la dependencia. | `app/build/outputs/logs/manifest-merger-release-report.txt:923` → `ADDED from play-services-measurement-impl:22.1.2`; `grep -r "FirebaseAnalytics\|logEvent" app/src/main/java` → 0 resultados; `app/build.gradle.kts:169` → `firebase-analytics-ktx` | **Opción A (recomendada):** quitar `implementation("com.google.firebase:firebase-analytics-ktx")`. Desaparecen los tres permisos y el `BIND_GET_INSTALL_REFERRER_SERVICE`, y la fila «Interacciones en la app» sale de Data Safety. **Opción B:** conservarla y declarar el ID de publicidad en Play Console. Lo que no se puede es dejarlo sin contestar. |

> **B2 es condicional:** si la v1 ya se publicó con esta declaración contestada correctamente,
> queda resuelto y solo hay que confirmarlo. Pero el checklist del repo no lo documenta,
> así que hay que verificarlo en la consola antes de enviar.

---

## 2. Tabla de riesgos

Pasan la revisión, pero rompen la app en campo o provocan un rechazo posterior.

| # | Riesgo | Severidad | Evidencia | Impacto |
|---|---|---|---|---|
| **R1** | **Cero telemetría de fallos.** No hay Crashlytics, ni Sentry, ni Bugsnag. Ninguna referencia en gradle ni en Kotlin. | **Alta** | `grep -rn "crashlytics\|Sentry\|bugsnag"` en `android/` → 0 resultados | La v2 se publica a ciegas. Solo se verían los ANR/crashes que Play recoge de usuarios que aceptan compartir, sin *stack trace* desofuscado. Firebase ya está integrado: añadir Crashlytics es una dependencia y un plugin, y el `mapping.txt` se sube solo. |
| **R2** | **Crash irrecuperable al arranque si falla el Keystore.** `SessionStore` construye `MasterKey` + `EncryptedSharedPreferences.create(...)` como `val` de constructor, **sin `try/catch`**. `AuthRepository` instancia `SessionStore` también en el constructor, y `MainActivity` crea `AuthRepository` dentro de `setContent`. Además `androidx.security:security-crypto` está en **`1.1.0-alpha06`** — una alfa sosteniendo el token de sesión en producción. | **Alta** | `data/SessionStore.kt:31-41`; `data/AuthRepository.kt:12-13`; `MainActivity.kt` (`AuthRepository(this@MainActivity)`); `app/build.gradle.kts:145` | Si el Keystore se invalida (restauración desde backup, cambio del bloqueo de pantalla, actualización de Android, OEM con Keystore roto) la app **crashea al abrir y no se recupera nunca** salvo borrando datos. Es exactamente el fallo que genera reseñas de una estrella y que, sin R1, nadie ve. Envolver en `try/catch` con borrado y recreación del fichero cifrado. |
| **R3** | **La captura de evidencias por cámara está rota en Android 7–9.** `freshCameraOutputUri()` mete `MediaStore.MediaColumns.RELATIVE_PATH` en el `ContentValues` **sin ningún gate de versión**, y esa columna existe desde API 29. Encima hace `insert()` sobre `MediaStore.Images.Media.EXTERNAL_CONTENT_URI`, que en API 24–28 exige `WRITE_EXTERNAL_STORAGE` — permiso **no declarado**. `minSdk = 24`. | **Alta** | `ui/common/MediaPickerBar.kt:29-40`; `grep -n "VERSION" MediaPickerBar.kt` → 0 resultados; manifiesto: no hay `WRITE_EXTERNAL_STORAGE` | En Android 7.0–9.0 el `insert` devuelve `null` (el botón de cámara no hace nada) o lanza `IllegalArgumentException`. Evidencias en campo = módulo OPS, el caso de uso principal. Gate por `Build.VERSION.SDK_INT >= Q`, o mejor: `FileProvider` + `TakePicture` sobre `getExternalFilesDir` (ya está el provider configurado en `xml/nexara_file_paths.xml`). |
| **R4** | **El banner de sin-conexión queda debajo de la barra de estado.** `MainActivity` llama `enableEdgeToEdge()`, y `NexaraScaffold` mete `OfflineBanner` como primer hijo de una `Column(Modifier.fillMaxSize())` **sin ningún padding de insets**. En todo el proyecto hay **0 usos** de `statusBarsPadding`, `systemBarsPadding`, `safeDrawingPadding`, `contentWindowInsets` o `WindowInsets.*`. | **Media-alta** | `MainActivity.kt:52`; `ui/NexaraScaffold.kt:51-62`; `ui/shared/OfflineBanner.kt`; `grep -rn "systemBarsPadding\|WindowInsets\."` → 0 | Con `targetSdk=36`, Android 15+ **fuerza** edge-to-edge sin opción de salida. El banner naranja («Sin conexión · N en cola») se dibuja bajo el reloj y la batería: ilegible justo cuando más importa. Los 62 `Scaffold(` internos sí están bien (Material3 aplica sus insets por defecto y `NxModuleScaffold` propaga el `PaddingValues`); el defecto es solo del banner. Un `Modifier.statusBarsPadding()` en la `Column` lo resuelve. |
| **R5** | **La API key de Maps depende de la máquina que compila y el fallback no rompe el build.** `build.gradle.kts` lee `GOOGLE_MAPS_API_KEY` de `-P` o de `local.properties`; si no está, pone `manifestPlaceholders["MAPS_API_KEY"] = "AIzaSyPLACEHOLDER"` **y compila igual**. `local.properties` está en `.gitignore`. | **Media-alta** | `app/build.gradle.kts:32-42`. Verificado: el manifiesto fusionado de release actual **sí** lleva una clave real, no el placeholder — pero solo porque se compiló en esta máquina | Un AAB generado en otra máquina, en un runner de CI o tras reinstalar el sistema sale con mapas en blanco, sin error de compilación y sin que nadie se entere hasta que un usuario lo reporta. Hacer que `bundleRelease` **falle** si la clave está en blanco o es el placeholder. |
| **R6** | **`bundleRelease` cae silenciosamente a la firma de debug.** `signingConfig = if (keystorePropertiesFile.exists()) release else debug`. Sin `key.properties`, Gradle produce un AAB firmado con la llave de debug, sin avisar. | **Media** | `app/build.gradle.kts:70-74` | Play lo rechaza con *«el certificado de subida no coincide»*, pero solo después de subir 26 MB. `scripts/build-play-aab.ps1:80-82` sí lanza una excepción si falta el fichero — la trampa es para quien invoque `gradlew bundleRelease` a mano (que es justo lo que documenta `docs/ANDROID-RELEASE.md` §Verificación local). Mejor: fallar en el propio Gradle en vez de degradar a debug. |
| **R7** | **Transferencia dispositivo-a-dispositivo sin reglas.** `allowBackup="false"` corta el backup en la nube, pero en Android 12+ la transferencia D2D **sigue activa** salvo que se declare `android:dataExtractionRules`. No hay ese atributo ni fichero de reglas. | **Media** | Manifiesto fusionado: `android:allowBackup="false"`, sin `dataExtractionRules` ni `fullBackupContent` | El fichero cifrado de sesión viaja a un teléfono nuevo. En la práctica es ilegible (la clave maestra vive en el Keystore y no se transfiere), pero eso es justo lo que dispara **R2**: el usuario estrena teléfono, la app restaura el fichero, no puede descifrarlo y crashea al abrir. Añadir `data_extraction_rules.xml` con `<device-transfer><exclude domain="sharedpref" path="nexara_session.xml"/></device-transfer>`. |
| **R8** | **Los tests existen pero nadie los ejecuta, y no hay ni un test instrumentado.** 6 ficheros JVM con **51 `@Test`** (`DeepLinkParser` 15, `NotificationDeepLinkResolver` 13, `AuthErrorMapper` 10, `WebPanelUrl` 6, `FinanceStatusTone` 5, `AppUrlsParity` 2). Directorio `app/src/androidTest` **no existe**. `.github/workflows/ci.yml` **no tiene ningún paso de Android**: solo Node, Prisma, typecheck de API y web, Jest y Vitest. | **Media** | `find app/src/test app/src/androidTest`; `grep -c "@Test"`; `.github/workflows/ci.yml` completo | Lo que cubren los 51 tests es la capa de deep links y el mapeo de errores — nada de UI, nada de red, nada de serialización. Y ni eso corre automáticamente: `npm run mobile:smoke` es local y manual (`scripts/mobile-smoke-checklist.ps1` hace `assembleDebug` + `testDebugUnitTest`, pero solo si alguien lo lanza). Añadir un job `gradlew testDebugUnitTest lintRelease` al CI cuesta poco. |
| **R9** | **Dos permisos declarados que el código no usa.** `VIBRATE` y `READ_EXTERNAL_STORAGE` (`maxSdkVersion=32`). | **Media** | `grep -rn "VIBRATE\|READ_EXTERNAL_STORAGE"` en Kotlin → **0 resultados**. La vibración que existe es `performHapticFeedback` de Compose (`NxNavigation.kt:119`, `SmartQuoteBuilderScreen.kt:504`), que **no requiere** `VIBRATE`. El picker usa `PickMultipleVisualMedia` + `OpenMultipleDocuments` + `TakePicture` (`MediaPickerBar.kt:64-79`), ninguno de los cuales requiere permiso de almacenamiento en **ninguna** versión de Android | Un permiso declarado y no usado aumenta la superficie de escrutinio de Play y hincha la ficha de permisos. Y `READ_EXTERNAL_STORAGE` es de la misma familia que ya provocó el rechazo del bundle 3. Quitar los dos. |
| **R10** | **Repo público con `google-services.json` versionado.** El remoto es `github.com/AdamPark7014/NEXARA-app` y el propio `ci.yml` dice «El repositorio es público y hay credenciales en claro dentro del árbol». `google-services.json` está en `git ls-files`. | **Media** | `git ls-files \| grep google-services` → `apps/mobile-native/android/app/google-services.json`; `.github/workflows/ci.yml:60-64` | Versionar `google-services.json` es práctica estándar (la clave que lleva es de cliente), **pero solo si está restringida**. Con el repo público es obligatorio confirmar que la API key de Firebase y la de Maps están limitadas por *package name* + **SHA-1 de las dos llaves**: la de subida (`A9:86:2A:...`, documentada en el checklist) **y la de distribución de Play**, que Google genera al activar Play App Signing. Si falta la segunda, el mapa sale en blanco en la versión de la tienda aunque funcione en local — está avisado en `PLAY-STORE-CHECKLIST.md` §4, pero no consta que se haya hecho. |
| **R11** | `@JsonClass(generateAdapter = true)` sin procesador de anotaciones. `QueuedMutation` la lleva, pero no hay `ksp` ni `kapt` de `moshi-kotlin-codegen` en el build. | **Baja** | `data/offline/OfflineMutationQueue.kt:14`; `app/build.gradle.kts` sin plugin KSP | Hoy funciona: Moshi no encuentra el adaptador generado, captura el `ClassNotFoundException` y cae al adaptador reflexivo. La anotación es decorativa **pero salva la clase de R8** (`-keep @com.squareup.moshi.JsonClass class * { *; }`). Verificado en `mapping.txt:668824`: `QueuedMutation` **no fue renombrada** mientras el resto de `data.offline` sí (`NetworkMonitor -> rc.b`). Si alguien añade KSP más adelante, el comportamiento cambia. |
| **R12** | Sin tema oscuro en recursos ni icono monocromo. No existe `values-night/`, `windowBackground` es `@color/white`, y los `adaptive-icon` no declaran `<monochrome>`. | **Baja** | `app/src/main/res/` sin `values-night`; `values/themes.xml:6`; `mipmap-anydpi-v26/ic_launcher.xml` | Destello blanco al abrir en modo oscuro (Compose sí gestiona el tema, el problema es el `windowBackground` de Android antes de que Compose pinte). Y en Android 13+ el icono temático no se aplica. Calidad de ficha, no bloqueo. |

---

## 3. Listado de permisos

### 3.1 Declarados en `AndroidManifest.xml`

| Permiso | ¿Lo usa el código? | Evidencia | ¿Exige declaración en la ficha? |
|---|---|---|---|
| `INTERNET` | **Usado** | Retrofit/OkHttp — `data/api/ApiClient.kt` | No |
| `ACCESS_NETWORK_STATE` | **Usado** | `data/offline/NetworkMonitor.kt:22-33` (`ConnectivityManager.registerNetworkCallback`) | No |
| `ACCESS_FINE_LOCATION` | **Usado** | `util/DeviceLocation.kt:40-54`, `ui/console/screens/ConsoleGpsScreen.kt:282,345`, `ui/common/LocationPermissionBanner.kt:51` | **Sí** — Data Safety: *Ubicación precisa*, opcional. **No** dispara el formulario de ubicación en segundo plano (no hay `ACCESS_BACKGROUND_LOCATION`, no hay `FOREGROUND_SERVICE`) |
| `ACCESS_COARSE_LOCATION` | **Usado** | Mismos ficheros | **Sí** — Data Safety: *Ubicación aproximada*, opcional |
| `CAMERA` | **Usado** | `ui/common/BarcodeScannerScreen.kt:59-173` (CameraX + ML Kit), `MediaPickerBar.kt` (`TakePicture`) | **Sí** — Data Safety: *Fotos y videos*, opcional |
| `POST_NOTIFICATIONS` | **Usado** | `MainActivity.kt:177-179`, `push/NexaraNotifications.kt:73` | No, pero conviene justificar el push en la descripción (ya está) |
| `VIBRATE` | **NO USADO** | 0 referencias. La vibración real es `performHapticFeedback` de Compose, que no requiere este permiso | No, pero **quitar** |
| `READ_EXTERNAL_STORAGE` (`maxSdkVersion=32`) | **NO USADO** | 0 referencias. El picker usa Photo Picker + SAF | No en 2026, pero **quitar** — es la familia de permisos que ya provocó el rechazo del bundle 3 |

### 3.2 Heredados de librerías (aparecen en el manifiesto fusionado)

| Permiso | Origen | ¿Se usa? | ¿Exige declaración? |
|---|---|---|---|
| `USE_BIOMETRIC` | `androidx.biometric` | **Sí** — `security/AppLock.kt` | No |
| `USE_FINGERPRINT` | `androidx.biometric` (legacy, API < 28) | Indirecto | No |
| `WAKE_LOCK` | Play Services / FCM | Indirecto | No |
| `com.google.android.c2dm.permission.RECEIVE` | FCM | **Sí** — `push/NexaraFirebaseService.kt` | No |
| `BIND_GET_INSTALL_REFERRER_SERVICE` | `play-services-measurement` | **No** por código propio | Contribuye a la declaración de Data Safety de analítica |
| **`com.google.android.gms.permission.AD_ID`** | `play-services-measurement-impl:22.1.2` | **No** — `FirebaseAnalytics` nunca se invoca | **SÍ — declaración obligatoria de ID de publicidad. Ver B2** |
| `ACCESS_ADSERVICES_AD_ID` | `play-services-measurement-api:22.1.2` | No | Ídem B2 |
| `ACCESS_ADSERVICES_ATTRIBUTION` | `play-services-measurement-api:22.1.2` | No | Ídem B2 |
| `mx.nexara...DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | `androidx.core` | Interno (`protectionLevel="signature"`) | No |

### 3.3 Permisos sensibles: lo que **no** está (y está bien)

`QUERY_ALL_PACKAGES`, `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`, `MANAGE_EXTERNAL_STORAGE`,
`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE*`, `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`,
SMS, registro de llamadas, `REQUEST_INSTALL_PACKAGES`, accesibilidad.

**Ninguno está declarado.** No hace falta el formulario de permisos restringidos. El único
`<queries>` es `com.google.android.apps.maps`, inyectado por el SDK de Maps — inocuo.

### 3.4 Política de privacidad y borrado de cuenta

| Requisito | Estado |
|---|---|
| Política de privacidad | `https://nexara.com.mx/legal/privacidad` → existe en el código: `apps/web/app/legal/privacidad/page.tsx` |
| URL pública de eliminación de cuenta | `https://nexara.com.mx/legal/eliminar-cuenta` → existe: `apps/web/app/legal/eliminar-cuenta/page.tsx` |
| ¿Referenciada en el manifiesto? | No, y no hace falta: Play la toma de la ficha |
| **Pendiente** | `PLAY-STORE-CHECKLIST.md` §7 dice **«Falta desplegar web»**. Confirmar con `curl` que las dos URLs responden 200 **antes** de enviar a revisión |

---

## 4. Veredicto ProGuard: ¿la ofuscación puede romper el JSON?

### **NO — hoy no lo rompe. Verificado sobre el `mapping.txt` real, no sobre las reglas.**

El riesgo era legítimo: la app usa **Moshi con `KotlinJsonAdapterFactory`** (adaptador
**reflexivo**, no generado), que deriva los nombres de las claves JSON de los nombres de las
propiedades Kotlin leídos del `@Metadata`. R8 reescribe ese metadata al renombrar, así que
cualquier DTO ofuscado pasaría a serializar `{"a":...,"b":...}` y a fallar en silencio.

Pero las reglas lo cubren. La evidencia:

**1. Toda la superficie de DTOs vive en un solo paquete, y ese paquete está protegido.**

`-keep class mx.nexara.mobile.nativeapp.data.api.** { *; }` cubre **275 `data class`** —
el 84 % de todas las del proyecto. Y no es teoría: en
`app/build/outputs/mapping/release/mapping.txt` hay **365 entradas** que empiezan por
`mx.nexara.mobile.nativeapp.data.api`, y **ninguna fue renombrada** (todas mapean a sí
mismas, con getters y campos intactos):

```
mx.nexara.mobile.nativeapp.data.api.ActivityDto -> mx.nexara.mobile.nativeapp.data.api.ActivityDto:
```

**2. No hay DTOs de Retrofit fuera de ese paquete.** Los únicos `import mx.nexara.*` dentro
de `data/api/` son `BuildConfig`, `NexaraOffline` y `SessionEvents` — ninguna clase de datos
externa entra en un `@GET`/`@POST`. Los helpers `parseList<reified T>` de
`CrmRepository:45`, `ExtraRepository:76` y `StudioRepository:55` se instancian siempre con
tipos de `data.api` (`CotizacionDto`, `NewsPostDto`, `WorkflowDecideRequest`…). El resto de
esos repositorios parsea a `Map<String, Any?>` genéricos, inmunes a la ofuscación por
definición.

**3. Los otros tres paquetes con `-keep` son exactamente los que hacían falta:**
`data.console` (`DashboardPayload`), `data.realtime` (5 clases de eventos Socket.IO) y
`data.tickets`.

**4. El único DTO fuera de esos paquetes está salvado por otra regla.**
`data.offline.QueuedMutation` lleva `@JsonClass(generateAdapter = true)`, y
`-keep @com.squareup.moshi.JsonClass class * { *; }` lo preserva. Confirmado en
`mapping.txt:668824`: `QueuedMutation` conserva su nombre y sus nueve getters, mientras sus
vecinos del mismo paquete sí se ofuscaron (`NetworkMonitor -> rc.b`,
`OfflineMutationQueue -> rc.e`). **Esto importa más de lo que parece:** la cola offline se
persiste en disco y sobrevive a las actualizaciones. Si se hubiera ofuscado, las mutaciones
pendientes escritas por la v1 serían ilegibles para la v2 y el trabajo de campo encolado se
perdería en silencio al actualizar.

**5. Las reglas de consumidor de las librerías están aplicadas.** En
`mapping/release/configuration.txt` aparecen `META-INF/proguard/moshi.pro` (línea 1208) y
`kotlin-reflect.pro` (línea 1232) — esta última es imprescindible, porque el adaptador
reflexivo de Moshi depende de `kotlin-reflect`, que sí está en el bundle (1 035 entradas
`kotlin.reflect` en el mapping).

**6. `SessionStore` no usa Moshi.** Lee y escribe claves de `EncryptedSharedPreferences`
como literales (`"token"`, `"email"`, `"permissions_csv"`). Inmune.

### La condición que sostiene el veredicto

Es una garantía **frágil por construcción**: depende de que nadie declare un DTO de Moshi
fuera de los cuatro paquetes cubiertos. Hoy hay 42 `data class` en `ui/console`, 14 en
`ui/tickets`, 12 en `ui/studio` y 9 en `ui/ventas` — todas son estado de UI, ninguna toca
Moshi. Pero el día que alguien ponga un `Dto` en `ui/…` o en `data/crm`, R8 lo ofuscará y
**la app no fallará al compilar ni al arrancar**: el listado saldrá vacío o con campos nulos,
y sin R1 nadie lo verá.

**Blindaje barato:** sustituir los cuatro `-keep` por paquete por una regla estructural,
y anotar todos los DTOs:

```proguard
# Cualquier data class que Moshi vaya a deserializar, esté donde esté.
-keep @com.squareup.moshi.JsonClass class * { *; }
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}
-keep class mx.nexara.mobile.nativeapp.data.api.** { *; }
```

Y, ya en modo defensivo, un test JVM que compruebe que ningún fichero fuera de
`data/api/` declara una clase cuyo nombre termine en `Dto` — el mismo patrón que ya usa
`AppUrlsParityTest`.

---

## 5. Cumplimiento técnico: lo que sí está bien

Vale la pena dejarlo por escrito para no volver a auditarlo.

| Requisito | Estado | Evidencia |
|---|---|---|
| **AAB, no APK** | ✅ | `scripts/build-play-aab.ps1` → `gradlew bundleRelease`; salida `app-release.aab` (26 MB) |
| **`targetSdk` vigente** | ✅ **sin margen** | `targetSdk = 36`, `compileSdk = 36`, `minSdk = 24`. Cumple el corte del 31-08-2026. Ya no hay colchón: el siguiente corte (agosto 2027) exigirá API 37. Conviene confirmarlo en Play Console, que muestra el nivel exigido vigente |
| **16 KB page size** | ✅ **verificado ELF a ELF** | Los 10 `.so` de 64 bits del AAB (`arm64-v8a` y `x86_64`) tienen **`p_align = 0x4000`** en todos sus segmentos `PT_LOAD`: `libbarhopper_v3` (ML Kit), `libimage_processing_util_jni` (CameraX 1.4.2), `libandroidx.graphics.path`, `libdatastore_shared_counter`, `libsurface_util_jni`. Además `packaging.jniLibs.useLegacyPackaging = false` |
| **Tráfico en claro bloqueado** | ✅ | `src/main/res/xml/network_security_config.xml` → `cleartextTrafficPermitted="false"`. El overlay que permite HTTP a `localhost`/`10.0.2.2` vive en `src/debug/` y **no entra en release**. Manifiesto fusionado de release: sin `usesCleartextTraffic` |
| **R8 activo con símbolos nativos** | ✅ | `isMinifyEnabled = true`, `isShrinkResources = true`, `ndk.debugSymbolLevel = "SYMBOL_TABLE"` |
| **`allowBackup`** | ✅ nube / ⚠️ D2D | `android:allowBackup="false"`. Falta `dataExtractionRules` — ver **R7** |
| **Secretos fuera de git** | ✅ | `git ls-files` no lista `key.properties`, `nexara-upload.jks` ni `local.properties`. `git check-ignore -v` confirma las tres reglas (`.gitignore:74,77,78`). `NEXARA-credenciales-usuarios-v4.xlsx` tampoco está versionado |
| **Firma configurada** | ✅ | `signingConfigs { create("release") }` leyendo `key.properties`; cert válido hasta 2053 según `PLAY-STORE-CHECKLIST.md` §4 (Play exige ≥ 2033). Salvedad en **R6** |
| **Assets de ficha** | ✅ | `icon-512.png` = **512×512, RGB sin canal alfa** (Play rechaza transparencia); `feature-graphic-1024x500.png` = **1024×500**; **8 capturas** en `screenshots/phone/` a **1080×1920** |
| **Iconos adaptativos** | ✅ | `mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml`, PNG reales en los 5 densidades (48→192) y foreground en lienzo 108 dp con zona segura de 72 dp (`scripts/gen-native-app-icons.py:59`). Es la corrección de `1a8f8051` tras el rechazo por icono |
| **Splash screen** | ✅ | `Theme.Nexara.Splash` con `core-splashscreen:1.0.1` y fallback para API < 31 |
| **Predictive back** | ✅ | `android:enableOnBackInvokedCallback="true"` — obligatorio de facto en Android 15+ |
| **Baseline profile** | ✅ | El AAB incluye `BUNDLE-METADATA/com.android.tools.build.profiles/baseline.prof` |
| **Cuenta demo para revisores** | ✅ | `apps/api/prisma/seed-play-reviewer.ts` — tenant `nexara-demo` aislado, contraseña aleatoria fuera del repo, rol acotado (nunca `super_admin`). Es la mejor pieza de todo el checklist |
| **Automatización de screenshots gated** | ✅ | `ScreenshotAutomation` (deep link `nexara://debug/auto-login`) está protegida por `BuildConfig.DEBUG` en las **dos** puertas de entrada (`isDebugAutomationUri` y `handle`), así que R8 la elimina del release. Aun así vive en `src/main` — ver mejora M2 |

---

## 6. Mejoras (no bloquean nada)

| # | Mejora |
|---|---|
| **M1** | Automatizar el bump de `VERSION_CODE` en `scripts/build-play-aab.ps1` (leer, incrementar y reescribir `gradle.properties` antes de compilar). Es la causa raíz de **B1** y del riesgo de repetirlo en la v3 |
| **M2** | Mover `screenshots/ScreenshotAutomation.kt` a `app/src/debug/java/`. Hoy R8 lo elimina, pero depender de que las dos guardas `BuildConfig.DEBUG` sigan ahí es más frágil que separarlo por source set |
| **M3** | Dependencias duplicadas en `app/build.gradle.kts`: `androidx.datastore:datastore-preferences` declarado en `1.1.1` (línea 143) **y** `1.1.7` (línea 144); `androidx.activity:activity-compose:1.11.0` declarado dos veces (líneas 112 y 164). Gradle resuelve al mayor, pero es ruido que confunde |
| **M4** | Documentación desalineada con el disco. `docs/ANDROID-RELEASE.md` §Versionado muestra `VERSION_CODE=1` / `VERSION_NAME=0.1.0`; `docs/STORE-UPLOAD-READY.md` y `CHANGELOG-MOBILE.md` dicen `VERSION_CODE=2`; el real es **5**. Y `CHANGELOG-MOBILE.md` no tiene entrada para los bundles 3, 4 ni 5 — el historial de los dos rechazos solo existe en el mensaje de `1a8f8051` |
| **M5** | `play-assets/ASSETS-README.md` marca las capturas como «❌ Pendiente» en la tabla de inventario, aunque tres párrafos más abajo (y en el disco) están las 8 |
| **M6** | `MainActivity.askNotificationPermissionIfNeeded()` pide `POST_NOTIFICATIONS` nada más abrir, **antes del login** y sin contexto. Pedirlo tras el primer login, explicando que es para asignaciones, sube mucho la aceptación |
| **M7** | Las reglas `-keep class com.google.android.gms.** { *; }` y `-keep class com.google.firebase.** { *; }` desactivan el *shrinking* de las dos librerías más grandes del proyecto. Acotarlas bajaría el AAB bastante por debajo de los 26 MB actuales |
| **M8** | Añadir `<monochrome>` a los `adaptive-icon` y un `values-night/themes.xml` (ver **R12**) |

---

## 7. Checklist accionable para la v2

En orden. Lo de arriba bloquea lo de abajo.

### Antes de tocar código

- [ ] Entrar a Play Console → *Versiones → Panel de la app* y anotar el **`versionCode` más alto subido** (incluidos bundles descartados o nunca publicados: Play no reutiliza ninguno).
- [ ] Comprobar en *Contenido de la app* qué se contestó en **ID de publicidad**, **Seguridad de los datos** y **Acceso a la app**.
- [ ] `curl -o /dev/null -w "%{http_code}\n" https://nexara.com.mx/legal/privacidad` y lo mismo con `/legal/eliminar-cuenta`. Ambas deben dar **200**.
- [ ] Confirmar que el **SHA-1 de la llave de distribución de Play** (Play Console → Configuración → Integridad de la app) está en las restricciones de la API key de Maps **y** en Firebase. Sin eso, el mapa sale en blanco solo en la versión de la tienda.

### Bloqueantes

- [ ] **B1** — `apps/mobile-native/android/gradle.properties`: `VERSION_CODE` = (el más alto subido) + 1, previsiblemente `6`. Subir `VERSION_NAME` a `1.1.0`.
- [ ] **B1** — Borrar el AAB obsoleto y **recompilar desde cero**: `npm run mobile:android:play-aab` con `-Clean`. El de disco es anterior a `c8bccea5`.
- [ ] **B2** — Decidir: quitar `firebase-analytics-ktx` de `app/build.gradle.kts` (recomendado, no se usa en ninguna línea de Kotlin) **o** declarar el ID de publicidad en Play Console. Si se quita, revisar también la fila «Interacciones en la app» de Data Safety.

### Riesgos que deberían entrar en la v2

- [ ] **R1** — Añadir **Firebase Crashlytics** (`com.google.firebase:firebase-crashlytics-ktx` + plugin `com.google.firebase.crashlytics`). Firebase ya está integrado y el plugin sube el `mapping.txt` automáticamente en cada `bundleRelease`. Sin esto, ningún otro punto de esta lista se puede verificar en campo.
- [ ] **R2** — Envolver `SessionStore.prefs` en `try/catch`: si `EncryptedSharedPreferences.create` lanza, borrar el fichero `nexara_session` y reintentar una vez; si vuelve a fallar, degradar a sesión vacía (login limpio) en vez de crashear. Evaluar además salir de `security-crypto:1.1.0-alpha06`.
- [ ] **R3** — `MediaPickerBar.freshCameraOutputUri()`: gate por `Build.VERSION.SDK_INT >= Q` para `RELATIVE_PATH`, o migrar a `FileProvider` sobre `getExternalFilesDir` (el provider ya existe en `xml/nexara_file_paths.xml`). Probar la captura de evidencias en un emulador **API 24 y API 28**.
- [ ] **R4** — `Modifier.statusBarsPadding()` en la `Column` de `NexaraScaffold`, o `WindowInsets.systemBars` en el `OfflineBanner`. Verificar en Android 15+ con el banner visible (modo avión).
- [ ] **R9** — Quitar `VIBRATE` y `READ_EXTERNAL_STORAGE` del `AndroidManifest.xml`.
- [ ] **R5** — Hacer que `bundleRelease` **falle** si `MAPS_API_KEY` está en blanco o vale `AIzaSyPLACEHOLDER`.
- [ ] **R6** — Hacer que `bundleRelease` **falle** si no existe `key.properties`, en vez de degradar a la firma de debug.
- [ ] **R7** — Añadir `app/src/main/res/xml/data_extraction_rules.xml` excluyendo `nexara_session` de `<device-transfer>`, y referenciarlo con `android:dataExtractionRules`.
- [ ] **R8** — Añadir al `.github/workflows/ci.yml` un job Android con `setup-java@v4` (JDK 17) + `gradlew testDebugUnitTest lintRelease`. Los 51 tests ya existen; solo falta que alguien los ejecute.

### Blindaje del veredicto ProGuard

- [ ] Anotar con `@JsonClass(generateAdapter = true)` los DTOs nuevos, y añadir `-keepclassmembers class * { @com.squareup.moshi.Json <fields>; }` a `proguard-rules.pro`.
- [ ] Test JVM que falle si aparece una clase terminada en `Dto` fuera de `data/api/` (mismo patrón que `AppUrlsParityTest`).

### Verificación en release antes de enviar

Todo esto **sobre el AAB minificado**, no sobre debug. Es lo que `docs/ANDROID-RELEASE.md`
§Checklist ya pide y lo que ninguna prueba automática cubre:

- [ ] Instalar el AAB con `bundletool build-apks --local-testing` en un teléfono real.
- [ ] Login con `play.review@nexara.com.mx` (regenerar con `npm run seed:play-reviewer`).
- [ ] Recorrer **un flujo por panel**: ERP, Ventas, OPS, Contabilidad, STUDIO, LAB, Portal. Confirmar que las listas traen datos — un listado vacío en release y lleno en debug es la firma de una regla `-keep` que falta.
- [ ] Push FCM recibido y deep link abriendo la pantalla correcta.
- [ ] Mapa (GPS) renderizando — es la prueba de que el SHA-1 de distribución está bien registrado.
- [ ] Visor PDF abriendo un documento.
- [ ] Escáner de códigos de barras (ML Kit) con permiso de cámara concedido **y** denegado.
- [ ] Cola offline: modo avión, crear algo, reconectar, verificar que sincroniza. Y **actualizar sobre la v1 instalada** para confirmar que la cola persistida se sigue leyendo.
- [ ] Rechazar ubicación y cámara y confirmar que la app no truena — el texto que se entrega a los revisores lo promete explícitamente.
- [ ] Archivar `app/build/outputs/mapping/release/mapping.txt` junto al `versionCode` subido.

---

## 8. Notas de método

- Auditoría de solo lectura: no se ejecutó Gradle, no se abrió el keystore ni `key.properties`,
  no se transcribió ninguna contraseña ni clave.
- El manifiesto fusionado, el `mapping.txt` (128 MB), el `configuration.txt` y el `.aab` que
  se citan son artefactos **preexistentes** en `app/build/`, generados el 31-08-2026 a las
  14:05–14:06. Reflejan `versionCode 5`, es decir el estado del código **antes** de `c8bccea5`.
- La alineación de 16 KB se comprobó parseando las cabeceras de programa ELF de los `.so`
  extraídos del AAB, no leyendo la documentación de las librerías.
- El cruce «permiso declarado ↔ permiso usado» se hizo por `grep` de `Manifest.permission.*`
  y de las APIs equivalentes (`FusedLocationProviderClient`, `ProcessCameraProvider`,
  `ConnectivityManager`, `performHapticFeedback`) sobre todo `app/src/main/java`.
- El 502 del dashboard móvil y el manejo de errores HTTP están cubiertos por
  `.ai/auditoria-2026-09/03-movil-502-dashboard.md`; no se duplican aquí.
