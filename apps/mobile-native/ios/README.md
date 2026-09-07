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
│   ├── Assets.xcassets/     # AppIcon 1024x1024 sin canal alfa
│   ├── NexaraApp.Debug.entitlements    # aps-environment: development
│   └── NexaraApp.Release.entitlements  # aps-environment: production
└── scripts/                 # firma y secretos, desde Windows
```

## Generar el proyecto Xcode

`NexaraApp.xcodeproj` **no se versiona**: `project.yml` es la única definición y
el proyecto se genera con [XcodeGen](https://github.com/yonaskolb/XcodeGen). En
el runner de macOS eso ya pasa solo. A mano, si algún día hay una Mac delante:

```bash
brew install xcodegen && xcodegen generate && open NexaraApp.xcodeproj
```

## Distribución

La app iOS **no se sirve desde el VPS**: se distribuye por TestFlight / App Store
Connect, y se construye **sin Mac** en un runner de GitHub Actions.

**Léete [`PUBLICAR-SIN-MAC.md`](PUBLICAR-SIN-MAC.md)** — es el runbook completo:
qué cuesta, qué tiene que hacer Adam una sola vez, cómo se lanza y qué mirar
cuando falle.

## Paridad con Android

Toda vista, endpoint y flujo existe también en `android/`. Si añades un módulo aquí, añade su análogo allá (y viceversa) para mantener paridad.
