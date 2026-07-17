## Mobile Native (100% nativo)

Reescritura **sin WebView / sin Capacitor** de la app móvil NEXARA, en paridad con `apps/web` (paneles ERP · CRM · OPS · STUDIO · LAB + Portal clientes).

### Stack

| Plataforma | Tecnología |
|---|---|
| **Android** | Kotlin + Jetpack Compose + Navigation + Retrofit + Socket.IO + FCM |
| **iOS** | Swift + SwiftUI (espejo en `ios/`, ver `ios/README.md`) |

### Preview en vivo (desarrollo)

Esta app **no** es Expo/React Native: no hay un Metro en `localhost:8081`. El preview real es emulador/simulador + rebuild incremental.

#### Android (Windows / macOS / Linux)

Desde la raíz del monorepo:

```bash
npm run mobile:android:preview
```

Eso:

1. Usa el Android SDK local (`%LOCALAPPDATA%\Android\Sdk` en Windows)
2. Crea el AVD `nexara_phone` si no existe (API 34 Google APIs x86_64)
3. Arranca el emulador
4. Compila e instala el APK debug (`gradlew installDebug`)
5. Lanza `mx.nexara.mobile.nativeapp/.MainActivity`

**Cambios en tiempo real (Compose):** abre Android Studio → **Open** → `apps/mobile-native/android` → Run en el mismo emulador → edita UI con **Live Edit / Apply Changes**. Ese es el equivalente a “ver cómo se arma” mientras desarrollas.

Opciones del script:

```bash
pwsh -File scripts/preview-android-emulator.ps1 -SkipBuild   # solo emulador + launch
pwsh -File scripts/preview-android-emulator.ps1 -NoLaunch    # instala sin abrir la app
```

Teléfono físico (alternativa): USB + depuración → `npm run apk:build-install`.

#### Google Play (AAB firmado)

Primera vez (crea upload keystore local, **no se sube a git**):

```bash
pwsh -File scripts/build-play-aab.ps1 -CreateKeystore
```

Builds siguientes:

```bash
npm run mobile:android:play-aab
```

Salida: `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab`

Sube ese `.aab` en [Play Console](https://play.google.com/console) → tu app → Producción o prueba interna → Crear versión. Package: `mx.nexara.mobile.nativeapp`.

Respalda `nexara-upload.jks` + `key.properties`; sin ellos no podrás actualizar la app en Play.

#### iOS (solo Mac)

En Windows **no** se puede correr el Simulator de iOS ni servir la app nativa en un puerto local.

En Mac:

1. Sigue [`ios/MAC_BUILD_PLAYBOOK.md`](ios/MAC_BUILD_PLAYBOOK.md) / [`ios/README.md`](ios/README.md)
2. `cd apps/mobile-native/ios && xcodegen generate && open NexaraApp.xcodeproj`
3. Run en el Simulator → SwiftUI Previews / hot reload de Xcode

### Paneles (igual que web)

Alineado con `apps/web/lib/access-matrix.ts`:

- **ERP** — finanzas, RH, gobierno, almacén (`ConsoleNavHost` filtrado)
- **CRM** — pipeline comercial (`VentasNavHost`)
- **OPS** — campo, GPS, evidencias, herramientas (`ConsoleNavHost` filtrado)
- **STUDIO** — contenido y marca (`StudioNavHost`)
- **LAB** — health check y sandbox (`LabNavHost`)
- **Portal** — tickets cliente/sucursal (`TicketsNavHost`)

Resolución de acceso: `android/.../access/PanelAccessResolver.kt` · iOS: `ios/NexaraApp/Access/PanelAccessResolver.swift`

### Android — abrir / compilar

1. Android Studio → **Open** → `apps/mobile-native/android`
2. Sync Gradle → Run `app`
3. API por defecto: `https://api.nexara.com.mx/api` (`BuildConfig.API_BASE_URL`)

O usa el preview automatizado: `npm run mobile:android:preview`.

### Infraestructura cross-cutting

| Feature | Android | iOS |
|---|---|---|
| Sesión cifrada | ✅ `SessionStore` | ✅ Keychain |
| Socket.IO realtime | ✅ `RealtimeBus` | ⬜ |
| Push FCM | ✅ | ⬜ |
| Cola offline mutaciones | ✅ integrado en `ApiClient` + replay | ⬜ |
| Cache GET offline | ✅ `OfflineHttpInterceptor` | ⬜ |
| Banner sin conexión | ✅ `OfflineBanner` | ⬜ |
| STUDIO (9 módulos) | ✅ CRUD nativo `ui/studio/` | ✅ listas + dashboard |
| GPS / cámara / mapas | ✅ | ✅ MapKit |

### Panel STUDIO (detalle Android)

Dashboard KPIs, carrusel hero (upload/reorder), casos de éxito, noticias, contactos/leads, redes sociales, newsletter, secciones del sitio (JSON editor).

### Matriz de paridad

Ver [`docs/native-parity-matrix.md`](../../docs/native-parity-matrix.md).

### Migración desde Capacitor

La app legacy Capacitor (`apps/mobile`) ya no forma parte del monorepo. Esta carpeta es la fuente nativa (Android + iOS).

### Próximos pasos (orden sugerido)

1. iOS: editores CRUD STUDIO (hero upload, casos, noticias) — paridad Android
2. Offline en iOS (URLSession cache + cola)
3. Generar catálogo de módulos desde `access-matrix.ts` (script CI)
4. Build iOS en Mac (`ios/MAC_BUILD_PLAYBOOK.md`)
