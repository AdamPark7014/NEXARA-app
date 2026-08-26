# Deep links móvil (Android)

Mapeo de URLs web / notificaciones → paneles y pantallas nativas.

## Flujo

1. `DeepLinkParser` o `NotificationDeepLinkResolver` producen un `DeepLinkDestination`.
2. `PendingDeepLink` guarda el destino hasta que hay sesión y el `NavHost` del panel está montado.
3. Cada panel consume con `PendingDeepLink.consumeModuleDestination(panel)` y navega vía `DeepLinkNavigation`.

## Paneles

| Prefijo URL | Panel | NavHost |
|-------------|-------|---------|
| `/erp`, `/console`, `/people`, `/contabilidad` | ERP | `ConsoleNavHost` (panel ERP) |
| `/ops`, `/operacion`, `/noc`, `/support` | OPS | `ConsoleNavHost` (panel OPS) |
| `/crm`, `/ventas` | CRM | `VentasNavHost` |
| `/portal`, `/tickets` | Portal | `TicketsNavHost` |
| `/studio`, `/web` | Studio | `StudioNavHost` |
| `/lab` | Lab | `LabNavHost` |

## Entidades de notificación

| Entidad / `entityType` | Panel | Módulo | Ruta nativa (con ID) |
|------------------------|-------|--------|----------------------|
| Oportunidad (`SalesOpportunity`, `opportunity`) | CRM | `oportunidades` | `v/opportunity/{id}` |
| Lead (`SalesLead`, `lead`) | CRM | `leads` | `v/lead/{id}` |
| Cotización (`Cotizacion`, `quote`) | CRM | `cotizaciones` | `v/quote/{id}` |
| Actividad (`Activity`) | OPS | `activities` | `console/activity/{id}` |
| Viático (`Viatico`) | OPS | `viatics` | lista + highlight `{id}` |
| Ticket (`ticket`, `tickets`) | Portal | `tickets` | `tickets/tickets/{id}` |
| Chat (`chat_message`, `chat`) | ERP | `chat` | canal `?channel=` → `ChatScreen` |

## Ejemplos de `relatedUrl` (API)

| URL | Destino |
|-----|---------|
| `/crm/opportunities/42` | CRM → detalle oportunidad 42 |
| `/crm/leads?highlight=15` | CRM → detalle lead 15 |
| `/crm/quotes/99` | CRM → detalle cotización 99 |
| `/ops/activities/501` | OPS → detalle actividad 501 |
| `/ops/viatics?highlight=7` | OPS → viáticos, resaltar 7 |
| `/erp/chat?channel=3&msg=88` | ERP → chat canal 3 |
| `/portal/tickets/12` | Portal → detalle ticket 12 |
| `/erp/notifications-center` | Centro de notificaciones global |

## Query params reconocidos

| Parámetro | Uso |
|-----------|-----|
| `highlight` | ID de entidad (leads, viáticos, etc.) |
| `id` | ID genérico |
| `channel` | ID de canal de chat |
| `activityId` | ID de actividad (evidencias) |
| `msg` | ID de mensaje (chat; se conserva en `params`) |

## Resolución desde notificación

Prioridad en `NotificationDeepLinkResolver`:

1. `relatedUrl` → `DeepLinkParser.parseWebPath`
2. `entityType` + `relatedEntityId`
3. `category` + `relatedEntityId`

Excepción: `chat_message` usa `relatedEntityId` como mensaje; el canal se toma de `relatedUrl` (`channel=`).

## Tests

Casos cubiertos en `apps/mobile-native/android/app/src/test/java/.../DeepLinkParserTest.kt`.

Ejecutar:

```bash
cd apps/mobile-native/android
./gradlew testDebugUnitTest --tests "mx.nexara.mobile.nativeapp.access.DeepLinkParserTest"
```

## Esquema URI custom (opcional)

`nexara://crm/oportunidades` o `nexara://ops/activities/123` — mismo parser que URLs web (`MainActivity` → `DeepLinkParser.parse(uri)`).
