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
        case (.console, "vehicles"):
            VehiclesView(personalOnly: false)
        case (.console, "my-vehicles"):
            VehiclesView(personalOnly: true)
        case (.console, "gps"):
            GpsMapView()
        case (.console, "tools"):
            ToolsHubView()
        case (.console, "clients"):
            ServiceClientsView()
        case (.console, "service-clients"):
            ServiceClientsView(title: "Clientes de servicio")
        case (.web, "clientes"):
            ServiceClientsView()
        case (.console, "projects"):
            ProjectsView()
        case (.console, "work-projects"), (.contabilidad, "work-projects"):
            WorkProjectsView()
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
            EmployeePaymentsView()
        case (.console, "accounting"), (.contabilidad, "accounting"):
            AccountingView()
        case (.console, "invoicing"), (.contabilidad, "invoicing"):
            InvoicesView()
        case (.console, "banking"), (.contabilidad, "banking"):
            BankingView()
        case (.console, "expenses"), (.contabilidad, "expenses"):
            ExpensesView()
        case (.console, "fines"), (.contabilidad, "multas"):
            FinesView()
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
        case (.ventas, "gestion-vendedores"), (.console, "gestion-vendedores"):
            CrmSalesTeamView()
        case (.ventas, "cotizaciones"):
            CrmCotizacionesView()
        case (.ventas, "plantillas"), (.ventas, "templates"):
            CrmTemplatesView()
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
        case (.console, "analytics"), (.console, "bi"):
            ErpBiView()
        case (.console, "executive"):
            ExecutiveView()
        case (.console, "approvals"):
            ApprovalsView()
        case (.console, "notifications-center"):
            NotificationsCenterView(onBack: {})
        case (.console, "noc"):
            NocView()
        case (.console, "support-sla"):
            SlaView()
        case (.console, "maintenance-contracts"):
            MaintenanceContractsView()
        case (.console, "support"):
            ClientTicketsModuleView()
        case (.console, "companies"):
            CompaniesView()
        case (.console, "kb"):
            KbView()
        case (.console, "exports"):
            ExportsView()
        case (.console, "architecture"):
            ArchitectureView()
        case (.console, "calendar"):
            ErpCalendarView()
        case (.console, "orgchart"):
            OrgchartView()
        case (.console, "kpis-hr"):
            HrKpisView()
        case (.ventas, "reportes"):
            CrmReportsView(mode: .reportes)
        case (.ventas, "crecimiento"):
            CrmReportsView(mode: .crecimiento)
        case (.ventas, "equipo-comparativa"):
            CrmReportsView(mode: .equipoComparativa)
        case (.console, "audit"):
            AuditView()
        case (.console, "assets"):
            MaintenanceView(initialTab: 1)
        case (.console, "stock"):
            StockView(initialTab: 0)
        case (.console, "warehouse"):
            StockView(initialTab: 1)
        case (.console, "procurement"):
            ProcurementModuleView()
        case (.console, "maintenance"):
            MaintenanceView(initialTab: 0)
        case (.console, "service-sheets"):
            ServiceSheetsView()
        case (.console, "documents"):
            DocumentsView()
        case (.console, "cvs"):
            CvsView()
        case (.console, "recruiting"):
            RecruitingView()
        case (.console, "client-tickets"):
            ClientTicketsModuleView()
        case (.console, "contact-messages"), (.web, "contactos"):
            ContactMessagesView()
        case (.console, "news"), (.web, "noticias"):
            NewsView()
        case (.console, "newsletter"):
            NewsletterView()
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
            WorkProjectsView()
        case (.ventas, "notificaciones"):
            NotificationsCenterView(onBack: {})
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
                Text("Push APNs: el token se registra al iniciar sesión. Las alertas llegan según tus roles y permisos.")
                    .font(.footnote).foregroundColor(.secondary)
            }
        }
        .navigationTitle("Mis preferencias")
    }
}
