# Android release build — NEXARA (`mx.nexara.mobile.nativeapp`)

Guía para compilar, versionar y publicar el AAB de Play Store con R8 habilitado.

---

## Resumen de la configuración

| Aspecto | Debug | Release (Play Store) |
|---|---|---|
| Minificación R8 | No | Sí (`isMinifyEnabled`) |
| Shrinking de recursos | No | Sí (`isShrinkResources`) |
| API base | `http://10.0.2.2:3001/api` | `https://api.nexara.com.mx/api` |
| Cleartext HTTP | Solo localhost / emulador | Bloqueado |
| Logging HTTP | Body completo | Deshabilitado |
| Firma | Debug keystore | Upload keystore (`key.properties`) |

---

## Versionado (`versionCode` / `versionName`)

Los valores viven en [`apps/mobile-native/android/gradle.properties`](../apps/mobile-native/android/gradle.properties):

```properties
VERSION_CODE=1
VERSION_NAME=0.1.0
```

`build.gradle.kts` los lee en `defaultConfig`; no hace falta editar el `.kts` en cada release.

### Reglas de bump

1. **`VERSION_CODE`** — entero monótono. **Subir en cada subida a Play Console.** Google rechaza un `versionCode` repetido aunque el `versionName` cambie.
2. **`VERSION_NAME`** — semver legible para usuarios (p. ej. `0.2.0`, `1.0.0`). No afecta la aceptación en Play, pero conviene alinearlo con el release del monorepo.
3. Tras cambiar los valores, recompila el AAB; no uses un bundle viejo con código nuevo.

Ejemplo para la segunda subida:

```properties
VERSION_CODE=2
VERSION_NAME=0.2.0
```

---

## R8 / ProGuard

Release usa R8 con:

- `proguard-android-optimize.txt` (Android SDK)
- [`app/proguard-rules.pro`](../apps/mobile-native/android/app/proguard-rules.pro)

### Stack cubierto

| Librería | Notas |
|---|---|
| **Retrofit + OkHttp** | Interfaces `*Api` y anotaciones `@GET`/`@POST` |
| **Moshi** | La app usa Moshi + `KotlinJsonAdapterFactory`, **no Gson**. Se conservan DTOs en `data.api.*` y paquetes relacionados. |
| **Coil** | Carga de imágenes en Compose |
| **Socket.IO** | Cliente realtime (`RealtimeClient`) |
| **Firebase / Maps** | FCM, Analytics, Play Services Maps |

Si un release minificado falla en runtime con `JsonDataException`, `IllegalArgumentException` de Moshi o `ClassCastException` en Retrofit, amplía los `-keep` en `proguard-rules.pro` para el DTO o paquete afectado.

### Desactivar minify temporalmente

Solo para depurar un crash de R8:

```kotlin
release {
    isMinifyEnabled = false
    isShrinkResources = false
}
```

No subas a Play sin volver a activar minify.

---

## Seguridad de red

- **Release:** [`src/main/res/xml/network_security_config.xml`](../apps/mobile-native/android/app/src/main/res/xml/network_security_config.xml) — cleartext deshabilitado; solo HTTPS del sistema.
- **Debug:** [`src/debug/res/xml/network_security_config.xml`](../apps/mobile-native/android/app/src/debug/res/xml/network_security_config.xml) — permite HTTP a `localhost`, `127.0.0.1` y `10.0.2.2` (API local en emulador).

El manifiesto referencia `@xml/network_security_config`; el overlay de `debug` sustituye el XML en builds de depuración sin afectar release.

---

## Compilar el AAB

### Requisitos

- JDK 17+
- Upload keystore: `apps/mobile-native/android/nexara-upload.jks`
- Credenciales: `apps/mobile-native/android/key.properties` (fuera de git)

### Comando recomendado

```bash
npm run mobile:android:play-aab
```

Equivale a `gradlew clean bundleRelease` desde `apps/mobile-native/android`.

### Salida

```
apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab
```

### Verificación local

```bash
cd apps/mobile-native/android
./gradlew.bat bundleRelease --no-daemon
./gradlew.bat assembleDebug --no-daemon   # confirmar que debug no se rompe
```

Inspeccionar el mapping de R8 (útil si hay crash en producción):

```
app/build/outputs/mapping/release/mapping.txt
```

Guárdalo junto con cada `versionCode` subido a Play.

---

## Firma y Play App Signing

Ver también [`docs/PLAY-STORE-CHECKLIST.md`](PLAY-STORE-CHECKLIST.md).

- Upload keystore: firma el AAB que subes.
- Play App Signing: Google refirma con la llave de distribución. Agrega el SHA-1 de **ambas** llaves (upload + distribución de Play) en Firebase y la API key de Maps.

---

## Checklist pre-subida

- [ ] `VERSION_CODE` incrementado en `gradle.properties`
- [ ] `bundleRelease` exitoso con R8 activo
- [ ] Login y un flujo por panel probados en **release** (no solo debug)
- [ ] Push (FCM), mapa y PDF abiertos al menos una vez
- [ ] `mapping.txt` archivado para este `versionCode`
- [ ] Cuenta demo de Play reviewer probada (`npm run seed:play-reviewer` en API)

---

## Referencias en el repo

| Archivo | Rol |
|---|---|
| `apps/mobile-native/android/app/build.gradle.kts` | buildTypes, signing, BuildConfig |
| `apps/mobile-native/android/gradle.properties` | `VERSION_CODE`, `VERSION_NAME` |
| `apps/mobile-native/android/app/proguard-rules.pro` | Reglas R8 |
| `scripts/build-play-aab.ps1` | Script de CI local |
| `docs/PLAY-STORE-CHECKLIST.md` | Ficha, declaraciones, cuenta demo |
