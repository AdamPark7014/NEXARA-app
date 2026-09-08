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

## Medición del 08-09-2026

Ejecutar `scripts/parity-report.py` no es lo mismo que leer esta tabla. Las
cifras del día del barrido:

| | endpoints distintos |
|---|---|
| Web | 235 |
| Android | 361 |
| iOS | 413 |

| Hueco | Endpoints |
|---|---|
| La web tiene y **ninguna** app | 46 |
| Android tiene y iOS no | 12 |
| **iOS tiene y Android no** | **64** |

Esa última fila es la deuda abierta: el barrido llevó a iOS por delante en
contabilidad, evidencias de actividad, usuarios y ventas. Android necesita una
pasada equivalente para que las dos tiendas reciban lo mismo.

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
| **AUSENTE** | Sin pantalla nativa (Placeholder o sin entrada de catálogo). |
| **WEBVIEW** | Embebido WebView — **0 casos** hoy (escape = navegador externo sin sesión). |

Resumen catálogo Android (128 entradas): estados honestos NATIVO / SOLO_LECTURA / CASCARON.

**Panel INTEGRA: 21 módulos cableados** (2026-09-07). Video, ANPR, vehículos,
horarios, espacios, detección, bitácora, avisos, mi perfil, ajustes, plano y
panorama dejaron de ser «Bloque 2». Dos recortes dichos y no disimulados: las
**cámaras no son transmisión en vivo** (rejilla con vista previa, PTZ y
captura; el muro MSE/WebSocket se queda en la web) y los **polígonos de
detección y los pines del plano se ven pero no se editan**.

> Este documento **ha mentido antes**: llegó a tener 68 ✅ sin una sola
> advertencia, de los que 13 eran módulos de solo lectura y 3 inalcanzables.
> Por eso ahora `check-app-web-parity.py` compara en los dos sentidos y falla
> si la matriz y el catálogo divergen. No edites una fila sin ejecutarlo.

## Escrituras que el dueño NO ha autorizado

Ninguna de estas está implementada en iOS, y en Android solo las marcadas. La
regla del barrido fue: **consulta sí, escritura fiscal o de nómina no**, y las
pantallas lo dicen en su propio pie en vez de esconder el botón.

| Zona | Endpoints |
|---|---|
| Timbrado y SAT | `invoices/:id/stamp`, `/credit-note`, `/cancel`, `payments/:id/stamp-complement`, `compliance/diot`, `compliance/sat-agrupador-status` |
| Cierre contable | `journal-entries/:id/reverse`, `fiscal-periods/:id/close`, `/reopen` |
| Conciliación bancaria | `banking/transactions/:id/reconcile`, `banking/accounts/:id/transactions/import` |
| Nómina | `employee-payments` (alta, edición, marcar pagado), `fines/:id/approve` |
| Usuarios y roles | `POST users`, `users/:id/manager`, `users/:id/hr`, `users/bulk/active`, `users/:id/unlock`, sesiones ajenas, `POST/PATCH/DELETE roles` |
| Privacidad | `audit/privacy/erase/:id` |
| Cobro | `company/billing/checkout`, `company/billing/portal` |

> **Android ya publicó dos de estas y siguen vivas en Google Play:**
> `PATCH accounting/journal-entries/{id}/post` (contabilizar asiento) y
> `POST accounting/journal-entries` (alta de asiento) —
> `ExtraApi.kt:948-951` → `FinanceRichScreens.kt`, alcanzables con la clave
> `accounting`. Son trabajo anterior al barrido y **no se han retirado**:
> quitar funcionalidad ya publicada es decisión del dueño, no de un agente.

Dos decisiones de criterio tomadas durante el barrido, señaladas para revisión:
**aprobar órdenes de compra** desde el móvil se dejó activo (es el paso
siguiente de aprobar requisiciones, que sí estaba autorizado, y el servidor lo
protege con `PROCUREMENT_APPROVE`); **aprobar multas** se dejó fuera, porque una
multa se descuenta de la nómina del trabajador.

## Reglas

