# 05 · Inventario real de módulos: app Android vs web

**Auditoría READ-ONLY** · 2026-09-06 · monorepo `C:\dev\apps\NEXARA-app`
Alcance: `apps/web/app/(panels)` + `(subdomains)` vs `apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp` y `apps/mobile-native/ios`.

> Síntoma reportado: *"la app móvil no concatena con la cantidad exhaustiva de procesos que tiene la web y además no tienen muchos módulos"*.
> **Conclusión: el síntoma es real y tiene tres causas concretas y verificables.** No es una impresión.

---

## 0. Resumen ejecutivo (lo que hay que saber en 60 segundos)

1. **El panel INTEGRA no existe en la app.** Ni una pantalla, ni una entrada de catálogo, ni un `PanelId`. La palabra "integra" aparece **una sola vez** en todo el código Kotlin, y es un literal de subdominio en `WebPanelUrl.kt:151`. Son **18 módulos web** (video, accesos, personas, visitas, ANPR, asistencia ACS, alarmas, detección, plano…) invisibles en móvil. INTEGRA es además el producto con más ADRs del repo (`ADR-0017` … `ADR-0021`).
2. **Hay módulos nativos ya escritos que la app filtra y nunca muestra.** `dispatch` (Centro de despacho, 292 líneas de Compose funcionando) no está ni en `ERP_KEYS` ni en `OPS_KEYS` de `ModulePanelMap.kt` → se filtra en los dos paneles y **no hay forma de llegar a él desde la UI**. Lo mismo le pasa a `chat` en el menú "Más" de ERP/OPS y a `recruiting`, que está en `OPS_KEYS` pero no en ningún grupo del sidebar.
3. **Muchos módulos "✅" son listas de solo lectura.** De 270 endpoints declarados en las interfaces Retrofit, **177 son `@GET`** y solo 93 mutan. Módulos que en la web son de gestión (usuarios, RRHH, multas, documentos, pagos a empleados, contratos, mis vehículos, mi perfil) en la app son listas con detalle de clave-valor y ningún botón de acción.
4. **`docs/native-parity-matrix.md` no es fiable.** Marca ✅ en todo, no tiene sección de INTEGRA, y no distingue "listar" de "operar". Ver §5.
5. **No hay WebView en ninguna parte de la app.** La categoría WEBVIEW del encargo resulta ser **cero**: el único puente a la web es un botón "Abrir en la web" dentro de `PlaceholderScreen`, que lanza el **navegador externo** (`Intent.ACTION_VIEW`) — y que hoy es código muerto, porque ningún módulo del catálogo cae en el placeholder.
6. **iOS no es un esqueleto pero tampoco es un producto**: 131 archivos Swift, 29,517 líneas, sin `.xcodeproj` (se genera con XcodeGen en Mac), sin Firebase enlazado y con `aps-environment: development`. Ver §6.

---

## 1. Inventario WEB (la referencia)

### 1.1 Rutas físicas `page.tsx`

| Grupo | Rutas |
|---|---:|
| `(panels)` | **168** |
| `(subdomains)/tickets` | 5 |
| `(public)` | 19 |
| `(auth)` | 3 |
| `legal/` + `dashboard/` | 6 |
| **Total repo** | **200** |

Desglose de las 168 de `(panels)`:

| Panel | Rutas `page.tsx` |
|---|---:|
| `ops` | 47 |
| `crm` | 41 |
| `erp` | 39 |
| `integra` | 19 |
| `studio` | 14 |
| `lab` | 8 |

### 1.2 Módulos declarados (referencia canónica)

La cuenta de `page.tsx` mezcla módulos con sub-rutas de detalle (`/ops/activities/[id]/evidencias`, `/crm/clients/[id]/tickets`…). La lista **autoritativa de módulos** es `apps/web/lib/access-matrix.ts`, que declara **103 módulos** repartidos en 6 paneles:

| Panel | Módulos declarados |
|---|---:|
| ERP | 33 |
| OPS | 22 |
| INTEGRA | **18** |
| CRM | 15 |
| STUDIO | 10 |
| LAB | 5 |
| **Total** | **103** |

Además el subdominio **Portal de clientes** (`(subdomains)/tickets`, 5 rutas) que no vive en `access-matrix.ts`.

Uso las **103** como denominador de toda esta auditoría.

### 1.3 El dato que nadie estaba midiendo

Escribí el recorrido inverso al que hace `scripts/check-app-web-parity.py` (ver §5.3):

```
RUTAS WEB EN (panels):                       168
CUBIERTAS POR UNA ENTRADA DE ModuleCatalog:   80
SIN NINGUNA ENTRADA EN EL CATÁLOGO:           88   ← 52%
```

Reparto de las 88 sin cubrir: OPS 27 · CRM 25 · **INTEGRA 19 (el panel entero)** · ERP 8 · STUDIO 5 · LAB 4.
Buena parte de las de OPS/CRM son sub-rutas de detalle que la app **sí resuelve** con pestañas dentro de una pantalla (§2.4), pero las 19 de INTEGRA, `/erp/reuniones`, `/erp/facilities/access`, `/erp/settings/{api-keys,webhooks,billing}`, `/crm/team` y `/ops/tools/new-inventory` son ausencias reales.

---

## 2. Inventario ANDROID (lo que hay de verdad)

### 2.1 Cifras del código

| Métrica | Valor |
|---|---:|
| Archivos Kotlin | 186 |
| `@Composable fun *Screen` únicos | **136** |
| Líneas en archivos de pantalla | ~34,900 |
| Endpoints Retrofit `@GET` | 177 |
| Endpoints Retrofit `@POST`/`@PATCH`/`@PUT`/`@DELETE` | 42 / 31 / 10 / 10 = **93** |
| Paneles ofrecidos (`PanelId.kt`) | 6: ERP, CRM, OPS, STUDIO, LAB, PORTAL — **sin INTEGRA** |
| Entradas de `ModuleCatalog` | console 64 · ventas 20 · contabilidad 13 · studio 10 · lab 4 |

**No es una app vacía.** Hay trabajo real y voluminoso: `ChatScreen.kt` son 2,919 líneas, `CrmModuleScreens.kt` 2,340, `FinanceRichScreens.kt` 1,332, `ConsoleEvidencesScreen.kt` 1,279. El problema no es la cantidad de código, es **dónde está** y **qué deja hacer**.

