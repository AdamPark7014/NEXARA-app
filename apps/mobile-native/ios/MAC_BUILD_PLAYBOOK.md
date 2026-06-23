# 🍎 NEXARA iOS — Mac Build Playbook (lee-esto-primero)

Este documento es el **runbook** exacto que debe seguir el asistente (o cualquier dev)
cuando se tenga acceso a una Mac. Todo lo que puede hacerse desde Windows ya está hecho.

---

## ✅ Estado actual (preparado desde Windows)

| Componente | Estado |
|---|---|
| Estructura `NexaraApp/` (SwiftUI, SessionStore Keychain, ApiClient, Repositories) | Listo |
| `ModuleCatalog.swift` (89 módulos en 5 portales) | Listo |
| `ModuleRouter.swift` (switch completo) | Listo |
| `PushManager` + `AppDelegate` + `NexaraApp` con `@UIApplicationDelegateAdaptor` | Listo |
| `NexaraMapView` (MapKit nativo, sin API key) | Listo |
| `MediaPickerBar` (PhotosPicker + UIImagePickerController + fileImporter) | Listo |
| `PDFViewerView` (PDFKit nativo) | Listo |
| `Downloads` (URLSession + Documents/NEXARA + ShareLink) | Listo |
| `Resources/Info.plist` con permisos location/camera/photos/micro/tracking | Listo |
| `Resources/NexaraApp.entitlements` con `aps-environment=development` | Listo |
| `project.yml` con entitlements y source paths | Listo |
| `Assets.xcassets/AppIcon.appiconset` | Placeholder (falta PNG 1024x1024) |

---

## 🚀 Pasos en la Mac (primer arranque ~30–45 min)

### 1) Instalar herramientas
```bash
xcode-select --install                            # ~5–10 min
sudo xcodebuild -license accept
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install xcodegen git
```

### 2) Clonar / pull
```bash
cd ~/Desktop
git clone https://github.com/AdamPark7014/NEXARA-app.git
cd NEXARA-app
git pull --rebase                                 # si ya lo tienes
```

### 3) Generar proyecto Xcode
```bash
cd apps/mobile-native/ios
xcodegen generate
open NexaraApp.xcodeproj
```

### 4) Configurar Signing (en Xcode)
1. Target `NexaraApp` → pestaña **Signing & Capabilities**.
2. Marcar ✅ **Automatically manage signing**.
3. **Team**: elegir Apple ID personal o de empresa. Si no hay ninguno:
   - *Xcode → Settings → Accounts → "+" → Apple ID*. La cuenta gratuita basta para instalar en tu iPhone.
4. Cambiar **Bundle Identifier** si hay conflicto: `mx.nexara.mobile.NexaraApp.dev`.

### 5) Agregar dependencias Swift Package Manager
En Xcode: **File → Add Package Dependencies…**

Añadir estos paquetes (uno a la vez, Add Package, esperar resolución):

```
https://github.com/firebase/firebase-ios-sdk
   → Seleccionar:  FirebaseMessaging, FirebaseAnalytics
```

> Nota: **Google Maps NO se usa en iOS**; usamos MapKit nativo (gratis, sin key). Si en el futuro se requiere parity visual con Android Maps, agregar `https://github.com/googlemaps/ios-maps-sdk` y reemplazar `NexaraMapView.swift` por la versión GMSMapView.

### 6) Añadir `GoogleService-Info.plist` (Firebase)
1. Ir a https://console.firebase.google.com → proyecto NEXARA → *Settings → General → Add app → iOS*.
2. Bundle ID: `mx.nexara.mobile.NexaraApp` (o el que hayas elegido).
3. Descargar `GoogleService-Info.plist`.
4. Arrastrarlo al grupo `NexaraApp/` en Xcode (✅ Copy items if needed, ✅ target NexaraApp).
5. **NO subir este archivo a git** (ya está en `.gitignore`).

### 7) Habilitar capabilities
En Xcode → Signing & Capabilities → **+ Capability**:
- ✅ **Push Notifications**
- ✅ **Background Modes** → marcar: Remote notifications, Location updates, Background fetch.

### 8) Cargar ícono (AppIcon)
1. Desde el PNG 1024×1024 (el logo NEXARA, proporcionado en USB/cloud).
2. Arrastrar al slot **iOS App Icon (1024 x 1024)** dentro de `Assets.xcassets → AppIcon`.
3. Xcode genera el resto automáticamente (desde iOS 14).

### 9) Apuntar al backend correcto
Editar `NexaraApp/Data/ApiClient.swift`:
- Asegurarse que el `baseURL` en release es `https://api.nexara.com.mx/api`.
- DEBUG apunta a `http://localhost:3001/api` — para probar contra producción en el simulador puedes temporalmente forzar production.