- **Parity**: misma capacidad funcional con las mismas reglas RBAC (ver `apps/web/lib/access-matrix.ts`).
- **Paneles v2**: ERP, CRM, OPS, STUDIO, LAB, INTEGRA + Portal clientes.
- **Android hub**: `PanelAccessResolver` + `PanelId` + `ModuleCatalog`.
- **Offline / realtime**: Socket.IO + cola offline en `ApiClient` / `OfflineSyncCoordinator`.

## Core / Auth

| Feature | Web route | Android | iOS |
|---|---|---|---|
| Login | `/login` | NATIVO · LoginScreen | NATIVO · LoginView |
| Panel hub | `/paneles` | NATIVO · PanelAccessResolver | NATIVO · PanelAccessResolver |
| Session store | — | NATIVO · SessionStore | NATIVO · SessionStore |
| Saved accounts | — | NATIVO · QuickProfile | NATIVO · QuickProfileStore |
| Deep links | `nexara://` | NATIVO · DeepLinkParser | NATIVO · DeepLinkParser |

## Panel ERP (ModuleCatalog.console — claves ERP)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Inicio | `/console/dashboard` | NATIVO · ConsoleDashboardScreen | NATIVO |
| Actividades | `/operacion/activities` | NATIVO · ConsoleActivitiesScreen | NATIVO |
| Mis actividades | `/operacion/my-activities` | NATIVO | NATIVO |
| Evidencias | `/operacion/evidences` | NATIVO · flujo 5 pasos + aprobar | NATIVO |
| Mis evidencias | `/operacion/my-evidences` | NATIVO | NATIVO |
| Viáticos (revisión) | `/operacion/viatics` | NATIVO · approveViatic | NATIVO |
| Mis viáticos | `/operacion/my-viatics` | NATIVO · create + estatus | NATIVO |
| Vehículos | `/operacion/vehicles` | NATIVO · approve + flotilla | NATIVO |
| Mis vehículos | `/operacion/my-vehicles` | NATIVO · solicitud + salida/devolución 9 fotos | NATIVO |
| GPS | `/operacion/gps` | NATIVO · ConsoleGpsScreen | NATIVO |
| Herramientas | `/operacion/tools` | NATIVO · hub + inventario/kit/renovaciones | NATIVO |
| Clientes | `/console/clients` | NATIVO · CRUD | NATIVO |
| Proyectos | `/operacion/projects` | NATIVO · patchProjectStatus | NATIVO |
| Proyectos internos | `/operacion/work-projects` | NATIVO · ConsoleProjectsScreen | NATIVO |
| Usuarios | `/console/users` | NATIVO · create/edit | NATIVO |
| Asistencia | `/console/attendance` | NATIVO · check-in geo + foto | NATIVO |
| Comidas (admin) | `/console/lunch-breaks` | NATIVO · KPIs + check-in/out | NATIVO |
| Mis comidas | `/console/my-lunch-breaks` | NATIVO | NATIVO |
| RRHH | `/console/hr` | NATIVO · aprobar ausencias | NATIVO |
| Pagos empleados | `/console/employee-payments` | NATIVO · CRUD + pagado | NATIVO |
| Contabilidad | `/console/accounting` | NATIVO · pólizas create/post | NATIVO |
| Banca | `/console/banking` | NATIVO · cuentas | NATIVO |
| Facturación | `/console/invoicing` | NATIVO · pagos/match | NATIVO |
| Gastos | `/console/expenses` | NATIVO · create/approve | NATIVO |
| Multas | `/console/fines` | NATIVO · approve/reject | NATIVO |
| Cotizaciones ERP | `/console/cotizaciones` | SOLO_LECTURA | SOLO_LECTURA |
| Gestión vendedores | `/console/gestion-vendedores` | SOLO_LECTURA · VentasSalesTeamScreen | SOLO_LECTURA |
| Vista ejecutiva | `/erp/executive` | SOLO_LECTURA · ExecutiveScreen | SOLO_LECTURA |
| Despacho OT | `/ops/dispatch` | NATIVO · board + reassign | NATIVO |
| Aprobaciones | `/erp/approvals` | NATIVO · workflowDecide | NATIVO |
| Notificaciones | `/erp/notifications-center` | NATIVO · NotificationsScreen | NATIVO |
| Chat | `/erp/chat` | NATIVO · ChatScreen (a veces oculto en menú) | NATIVO |
| BI | `/erp/analytics/bi` | SOLO_LECTURA · ErpBiScreen | SOLO_LECTURA |
| Analítica | `/console/analytics` | SOLO_LECTURA · ErpBiScreen | SOLO_LECTURA |
| Auditoría | `/console/audit` | SOLO_LECTURA · AuditModuleScreen | SOLO_LECTURA |
| Activos | `/operacion/assets` | SOLO_LECTURA · las escrituras del fichero son de la pestaña Órdenes, o sea de `maintenance` | SOLO_LECTURA |
| Almacén | `/console/stock` | NATIVO · WarehouseHubScreen | NATIVO |
| Bodega | `/console/warehouse` | NATIVO | NATIVO |
| Compras | `/console/procurement` | NATIVO · approve/reject req | NATIVO |
| Mantenimiento | `/operacion/maintenance` | NATIVO · OT start/complete | NATIVO |
| Hojas de servicio | `/operacion/service-sheets` | SOLO_LECTURA · **no existe ningún endpoint de escritura de hojas de servicio** en el cliente | SOLO_LECTURA |
| Documentos | `/console/documents` | NATIVO · upload | NATIVO |
| CVs | `/console/cvs` | NATIVO · create + move stage | NATIVO |
| Reclutamiento | `/ops/recruiting` | NATIVO · RecruitingScreen | NATIVO |
| Tickets clientes | `/operacion/client-tickets` | NATIVO · ClientTicketsModuleScreen | NATIVO |
| Clientes servicio | `/ops/service-clients` | NATIVO · ConsoleClientsScreen | NATIVO |
| Bandeja soporte | `/ops/support` | NATIVO | NATIVO |
| NOC | `/ops/noc` | SOLO_LECTURA · sin reconocer alarma | SOLO_LECTURA |
| SLA | `/ops/support/sla` | SOLO_LECTURA | SOLO_LECTURA |
| Contratos mant. | `/ops/maintenance/contracts` | NATIVO · create/status/OT | NATIVO |
| Mensajes contacto | `/console/contact-messages` | SOLO_LECTURA | SOLO_LECTURA |
| Noticias ERP | `/console/news` | SOLO_LECTURA · lista real, sin alta | SOLO_LECTURA |
| Newsletter ERP | `/console/newsletter` | SOLO_LECTURA | SOLO_LECTURA |
| Mi perfil | `/console/my-profile` | NATIVO · MyProfileScreen | NATIVO |
| Mis preferencias | `/console/my-preferences` | SOLO_LECTURA | SOLO_LECTURA |
| Cola offline | `/console/offline-queue` | NATIVO · OfflineQueueScreen | NATIVO |
| Ajustes | `/console/settings` | NATIVO · parcial (faltan api-keys/webhooks) | NATIVO |
| Multi-empresa | `/erp/companies` | NATIVO · create/edit | NATIVO |
| Knowledge Base | `/erp/kb` | SOLO_LECTURA | SOLO_LECTURA |
| Exportaciones | `/erp/exports` | SOLO_LECTURA · es un `@GET`: descarga, no administra | SOLO_LECTURA |
| Arquitectura | `/erp/architecture` | SOLO_LECTURA · catálogo local, no llama a la API | SOLO_LECTURA |
| Calendario | `/erp/calendar` | SOLO_LECTURA | SOLO_LECTURA |
| Organigrama | `/erp/hr/orgchart` | SOLO_LECTURA | SOLO_LECTURA |
| KPIs personas | `/erp/hr/kpis` | SOLO_LECTURA | SOLO_LECTURA |
| Reuniones | `/erp/reuniones` | NATIVO · 4 pestañas, convocar con agenda, pasar lista mandando la lista completa, acuerdos con dueño y fecha, cierre con minuta | AUSENTE |
| Accesos oficinas | `/erp/facilities/access` | AUSENTE | AUSENTE |

