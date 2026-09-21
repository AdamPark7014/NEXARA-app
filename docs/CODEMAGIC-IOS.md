# CI iOS con Codemagic (NEXARA)

Esta guía explica cómo activar un build gratis (simulador) del app nativo iOS de NEXARA usando Codemagic. No requiere certificados ni secretos para el primer build verde.

## Requisitos
- Repositorio: `AdamPark7014/NEXARA-app` (monorepo)
- App iOS: `apps/mobile-native/ios/`
- El proyecto Xcode se genera con XcodeGen desde `project.yml`

## Conectar el repo en Codemagic
1. Entra a `https://codemagic.io` con tu cuenta de GitHub.
2. Conecta el repositorio `NEXARA-app` (monorepo).
3. Codemagic detectará el archivo `codemagic.yaml` en la raíz.

## Plan gratuito
- Codemagic Free incluye aprox. 500 minutos/mes de build en macOS.
- Este flujo usa un build de simulador (Debug) que no requiere firma ni secretos.

## Cómo lanzar el primer build
1. Asegúrate de que la rama `main` tenga el `codemagic.yaml` en la raíz.
2. En Codemagic, abre el proyecto del repo y selecciona el workflow:
   - «iOS Simulator Build (NEXARA)» (`ios-simulator-build`).
3. Ejecuta el build manualmente desde la UI o haz push a `main` (también se activa en tags).
4. El pipeline:
   - Usa macOS con Xcode 16.x,
   - instala `xcodegen`,
   - genera `NexaraApp.xcodeproj` desde `apps/mobile-native/ios/project.yml`,
   - compila para `iPhone 15` (simulador) en Debug.
5. Artefactos:
   - `.app` del simulador en `DerivedData/Build/Products/Debug-iphonesimulator/`.
   - Logs de build (`.xcactivitylog`).

## Qué se necesita después para TestFlight (opcional, más adelante)
- Ya contamos con membresía de Apple Developer (paga).
- Para subir a TestFlight desde CI se requiere:
  - Certificados y perfiles de aprovisionamiento válidos, o
  - App Store Connect API Key (Issuer ID, Key ID, Private Key `.p8`).
- En Codemagic se recomienda usar la integración nativa de App Store Connect (Developer Portal Integration).
- El `codemagic.yaml` incluye una sección comentada con ejemplos para activar firma y publicación a TestFlight cuando se carguen los secretos.

## Notas
- Bundle ID: `mx.nexara.mobile.NexaraApp`.
- Nombre del target/esquema: `NexaraApp`.
- Si en algún momento el spec de XcodeGen cambia de nombre a `project.yaml`, el workflow ya contempla ambos.

## TestFlight / App Store (IPA) — configuración paso a paso

1) Crear API Key de App Store Connect (ASC):
- Entra a App Store Connect → Users and Access → Keys → App Store Connect API.
- Crea una nueva clave:
  - Descargar el archivo `.p8` (guárdalo seguro).
  - Anota:
    - Issuer ID
    - Key ID (ej. ABCDE12345)
    - Team ID (si aplica para otros flujos)
- Estas credenciales NO son el Apple ID ni contraseña; son una API Key de ASC.

2) Conectar la integración en Codemagic (recomendado):
- En Codemagic → Settings → Integrations → App Store Connect → Add new → carga la API key (Issuer ID, Key ID y `.p8`).
- Con esto, en `codemagic.yaml` se debe usar `auth: integration` bajo `publishing.app_store_connect` (no se requieren variables de entorno para ASC).

Opcional (solo si no usas integración y prefieres variables):
- Abre el proyecto en Codemagic → Settings → Environment variables y crea:
  - Grupo `app_store_connect` con:
    - `APP_STORE_CONNECT_ISSUER_ID`
    - `APP_STORE_CONNECT_KEY_IDENTIFIER`
    - `APP_STORE_CONNECT_PRIVATE_KEY`
- En cualquier caso, crea también el grupo `ios_signing`:
    - `CERTIFICATE_PRIVATE_KEY`: clave privada en formato PKCS#8 PEM (contenido completo del PEM). Requerida para que Codemagic gestione y guarde certificados de firma.
    - `PROVISIONING_PROFILE_NAME`: nombre del perfil de aprovisionamiento App Store.
    - `BUNDLE_ID`: bundle id de la app (ej. `mx.nexara.mobile.NexaraApp`).

Nota (cuentas personales de Codemagic):
- Los “Environment groups” no están disponibles. En su lugar, usa Application → Environment variables y agrega:
  - `CERTIFICATE_PRIVATE_KEY` (PKCS#8 PEM, marcado como Secure)
  - (Opcional) `PROVISIONING_PROFILE_NAME` si manejas perfiles manualmente

3) Activar workflow iOS App Store en `codemagic.yaml`:
- Ya existe el workflow `ios-app-store`:
  - Archiva (Release) y exporta IPA con `method=app-store`.
  - Publica a TestFlight usando la integración de App Store Connect (`auth: integration`).
  - Mantiene `submit_to_app_store: false` (NO envía a App Review automáticamente).
- Puedes ejecutar el workflow manualmente desde Codemagic o por push/tag a la rama configurada.

4) Recomendaciones:
- Primero verifica que el archive/export funcione (artefacto `.ipa` en `build/export/`).
- Conecta la app en App Store Connect (mismo bundle id).
- Sube a TestFlight; no se mandará a revisión automáticamente (configurable).
- Asegúrate de tener el ícono iOS App Store de 1024×1024 PNG sin transparencia en:
  `apps/mobile-native/ios/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png`