### 2.2 NavHosts registrados

| NavHost | Archivo | Líneas | Ruta comodín | Módulos que despacha |
|---|---|---:|---|---:|
| Console (ERP + OPS) | `ui/console/ConsoleNavHost.kt` | 648 | `console/m/{key}` | 65 claves |
| Ventas (CRM) | `ui/ventas/VentasNavHost.kt` | 827 | `v/m/{key}` | 20 claves |
| Lab | `ui/lab/LabNavHost.kt` | 393 | rutas fijas | 4 |
| Tickets (Portal) | `ui/tickets/TicketsNavHost.kt` | 245 | rutas fijas | 10 |
| Contabilidad | `ui/contabilidad/ContabilidadNavHost.kt` | 206 | sub-hub desde ERP | 13 |
| Studio | `ui/studio/StudioNavHost.kt` | 104 | `studio/m/{key}` | 10 |
| **Integra** | — | — | — | **no existe** |

**Ningún módulo del catálogo cae hoy en `PlaceholderScreen`**: el `when(key)` de `ConsoleNavHost` cubre las 64 claves del catálogo console y el de `VentasNavHost` las 20 de ventas. Ese "próximamente" está por tanto muerto — lo cual es correcto para lo que el catálogo declara, y engañoso respecto a lo que la web tiene.

### 2.3 Ausencia total de WebView — y qué significa

```
grep -rn "WebView" apps/mobile-native/android/app/src/main → 0 resultados
```

El único enlace a la web es `PlaceholderScreen.kt:80` → `WebPanelUrl.forPath(webPath)` → `openExternalUrl()` → `Intent.ACTION_VIEW` (navegador del sistema, no WebView embebido, no cookie compartida).

**Consecuencia práctica**: en cuanto un módulo dependa de ese botón, el usuario aterriza en Chrome **sin sesión** — la app guarda el token en `EncryptedSharedPreferences` (`data/SessionStore.kt`), no en cookies del navegador — y en un subdominio distinto (`core.`, `sales.`, `ops.`…). Es decir: **la vía de escape a la web está rota de facto**, exactamente como sospechaba el encargo, solo que no por WebView sino por navegador externo. Hoy no muerde porque nada la usa; morderá en cuanto se añada un módulo al catálogo sin implementarlo.

### 2.4 Lo que la app SÍ hace mejor de lo que sugiere la cuenta de rutas

- **Detalle de actividad**: `ActivityDetailScreen.kt:36` tiene 9 pestañas (`Info · Operación · Evidencias · Viáticos · Equipo · Materiales · Historial · Incidencias · Aprobaciones`) que cubren de una sola pantalla las 12 sub-rutas `/ops/activities/[id]/*` de la web. Con escritura real: `createViatic`, `assignViatic`, `addActivityIncident`, `resolveActivityIncident`, `addActivityRecommendation`, `executeActivity`, `updateActivity`.
- **Portal de clientes**: la app tiene 10 pantallas de portal (tickets, sucursales, inventarios con sync/decide/PDF, feedback, solicitudes, ayuda, servicios) frente a **5** rutas web. Aquí el móvil va por delante.
- **Smart Quote**: `SmartQuoteBuilderScreen.kt` (1,194 líneas, con `checkMargin`, `configureSolution`, `copilotDraft`, `laborSuggest`) — funcionalidad de primer nivel.
- **Evidencias**: flujo completo de 5 pasos con foto de entrada, fotos de trabajo, hoja de servicio PDF, foto de salida, aprobar/rechazar.
- **Offline**: `data/offline/` con caché GET, cola de mutaciones y coordinador de replay. Real y bien montado.

---

## 3. LA TABLA DE VERDAD

Leyenda de estado:
- **NATIVO** — pantalla Compose que consume la API y **permite operar** (crear/editar/aprobar).
- **NATIVO-RO** — pantalla Compose real contra la API, pero **solo lectura**, y en la web tampoco se opera (reportes, KPIs, logs). Cuenta como paridad.
- **CASCARÓN** — la pantalla existe pero es una lista/detalle sin acciones, mientras **la web sí deja operar**. O existe y es inalcanzable.
- **AUSENTE** — no existe.
- **WEBVIEW** — 0 casos en toda la app (§2.3).

### 3.1 Panel ERP (33 módulos web)

