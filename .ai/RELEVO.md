# RELEVO

- Último turno: cursor
- Fecha: 2026-09-22
- Rama: cursor/ios-erp-parity-push-3975

## Hecho en este turno (iOS parity con Android/web ERP)
- ERP como UX primaria en iOS:
  - `NexaraApp.swift`: al iniciar sesión navega directo a `portal(.erp)`; el back de notificaciones regresa a ERP.
  - Eliminado botón "Paneles" del dashboard ERP y la opción "Cambiar panel" en «Más».
- Sidebar/IA: iOS ya reflejaba el sidebar ERP como Android (reglas en `ConsoleAccessRules`), sin cambios funcionales.
- Notificaciones push (paridad estilo WhatsApp donde APNs lo permite):
  - Nuevo target `NexaraNotificationService` (Notification Service Extension) para enriquecer contenido (subtitle=sender, threadIdentifier, imagen adjunta).
  - `PushManager`: registro de categorías `chat`, `tickets`, `alerts`.
- Versionado iOS para TestFlight:
  - `CURRENT_PROJECT_VERSION` → 2 (project.yml) y `CFBundleVersion` → 2 (Info.plist).
- Verificación PR #5: `Info.plist` incluye descripciones de uso (ubicación, cámara, fotos, micrófono, tracking).

## Pendiente / riesgos
- Backend APNs: para que la extensión se active, el payload debe incluir `mutable-content: 1` y, si aplica, `category`/`chatId`/`image`. Revisar y ajustar envío si hiciera falta.
- Captura de screenshots App Store: se documentan rutas ERP actuales en el PR (sin multipanel).

## No tocar
- Android: sin cambios.
- Web ERP: sin cambios en IA/colores.

## Siguiente paso
1) Validar build XcodeGen con el nuevo target de extensión. 2) Probar push con `mutable-content:1` y `category=chat`. 3) Capturar screenshots definidos en el PR.
