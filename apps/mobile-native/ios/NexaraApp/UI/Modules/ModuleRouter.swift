import SwiftUI

/// Resuelve la vista nativa para un módulo dado (portal + key).
/// Equivalente al `when(key)` de cada NavHost de Android.
struct ModuleRouter {
    @ViewBuilder
    static func view(for panel: PanelId, key: String) -> some View {
        let portal = panel.routingPortal
        switch (portal, key) {
        // ── Console ────────────────────────────────────────────────
        case (.console, "activities"),
             (.console, "my-activities"):
            ActivitiesView()
        case (.console, "evidences"), (.console, "my-evidences"):
            GenericListModuleView(title: "Evidencias") { (await ExtraRepository.shared.evidences()).map {
                toRow($0, title: ["title","descripcion","fileName"], subtitle: ["activityAn"])
            } }
        case (.console, "viatics"), (.console, "my-viatics"):
            GenericListModuleView(title: "Viáticos") { (await ExtraRepository.shared.viatics()).map {
                toRow($0, title: ["concepto","descripcion","motivo"], subtitle: ["usuario","userName"])
            } }
        case (.console, "vehicles"), (.console, "my-vehicles"):
            GenericListModuleView(title: "Vehículos") { (await ExtraRepository.shared.vehicles()).map {
                toRow($0, title: ["placas","marca","modelo"], subtitle: ["solicitanteNombre","solicitante"])
            } }
        case (.console, "gps"):
            GpsMapView()
        case (.console, "tools"):
            GenericListModuleView(title: "Herramientas") { (await ExtraRepository.shared.tools()).map {
                toRow($0, title: ["name","nombre"], subtitle: ["code","sku"])
            } }
        case (.console, "clients"):
            GenericListModuleView(title: "Clientes") { (await ExtraRepository.shared.clients()).map {
                toRow($0, title: ["name","nombre","razonSocial"], subtitle: ["email","rfc"])
            } }
        case (.web, "clientes"), (.ventas, "clientes"):
            GenericListModuleView(title: "Clientes comerciales") { (await ExtraRepository.shared.serviceClients()).map {
                toRow($0, title: ["name","nombre","razonSocial"], subtitle: ["email","rfc"])
            } }
        case (.console, "projects"):
            GenericListModuleView(title: "Proyectos") { (await ExtraRepository.shared.operationalProjects()).map {
                toRow($0, title: ["name","nombre","title"], subtitle: ["clientName","cliente"])
            } }
        case (.console, "work-projects"), (.contabilidad, "work-projects"):
            GenericListModuleView(title: "Proyectos internos") { (await ExtraRepository.shared.projects()).map {
                toRow($0, title: ["name","nombre","title"], subtitle: ["clientName","cliente"])
            } }
        case (.console, "users"):
            GenericListModuleView(title: "Usuarios") { (await ExtraRepository.shared.users()).map {
                toRow($0, title: ["nombre","name"], subtitle: ["email","rol"])
            } }
        case (.console, "attendance"):
            AttendanceView()
        case (.console, "my-lunch-breaks"):
            MyLunchBreaksView()
        case (.console, "lunch-breaks"), (.contabilidad, "horas"):
            GenericListModuleView(title: "Comidas") { (await ExtraRepository.shared.lunchBreaks()).map {
                toRow($0, title: ["userName","usuario"], subtitle: ["reason","motivo"], meta: ["startedAt","createdAt"])
            } }
        case (.console, "hr"):
            GenericListModuleView(title: "RR. HH. · Permisos") { (await ExtraRepository.shared.hrLeaves()).map {
                toRow($0, title: ["reason","motivo","type"], subtitle: ["userName","employeeName"])
            } }
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
            GenericListModuleView(title: "Facturación") { (await ExtraRepository.shared.invoices()).map {
                toRow($0, title: ["folio","invoiceNumber"], subtitle: ["clientName","cliente"], meta: ["total"])
            } }
        case (.console, "banking"), (.contabilidad, "banking"):
            GenericListModuleView(title: "Banca") { (await ExtraRepository.shared.bankAccounts()).map {
                toRow($0, title: ["name","nombre","alias"], subtitle: ["bank","banco","accountNumber"], meta: ["balance","saldo"])
            } }
        case (.console, "expenses"), (.contabilidad, "expenses"):
            GenericListModuleView(title: "Gastos") { (await ExtraRepository.shared.expenses()).map {
                toRow($0, title: ["concept","concepto","descripcion"], subtitle: ["category","categoria"], meta: ["amount","total"])
            } }
        case (.console, "fines"), (.contabilidad, "multas"):
            GenericListModuleView(title: "Multas") { (await ExtraRepository.shared.fines()).map {
                toRow($0, title: ["reason","motivo","concepto"], subtitle: ["userName","empleado"], meta: ["amount","total"])
            } }
        case (.console, "cotizaciones"), (.ventas, "cotizaciones"), (.ventas, "plantillas"):
            GenericListModuleView(title: "Cotizaciones") { (await ExtraRepository.shared.cotizaciones()).map {
                toRow($0, title: ["folio","number"], subtitle: ["clientName","cliente"], meta: ["total","amount"])
            } }
        case (.ventas, "dashboard"):
            CrmDashboardView()
        case (.contabilidad, "dashboard"):
            ContabilidadDashboardView()
        case (.web, "dashboard"), (.studio, "dashboard"):
            StudioDashboardView()
        case (.studio, "hero"):
            StudioListModuleView(
                title: "Carrusel inicio",
                loader: { try await StudioRepository.shared.heroSlides() },
                rowTitle: { $0["caption"] as? String ?? $0["altText"] as? String ?? "Slide" },
                rowSubtitle: { ($0["isActive"] as? Bool == false) ? "Inactivo" : "Activo" }
            )
        case (.studio, "cases"):
            StudioListModuleView(
                title: "Casos de éxito",
                loader: { try await StudioRepository.shared.caseStudies() },
                rowTitle: { $0["titulo"] as? String ?? "—" },
                rowSubtitle: { $0["cliente"] as? String ?? "" }
            )
        case (.studio, "news"):
            GenericListModuleView(title: "Noticias") { (await ExtraRepository.shared.news()).map {
                toRow($0, title: ["title","titulo"], subtitle: ["summary","excerpt"])
            } }
        case (.studio, "contacts"), (.studio, "leads"):
            StudioListModuleView(
                title: "Contactos",
                loader: { try await StudioRepository.shared.contactMessages() },
                rowTitle: { $0["subject"] as? String ?? $0["name"] as? String ?? "—" },
                rowSubtitle: { $0["email"] as? String ?? "" }
            )
        case (.studio, "social"):
            StudioListModuleView(
                title: "Redes sociales",
                loader: { try await StudioRepository.shared.socialPosts() },
                rowTitle: { $0["titulo"] as? String ?? "—" },
                rowSubtitle: { ($0["red"] as? String ?? "") + " · " + ($0["estado"] as? String ?? "") }
            )
        case (.studio, "newsletter"):
            StudioListModuleView(
                title: "Newsletter",
                loader: { try await StudioRepository.shared.newsletter() },
                rowTitle: { $0["email"] as? String ?? "—" },
                rowSubtitle: { $0["name"] as? String ?? "" }
            )
        case (.studio, "pages"):
            StudioListModuleView(
                title: "Secciones del sitio",
                loader: { try await StudioRepository.shared.pageSections().map { ["section": $0] } },
                rowTitle: { $0["section"] as? String ?? "—" },
                rowSubtitle: { _ in "Contenido de landing" }
            )
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
        case (.console, "client-tickets"), (.console, "gestion-vendedores"),
             (.ventas, "leads"), (.ventas, "oportunidades"), (.ventas, "gestion-vendedores"):
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
        case (.console, "my-profile"), (.ventas, "my-profile"), (.tickets, "profile"):
            MyProfileView()
        case (.console, "my-preferences"):
            MyPreferencesView()
        case (.console, "dashboard"), (.console, "settings"):
            GenericListModuleView(title: "Analítica") { (await ExtraRepository.shared.activities()).map {
                toRow($0, title: ["title","titulo"], subtitle: ["clientName"])
            } }
        // ── Ventas / Contabilidad / Web restantes caen a analytics/proyectos
        case (.ventas, "proyectos"), (.contabilidad, "proyectos"), (.web, "proyectos"):
            GenericListModuleView(title: "Proyectos") { (await ExtraRepository.shared.projects()).map {
                toRow($0, title: ["name","nombre","title"], subtitle: ["clientName","cliente"])
            } }
        case (.ventas, "notificaciones"):
            GenericListModuleView(title: "Notificaciones") { (await ExtraRepository.shared.audit()).map {
                toRow($0, title: ["action","description"], subtitle: ["userName"])
            } }
        case (.contabilidad, "viaticos"):
            GenericListModuleView(title: "Viáticos") { (await ExtraRepository.shared.viatics()).map {
                toRow($0, title: ["concepto","motivo"], subtitle: ["usuario"])
            } }
        // ── Tickets / Portal
        case (.tickets, "tickets"), (.tickets, "dashboard"), (.tickets, "home"):
            TicketsDashboardView()
        case (.tickets, _):
            GenericListModuleView(title: "Tickets") { (await ExtraRepository.shared.clientTicketRequests()).map {
                toRow($0, title: ["title","subject"], subtitle: ["clientName"])
            } }
        // ── LAB
        case (.lab, "health"):
            LabHealthView()
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
