# Native parity matrix (apps/web → apps/mobile-native)

Checklist de **paridad honesta** entre el panel web (`apps/web`) y la app nativa Android (+ referencia iOS).
Fuente de verdad del catálogo: `ModuleCatalog.kt` (`parityStatus` + `nativeImplemented` derivado).

**Verificación:** `python scripts/check-app-web-parity.py` (falla si la matriz y el catálogo divergen).

## Leyenda (columna Android / iOS)

| Estado | Significado |
|---|---|
| **NATIVO** | Pantalla Compose con CRUD/ops reales contra la API. `nativeImplemented=true`. |
| **SOLO_LECTURA** | Pantalla nativa de consulta; la web tampoco exige mutaciones (KPIs, logs, catálogos). |
| **CASCARON** | Pantalla existe pero lista/detalle sin operar; la web sí permite crear/editar/aprobar. |
| **AUSENTE** | Sin pantalla nativa (Placeholder o sin entrada de catálogo). |
| **WEBVIEW** | Embebido WebView — **0 casos** hoy (escape = navegador externo sin sesión). |

Resumen catálogo Android (111+ entradas): estados honestos NATIVO / SOLO_LECTURA / CASCARON.
Panel INTEGRA MVP móvil: **Access, Events, People, ACS Attendance, Visitors** (NATIVO); video/ANPR/mapa = AUSENTE (Bloque 2).

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
| Vehículos | `/operacion/vehicles` | CASCARON · solo lista | CASCARON |
| Mis vehículos | `/operacion/my-vehicles` | NATIVO · solicitud + salida/devolución 9 fotos | NATIVO |
| GPS | `/operacion/gps` | NATIVO · ConsoleGpsScreen | NATIVO |
| Herramientas | `/operacion/tools` | NATIVO · hub + inventario/kit/renovaciones | NATIVO |
| Clientes | `/console/clients` | NATIVO · CRUD | NATIVO |
| Proyectos | `/operacion/projects` | NATIVO · patchProjectStatus | NATIVO |
| Proyectos internos | `/operacion/work-projects` | CASCARON · WorkProjectsRichScreen | CASCARON |
| Usuarios | `/console/users` | NATIVO · create/edit | NATIVO |
| Asistencia | `/console/attendance` | NATIVO · check-in geo + foto | NATIVO |
| Comidas (admin) | `/console/lunch-breaks` | NATIVO · KPIs + check-in/out | NATIVO |
| Mis comidas | `/console/my-lunch-breaks` | NATIVO | NATIVO |
| RRHH | `/console/hr` | NATIVO · aprobar ausencias | NATIVO |
| Pagos empleados | `/console/employee-payments` | CASCARON | CASCARON |
| Contabilidad | `/console/accounting` | NATIVO · pólizas create/post | NATIVO |
| Banca | `/console/banking` | NATIVO · cuentas | NATIVO |
| Facturación | `/console/invoicing` | NATIVO · pagos/match | NATIVO |
| Gastos | `/console/expenses` | NATIVO · create/approve | NATIVO |
| Multas | `/console/fines` | NATIVO · approve/reject | NATIVO |
| Cotizaciones ERP | `/console/cotizaciones` | SOLO_LECTURA | SOLO_LECTURA |
| Gestión vendedores | `/console/gestion-vendedores` | SOLO_LECTURA · VentasSalesTeamScreen | SOLO_LECTURA |
| Vista ejecutiva | `/erp/executive` | SOLO_LECTURA · ExecutiveScreen | SOLO_LECTURA |
| Despacho OT | `/ops/dispatch` | CASCARON · pantalla OK, menú oculto | CASCARON |
| Aprobaciones | `/erp/approvals` | NATIVO · workflowDecide | NATIVO |
| Notificaciones | `/erp/notifications-center` | NATIVO · NotificationsScreen | NATIVO |
| Chat | `/erp/chat` | NATIVO · ChatScreen (a veces oculto en menú) | NATIVO |
| BI | `/erp/analytics/bi` | SOLO_LECTURA · ErpBiScreen | SOLO_LECTURA |
| Analítica | `/console/analytics` | SOLO_LECTURA · ErpBiScreen | SOLO_LECTURA |
| Auditoría | `/console/audit` | SOLO_LECTURA · AuditModuleScreen | SOLO_LECTURA |
| Activos | `/operacion/assets` | NATIVO · MaintenanceModuleScreen | NATIVO |
| Almacén | `/console/stock` | NATIVO · WarehouseHubScreen | NATIVO |
| Bodega | `/console/warehouse` | NATIVO | NATIVO |
| Compras | `/console/procurement` | NATIVO · approve/reject req | NATIVO |
| Mantenimiento | `/operacion/maintenance` | NATIVO · OT start/complete | NATIVO |
| Hojas de servicio | `/operacion/service-sheets` | NATIVO · ServiceSheetsModuleScreen | NATIVO |
| Documentos | `/console/documents` | NATIVO · upload | NATIVO |
| CVs | `/console/cvs` | CASCARON | CASCARON |
| Reclutamiento | `/ops/recruiting` | CASCARON · inalcanzable en sidebar | CASCARON |
| Tickets clientes | `/operacion/client-tickets` | NATIVO · ClientTicketsModuleScreen | NATIVO |
| Clientes servicio | `/ops/service-clients` | NATIVO · ConsoleClientsScreen | NATIVO |
| Bandeja soporte | `/ops/support` | NATIVO | NATIVO |
| NOC | `/ops/noc` | SOLO_LECTURA · sin reconocer alarma | SOLO_LECTURA |
| SLA | `/ops/support/sla` | SOLO_LECTURA | SOLO_LECTURA |
| Contratos mant. | `/ops/maintenance/contracts` | CASCARON | CASCARON |
| Mensajes contacto | `/console/contact-messages` | SOLO_LECTURA | SOLO_LECTURA |
| Noticias ERP | `/console/news` | CASCARON · lista sin CRUD | CASCARON |
| Newsletter ERP | `/console/newsletter` | CASCARON | CASCARON |
| Mi perfil | `/console/my-profile` | CASCARON · sin updateProfile | CASCARON |
| Mis preferencias | `/console/my-preferences` | SOLO_LECTURA | SOLO_LECTURA |
| Cola offline | `/console/offline-queue` | NATIVO · OfflineQueueScreen | NATIVO |
| Ajustes | `/console/settings` | NATIVO · parcial (faltan api-keys/webhooks) | NATIVO |
| Multi-empresa | `/erp/companies` | NATIVO · create/edit | NATIVO |
| Knowledge Base | `/erp/kb` | SOLO_LECTURA | SOLO_LECTURA |
| Exportaciones | `/erp/exports` | NATIVO · CSV + share | NATIVO |
| Arquitectura | `/erp/architecture` | CASCARON · catálogo local | CASCARON |
| Calendario | `/erp/calendar` | SOLO_LECTURA | SOLO_LECTURA |
| Organigrama | `/erp/hr/orgchart` | SOLO_LECTURA | SOLO_LECTURA |
| KPIs personas | `/erp/hr/kpis` | SOLO_LECTURA | SOLO_LECTURA |
| Reuniones | `/erp/reuniones` | AUSENTE | AUSENTE |
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
| Proyectos | `/ventas/proyectos` | CASCARON · sin costos/orden | CASCARON |
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
| Mi perfil | `/ventas/my-profile` | CASCARON | CASCARON |
| Equipo CRM | `/crm/team` | AUSENTE (expuesto como gestion-vendedores) | AUSENTE |

