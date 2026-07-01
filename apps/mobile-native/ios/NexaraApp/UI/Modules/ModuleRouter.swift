import SwiftUI

/// Resuelve la vista nativa para un módulo dado (portal + key).
/// Equivalente al `when(key)` de cada NavHost de Android.
struct ModuleRouter {
    @ViewBuilder
    static func view(for panel: PanelId, key: String) -> some View {
        view(portal: panel.routingPortal, key: key)
    }

    @ViewBuilder
    static func view(portal: ModuleRoutingPortal, key: String) -> some View {
        switch (portal, key) {
        // ── Console ────────────────────────────────────────────────
        case (.console, "activities"),
             (.console, "my-activities"):
            ActivitiesView()
        case (.console, "evidences"):
            EvidencesView(reviewMode: true)
        case (.console, "my-evidences"):
            EvidencesView(reviewMode: false)
        case (.console, "viatics"):
            ViaticsView(personalOnly: false)
        case (.console, "my-viatics"):
            ViaticsView(personalOnly: true)
        case (.contabilidad, "viaticos"):
            ViaticsView(personalOnly: false)
        case (.console, "vehicles"), (.console, "my-vehicles"):
            VehiclesView()
        case (.console, "gps"):
            GpsMapView()
        case (.console, "tools"):
            ToolsHubView()
        case (.console, "clients"):
            ServiceClientsView()
        case (.web, "clientes"):
            ServiceClientsView()
        case (.console, "projects"):
            ProjectsView()
        case (.console, "work-projects"), (.contabilidad, "work-projects"):
            GenericListModuleView(title: "Proyectos internos") { (await ExtraRepository.shared.projects()).map {
                toRow($0, title: ["name","nombre","title"], subtitle: ["clientName","cliente"])
            } }
        case (.console, "users"):
            UsersView()
        case (.console, "attendance"):
            AttendanceView()
        case (.console, "my-lunch-breaks"):
            MyLunchBreaksView()
        case (.console, "lunch-breaks"), (.contabilidad, "horas"):
            LunchBreaksAdminView()
        case (.console, "hr"):
            HrLeavesView()
        case (.console, "employee-payments"), (.contabilidad, "employee-payments"),
             (.contabilidad, "pagos"):
            GenericListModuleView(title: "Pagos a empleados") { (await ExtraRepository.shared.employeePayments()).map {
                toRow($0, title: ["concept","concepto"], subtitle: ["userName","empleado"], meta: ["paidAt","createdAt"])
            } }
        case (.console, "accounting"), (.contabilidad, "accounting"):
            GenericListModuleView(title: "Contabilidad") { (await ExtraRepository.shared.journalEntries()).map {
                toRow($0, title: ["description","descripcion","concepto"], subtitle: ["account","cuenta"])
            } }
        case (.console, "invoicing"), (.contabilidad, "invoicing"):
            InvoicesView()
        case (.console, "banking"), (.contabilidad, "banking"):
            BankingView()
        case (.console, "expenses"), (.contabilidad, "expenses"):
            ExpensesView()
        case (.console, "fines"), (.contabilidad, "multas"):
            GenericListModuleView(title: "Multas") { (await ExtraRepository.shared.fines()).map {
                toRow($0, title: ["reason","motivo","concepto"], subtitle: ["userName","empleado"], meta: ["amount","total"])
            } }
        case (.console, "cotizaciones"):
            CrmCotizacionesView()
        case (.ventas, "oportunidades"):
            CrmOpportunitiesView()
        case (.ventas, "clientes"):
            CrmCommercialClientsView()
        case (.ventas, "productos"):
            CrmProductsView()
        case (.ventas, "proyectos"):
            CrmProjectsView()
        case (.ventas, "pipeline"):
            CrmPipelineView()
        case (.ventas, "agenda"):
            CrmAgendaView()
        case (.ventas, "licitaciones"), (.ventas, "tenders"):
            CrmTendersView()
        case (.ventas, "metas"), (.ventas, "targets"):
            CrmTargetsView()
        case (.ventas, "equipo-comercial"), (.ventas, "sales-team"):
            CrmSalesTeamView()
        case (.ventas, "gestion-vendedores"):
            CrmSalesTeamView()
        case (.ventas, "plantillas"), (.ventas, "cotizaciones"):
            CrmCotizacionesView()
        case (.ventas, "leads"):
            CrmLeadsView()
        case (.tickets, "portal"), (.tickets, "home"):
            PortalHomeView(onExit: {}, onNavigate: { _ in })
        case (.tickets, "profile"):
            PortalProfileView()
        case (.tickets, "branches"):
            PortalBranchesModuleView()
        case (.tickets, "requests"), (.tickets, "request-new"):
            PortalRequestsView(onNew: {})
        case (.tickets, "tickets"), (.tickets, "dashboard"):
            PortalTicketsView(onOpen: { _ in })
        case (.tickets, "inventories"):
            PortalInventoriesView(onOpen: { _ in })
        case (.tickets, "feedback-pending"):
            PortalFeedbackView()
        case (.ventas, "dashboard"):
            CrmDashboardView()
        case (.contabilidad, "dashboard"):
            ContabilidadDashboardView()
        case (.web, "dashboard"), (.studio, "dashboard"):
            StudioDashboardView()
        case (.studio, "hero"):
            StudioHeroView()
        case (.studio, "cases"):
            StudioCasesView()
        case (.studio, "news"):
            StudioNewsView()
        case (.studio, "contacts"):
            StudioContactsView(leadsOnly: false)
        case (.studio, "leads"):
            StudioContactsView(leadsOnly: true)
        case (.studio, "social"):
            StudioSocialView()
        case (.studio, "newsletter"):
            StudioNewsletterView()
        case (.studio, "pages"):
            StudioPagesView()
        case (.console, "analytics"), (.ventas, "crecimiento"),
             (.ventas, "reportes"), (.ventas, "equipo-comparativa"):
            AnalyticsRawView()
        case (.console, "audit"):
            GenericListModuleView(title: "Auditoría") { (await ExtraRepository.shared.audit()).map {
                toRow($0, title: ["action","accion","description"], subtitle: ["userName","usuario"])
            } }
        case (.console, "assets"):
            GenericListModuleView(title: "Activos") { (await ExtraRepository.shared.maintenanceAssets()).map {
                toRow($0, title: ["name","nombre"], subtitle: ["code","tag","serial"])
            } }
        case (.console, "stock"):
            GenericListModuleView(title: "Almacén") { (await ExtraRepository.shared.stock()).map {
                toRow($0, title: ["name","nombre","productName"], subtitle: ["sku","code"], meta: ["quantity","cantidad"])
            } }
        case (.console, "warehouse"):
            GenericListModuleView(title: "Bodega") { (await ExtraRepository.shared.warehouse()).map {
                toRow($0, title: ["name","nombre"], subtitle: ["code","location"])
            } }
        case (.console, "procurement"):
            GenericListModuleView(title: "Compras · Requisiciones") { (await ExtraRepository.shared.requisitions()).map {
                toRow($0, title: ["title","descripcion","folio"], subtitle: ["requestedBy","solicitante"])
            } }
        case (.console, "maintenance"):
            GenericListModuleView(title: "Mantenimiento") { (await ExtraRepository.shared.workOrders()).map {
                toRow($0, title: ["title","description","orderNumber"], subtitle: ["assetName","equipmentName"])
            } }
        case (.console, "service-sheets"):
            GenericListModuleView(title: "Hojas de servicio") { (await ExtraRepository.shared.serviceSheets()).map {
                toRow($0, title: ["folio","number"], subtitle: ["clientName","anNumber"])
            } }
        case (.console, "documents"):
            GenericListModuleView(title: "Documentos") { (await ExtraRepository.shared.documents()).map {
                toRow($0, title: ["name","title","fileName"], subtitle: ["category","tipo"])
            } }
        case (.console, "cvs"):
            GenericListModuleView(title: "CVs") { (await ExtraRepository.shared.cvs()).map {
                toRow($0, title: ["fullName","name","fileName"], subtitle: ["position","role"])
            } }
        case (.console, "client-tickets"):
            GenericListModuleView(title: "Tickets de clientes") { (await ExtraRepository.shared.clientTicketRequests()).map {
                toRow($0, title: ["title","subject","asunto"], subtitle: ["clientName","cliente"])
            } }
        case (.console, "contact-messages"), (.web, "contactos"):
            GenericListModuleView(title: "Mensajes de contacto") { (await ExtraRepository.shared.contactMessages()).map {
                toRow($0, title: ["name","nombre","subject"], subtitle: ["email","telefono"])
            } }
        case (.console, "news"), (.web, "noticias"):
            GenericListModuleView(title: "Noticias") { (await ExtraRepository.shared.news()).map {
                toRow($0, title: ["title","titulo"], subtitle: ["excerpt","slug"])
            } }
        case (.console, "newsletter"):
            GenericListModuleView(title: "Newsletter") { (await ExtraRepository.shared.newsletter()).map {
                toRow($0, title: ["email","name"], subtitle: ["status"])
            } }
        case (.console, "my-profile"), (.ventas, "my-profile"):
            MyProfileView()
        case (.console, "my-preferences"):
            MyPreferencesView()
        case (.console, "settings"):
            ConsoleSettingsView()
        case (.console, "dashboard"):
            ConsoleDashboardView()
        // ── Ventas / Contabilidad / Web restantes caen a analytics/proyectos
        case (.contabilidad, "proyectos"), (.web, "proyectos"):
            GenericListModuleView(title: "Proyectos") { (await ExtraRepository.shared.projects()).map {
                toRow($0, title: ["name","nombre","title"], subtitle: ["clientName","cliente"])
            } }
        case (.ventas, "notificaciones"):
            GenericListModuleView(title: "Notificaciones") { (await ExtraRepository.shared.audit()).map {
                toRow($0, title: ["action","description"], subtitle: ["userName"])
            } }
        // ── LAB
        case (.lab, "health"):
            LabHealthView()
        case (.lab, "flags"):
            LabFlagsView()
        case (.lab, "ai"):
            LabAiSandboxView()
        case (.lab, "dashboard"), (.lab, "lab-home"):
            LabTabView(onExit: {})
        default:
            PlaceholderView(title: key)
        }
    }
}