| Módulo web | Ruta web | Estado Android | Archivo Kotlin | Evidencia |
|---|---|---|---|---|
| Vista ejecutiva | `/erp/executive` | NATIVO-RO | `ui/console/screens/ErpPlatformScreens.kt` → `ExecutiveScreen` | `repo.executiveCLevel()`; panel de KPIs |
| Resumen general | `/erp/dashboard` | **NATIVO** | `ConsoleDashboardScreen.kt` (882) | `workflowDecide` desde tarjeta de aprobaciones |
| Chat | `/erp/chat` | **NATIVO pero oculto** | `ui/chat/ChatScreen.kt` (2,919) | Canales/DM/reacciones/pin. **No aparece en "Más" de ERP/OPS**: `chat` no está en `ERP_KEYS`/`OPS_KEYS` (`ModulePanelMap.kt`). Solo llega por el atajo del dashboard (`ConsoleDashboardScreen.kt:247`) o deep link |
| Reuniones | `/erp/reuniones` | **AUSENTE** | — | `grep -i "reunion\|meeting"` → 0 en Kotlin |
| Aprobaciones | `/erp/approvals` | **NATIVO** | `ErpPlatformScreens.kt` → `ApprovalsScreen` | `repo.workflowDecide(id, decision)` |
| Analítica / BI | `/erp/analytics/bi` | NATIVO-RO | `ErpPlatformScreens.kt` → `ErpBiScreen` | margen, ingenieros, ROI cliente |
| Usuarios y roles | `/erp/users` | **CASCARÓN** | `ConsoleUsersScreen.kt` (330) | **cero llamadas `repo.*` de escritura**. Lista y detalle. La web da alta, roles, reset de contraseña |
| Empresas | `/erp/companies` | **CASCARÓN** | `GovernanceScreens.kt` → `CompaniesScreen` | solo `repo.companyDtos()` |
| Configuración | `/erp/settings` | NATIVO (parcial) | `ConsoleSettingsScreen.kt` (452) | `settingsUpsert` / `settingsDelete`. **Faltan** `/settings/api-keys`, `/settings/webhooks`, `/settings/billing` (3 rutas web AUSENTES) |
| Mapa del sistema | `/erp/architecture` | **CASCARÓN** | `GovernanceScreens.kt:350` → `ArchitectureScreen` | **no llama a ninguna API**: pinta `architecturePanels()`, un catálogo local hardcodeado. Es un folleto |
| Base de conocimiento | `/erp/kb` | NATIVO-RO | `GovernanceScreens.kt` → `KbScreen` | `kbArticles` / `kbArticle` |
| Contabilidad | `/erp/accounting` | **CASCARÓN** | `FinanceRichScreens.kt` → `AccountingRichScreen` | solo `journalEntries()`, sin captura de póliza |
| Facturación CFDI | `/erp/invoicing` | **NATIVO** | `FinanceRichScreens.kt` → `InvoicesRichScreen` | `registerInvoicePayment`, `evaluateInvoiceMatch`, `waiveInvoiceMatch` |
| Bancos | `/erp/banking` | NATIVO-RO | `FinanceRichScreens.kt` → `BankingRichScreen` | `bankAccounts()` |
| Viáticos | `/erp/finance/viatics` | **NATIVO** | `ConsoleViaticsScreen.kt` (770) | `approveViatic` |
| Gastos | `/erp/finance/expenses` | **NATIVO** | `FinanceRichScreens.kt` → `ExpensesRichScreen` | `createExpense`, `approveExpense` |
| Pagos a personal | `/erp/finance/employee-payments` | **CASCARÓN** | `FinanceRichScreens.kt` → `EmployeePaymentsRichScreen` | solo `employeePayments()` |
| Plantilla RRHH | `/erp/hr` | **CASCARÓN** | `HrLeavesScreen.kt` (235) | solo `repo.hrLeaveDtos()`. **No aprueba ni rechaza vacaciones** |
| Asistencia | `/erp/hr/attendance` | **NATIVO** | `ConsoleAttendanceScreen.kt` (633) | `attendanceCheckIn(type, lat, lng)` con geo |
| Comidas y descansos | `/erp/hr/lunch-breaks` | **NATIVO** | `ExtraModuleScreens.kt` | `lunchCheckin` / `lunchCheckout` con foto |
| Incidencias / multas | `/erp/hr/fines` | **CASCARÓN** | `FinanceRichScreens.kt` → `FinesRichScreen` | solo `fines()` |
| Organigrama | `/erp/hr/orgchart` | NATIVO-RO | `GovernanceScreens.kt` → `OrgchartScreen` | `orgNodeDtos()` + árbol |
| KPIs de personas | `/erp/hr/kpis` | NATIVO-RO | `GovernanceScreens.kt` → `HrKpisScreen` | — |
| Almacén | `/erp/warehouse` | **NATIVO** | `WarehouseWmsScreen.kt` (909) + `OpsModuleScreens.kt` → `WarehouseHubScreen` | `createStockMovement` |
| Compras | `/erp/procurement` | **NATIVO** | `OpsModuleScreens.kt` → `ProcurementModuleScreen` | `approveRequisition` / `rejectRequisition` |
| Documentos | `/erp/documents` | **CASCARÓN** | `CatalogRichScreens.kt` → `DocumentsRichScreen` | usa el genérico `CatalogRichScreen` (lista + detalle clave-valor). **Sin subir documento** |
| Auditoría | `/erp/audit` | NATIVO-RO | `ExtraModuleScreens.kt` → `AuditModuleScreen` | log, la web tampoco escribe |
| Exportaciones | `/erp/exports` | **NATIVO** | `GovernanceScreens.kt:266` | `repo.exportCsv()` + share intent |
| Notificaciones | `/erp/notifications-center` | **NATIVO** | `ui/shared/NotificationsScreen.kt` | `markRead`, `markAllRead`, deep link |
| Comunicados | `/erp/news` | **CASCARÓN** | `ExtraModuleScreens.kt` → `NewsModuleScreen` | lista tipada, sin CRUD (la CRUD existe pero en Studio) |
| Mi calendario | `/erp/calendar` | NATIVO-RO | `GovernanceScreens.kt` → `ErpCalendarScreen` | `calendarEventDtos(from,to)` |
| Mi perfil | `/erp/my-profile` | **CASCARÓN** | `ui/console/screens/MyProfileScreen.kt` (256) | solo `authRepo.loadSession()`. **No edita nada**; la app sí tiene `updateProfile` pero solo lo usa el Portal |
| Accesos oficinas | `/erp/facilities/access` | **AUSENTE** | — | `grep -i facilities` → 0 |

**ERP: 12 NATIVO · 8 NATIVO-RO · 11 CASCARÓN · 2 AUSENTE**

### 3.2 Panel OPS (22 módulos web)

