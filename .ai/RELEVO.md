# RELEVO

- Último turno: cursor
- Fecha: 2026-09-22
- Rama: cursor/erp-ia-push-homologation-7670

## Hecho en este turno (IA ERP + push WhatsApp-like)
- IA «Más» homologada a core (HOY / RECURSOS / MI CUENTA / FINANZAS)
  - Android `ui/console/ConsoleAccessRules.kt`: `consoleSidebarGroups` ahora agrupa:
    - HOY: Chat, Actividades, Asistencia, KPIs del equipo, Clientes, Cotizaciones, Proyectos
    - RECURSOS: Almacén, Herramientas, Vehículos, Organigrama
    - MI CUENTA: Mi perfil
    - FINANZAS (rol alto): Contabilidad, Facturación, Bancos, Viáticos, Gastos, Pagos a empleados, Exportaciones
  - iOS `Access/ConsoleAccessRules.swift`: mismo agrupamiento y orden.
- Push estilo conversación (WhatsApp-like)
  - Android: `push/NexaraNotifications.kt` añade canal `nexara_chat` y `MessagingStyle` con `Person`, agrupado por `chatId` (notificationId estable) y `CATEGORY_MESSAGE`. Auto-detección por `category=chat`/`entityType=chat*`/`chatId`.
  - iOS: `NotificationService` ya mapea `subtitle=sender`, `threadIdentifier=chatId/category`; se mantiene y se asegura `category=chat` desde backend cuando aplica.
  - Backend:
    - `devices/push-dispatch.service.ts`: payload amplía `category`, `chatId`, `senderName`, `conversationTitle`, `entityType`, `relatedEntityId`; en APNs añade `aps['mutable-content']=1` y `category` cuando es chat; datos extra en `data` para FCM.
    - `notifications/notifications.service.ts`: pasa `category`, `entityType`, `relatedEntityId`, `senderName` al dispatcher.
- iOS build: `CFBundleVersion` y `CURRENT_PROJECT_VERSION` a `3`.

## Pendiente / notas
- SiriKit/INSendMessageIntent no integrado (opcional); la UI de conversación funciona con NSE + `threadIdentifier`.
- La detección de hilo en backend extrae `chatId` de `relatedUrl` si no se pasa explícito.

## Verificación sugerida
- Enviar notificación `category=chat` con `sender`, `body`, `chatId` y verificar:
  - Android: burbuja de conversación, título de conversación y agrupación por hilo.
  - iOS: banner con `subtitle=sender`, agrupación por `threadIdentifier`, apertura al chat.
