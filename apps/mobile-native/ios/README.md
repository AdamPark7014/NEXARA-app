# NEXARA iOS (nativa)

App **100% nativa** iOS en SwiftUI que reemplaza a `apps/mobile` (Next.js + Capacitor) en paridad con `apps/mobile-native/android`.

## Estructura

```
ios/
├── project.yml              # Definición XcodeGen
├── NexaraApp/               # Código Swift
│   ├── NexaraApp.swift      # @main
│   ├── Data/                # ApiClient, AuthRepository, ExtraRepository
│   ├── Session/             # SessionStore (Keychain)
│   ├── Catalog/             # ModuleCatalog (espejo del Android)
│   └── UI/                  # Vistas SwiftUI
│       ├── Common/          # SimpleListView
│       ├── Modules/         # Pantallas de módulos
│       ├── LoginView.swift
│       ├── PanelHubView.swift
│       ├── *NavView.swift   # NavigationStack por portal
│       └── MyProfileView.swift
├── Resources/
│   ├── Info.plist
│   └── Assets.xcassets/     # (crear desde Xcode al generar)
```

## Generar el proyecto Xcode

Requiere [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
cd apps/mobile-native/ios
xcodegen generate
open NexaraApp.xcodeproj
```

## Distribución

La app iOS **no se sirve desde el VPS**: se distribuye por TestFlight / App Store Connect.
Ver `apps/mobile-native/README.md` para pipeline.

## Paridad con Android

Toda vista, endpoint y flujo existe también en `android/`. Si añades un módulo aquí, añade su análogo allá (y viceversa) para mantener paridad.
