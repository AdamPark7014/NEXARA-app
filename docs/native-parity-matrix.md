# Native parity matrix (apps/mobile → apps/mobile-native)

Esta matriz es el checklist de **paridad** para poder eliminar `apps/mobile` (Next/Capacitor) y quedarnos con:

- `apps/api` (backend)
- `apps/web` (panel web)
- `apps/mobile-native` (apps nativas Android+iOS)

## Reglas / definiciones
- **Parity**: misma capacidad funcional (aunque el UI sea diferente), con las mismas reglas de acceso (RBAC/jerarquía).
- **Paneles web (v2)**: ERP, CRM, OPS, STUDIO, LAB + Portal clientes — ver `apps/web/lib/access-matrix.ts`.
- **Android v2 hub**: `PanelAccessResolver` + `PanelId` (commit 2026-06) reemplaza nombres legacy console/ventas/web.
- **Portal**: cuentas cliente/sucursal (tickets/inventarios/solicitudes).
- **Realtime**: Socket.IO (`apps/api/src/realtime/realtime.gateway.ts`) para invalidar/refrescar.
- **Offline**: cache GET + cola de mutaciones con replay (equivalente a `apps/mobile/lib/install-offline-fetch.ts` + `offline-queue.ts`).

## Panel hub / Auth (core)
| Feature | Mobile web (`apps/mobile`) | Android native | iOS native |
|---|---|---|---|
| Login | `app/(auth)/login` | ✅ `ui/screens/LoginScreen.kt` | ✅ `LoginView` |
| Panel hub (/paneles) + access rules | `lib/panel-routing.ts` / `access-matrix.ts` | ✅ `PanelAccessResolver` (ERP/CRM/OPS/STUDIO/LAB) | ✅ `Access/PanelAccessResolver.swift` |
| Session store (token, perms) | `UserContext` (session/localStorage) | ✅ `EncryptedSharedPreferences` (`data/SessionStore.kt`) | ✅ `Session/SessionStore.swift` (Keychain) |
| Saved accounts | `lib/saved-accounts.ts` | ✅ `QuickProfile` en login | ✅ `QuickProfileStore` + login |
| Deep links to screens | (URL routing) | ✅ `nexara://` — ERP/CRM/Studio/Portal/LAB | ✅ `nexara://` — todos los paneles |

