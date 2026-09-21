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
- En Codemagic se configuran como variables/secretos o mediante una integración de App Store Connect.
- El `codemagic.yaml` incluye una sección comentada con ejemplos para activar firma y publicación a TestFlight cuando se carguen los secretos.

## Notas
- Bundle ID: `mx.nexara.mobile.NexaraApp`.
- Nombre del target/esquema: `NexaraApp`.
- Si en algún momento el spec de XcodeGen cambia de nombre a `project.yaml`, el workflow ya contempla ambos.