| Módulo web | Ruta web | Estado Android | Archivo Kotlin | Evidencia |
|---|---|---|---|---|
| Hoy en operaciones | `/ops/dashboard` | **NATIVO** | `ConsoleDashboardScreen(isOps = true)` | atajos + aprobaciones |
| Centro de despacho | `/ops/dispatch` | **CASCARÓN (inalcanzable)** | `ConsoleDispatchScreen.kt` (292) | La pantalla **funciona** (`reassignActivity`, abre actividad) pero `dispatch` **no está ni en `OPS_KEYS` ni en `ERP_KEYS`** (`ModulePanelMap.kt`) y tampoco en ningún `ConsoleSidebarGroup` (`ConsoleAccessRules.kt:163-201`) → se filtra de `visibleModules` y del menú "Más" en los dos paneles. **Solo se llega por deep link `nexara://`** |
| Chat | `/ops/chat` | NATIVO oculto | `ui/chat/ChatScreen.kt` | mismo caso que ERP |
| Proyectos operativos | `/ops/projects` | **NATIVO** | `ConsoleProjectsScreen.kt:182` | `patchProjectStatus` |
| Actividades · Todas | `/ops/activities` | **NATIVO** | `ConsoleActivitiesScreen.kt` + `ActivityDetailScreen.kt` | 9 pestañas, alta de OT (`OpsNewActivityScreen`) |
| Mis actividades | `/ops/my-activities` | **NATIVO** | idem, `title = "Mis actividades"` | — |
| Evidencias · Revisión | `/ops/evidences` | **NATIVO** | `ConsoleEvidencesScreen.kt` (1,279) | `approveEvidence`, `rejectEvidence`, `evidenceEntryPhoto`, `evidencePhotos`, `evidenceServiceSheetPdf`, `evidenceExitPhoto` |
| Mis evidencias | `/ops/my-evidences` | **NATIVO** | idem `mode = "user"` | — |
| Viáticos · Revisión | `/ops/viatics` | **NATIVO** | `ConsoleViaticsScreen.kt` | `approveViatic` |
| Mis viáticos | `/ops/my-viatics` | **CASCARÓN** | `ui/modules/ConsoleExtraScreens.kt` → `MyViaticsScreen` | solo `repo.viaticsFetch()`. El alta de viático vive escondida en la pestaña Viáticos del detalle de actividad |
| Vehículos · Flotilla | `/ops/vehicles` | **CASCARÓN** | `ConsoleVehiclesScreen.kt` (209) | solo `repo.vehiclesFetch()` |
| Mis vehículos | `/ops/my-vehicles` | **CASCARÓN** | `ConsoleExtraScreens.kt` → `MyVehiclesScreen` | solo `vehiclesFetch()`; sin bitácora, sin combustible, sin kilometraje |
| GPS en vivo | `/ops/gps` | **NATIVO** | `ConsoleGpsScreen.kt` (530) | `gpsUpdateConsent`, mapa, `util/DeviceLocation.kt` |
| Herramientas | `/ops/tools` | **NATIVO** | `ConsoleToolsScreen` + `ToolInventory` + `ToolMyKit` + `ToolsKitsUsers` + `ToolRenewals` | `approveToolRenewal`, `rejectToolRenewal`, `assignKit`, `reportKitIncident`, `resolveKitEvent`. **Falta** `/ops/tools/new-inventory` |
| Clientes con contrato | `/ops/service-clients` | **NATIVO** | `ConsoleClientsScreen.kt` (866) | `createServiceClient`, `updateServiceClient`, logo |
| Mantenimiento | `/ops/maintenance` | **NATIVO** | `OpsModuleScreens.kt` → `MaintenanceModuleScreen` | `startWorkOrder`, `completeWorkOrder` |
| Contratos de servicio | `/ops/maintenance/contracts` | **CASCARÓN** | `ErpPlatformScreens.kt` → `MaintenanceContractsScreen` | solo `maintenanceContractDtos()` |
| Activos en campo | `/ops/assets` | **NATIVO** | `MaintenanceModuleScreen(initialTab = 1)` | comparte OT |
| NOC · Monitoreo | `/ops/noc` | NATIVO-RO | `ErpPlatformScreens.kt` → `NocModuleScreen` | `nocSummary`, `nocAlerts`, `nocDevices`. Sin reconocer alarma |
| Bandeja de soporte | `/ops/support` | **NATIVO** | `OpsModuleScreens.kt` → `ClientTicketsModuleScreen` | `patchClientTicketStatus`, `assignClientTicket`. **Falta** `/ops/support/[id]` y `/ops/support/new` como rutas propias |
| SLA y tiempos | `/ops/support/sla` | NATIVO-RO | `ErpPlatformScreens.kt` → `SlaModuleScreen` | `slaStats()` |
| Reclutamiento técnico | `/ops/recruiting` | **CASCARÓN (inalcanzable)** | `GovernanceScreens.kt` → `RecruitingScreen` | Solo lectura (`candidateDtos`) **y** ausente de todos los `ConsoleSidebarGroup` → no aparece en "Más" pese a estar en `OPS_KEYS` |

**OPS: 12 NATIVO · 3 NATIVO-RO · 6 CASCARÓN (2 de ellos inalcanzables) · 1 oculto (chat)**

### 3.3 Panel CRM (15 módulos web)

| Módulo web | Ruta web | Estado Android | Archivo Kotlin | Evidencia |
|---|---|---|---|---|
| Resumen comercial | `/crm/dashboard` | NATIVO-RO | `VentasDashboardScreen.kt` (661) | KPIs + pipeline |
| Chat | `/crm/chat` | **NATIVO** | `ui/chat/ChatScreen.kt` | aquí sí aparece en el menú |
| Leads | `/crm/leads` | **NATIVO** | `VentasLeadScreens.kt` (635) | `createLead`, `updateLead`, `deleteLead` |
| Oportunidades | `/crm/opportunities` | **NATIVO** | `CrmModuleScreens.kt` + `VentasOpportunityDetailScreen.kt` (643) | `createOpportunity`, `updateOpportunity`, `deleteOpportunity`, `addOpportunityNote`, `addOpportunityEvidences`. Cubre las 6 sub-rutas `/opportunities/[id]/*` |
| Kanban del pipeline | `/crm/pipeline` | **NATIVO** | `CrmModuleScreens.kt` → `VentasPipelineScreen` | `updateOpportunityStage` |
| Agenda comercial | `/crm/agenda` | **NATIVO** | `CrmModuleScreens.kt` → `VentasAgendaScreen` | `completeCrmActivity` |
| Clientes | `/crm/clients` | **NATIVO** | `CrmModuleScreens.kt` (2,340) | `createClient`, `updateClient`, `provisionServiceClient`, `CrmClientDatosEditScreen`. Cubre `/clients/[id]/*` como detalle |
| Catálogo de productos | `/crm/products` | NATIVO-RO | `CrmModuleScreens.kt` → `VentasProductsScreen` | catálogo IT/CCTV |
| Cotizaciones | `/crm/quotes` | **NATIVO** | `VentasNavHost.kt` + `VentasQuoteDetailScreen.kt` (584) | `sendCotizacion`, PDF |
| Cotizador (builder) | `/crm/quotes/builder` | **NATIVO** | `SmartQuoteBuilderScreen.kt` (1,194) | `createQuote`, `checkMargin`, `laborSuggest`, `copilotDraft` |
| Plantillas | `/crm/templates` | **NATIVO** | `VentasTemplatesScreen.kt` (362) | `createOrderTemplate`, `deleteOrderTemplate`, `setOrderTemplateDefault` |
| Proyectos de venta | `/crm/projects` | **CASCARÓN** | `CrmModuleScreens.kt` → `VentasProyectosScreen` | sin mutaciones; el detalle `CrmProjectDetailScreen` no cubre `/projects/[id]/costos` ni `/orden` |
| Licitaciones | `/crm/tenders` | NATIVO-RO | `CrmModuleScreens.kt` → `VentasTendersScreen` | `tenderDtos()`; falta `/tenders/[id]` |
| Equipo de ventas | `/crm/team` | NATIVO-RO | `CrmModuleScreens.kt` → `VentasSalesTeamScreen` | expuesto como `gestion-vendedores`, no como `/crm/team` |
| Cuotas y metas | `/crm/targets` | NATIVO-RO | `CrmModuleScreens.kt` → `VentasTargetsScreen` | `salesTargetDtos()` |
| Reportes comerciales | `/crm/reports` | NATIVO-RO | `CrmReportsScreen.kt` (518) | 3 modos: reportes/crecimiento/equipo |

