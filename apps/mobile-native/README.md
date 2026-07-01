## Mobile Native (100% nativo)

Reescritura **sin WebView / sin Capacitor** de la app móvil NEXARA, en paridad con `apps/web` (paneles ERP · CRM · OPS · STUDIO · LAB + Portal clientes).

### Stack

| Plataforma | Tecnología |
|---|---|
| **Android** | Kotlin + Jetpack Compose + Navigation + Retrofit + Socket.IO + FCM |
| **iOS** | Swift + SwiftUI (espejo en `ios/`, ver `ios/README.md`) |

### Paneles (igual que web)

Alineado con `apps/web/lib/access-matrix.ts`:

- **ERP** — finanzas, RH, gobierno, almacén (`ConsoleNavHost` filtrado)
- **CRM** — pipeline comercial (`VentasNavHost`)
- **OPS** — campo, GPS, evidencias, herramientas (`ConsoleNavHost` filtrado)
- **STUDIO** — contenido y marca (`WebNavHost`)
- **LAB** — health check y sandbox (`LabNavHost`)
- **Portal** — tickets cliente/sucursal (`TicketsNavHost`)

Resolución de acceso: `android/.../access/PanelAccessResolver.kt` · iOS: `ios/NexaraApp/Access/PanelAccessResolver.swift`

### Android — abrir / compilar

1. Android Studio → **Open** → `apps/mobile-native/android`
2. Sync Gradle → Run `app`
3. API por defecto: `https://api.nexara.com.mx/api` (`BuildConfig.API_BASE_URL`)

### Infraestructura cross-cutting

| Feature | Android | iOS |
|---|---|---|
| Sesión cifrada | ✅ `SessionStore` | ✅ Keychain |
| Socket.IO realtime | ✅ `RealtimeBus` | ⬜ |
| Push FCM | ✅ | ⬜ |
| Cola offline mutaciones | ✅ integrado en `ApiClient` + replay | ⬜ |
| Cache GET offline | ✅ `OfflineHttpInterceptor` | ⬜ |
| Banner sin conexión | ✅ `OfflineBanner` | ⬜ |
| GPS / cámara / mapas | ✅ | ✅ MapKit |

### Matriz de paridad

Ver [`docs/native-parity-matrix.md`](../../docs/native-parity-matrix.md).

### Migración desde Capacitor

La app legacy vive en `apps/mobile/` (Next.js + Capacitor). Esta carpeta reemplaza módulo a módulo hasta poder retirar Capacitor.

### Próximos pasos (orden sugerido)

1. Offline en iOS (URLSession cache + cola)
2. Pantallas STUDIO nativas (hero, casos, noticias) — espejo web reciente
3. Generar catálogo de módulos desde `access-matrix.ts` (script CI)
4. Build iOS en Mac (`ios/MAC_BUILD_PLAYBOOK.md`)