## Panel Contabilidad (ModuleCatalog.contabilidad)

| Module | Web route (catalog) | Android | iOS |
|---|---|---|---|
| Dashboard | `/contabilidad/dashboard` | SOLO_LECTURA | SOLO_LECTURA |
| Contabilidad | `/contabilidad/accounting` | NATIVO · pólizas | NATIVO |
| Banca | `/contabilidad/banking` | NATIVO · cuentas | NATIVO |
| Facturación | `/contabilidad/invoicing` | NATIVO | NATIVO |
| Gastos | `/contabilidad/expenses` | NATIVO | NATIVO |
| Pagos empleados | `/contabilidad/employee-payments` | CASCARON | CASCARON |
| Viáticos | `/contabilidad/viaticos` | CASCARON · MyViaticsScreen RO | CASCARON |
| Pagos | `/contabilidad/pagos` | CASCARON | CASCARON |
| Horas | `/contabilidad/horas` | SOLO_LECTURA | SOLO_LECTURA |
| Proyectos | `/contabilidad/proyectos` | NATIVO · ConsoleProjectsScreen | NATIVO |
| Proyectos internos | `/contabilidad/work-projects` | CASCARON | CASCARON |
| Multas | `/contabilidad/multas` | CASCARON | CASCARON |
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
| Newsletter | `/studio/newsletter` | CASCARON · sin mutaciones | CASCARON |
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
| Personas | `/integra/people` | NATIVO · lista/detalle | AUSENTE |
| Asistencia ACS | `/integra/attendance` | NATIVO · lista | AUSENTE |
| Visitas | `/integra/visitors` | NATIVO · lista + registro | AUSENTE |
| Alarmas | `/integra/alarms` | NATIVO · queue + ack/clear | AUSENTE |
| En sitio | `/integra/access` | NATIVO · occupancy API (webPath→access) | AUSENTE |
| Equipos | `/integra/access` | NATIVO · devices API (webPath→access) | AUSENTE |
| Sitios | `/integra/settings` | SOLO_LECTURA · lista | AUSENTE |
| Video 24h | `/integra/video` | AUSENTE · Bloque 2 | AUSENTE |
| Detección | `/integra/detection` | AUSENTE · Bloque 2 | AUSENTE |
| ANPR | `/integra/anpr` | AUSENTE · Bloque 2 | AUSENTE |
| Plano | `/integra/map` | AUSENTE · Bloque 2 | AUSENTE |
| Vehículos ACS | `/integra/vehicles` | AUSENTE | AUSENTE |
| Auditoría | `/integra/audit` | AUSENTE | AUSENTE |
| Notificaciones | `/integra/notifications-center` | AUSENTE | AUSENTE |
| Mi perfil | `/integra/my-profile` | AUSENTE | AUSENTE |

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