## Panel CRM (ModuleCatalog.ventas)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Dashboard | `/ventas/dashboard` | SOLO_LECTURA · VentasDashboardScreen | SOLO_LECTURA |
| Leads | `/ventas/leads` | NATIVO · CRUD | NATIVO |
| Oportunidades | `/ventas/oportunidades` | NATIVO · FAB + detalle | NATIVO |
| Cotizaciones | `/ventas/cotizaciones` | NATIVO | NATIVO |
| Cotizador inteligente | `/ventas/cotizaciones/nueva` | NATIVO · SmartQuoteBuilderScreen | NATIVO |
| Productos | `/ventas/productos` | SOLO_LECTURA | SOLO_LECTURA |
| Clientes | `/ventas/clientes` | NATIVO · CRUD | NATIVO |
| Proyectos | `/ventas/proyectos` | NATIVO · status/costos/close | NATIVO |
| Pipeline | `/crm/pipeline` | NATIVO · updateStage | NATIVO |
| Agenda | `/crm/agenda` | NATIVO | NATIVO |
| Licitaciones | `/crm/tenders` | SOLO_LECTURA | SOLO_LECTURA |
| Metas | `/crm/targets` | SOLO_LECTURA | SOLO_LECTURA |
| Plantillas | `/ventas/plantillas` | NATIVO | NATIVO |
| Gestión vendedores | `/ventas/gestion-vendedores` | SOLO_LECTURA | SOLO_LECTURA |
| Comparativa equipo | `/ventas/equipo-comparativa` | SOLO_LECTURA · CrmReportsScreen | SOLO_LECTURA |
| Crecimiento | `/ventas/crecimiento` | SOLO_LECTURA | SOLO_LECTURA |
| Reportes | `/ventas/reportes` | SOLO_LECTURA | SOLO_LECTURA |
| Notificaciones | `/ventas/notificaciones` | NATIVO | NATIVO |
| Chat | `/erp/chat` | NATIVO | NATIVO |
| Mi perfil | `/ventas/my-profile` | NATIVO | NATIVO |
| Equipo CRM | `/crm/team` | AUSENTE (expuesto como gestion-vendedores) | AUSENTE |