**CRM: 9 NATIVO · 5 NATIVO-RO · 1 CASCARÓN · 0 AUSENTE — el panel mejor cubierto.**

### 3.4 Panel STUDIO (10 módulos web)

| Módulo web | Ruta web | Estado Android | Archivo Kotlin | Evidencia |
|---|---|---|---|---|
| Studio dashboard | `/studio/dashboard` | NATIVO-RO | `StudioDashboardScreen.kt` | KPIs |
| Chat | `/studio/chat` | **NATIVO** | `ChatScreen.kt` | — |
| Banner del inicio | `/studio/hero` | **NATIVO** | `StudioHeroScreen.kt` | `createHeroSlide`, `updateHeroSlide`, `deleteHeroSlide`, `reorderHeroSlides` |
| Páginas públicas | `/studio/pages` | **NATIVO** | `StudioMoreScreens.kt:215` | `upsertPageContent` (editor JSON crudo) |
| Casos de éxito | `/studio/cases` | **NATIVO** | `StudioCasesScreen.kt` | CRUD + `toggleCasePublicado`. Falta `/cases/[id]` como ruta |
| Noticias y blog | `/studio/news` | **NATIVO** | `StudioNewsScreen.kt` | `createNews`, `updateNews`, `deleteNews` |
| Redes sociales | `/studio/social` | **NATIVO** | `StudioSocialScreen.kt` | CRUD + `setSocialEstado` |
| Newsletter | `/studio/newsletter` | **CASCARÓN** | `StudioMoreScreens.kt` → `StudioNewsletterScreen` | sin mutaciones |
| Contactos web | `/studio/contacts` | **NATIVO** | `StudioContactsScreen.kt` | `updateContactMessage`, `deleteContactMessage` |
| Leads del sitio | `/studio/leads` | **NATIVO** | `StudioContactsRoute(leadsOnly = true)` | idem |

**STUDIO: 8 NATIVO · 1 NATIVO-RO · 1 CASCARÓN.**
Nota: el `StudioNavHost` **no tiene barra de pestañas ni menú "Más"** — solo un dashboard con `onOpenModule`. Es el panel con peor navegación.

### 3.5 Panel LAB (5 módulos web)

| Módulo web | Ruta web | Estado Android | Archivo Kotlin | Evidencia |
|---|---|---|---|---|
| Lab home | `/lab` | NATIVO-RO | `LabNavHost.kt` → `LabHomeScreen` | — |
| Chat | `/lab/chat` | **NATIVO** | `ChatScreen.kt` | — |
| AI sandbox | `/lab/ai` | **NATIVO** | `LabModuleScreens.kt` → `LabAiScreen` | `runAi` |
| Feature flags | `/lab/flags` | **NATIVO** | `LabModuleScreens.kt` → `LabFlagsScreen` | `setFlag` |
| Health API | `/lab/health` | NATIVO-RO | `LabModuleScreens.kt` → `LabHealthScreen` | — |

**LAB: 3 NATIVO · 2 NATIVO-RO. Paridad completa.**

### 3.6 Panel INTEGRA (18 módulos web) — **el agujero**

| Módulo web | Ruta web | Estado Android | Archivo Kotlin | Evidencia |
|---|---|---|---|---|
| Consola Ops | `/integra` | **AUSENTE** | — | `PanelId.kt` no tiene INTEGRA |
| Video · 24h | `/integra/video` | **AUSENTE** | — | — |
| Detección | `/integra/detection` | **AUSENTE** | — | — |
| Eventos Face | `/integra/events` | **AUSENTE** | — | — |
| Alarmas | `/integra/alarms` | **AUSENTE** | — | — |
| Accesos | `/integra/access` | **AUSENTE** | — | — |
| Personas | `/integra/people` | **AUSENTE** | — | — |
| Horarios | `/integra/schedules` | **AUSENTE** | — | — |
| Espacios | `/integra/espacios` | **AUSENTE** | — | — |
| Asistencia (ACS) | `/integra/attendance` | **AUSENTE** | — | — |
| Visitas | `/integra/visitors` | **AUSENTE** | — | — |
| Vehículos | `/integra/vehicles` | **AUSENTE** | — | — |
| ANPR / placas | `/integra/anpr` | **AUSENTE** | — | — |
| Sitios | `/integra/settings` | **AUSENTE** | — | — |
| Auditoría | `/integra/audit` | **AUSENTE** | — | — |
| Plano | `/integra/map` | **AUSENTE** | — | — |
| Notificaciones | `/integra/notifications-center` | **AUSENTE** | — | — |
| Mi perfil | `/integra/my-profile` | **AUSENTE** | — | — |

Evidencia global:
```
grep -rni "integra" apps/mobile-native/android/app/src/main --include=*.kt
→ 1 resultado: access/WebPanelUrl.kt:151   "/integra" to "integra"
```
Ese único literal ni siquiera se usa: nadie construye una URL `/integra/...` porque no hay entrada de catálogo que la produzca.

`PanelAccessResolver.accessiblePanels()` devuelve para **super admin**: `listOf(ERP, CRM, OPS, STUDIO, LAB)`. INTEGRA nunca aparece, ni con todos los permisos.

### 3.7 Portal de clientes (fuera de `access-matrix.ts`)

