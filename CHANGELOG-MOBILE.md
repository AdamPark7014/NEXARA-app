# Changelog — NEXARA Mobile (Android nativo)

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).  
App: `mx.nexara.mobile.nativeapp` · código en `apps/mobile-native/android/`.

## [1.0.0] — 2026-08-22

Primera versión pública en Google Play de la app móvil 100 % nativa (Kotlin + Jetpack Compose), en paridad funcional con los paneles web de NEXARA.

### Plataforma

- Arquitectura nativa sin WebView/Capacitor: Retrofit, Navigation Compose, Room/cola offline donde aplica.
- Integración con API de producción (`api.nexara.com.mx`) y tiempo real vía Socket.IO.
- Firebase Cloud Messaging para notificaciones push y Firebase Analytics (uso agregado).
- Firma de release para Play (AAB) y configuración de red/ProGuard para builds de producción.

### Acceso, sesión y seguridad

- Login corporativo con aislamiento por organización y resolución de permisos alineada a la web.
- Tokens de sesión cifrados en dispositivo (Android Keystore / `SessionStore`).
- Inicio de sesión con biometría, preferencias de login y flujo de onboarding.
- Manejo de sesión expirada, errores de API mapeados y eventos globales de sesión.
- Deep links y resolución de navegación desde notificaciones.

### Paneles

- **Selector de paneles** con acceso por rol: ERP, Ventas (CRM), OPS, Contabilidad, STUDIO, LAB y Portal de clientes.
- Recordatorio del último panel usado (`PanelPreferencesStore`).
- **ERP / Consola (`ConsoleNavHost`):** módulos nativos para operación y administración — dashboard, actividades, evidencias, viáticos, vehículos, GPS, herramientas, clientes, proyectos, usuarios, asistencia, RH, finanzas (contabilidad, banca, facturación, gastos), almacén, compras, aprobaciones, BI, auditoría, documentos, chat, notificaciones, ajustes, cola offline y más (catálogo en `ModuleCatalog`).
- **Ventas (`VentasNavHost`):** CRM comercial — dashboard, leads, oportunidades, cotizaciones, catálogo IT/CCTV, pipeline, agenda, metas, reportes, gestión de vendedores.
- **Contabilidad (`ContabilidadNavHost`):** panel financiero dedicado.
- **STUDIO (`StudioNavHost`):** gestión de contenido, casos, noticias, newsletter y contactos.
- **LAB (`LabNavHost`):** herramientas internas (health, flags, IA).
- **Portal de clientes:** tickets y módulos de autoservicio para clientes de la organización.

### Ventas y cotizador inteligente

- API y repositorio de Smart Quote: búsqueda de productos, armado de cotización y detalle.
- Generación/consulta de PDF de cotización alineada al backend.
- Pantallas ricas de CRM y finanzas compartidas con la consola donde aplica.

### Chat y notificaciones

- Chat en tiempo real (`ChatRepository`, `ChatApi`) con favoritos y eventos de bus en tiempo real.
- Pantalla de chat nativa y centro de notificaciones in-app.
- Registro de token FCM y sincronización con el servidor.

### Operación en campo

- Mapas integrados (`NexaraMap`) para GPS y seguimiento operativo.
- Módulos de evidencias, actividades, viáticos, vehículos e inventario de herramientas.
- Permisos de ubicación, cámara y almacenamiento solicitados en tiempo de ejecución.

### Offline y sincronización

- Cola offline con coordinador de sincronización al reconectar.
- Pantalla de cola offline para revisar operaciones pendientes.

### Experiencia de usuario

- Sistema de diseño empresarial NEXARA (`EnterpriseComponents`, `NxNavigation`).
- Carga de imágenes asíncrona, visor PDF y listas reutilizables.
- Perfil, preferencias y pantallas de configuración de consola.

### Documentación y Play Store

- Ficha y checklist de Play (`docs/PLAY-STORE-LISTING.md`, `PLAY-STORE-CHECKLIST.md`).
- Cuenta demo para revisores (`seed:play-reviewer`).
- Smoke automatizado: `npm run mobile:smoke`.

### Notas técnicas

- `VERSION_CODE=2`, `VERSION_NAME=1.0.0` en `apps/mobile-native/android/gradle.properties`.
- Artefacto de subida: `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab`.

[1.0.0]: https://github.com/nexara/nexara-app/releases/tag/mobile-v1.0.0