## Panel Contabilidad (ModuleCatalog.contabilidad)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Dashboard | `/contabilidad/dashboard` | SOLO_LECTURA | SOLO_LECTURA |
| Contabilidad | `/contabilidad/accounting` | NATIVO · pólizas | NATIVO |
| Banca | `/contabilidad/banking` | NATIVO · cuentas | NATIVO |
| Facturación | `/contabilidad/invoicing` | NATIVO | NATIVO |
| Gastos | `/contabilidad/expenses` | NATIVO | NATIVO |
| Pagos empleados | `/contabilidad/employee-payments` | NATIVO · CRUD + pagado | NATIVO |
| Viáticos | `/contabilidad/viaticos` | NATIVO · abría «Mis viáticos» filtrado por el propio usuario, así que el contador veía una pantalla vacía; ahora abre la de revisión | CASCARON |
| Pagos | `/contabilidad/pagos` | NATIVO | CASCARON |
| Horas | `/contabilidad/horas` | SOLO_LECTURA | SOLO_LECTURA |
| Proyectos | `/contabilidad/proyectos` | NATIVO · ConsoleProjectsScreen | NATIVO |
| Proyectos internos | `/contabilidad/work-projects` | NATIVO · ConsoleProjectsScreen | NATIVO |
| Multas | `/contabilidad/multas` | NATIVO · FinesRichScreen | NATIVO |
| Chat | `/erp/chat` | NATIVO | NATIVO |

## Panel STUDIO (ModuleCatalog.studio)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Dashboard | `/studio/dashboard` | SOLO_LECTURA | SOLO_LECTURA |
| Hero | `/studio/hero` | NATIVO · CRUD + reorder | NATIVO |
| Secciones | `/studio/pages` | NATIVO · JSON editor | NATIVO |
| Casos | `/studio/cases` | NATIVO · CRUD + publicar | NATIVO |
| Noticias | `/studio/news` | NATIVO | NATIVO |
| Redes | `/studio/social` | NATIVO | NATIVO |
| Newsletter | `/studio/newsletter` | SOLO_LECTURA | SOLO_LECTURA |
| Contactos | `/studio/contacts` | NATIVO | NATIVO |
| Leads sitio | `/studio/leads` | NATIVO | NATIVO |
| Chat | `/erp/chat` | NATIVO | NATIVO |