## Panel: Console
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/console/dashboard` | ✅ `ConsoleDashboardScreen` | ✅ `ConsoleDashboardView` |
| Tabs inferiores por rol (admin vs campo) | sidebar web | ✅ `ConsoleNavHost` dinámico | ✅ `ConsoleTabView` dinámico + RBAC |
| Rol **Administrativo** (solo ERP, módulos limitados) | `page-matrix` administrativo | ✅ RBAC + tabs Inicio/Asistencia/Más + atajos dashboard | ✅ idem |
| Activities (admin) | `/console/activities` | ✅ | ✅ `ActivitiesView` |
| My activities | `/console/my-activities` | ✅ | ✅ `ActivitiesView` |
| Evidences (admin/user) | `/console/evidences`, `/console/my-evidences` | ✅ workflow completo | ✅ `EvidencesView` (flujo 5 pasos) |
| Viatics | `/console/viatics` | ✅ | ✅ `ViaticsView` |
| My viatics | `/console/my-viatics` | ✅ | ✅ scope personal |
| Vehicles | `/console/vehicles` | ✅ | ✅ `VehiclesView` |
| GPS | `/console/gps` | ✅ | ✅ `GpsMapView` |
| Tools hub + inventory + my-kit + renewals + kits-users | `/console/tools/*` | ✅ | ✅ `ToolsHubView` (aprobar/rechazar renovaciones) |
| Clients | `/console/clients` | ✅ CRUD + logo | ✅ `ServiceClientsView` CRUD + logo |
| Projects | `/console/projects` | ✅ | ✅ `ProjectsView` + estado |
| Users | `/console/users` | ✅ | ✅ `UsersView` |
| Attendance | `/console/attendance` | ✅ check-in/out | ✅ entrada/salida |
| HR leaves | `/console/hr` | ✅ `HrLeavesScreen` | ✅ `HrLeavesView` |
| Lunch breaks | `/console/lunch-breaks` | ✅ `LunchBreaksModuleScreen` (KPIs + tarjetas) | ✅ `LunchBreaksAdminView` |
| My lunch breaks | `/console/my-lunch-breaks` | ✅ | ✅ `MyLunchBreaksView` |
| Finance (expenses/invoices/banking) | varios | ✅ | ✅ vistas dedicadas |
| Settings (console.admin) | `/console/settings` | ✅ | ✅ `ConsoleSettingsView` |

## Panel: OPS (operaciones)
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Tickets de clientes (bandeja + KPIs + cambio estado) | `/ops/support` | ✅ `ClientTicketsModuleScreen` | ✅ `ClientTicketsModuleView` |
| Compras (requisiciones + órdenes + aprobar/rechazar) | `/erp/procurement` | ✅ `ProcurementModuleScreen` | ✅ `ProcurementModuleView` |
| Bodega + almacén (hub sin duplicar) | `/console/warehouse`, `/console/stock` | ✅ `WarehouseHubScreen` | ✅ `WarehouseHubView` |
| Hojas de servicio | `/operacion/service-sheets` | ✅ `ServiceSheetsModuleScreen` | ✅ `ServiceSheetsModuleView` |
| Mantenimiento / Activos | varios | ✅ `MaintenanceModuleScreen` (hub + iniciar/completar OT) | ✅ `MaintenanceView` |
| Gestión vendedores (desde ERP) | `/console/gestion-vendedores` | ✅ `VentasSalesTeamScreen` | ✅ `CrmSalesTeamView` |

## Panel: Tickets (Portal cliente/sucursal)
| Capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Portal home | `/tickets` | ✅ `TicketsPortalScreen` | ✅ `PortalHomeView` |
| Profile view/update | tab Perfil | ✅ | ✅ `PortalProfileView` |
| Branches list/create/edit + logo upload | tab Sucursales | ✅ | ✅ CRUD + logo (`PortalBranchEditView`) |
| Requests list/create | tab Nuevo/Solicitudes | ✅ | ✅ + crear solicitud |
| Tickets list/detail | tab Tickets | ✅ | ✅ + PDF reporte |
| Ticket report PDF | ticket modal/descarga | ✅ | ✅ |
| Close request | (acción) | ✅ | ✅ |
| Feedback pending + submit | (feedback modal) | ✅ | ✅ formulario completo |
| Inventories (list/detail/sync/upload/report) | tab Inventarios | ✅ | ✅ sync + decide + PDF |
| Portal report PDF | `/client-portal/report` | ✅ | ✅ |
| Realtime refresh (`entity:updated`) | Socket.IO | ✅ | ✅ `RealtimeBus` |
| Offline queue/cache | Offline layer | ✅ | ✅ cache GET + cola mutaciones |

## Panel: Ventas / CRM
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/ventas/dashboard` | ✅ | ✅ `CrmDashboardView` |
| Leads | `/ventas/leads` | ✅ | ✅ `CrmLeadsView` |
| Oportunidades | `/ventas/oportunidades` | ✅ `VentasOportunidadesScreen` + FAB crear | ✅ `CrmOpportunitiesView` + FAB crear |
| Clientes | `/ventas/clientes` | ✅ `VentasClientesScreen` | ✅ `CrmCommercialClientsView` |
| Cotizaciones (view/pdf) | `/ventas/cotizaciones` | ✅ | ✅ KPI + filtros |
| Cotizador inteligente (Smart Quote) | `/ventas/cotizaciones/nueva` | ✅ `SmartQuoteBuilderScreen` | ✅ |
| Productos | `/crm/products` | ✅ `VentasProductsScreen` | ✅ `CrmProductsView` |
| Proyectos | `/ventas/proyectos` | ✅ `VentasProyectosScreen` | ✅ `CrmProjectsView` |
| Pipeline | `/crm/pipeline` | ✅ `VentasPipelineScreen` | ✅ `CrmPipelineView` |
| Agenda | `/crm/agenda` | ✅ `VentasAgendaScreen` | ✅ `CrmAgendaView` |
| Licitaciones | `/crm/tenders` | ✅ `VentasTendersScreen` | ✅ `CrmTendersView` |
| Metas comerciales | `/crm/targets` | ✅ `VentasTargetsScreen` | ✅ `CrmTargetsView` |
| Oportunidades (detalle: notas, adjuntos, cotizaciones, historial, CRUD, PDF) | `/crm/opportunities` | ✅ `VentasOpportunityDetailScreen` | ✅ `CrmOpportunityDetailView` |
| Plantillas cotización PDF | `/crm/templates` | ✅ `VentasTemplatesScreen` (`ventas/order-templates`) | ✅ `CrmTemplatesView` |
| Clientes de servicio (OPS) | `/ops/service-clients` | ✅ `ConsoleClientsScreen` vía `service-clients` | ✅ `ServiceClientsView` |
| Reportes + crecimiento + comparativa | `/ventas/reportes`, `/ventas/crecimiento`, `/ventas/equipo-comparativa` | ✅ `CrmReportsScreen` (KPIs `ventas/reportes/metricas` + vendedores) | ✅ `CrmReportsView` |
| Notificaciones ventas | `/ventas/notificaciones` | ✅ `NotificationsScreen` | ✅ `NotificationsCenterView` |
| Dashboard CRM (métricas mes) | `/ventas` inicio | ✅ `VentasDashboardScreen` + pipeline API | ✅ `CrmDashboardView` + pipeline API |
| Menú «Más» sin duplicar tabs | sidebar web | ✅ `consoleSidebarGroupsForMore` / `ventasSidebarGroups` | ✅ `ConsoleAccessRules` (mismo filtro) |
| ERP BI / analítica | `/erp/analytics/bi`, `/console/analytics` | ✅ `ErpBiScreen` (KPIs + margen + ingenieros + ROI) | ✅ `ErpBiView` |
| Vista ejecutiva | `/erp/executive` | ✅ `ExecutiveScreen` (`executive/c-level`) | ✅ `ExecutiveView` |
| Aprobaciones | `/erp/approvals` | ✅ `ApprovalsScreen` (workflow my-pending) | ✅ `ApprovalsView` |
| Centro notificaciones ERP | `/erp/notifications-center` | ✅ `NotificationsScreen` (hub global) | ✅ `NotificationsCenterView` |
| NOC monitoreo | `/ops/noc` | ✅ `NocModuleScreen` | ✅ `NocView` |
| SLA soporte | `/ops/support/sla` | ✅ `SlaModuleScreen` | ✅ `SlaView` |
| Contratos mantenimiento | `/ops/maintenance/contracts` | ✅ `MaintenanceContractsScreen` | ✅ `MaintenanceContractsView` |
| Bandeja soporte | `/ops/support` | ✅ `ClientTicketsModuleScreen` | ✅ `ClientTicketsModuleView` |
| Multi-empresa | `/erp/companies` | ✅ `CompaniesScreen` | ✅ `CompaniesView` |
| Knowledge Base | `/erp/kb` | ✅ `KbScreen` | ✅ `KbView` |
| Exportaciones CSV | `/erp/exports` | ✅ `ExportsScreen` (share intent) | ✅ `ExportsView` (share sheet) |
| Arquitectura ERP | `/erp/architecture` | ✅ `ArchitectureScreen` (catálogo local) | ✅ `ArchitectureView` |
| Calendario personal | `/erp/calendar` | ✅ `ErpCalendarScreen` | ✅ `ErpCalendarView` |
| Organigrama | `/erp/hr/orgchart` | ✅ `OrgchartScreen` | ✅ `OrgchartView` |
| KPIs de personas | `/erp/hr/kpis` | ✅ `HrKpisScreen` | ✅ `HrKpisView` |

## Panel: Contabilidad
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Hub TabView (Inicio · Facturas · Gastos · Más) | `/contabilidad/*` | ✅ `ContabilidadNavHost` (desde ERP Más + deep link) | ✅ `ContabilidadTabView` (desde ERP Más) |
| Dashboard | `/contabilidad/dashboard` | ✅ | ✅ `ContabilidadDashboardView` |
| Facturación / Gastos / Banca | varios | ✅ `InvoicesRichScreen` / `ExpensesRichScreen` / `BankingRichScreen` | ✅ `InvoicesView` / `ExpensesView` / `BankingView` |
| Pagos empleados · Multas · Asientos | varios | ✅ `FinanceRichScreens` | ✅ `EmployeePaymentsView` / `FinesView` / `AccountingView` |

## Panel: STUDIO (web)
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard KPIs | `/studio/dashboard` | ✅ `StudioDashboardScreen` | ✅ `StudioDashboardView` |
| Hero carousel CRUD | `/studio/hero` | ✅ upload/reorder | ✅ CRUD + reorder |
| Casos de éxito | `/studio/cases` | ✅ CRUD + publicar | ✅ CRUD + publicar |
| Noticias | `/studio/news` | ✅ CRUD | ✅ CRUD |
| Contactos / Leads | `/studio/contacts`, `/studio/leads` | ✅ workflow | ✅ detalle + estado |
| Redes sociales | `/studio/social` | ✅ CRUD | ✅ CRUD + publicar |
| Newsletter | `/studio/newsletter` | ✅ | ✅ búsqueda |
| Secciones sitio | `/studio/pages` | ✅ JSON editor | ✅ JSON editor |

## Panel: Web (legacy → STUDIO)
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Dashboard | `/web/dashboard` | ✅ vía panel STUDIO | ✅ vía panel STUDIO |
| Clientes | `/web/clientes` | ✅ `ServiceClientsView` / Studio | ✅ `ServiceClientsView` |
| Proyectos | `/web/proyectos` | ✅ módulos CRM/Console | ✅ `ModuleRouter` |
| Contactos | `/web/contactos` | ✅ Studio contacts | ✅ Studio contacts |
| Noticias | `/web/noticias` | ✅ `NewsModuleScreen` | ✅ listas nativas |

## Panel: LAB
| Screen / capability | Mobile route | Android native | iOS native |
|---|---|---|---|
| Lab home + KPIs API | `/lab` | ✅ `LabNavHost` home | ✅ `LabTabView` home |
| API Health | `/lab/health` | ✅ `LabHealthScreen` | ✅ `LabHealthView` |
| Feature flags | `/lab/flags` | ✅ `LabFlagsScreen` | ✅ `LabFlagsView` |
| AI Sandbox | `/lab/ai` | ✅ `LabAiScreen` | ✅ `LabAiSandboxView` |

## Cross-cutting
| Feature | Mobile web | Android native | iOS native |
|---|---|---|---|
| Notifications inbox + badge | `apps/api/src/notifications` | ✅ `NotificationsScreen` + badge hub | ✅ `NotificationsCenterView` + badge |
| Socket.IO realtime | `apps/api/src/realtime` | ✅ `RealtimeBus` | ✅ `RealtimeBus` |
| Offline GET cache | `install-offline-fetch.ts` | ✅ integrado en `ApiClient` | ✅ `OfflineApiCache` |
| Offline mutation queue + replay | `offline-queue.ts` | ✅ `OfflineSyncCoordinator` | ✅ `OfflineSyncCoordinator` |
| Camera/gallery uploads | evidences/ventas opp | ✅ `MediaPickerBar` + cámara/galería en evidencias | ✅ `MediaPickerBar` + `CameraCaptureView` |
| Push notifications (FCM/APNs) | devices/push-token | ✅ FCM + deep link al tocar | ✅ APNs + `PushManager` |