| Capacidad web | Ruta | Estado Android | Archivo |
|---|---|---|---|
| Portal home | `/tickets` | **NATIVO** | `TicketsPortalScreen.kt` |
| Sucursal | `/tickets/[branch]` | **NATIVO** | `TicketsBranchesScreen` + `TicketsBranchEditScreen` (933, `createBranch`/`updateBranch`) |
| Mis servicios | `/tickets/mis-servicios` | **NATIVO** | `PortalServicesScreen.kt` |
| Mis sucursales | `/tickets/mis-sucursales` | **NATIVO** | `TicketsBranchesScreen.kt` |
| Ayuda | `/tickets/ayuda` | **NATIVO** | `PortalHelpScreen.kt` |
| *(solo app)* Inventarios | — | **NATIVO** | `TicketsInventoryDetailScreen.kt` (875): `syncInventory`, `decideInventory`, `uploadInventoryMedia` |
| *(solo app)* Solicitudes | — | **NATIVO** | `TicketsRequestNewScreen.kt` (787), `TicketsRequestsScreen.kt` |
| *(solo app)* Feedback | — | **NATIVO** | `TicketsFeedbackPendingScreen.kt` |
| *(solo app)* Perfil | — | **NATIVO** | `TicketsProfileScreen.kt` (`updateProfile`) |
| Detalle de ticket | — | **CASCARÓN** | `TicketsTicketDetailScreen.kt` (647): solo `ticket()` y `ticketReportPdfBytes()`. Sin comentar ni cambiar estado |

**El Portal es la joya de la app y va por delante de la web.**

---

## 4. NÚMEROS

Denominador: los **103 módulos** declarados en `apps/web/lib/access-matrix.ts`.

| Categoría | Módulos | % |
|---|---:|---:|
| **NATIVO REAL** (opera contra la API) | **44** | 42.7% |
| **NATIVO-RO** (lectura, y la web tampoco opera → cuenta paridad) | **19** | 18.4% |
| *Subtotal con paridad funcional aceptable* | **63** | **61.2%** |
| **CASCARÓN** (existe, pero la web sí opera y la app no — o es inalcanzable) | **20** | 19.4% |
| **AUSENTE** | **20** | 19.4% |
| **WEBVIEW** | **0** | 0% |

Desglose de los 20 AUSENTE: **18 de INTEGRA** + `/erp/reuniones` + `/erp/facilities/access`.
(A nivel de *ruta*, además faltan `/erp/settings/{api-keys,webhooks,billing}`, `/ops/tools/new-inventory`, `/crm/tenders/[id]`, `/crm/projects/[id]/{costos,orden}`, `/ops/support/{new,[id]}` y `/studio/cases/[id]`.)

Los 20 CASCARÓN, por nombre:
`users` · `companies` · `architecture` · `accounting` · `employee-payments` · `hr` · `fines` · `documents` · `news(ERP)` · `my-profile` · `my-viatics` · `vehicles` · `my-vehicles` · `maintenance-contracts` · `recruiting`* · `dispatch`* · `crm-projects` · `studio-newsletter` · `ticket-detail(portal)` · `crm-tenders(sin detalle)`
`*` = además **inalcanzable desde la UI**.

Por panel:

| Panel | Total | NATIVO | NATIVO-RO | CASCARÓN | AUSENTE | % con paridad |
|---|---:|---:|---:|---:|---:|---:|
| CRM | 15 | 9 | 5 | 1 | 0 | **93%** |
| LAB | 5 | 3 | 2 | 0 | 0 | **100%** |
| STUDIO | 10 | 8 | 1 | 1 | 0 | **90%** |
| OPS | 22 | 12 | 3 | 7 | 0 | 68% |
| ERP | 33 | 12 | 8 | 11 | 2 | 61% |
| **INTEGRA** | **18** | **0** | **0** | **0** | **18** | **0%** |

---

## 5. Contraste con `docs/native-parity-matrix.md` — **el hallazgo estrella**

El documento tiene **68 filas con ✅ en la columna "Android native"** y ninguna con ⚠️ o ❌. A continuación, las filas cuyo ✅ **no se sostiene contra el código**.

### 5.1 Filas ✅ que en realidad son CASCARÓN

| Fila del doc | Lo que dice | Lo que hay | Prueba |
|---|---|---|---|
| `Users \| /console/users` | ✅ | Lista de solo lectura | `ConsoleUsersScreen.kt`: 0 llamadas de escritura |
| `HR leaves \| /console/hr` | ✅ `HrLeavesScreen` | Solo lectura | `HrLeavesScreen.kt`: único `repo.hrLeaveDtos()` |
| `Multi-empresa \| /erp/companies` | ✅ `CompaniesScreen` | Solo lectura | `GovernanceScreens.kt` |
| `Arquitectura ERP \| /erp/architecture` | ✅ "(catálogo local)" | **No toca la API**: pinta un array hardcodeado | `GovernanceScreens.kt:350-383` |
| `Knowledge Base \| /erp/kb` | ✅ `KbScreen` | Solo lectura | `kbArticleDtos()` |
| `Pagos empleados · Multas · Asientos` | ✅ `FinanceRichScreens` | Los tres son solo lectura (lo único que muta ahí son gastos y facturas) | `EmployeePaymentsRichScreen`, `FinesRichScreen`, `AccountingRichScreen`: 0 mutaciones |
| `Contratos mantenimiento \| /ops/maintenance/contracts` | ✅ | Solo lectura | `maintenanceContractDtos()` |
| `NOC monitoreo \| /ops/noc` | ✅ | Solo lectura, sin reconocer alarmas | `nocSummary/nocAlerts/nocDevices` |
| `SLA soporte \| /ops/support/sla` | ✅ | Solo lectura | `slaStats()` |
| `My viatics \| /console/my-viatics` | ✅ "scope personal" | Solo lectura; no crea viático | `ConsoleExtraScreens.kt` |
| `Vehicles \| /console/vehicles` | ✅ `VehiclesView` | Solo lectura | `ConsoleVehiclesScreen.kt` |
| `Newsletter \| /studio/newsletter` | ✅ | Solo lectura | `StudioMoreScreens.kt` |
| `Proyectos \| /ventas/proyectos` | ✅ `VentasProyectosScreen` | Solo lectura; sin costos ni orden | `CrmModuleScreens.kt` |

### 5.2 Filas ✅ de módulos **inalcanzables desde la UI**