struct PlaceholderView: View {
    let title: String
    var body: some View {
        VStack(spacing: 12) {
            Text(title).font(.title2).bold()
            Text("Módulo sin pantalla específica.")
                .foregroundColor(.secondary)
                .font(.footnote)
        }
        .padding()
    }
}

struct AnalyticsRawView: View {
    @State private var raw: String = ""
    @State private var isLoading = true
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if isLoading { ProgressView() }
                else if raw.isEmpty {
                    Text("Sin datos").foregroundColor(.secondary)
                } else {
                    Text("Dashboard").font(.headline)
                    Text(raw).font(.system(.caption, design: .monospaced))
                }
            }
            .padding()
        }
        .navigationTitle("Analítica")
        .task {
            raw = await ExtraRepository.shared.analyticsDashboardRaw()
            isLoading = false
        }
    }
}

struct MyProfileView: View {
    @EnvironmentObject var session: SessionStore
    var body: some View {
        List {
            if let u = session.currentUser {
                Section("Identidad") {
                    row("Nombre", u.nombre)
                    row("Email", u.email)
                    if let r = u.role { row("Rol", r) }
                    if let d = u.department { row("Departamento", d) }
                }
                Section("Flags") {
                    row("SuperAdmin", u.isSuperAdmin ? "Sí" : "No")
                    row("Cliente", u.isClient ? "Sí" : "No")
                    row("Sucursal", u.isBranchUser ? "Sí" : "No")
                    if let c = u.clientId { row("Cliente ID", c) }
                    if let b = u.branchId { row("Sucursal ID", b) }
                }
                if !u.permissions.isEmpty {
                    Section("Permisos (\(u.permissions.count))") {
                        ForEach(u.permissions, id: \.self) { p in Text(p).font(.footnote) }
                    }
                }
            } else {
                Text("Sin sesión activa").foregroundColor(.secondary)
            }
        }
        .navigationTitle("Mi perfil")
    }
    @ViewBuilder private func row(_ label: String, _ value: String) -> some View {
        HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value) }
    }
}

struct MyPreferencesView: View {
    var body: some View {
        List {
            Section("Notificaciones") {
                Text("Las preferencias de notificaciones se configuran desde Ajustes del sistema operativo.")
                    .font(.footnote).foregroundColor(.secondary)
            }
            Section("Dispositivo") {
                Text("Registro automático en login. Para push se requiere APNs + Firebase (pendiente).")
                    .font(.footnote).foregroundColor(.secondary)
            }
        }
        .navigationTitle("Mis preferencias")
    }
}
