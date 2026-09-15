# Native parity matrix (apps/web → apps/mobile-native)

Checklist de **paridad honesta** entre el panel web (`apps/web`) y la app nativa Android (+ referencia iOS).
Fuente de verdad del catálogo: `ModuleCatalog.kt` (`parityStatus` + `nativeImplemented` derivado).

**Verificación:**
- `python scripts/check-app-web-parity.py` — falla si esta matriz y el catálogo de Android divergen.
- `python scripts/parity-report.py` — **no lee este documento**: cuenta qué endpoints
  de la API consume de verdad cada cliente, leyendo el código. Úsalo antes de
  creerte una fila de aquí.
- `python scripts/ios-static-check.py` — errores de compilación de Swift sin Mac, y
  claves de catálogo iOS sin caso en el router.

## Solo existe NEXARA Core (15-09-2026)

Decisión del dueño: **solo existe ERP**. El menú de paneles no tiene sentido y toda
vista que no sea ERP no debe existir. En Android se quitaron:

- el selector de paneles («Tus paneles») y la preferencia del último panel;
- los paneles CRM/Ventas, STUDIO, LAB, INTEGRA, OPS y Contabilidad, con sus
  pantallas, repositorios, APIs y pruebas;
- todos los módulos ERP fuera de `CORE_OLA1_MODULE_IDS` (inicio/dashboard,
  herramientas, vehículos, viáticos, usuarios, proyectos, finanzas, almacén,
  compras, reuniones, gobierno, etc.) y la ruta genérica `console/m/{key}`.

Tras el login el personal entra directo a **Actividades** (`/erp/pizarra`). La barra
inferior lleva exactamente los módulos de Core que la web le da al rol
(`me/navigation.paths` con la coincidencia estricta de url-matrix; Clientes además
exige sectores por correo) y la campana de notificaciones va arriba.

El **portal de clientes** (`/tickets`, portal.nexara.com.mx) se conserva — en la web
«NO se toca» — pero solo para cuentas de cliente y de sucursal (`isClient` /
`isBranchUser`), que entran directo a él. El personal nunca lo ve.

Los deep links y toques de notificación siguen `coreSurfaceRedirect`: el detalle y
las evidencias de actividad conservan el id, Mi perfil y Mis actividades van a su
equivalente, las URLs viejas de asistencia y comidas abren Asistencias, y todo lo
demás abre la casa de Core.

### Escrituras fiscales que Android tenía publicadas

La versión anterior de esta matriz advertía que Android exponía
`PATCH accounting/journal-entries/{id}/post` y `POST accounting/journal-entries`
desde `FinanceRichScreens.kt`. Con el recorte a Core esas pantallas **ya no existen**
en la app: no queda ninguna escritura fiscal, de nómina ni de usuarios en Android.

## Medición del 08-09-2026 (antes del recorte a Core)

Ejecutar `scripts/parity-report.py` no es lo mismo que leer esta tabla. Las
cifras del día del barrido, **antes** de quitar los paneles:

| | endpoints distintos |
|---|---|
| Web | 235 |
| Android | 361 |
| iOS | 413 |

Tras el recorte a Core estas cifras ya no describen la app Android; vuelve a correr
el informe antes de citarlas.

### Cómo se lee el informe, y cómo engaña

Mide **superficie de API consumida**, no calidad de pantalla: un listado muerto
y un CRUD completo consumen el mismo `GET`. Y solo ve la ruta cuando es un
literal pegado al helper. Dos veces en el mismo día invirtió el diagnóstico:

- No reconocía `postJSON` ni `getBinary`, y llegó a afirmar que la app iOS no
  tenía `auth/login`. iOS pasó de 157 a 381 endpoints al arreglarlo.
- `TicketsRepository` elegía la ruta con un ternario entre `client-portal/...` y
  `branch-portal/...`. El informe daba las 20 por ausentes: **26 endpoints de
  hueco donde solo había 8.**
- Normalizaba `newsletter${qs}` a `newsletter:id`, fabricando endpoints que no
  existen.

Si un hueco te sorprende, compruébalo a mano antes de mandar a nadie a taparlo.