| Fila del doc | Realidad |
|---|---|
| `Reclutamiento \| /ops/recruiting → ✅ RecruitingScreen` | Existe, es solo lectura, **y no aparece en ningún grupo del menú "Más"** (`ConsoleAccessRules.kt`). Inaccesible salvo deep link. |
| `Despacho OT \| /ops/dispatch → ✅ ConsoleDispatchScreen` (en `ModuleCatalog`) | La pantalla funciona pero `dispatch` **no está ni en `ERP_KEYS` ni en `OPS_KEYS`** → filtrado en los dos paneles. **Cero puntos de entrada en la UI.** |
| `Chat \| /erp/chat → ✅` | 2,919 líneas de chat que **no salen en el menú "Más" de ERP ni de OPS** por la misma razón. Solo el atajo del dashboard lo salva. |

### 5.3 Omisiones del propio documento (peor que un ✅ falso)

- **No existe una sección "Panel: INTEGRA"**. El doc declara en sus reglas: *"Paneles web (v2): ERP, CRM, OPS, STUDIO, LAB + Portal clientes"* — omitiendo INTEGRA, que sí está en `apps/web/lib/access-matrix.ts:105` como `PANELS.INTEGRA` con 18 módulos. La matriz no miente sobre INTEGRA: **simplemente lo borró del mapa**.
- **Faltan filas** para `reuniones`, `facilities/access`, `settings/api-keys`, `settings/webhooks`, `settings/billing`, `crm/team`, `tools/new-inventory`.
- El doc está escrito contra rutas de `apps/mobile` (`/console/*`, `/operacion/*`), una app **que ya no existe en el repo**. Compara la app nativa contra un fantasma, no contra `apps/web`.

### 5.4 El script de paridad también da falsa tranquilidad

```
$ python scripts/check-app-web-parity.py
rutas web encontradas: 168
módulos que enlazan a una ruta real: 100
módulos declarados sin equivalente web: 11
OK — la app y la web no divergen.
```

Ese "OK" solo comprueba **una dirección**: que cada `webPath` del catálogo aterrice en una ruta web existente (para que el botón "Abrir en la web" no dé 404). **Nunca pregunta qué rutas web no tienen módulo.** Ejecutando el recorrido inverso: **88 de 168 rutas web (52%) no tienen ninguna entrada en `ModuleCatalog`**, incluyendo el panel INTEGRA entero. El script debería fallar y no falla.

---

## 6. iOS

`apps/mobile-native/ios` **no es un esqueleto**: son **131 archivos Swift y 29,517 líneas**, con la misma arquitectura que Android (`Access/`, `Data/`, `Offline/`, `Realtime/`, `Push/`, `Security/`, y 72 vistas SwiftUI en `UI/` repartidas en Console, Crm, Ventas, Studio, Lab, Portal, Tickets, Contabilidad, Chat). Los repositorios y modelos son un espejo casi 1:1 de los de Kotlin.

Ahora bien, **no es un producto entregable**:
- **No hay `.xcodeproj` ni `.xcworkspace`** en el repo — solo `project.yml` para XcodeGen, que exige un Mac (`MAC_BUILD_PLAYBOOK.md`).
- Las dependencias de **Firebase se añaden a mano en Xcode** ("File > Add Packages…" dice el comentario de `project.yml`), es decir, el push de iOS no está reproducible en CI.
- `aps-environment: development` → ni siquiera está configurado para producción.
- **Tampoco tiene INTEGRA** (`grep -rli integra` en ios → solo el playbook de build).
- Va por detrás de Android en volumen (72 vistas vs 136 pantallas Compose) y le faltan pantallas que Android sí tiene (herramientas: inventario/mi kit/renovaciones/kits-usuarios como pantallas separadas, detalle de inventario del portal, etc.).

**Veredicto**: código real y bien estructurado, pero nunca compilado ni firmado. Para la v2 de Play no compite; para App Store haría falta un Mac, generar el proyecto, enlazar Firebase y una pasada de QA completa. **No lo metas en el alcance de la v2 de Google Play.**

---

## 7. Causas raíz (ordenadas por daño)

1. **`ModuleCatalog.kt` es el techo de la app y se quedó anclado a la app vieja.** Su propio comentario lo dice: *"Catálogo declarativo de módulos por portal, para mantener la paridad 1:1 con apps/mobile"* — con `apps/mobile` ya borrada. Todo lo que no esté ahí no existe para el usuario. Debe reconstruirse desde `apps/web/lib/access-matrix.ts`.
2. **`nativeImplemented = true` está puesto a mano en las 111 entradas del catálogo.** Es una etiqueta decorativa que nadie valida; alimenta además `ArchitectureScreen`, o sea que la app se auto-reporta 100% nativa dentro de sí misma.
3. **`ModulePanelMap.kt` mantiene dos listas blancas escritas a mano** (`ERP_KEYS` 42, `OPS_KEYS` 24) que hay que sincronizar con el catálogo. Ya se desincronizaron: `dispatch` y `chat` se cayeron de las dos.
4. **`ConsoleAccessRules.consoleSidebarGroups()` es una tercera lista a mano.** Un módulo tiene que aparecer en catálogo **Y** en la lista del panel **Y** en un grupo del sidebar para ser visible. Tres listas que hay que tocar a la vez → `recruiting` y `dispatch` se perdieron por el camino.
5. **Ningún test ni script comprueba el sentido web→app.**

---

## 8. Priorización: qué llevar a nativo para la v2 de Google Play

Criterio: **uso real del negocio en campo y en operación diaria**, no completitud. Asistencia, evidencias, tickets y CRM móvil pesan; configuración y gobierno no.

### Bloque 0 — Arreglos de una tarde, impacto inmediato (hazlos primero)

| # | Qué | Por qué | Dónde |
|---|---|---|---|
| **0.1** | Añadir `"dispatch"` a `OPS_KEYS` y al grupo `ops-monitoring` del sidebar | El **Centro de despacho ya está escrito y funciona** (reasignar OT). Hoy nadie puede abrirlo. Es la pantalla que más usa un coordinador de campo | `access/ModulePanelMap.kt`, `ui/console/ConsoleAccessRules.kt` |
| **0.2** | Añadir `"chat"` a `ERP_KEYS` y `OPS_KEYS` | 2,919 líneas de chat invisibles en el menú de los dos paneles más usados | idem |
| **0.3** | Añadir `"recruiting"` al grupo `people` del sidebar | Está en `OPS_KEYS` pero en ningún grupo → inalcanzable | `ConsoleAccessRules.kt` |
| **0.4** | Invertir el sentido de `scripts/check-app-web-parity.py` y hacerlo fallar en CI | Es lo que evita que esto vuelva a pasar | `scripts/` |