### 10) Compilar y correr
**En simulador** (no hay push pero funciona el resto):
- Seleccionar destino "iPhone 15 Pro" → ▶️.

**En dispositivo físico** (requerido para push):
- Conectar iPhone por cable, desbloquearlo, tocar "Confiar" en el pop-up.
- En el iPhone: *Ajustes → General → VPN y gestión de dispositivos → [tu Apple ID] → Confiar*.
- Seleccionar el iPhone como destino → ▶️.
- Aceptar permisos de notificaciones, ubicación, cámara cuando aparezcan.

### 11) Verificación funcional (checklist manual)
- [ ] Login con usuario, cliente y sucursal.
- [ ] Pantalla GPS muestra MapKit con pins.
- [ ] Módulo de Evidencias: tocar "Cámara", tomar foto, aparece en lista.
- [ ] Módulo con PDF (cotizaciones): abrir, scroll, share (ícono arriba derecha).
- [ ] Abrir un Excel: se abre el Share Sheet (iOS no renderiza xlsx inline, correcto).
- [ ] Recibir notificación push: enviar desde backend una prueba; debe aparecer banner incluso con app cerrada (ver sección APNs).

### 12) Push notifications APNs (requiere Apple Developer Program $99/año)
1. https://developer.apple.com/account → Certificates, Identifiers & Profiles → Keys.
2. **Create a Key** → nombre "NEXARA APNs" → ✅ Apple Push Notifications service → Continue → Download `.p8`.
3. Anotar Key ID y Team ID.
4. En Firebase Console → *Settings → Cloud Messaging → Apple app configuration* → subir `.p8` con Key ID + Team ID.
5. En el backend (`apps/api/src/devices/push-dispatch.service.ts`) ya está integrado con FCM → automáticamente rutea a APNs.

### 13) TestFlight (distribución a pruebas)
- Xcode → *Product → Archive*.
- Organizer → **Distribute App → App Store Connect → Upload**.
- appstoreconnect.apple.com → TestFlight → agregar build → invitar testers por email.

---

## 🧩 Archivos que hay que crear/verificar durante la sesión de Mac

| Archivo | Cómo se genera | Checklist |
|---|---|---|
| `NexaraApp.xcodeproj/` | `xcodegen generate` | ☐ |
| `Assets.xcassets/AppIcon.appiconset/1024.png` | Arrastrar PNG en Xcode | ☐ |
| `NexaraApp/GoogleService-Info.plist` | Descargar de Firebase Console | ☐ |
| Swift Packages resueltos | Xcode → Add Package | ☐ |
| Code Signing | Xcode → Signing & Capabilities | ☐ |
| Capabilities (Push, Background) | Xcode → + Capability | ☐ |

---

## ⚙️ Ajustes finos recomendados

### A. FirebaseApp.configure()
Una vez agregado Firebase, editar `NexaraApp/Push/AppDelegate.swift` y añadir:
```swift
import FirebaseCore
import FirebaseMessaging

func application(_ app: UIApplication,
                 didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    FirebaseApp.configure()
    Messaging.messaging().delegate = self  // si quieres FCM token iOS
    PushManager.shared.configure()
    Task { await PushManager.shared.requestPermissionAndRegister() }
    return true
}
```

### B. Mapeo APNs <-> FCM token (opcional, si quieres un solo endpoint backend)
Si prefieres enviar siempre **FCM token** (igual que Android):
```swift
import FirebaseMessaging

func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
    Messaging.messaging().token { token, _ in
        guard let token else { return }
        Task { await PushManager.shared.registerFCMToken(token) }
    }
}
```
Y en `PushManager.swift` agregar un método `registerFCMToken(_ token: String)` que llame a `POST /devices/push-token` con `platform: "ios"` y `token: fcmToken`.

### C. Release build settings
Antes de subir a App Store:
- `project.yml` → cambiar `aps-environment` a `production` en entitlements.
- Info.plist → revisar `ITSAppUsesNonExemptEncryption=false`.
- Icons → 1024 sin canal alpha (App Store lo rechaza con transparencia).

---

## 🧯 Troubleshooting esperado

- **"No such module 'FirebaseMessaging'"** → Falta resolver el Swift Package (File → Packages → Resolve Package Versions).
- **"Provisioning profile doesn't include aps-environment"** → En developer.apple.com generar nuevo profile después de habilitar Push Notifications para el App ID.
- **"Untrusted Developer" en iPhone** → Ajustes → General → VPN y gestión de dispositivos → Confiar.
- **Build falla por firma al abrir desde XcodeGen** → borrar `~/Library/Developer/Xcode/DerivedData/NexaraApp-*` y rebuild.
- **Cuenta gratuita, app se cierra a los 7 días** → normal, reinstalar desde Xcode. Solución definitiva: Apple Developer Program.