## Panel LAB (ModuleCatalog.lab)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Home | `/lab` | SOLO_LECTURA · LabHomeScreen | SOLO_LECTURA |
| API Health | `/lab/health` | SOLO_LECTURA | SOLO_LECTURA |
| Feature flags | `/lab/flags` | NATIVO · setFlag | NATIVO |
| AI Sandbox | `/lab/ai` | NATIVO · runAi | NATIVO |
| Chat | `/lab/chat` | NATIVO | NATIVO |

## Panel INTEGRA — MVP nativo + Bloque 2

`PanelId.INTEGRA` + `IntegraNavHost` + `ModuleCatalog.integra` en Android.
MVP operativo contra `/api/integra/**` (sin inventar ISAPI).

| Module | Web route | Android | iOS |
|---|---|---|---|
| Inicio hub | `/integra/` | NATIVO · IntegraNavHost | AUSENTE |
| Accesos | `/integra/access` | NATIVO · puertas + open | AUSENTE |
| Eventos | `/integra/events` | NATIVO · lista | AUSENTE |
| Personas | `/integra/people` | NATIVO · CRUD + face | NATIVO |
| Asistencia ACS | `/integra/attendance` | NATIVO · lista | AUSENTE |
| Visitas | `/integra/visitors` | NATIVO · lista + registro | AUSENTE |
| Alarmas | `/integra/alarms` | NATIVO · queue + ack/clear | AUSENTE |
| En sitio | `/integra/access` | NATIVO · occupancy API (webPath→access) | AUSENTE |
| Equipos | `/integra/access` | NATIVO · devices API (webPath→access) | AUSENTE |
| Ajustes / Sitios | `/integra/settings` | NATIVO · alta, etiqueta, activación, módulos por sitio, sync y baja | AUSENTE |
| Cámaras | `/integra/video` | NATIVO · rejilla con vista previa autorregulada, PTZ con presets, captura. **No es transmisión en vivo**: el muro MSE/WebSocket se queda en la web y la pantalla no pone «EN VIVO» | AUSENTE |
| Detección | `/integra/detection` | NATIVO · sensibilidad, confianza, objetivo, horario, guardar, aplicar al equipo y sondeo de capacidades. **Los polígonos de zona se ven pero no se editan** | AUSENTE |
| ANPR | `/integra/anpr` | NATIVO · lecturas de placa | AUSENTE |
| Vehículos ACS | `/integra/vehicles` | NATIVO · alta/edición/baja con aviso de placa duplicada | AUSENTE |
| Horarios | `/integra/schedules` | NATIVO · vigencia, plantilla por puerta, presets y reparto por terminal | AUSENTE |
| Espacios | `/integra/espacios` | NATIVO · política por espacio, reservas y cancelación | AUSENTE |
| Auditoría | `/integra/audit` | NATIVO · filtros, paginación real, `ipAddress`/`userAgent`/`previousData` visibles | AUSENTE |
| Notificaciones | `/integra/notifications-center` | NATIVO · centro con triaje | AUSENTE |
| Mi perfil | `/integra/my-profile` | NATIVO · credenciales y qué abre cada una | AUSENTE |
| Plano | `/integra/map` | SOLO_LECTURA · zoom, ficha del pin con estado vivo, cobertura y pines huérfanos. **No se sitúan ni se borran pines**: el servidor hace `upsert` por equipo y uno mal puesto pisa el bueno | AUSENTE |
| Panorama | `/integra/dashboard` | SOLO_LECTURA · enlace, puertas y cámaras con su resto «sin reportar», alarmas de 24 h, gente en sitio | AUSENTE |

## Portal clientes (TicketsNavHost — fuera del catálogo ERP)

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