Coste: horas. Recupera 3 módulos ya pagados.

### Bloque 1 — Los 10 módulos más urgentes a nativo

| # | Módulo | Estado hoy | Por qué urge (negocio) | Trabajo |
|---|---|---|---|---|
| **1** | **INTEGRA · Accesos + Eventos + Personas** (`/integra/access`, `/events`, `/people`) | AUSENTE | Es el producto insignia (5 ADRs), el que se instala en sitio de cliente, y **el guardia y el instalador trabajan de pie con un teléfono, no con un laptop**. Hoy no pueden ver quién entró ni dar de alta a una persona. Sin esto INTEGRA no tiene brazo móvil | Panel `PanelId.INTEGRA` + NavHost + 3 pantallas + repositorio |
| **2** | **INTEGRA · Asistencia ACS** (`/integra/attendance`) | AUSENTE | La asistencia del ERP ya es nativa y con geo; la de los terminales ACS no. Es el contraste que pide el propio módulo web ("Checador ERP + contraste ACS Integra"). Es nómina — dinero | Pantalla + endpoint |
| **3** | **INTEGRA · Visitas** (`/integra/visitors`) | AUSENTE | Alta de visita en recepción desde el teléfono. Es el caso de uso que más se demuestra en visita comercial | Pantalla + alta |
| **4** | **Vehículos y Mis vehículos** (`/ops/vehicles`, `/ops/my-vehicles`) | CASCARÓN (solo lista) | El ingeniero de campo maneja el vehículo. Bitácora, kilometraje, combustible e incidencias **se capturan en la carretera**, no en la oficina. Hoy la app solo enseña una lista | Añadir mutaciones a `ConsoleVehiclesScreen` + `MyVehiclesScreen` |
| **5** | **Mis viáticos · alta y comprobación** (`/ops/my-viatics`) | CASCARÓN | La aprobación ya es nativa (`approveViatic`) pero **el que gasta no puede capturar**. El alta está escondida en una pestaña del detalle de actividad. Subir el ticket con la cámara desde el restaurante es el flujo natural | `MyViaticsScreen` + `createViatic` + foto |
| **6** | **Detalle de ticket del Portal** (`TicketsTicketDetailScreen`) | CASCARÓN (647 líneas, solo lee) | El Portal es lo mejor de la app y el cliente entra desde el móvil. **No puede comentar ni cerrar su ticket** desde el detalle. Es la cara pública del producto | Comentarios + cambio de estado |
| **7** | **Mi perfil** (`/erp/my-profile`) | CASCARÓN | Todo empleado entra ahí el primer día. `updateProfile` **ya existe en el repositorio** — lo usa el Portal. Es conectar un cable. Además Google Play valora que el usuario pueda gestionar su cuenta | `MyProfileScreen.kt` + `updateProfile` |
| **8** | **Usuarios y roles** (`/erp/users`) | CASCARÓN | Sin alta/edición de usuario desde móvil, cualquier onboarding o baja urgente obliga a abrir el laptop. Es el módulo de administración que más se usa fuera de horario | CRUD + asignación de rol |
| **9** | **RRHH · aprobar vacaciones/incidencias** (`/erp/hr`, `/erp/hr/fines`) | CASCARÓN | El aprobador es un jefe que está en junta o en campo. Aprobar desde el teléfono es exactamente para lo que sirve una app. Hoy solo puede mirar | Botones aprobar/rechazar sobre `HrLeavesScreen` y `FinesRichScreen` |
| **10** | **Documentos** (`/erp/documents`) | CASCARÓN (`CatalogRichScreen` genérico) | Subir la foto de un acta, un contrato firmado o una constancia **desde el sitio del cliente**. La app ya tiene `MediaPickerBar` y cámara resueltos para evidencias — es reutilizar | Alta con `MediaPickerBar` |

### Bloque 2 — Siguiente ola (post-v2)

11. INTEGRA · Alarmas + Plano + ANPR — 12. NOC: reconocer/silenciar alarma — 13. Contratos de mantenimiento: alta/renovación — 14. Pagos a empleados y asientos contables — 15. Newsletter Studio + detalle de caso — 16. `/erp/settings/{api-keys,webhooks,billing}` — 17. `/erp/reuniones` — 18. `/ops/tools/new-inventory` — 19. Proyectos CRM con costos y orden — 20. `/erp/facilities/access`.

### Bloque 3 — Deuda que no es una pantalla

- Reconstruir `ModuleCatalog.kt` **generándolo** desde `apps/web/lib/access-matrix.ts` (script en `scripts/`), en vez de mantenerlo a mano.
- Eliminar el campo `nativeImplemented` o derivarlo del `when(key)` real del NavHost.
- Fusionar las tres listas (`ModuleCatalog` + `ModulePanelMap` + `ConsoleAccessRules`) en una sola fuente.
- Reescribir `docs/native-parity-matrix.md` contra `apps/web` (no contra la difunta `apps/mobile`), con estados `NATIVO / SOLO-LECTURA / AUSENTE` en vez de ✅.
- Borrar código muerto: `NewsRichScreen`, `ContactMessagesRichScreen`, `AuditRichScreen` y `GenericListModuleScreen` **no se referencian desde ningún sitio**.

---

## 9. Apéndice · comandos de verificación

```bash
# INTEGRA en Android
grep -rni "integra" apps/mobile-native/android/app/src/main --include=*.kt     # → 1 (un literal)

# WebView
grep -rn "WebView" apps/mobile-native/android/app/src/main                      # → 0

# Verbos HTTP
grep -rh "@GET\|@POST\|@PATCH\|@PUT\|@DELETE" \
  apps/mobile-native/android/.../data/api/*.kt | grep -o "@[A-Z]*" | sort | uniq -c
# 177 GET · 42 POST · 31 PATCH · 10 PUT · 10 DELETE

# Módulos del panel web
grep -c 'id: "' apps/web/lib/access-matrix.ts                                   # → 103

# Paridad inversa (script propio de esta auditoría)
# 168 rutas web · 80 cubiertas por catálogo · 88 sin cubrir
```

Versión auditada: `versionName` por defecto `0.1.0`, `versionCode` 1, `minSdk` 24, `targetSdk` 36, `applicationId` `mx.nexara.mobile.nativeapp`.