## Leyenda (columna Android / iOS)

| Estado | Significado |
|---|---|
| **NATIVO** | Pantalla Compose con CRUD/ops reales contra la API. `nativeImplemented=true`. |
| **SOLO_LECTURA** | Pantalla nativa de consulta; la web tampoco exige mutaciones (KPIs, logs, catálogos). |
| **CASCARON** | Pantalla existe pero lista/detalle sin operar; la web sí permite crear/editar/aprobar. |
| **AUSENTE** | Sin pantalla nativa (sin entrada de catálogo). |
| **WEBVIEW** | Embebido WebView — **0 casos** hoy (escape = navegador externo sin sesión). |

> Este documento **ha mentido antes**: llegó a tener 68 ✅ sin una sola
> advertencia, de los que 13 eran módulos de solo lectura y 3 inalcanzables.
> Por eso `check-app-web-parity.py` compara en los dos sentidos y falla
> si la matriz y el catálogo divergen. No edites una fila sin ejecutarlo.

## Reglas

- **Parity**: misma capacidad funcional con las mismas reglas RBAC (`apps/web/lib/core-surface.ts`, `apps/api/src/common/rbac/url-matrix.ts`).
- **Superficies**: NEXARA Core (ERP) + portal de clientes solo para cuentas externas.
- **Android**: `PanelAccessResolver` (Core o portal) + `CoreMenu` (módulos por rol) + `ModuleCatalog.core`.
- **Offline / realtime**: Socket.IO + cola offline en `ApiClient` / `OfflineSyncCoordinator`.

## Arranque y sesión

| Feature | Web route | Android | iOS |
|---|---|---|---|
| Login | `/login` | NATIVO · LoginScreen | NATIVO · LoginView |
| Entrada directa a Core | — | NATIVO · PanelAccessResolver (sin selector de paneles) | sin verificar |
| Session store | — | NATIVO · SessionStore | NATIVO · SessionStore |
| Deep links | `nexara://` | NATIVO · DeepLinkParser (coreSurfaceRedirect) | NATIVO · DeepLinkParser |

## NEXARA Core (ModuleCatalog.core)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Actividades | `/erp/pizarra` | NATIVO · ActividadesScreen: pizarra del equipo, día de cada persona, Mis actividades | sin verificar |
| Mis actividades | `/erp/mis-actividades` | NATIVO · pestaña «Mis actividades» dentro de Actividades | sin verificar |
| Asistencias | `/erp/asistencias` | NATIVO · ConsoleAttendanceScreen (checada + comidas) | sin verificar |
| Chat | `/erp/chat` | NATIVO · ChatScreen | sin verificar |
| Clientes | `/erp/clientes` | CASCARON · aún abre el padrón de clientes de servicio, no el de sectores de la web | sin verificar |
| Mi perfil | `/erp/my-profile` | NATIVO · MyProfileScreen | sin verificar |
| Notificaciones | `/erp/notifications-center` | NATIVO · NotificationsScreen desde la campana | sin verificar |

## Portal clientes (TicketsNavHost — solo cuentas de cliente y de sucursal)

| Capability | Web route | Android | iOS |
|---|---|---|---|
| Portal home | `/tickets` | NATIVO | NATIVO |
| Sucursales CRUD | `/tickets/*` | NATIVO | NATIVO |
| Solicitudes | — | NATIVO | NATIVO |
| Inventarios sync | — | NATIVO | NATIVO |
| Feedback | — | NATIVO | NATIVO |
| Perfil | — | NATIVO · updateProfile | NATIVO |
| Detalle ticket | — | NATIVO · comentarios + acciones estado | NATIVO |

## Cross-cutting

| Feature | Android | iOS |
|---|---|---|
| Socket.IO realtime | NATIVO · RealtimeBus | NATIVO |
| Offline GET cache | NATIVO | NATIVO |
| Offline mutation queue | NATIVO | NATIVO |
| Push (FCM/APNs) | NATIVO | WIP · aps dev |
| Camera / uploads | NATIVO · MediaPickerBar | NATIVO |
