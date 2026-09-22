# RELEVO

- Último turno: cursor
- Fecha: 2026-09-22
- Rama: cursor/ios-erp-parity-push-3975

## Hecho en este turno (ERP-first + color web core + TestFlight plist)
- Android ERP-first:
  - `ui/NexaraApp.kt`: post-login siempre a `Routes.Erp`; `DeepLinkDestination.PanelHub` redirige a ERP.
  - `ui/console/ConsoleNavHost.kt`: `onExitToPanels` ahora opcional; se oculta \"Salir a paneles\" (ERP como shell).
  - Tema: tokens de marca a azul web `#2563EB` (`NxColors.Teal = #2563EB`, `TealSoft = #DBEAFE`); Material3 secundario/oscuro ajustados.
- iOS marca/ERP:
  - `Resources/Assets.xcassets/AccentColor`: `#2563EB`; `.tint(Color(\"AccentColor\"))` en `NexaraApp.swift`.
  - Vistas ERP clave (Activities, Evidences, Attendance, GPS, Warehouse, ERP dashboard): `.teal` → `AccentColor`.
  - iOS ya entra ERP-first (como en PR #6 previo).
- TestFlight (PR #5 integrado aquí):
  - Workflow patcha Info.plist embebido para copiar descripciones de privacidad desde `Resources/Info.plist`
    (Location, Camera, PhotoLibrary, Microphone, Tracking) y asegura `CFBundleVersion=2` si venía `1`.

## Pendiente / riesgos
- Backend APNs: payload con `mutable-content: 1` y opcional `category`/`chatId`/`image` para estilo «chat».
- Disparar TestFlight: requiere merge a `main` y tag `ios-testflight-*` (secrets en repo).
- Capturas App Store: tomar desde ERP (sidebar IA par web; sin multipanel).

## No tocar
- Web ERP: IA/colores son la referencia (core.nexara.com.mx).

## Siguiente paso
1) Merge PR #6 a `main` (PR #5 queda subsumido). 2) Ejecutar workflow TestFlight en `main`. 3) Verificar notificaciones iOS con payloads reales.
