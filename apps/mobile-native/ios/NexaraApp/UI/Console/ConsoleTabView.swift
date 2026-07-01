import SwiftUI

/// Console (ERP/OPS) portal con TabView inferior — paridad con ConsoleNavHost de Android.
/// Tabs: Inicio · Actividades · Asistencia · GPS · Más
struct ConsoleTabView: View {
    let panel: PanelId   // .erp o .ops
    let onExit: () -> Void
    @State private var selectedTab: ConsoleTab = .dashboard
    @State private var deepLinkModuleKey: String?
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    private var user: SessionUser? { session.currentUser }
    private var isAdmin: Bool {
        guard let u = user else { return false }
        return u.isSuperAdmin || u.permissions.contains("console.admin")
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            // ── Inicio / Dashboard
            NavigationStack {
                ConsoleDashboardView()
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Paneles", action: onExit)
                        }
                    }
            }
            .tabItem { Label("Inicio", systemImage: "house") }
            .tag(ConsoleTab.dashboard)

            // ── Actividades
            NavigationStack {
                ActivitiesView()
            }
            .tabItem { Label("Actividades", systemImage: "list.clipboard") }
            .tag(ConsoleTab.activities)

            // ── Asistencia
            NavigationStack {
                AttendanceView()
            }
            .tabItem { Label("Asistencia", systemImage: "clock") }
            .tag(ConsoleTab.attendance)

            // ── GPS
            NavigationStack {
                GpsMapView()
            }
            .tabItem { Label("GPS", systemImage: "map") }
            .tag(ConsoleTab.gps)

            // ── Más módulos
            NavigationStack {
                ConsoleMoreView(panel: panel, onExit: onExit)
                    .navigationTitle("Más módulos")
            }
            .tabItem { Label("Más", systemImage: "ellipsis.circle") }
            .tag(ConsoleTab.more)
        }
        .deepLinkModulePresenter(panel: panel, presentedKey: $deepLinkModuleKey)
        .onAppear { applyDeepLinkIfNeeded() }
        .onChange(of: deepLink.pending) { _, _ in applyDeepLinkIfNeeded() }
    }

    private func applyDeepLinkIfNeeded() {
        if let key = deepLink.consumeModule(for: panel) {
            deepLinkModuleKey = key
        }
    }
}

// MARK: – More screen

private struct ConsoleMoreView: View {
    let panel: PanelId
    let onExit: () -> Void
    @State private var navPath: [String] = []
    @State private var showContabilidad = false
    @EnvironmentObject var session: SessionStore

    private var isAdmin: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin || u.permissions.contains("console.admin")
    }

    private var canFinance: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin
            || u.permissions.contains(where: { $0.lowercased().contains("contabilidad") })
            || (u.role ?? "").lowercased().contains("contab")
    }

    var body: some View {
        List {
            Section("Mi cuenta") {
                navRow(key: "my-profile",      icon: "👤", label: "Mi perfil")
                navRow(key: "my-viatics",      icon: "💼", label: "Mis viáticos")
                navRow(key: "my-lunch-breaks", icon: "🍽️", label: "Mis comidas")
                navRow(key: "my-vehicles",     icon: "🚗", label: "Mis vehículos")
                navRow(key: "my-preferences",  icon: "⚙️", label: "Mis preferencias")
            }
            Section("Operación") {
                navRow(key: "viatics",         icon: "💰", label: "Viáticos (equipo)")
                navRow(key: "vehicles",        icon: "🚗", label: "Vehículos")
                navRow(key: "tools",           icon: "🔧", label: "Herramientas")
                if panel == .ops {
                    navRow(key: "service-clients", icon: "🏬", label: "Clientes de servicio")
                } else {
                    navRow(key: "clients",         icon: "🏢", label: "Clientes")
                }
                navRow(key: "projects",        icon: "📐", label: "Proyectos")
                navRow(key: "work-projects",   icon: "🛠️", label: "Proyectos internos")
                navRow(key: "service-sheets",  icon: "📋", label: "Hojas de servicio")
                navRow(key: "client-tickets",  icon: "🎫", label: "Tickets de clientes")
            }
            Section("RRHH · Finanzas") {
                if canFinance {
                    Button {
                        showContabilidad = true
                    } label: {
                        HStack(spacing: 12) {
                            Text("📊").font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Hub Contabilidad").foregroundColor(.primary)
                                Text("Facturas, gastos y finanzas").font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                }
                navRow(key: "hr",                icon: "👥", label: "Recursos humanos")
                navRow(key: "employee-payments", icon: "💳", label: "Pagos a empleados")
                navRow(key: "lunch-breaks",      icon: "🍽️", label: "Comidas (equipo)")
                navRow(key: "expenses",          icon: "📊", label: "Gastos")
                navRow(key: "fines",             icon: "⚠️", label: "Multas")
                navRow(key: "invoicing",         icon: "🧾", label: "Facturación")
                navRow(key: "banking",           icon: "🏦", label: "Banca")
                navRow(key: "accounting",        icon: "📒", label: "Contabilidad")
            }
            Section("Almacén · Compras") {
                navRow(key: "warehouse",   icon: "🏭", label: "Bodega")
                navRow(key: "stock",       icon: "📦", label: "Almacén")
                navRow(key: "procurement", icon: "🛒", label: "Compras")
                navRow(key: "assets",      icon: "🖥️", label: "Activos")
                navRow(key: "maintenance", icon: "🔨", label: "Mantenimiento")
            }
            Section("Admin · Contenido") {
                navRow(key: "users",            icon: "🧑‍💼", label: "Usuarios")
                if isAdmin { navRow(key: "settings", icon: "⚙️", label: "Ajustes del sistema") }
                navRow(key: "audit",            icon: "🔍", label: "Auditoría")
                navRow(key: "analytics",        icon: "📈", label: "Analítica")
                navRow(key: "documents",        icon: "📄", label: "Documentos")
                navRow(key: "news",             icon: "📰", label: "Noticias")
                navRow(key: "newsletter",       icon: "📮", label: "Newsletter")
                navRow(key: "contact-messages", icon: "✉️", label: "Mensajes de contacto")
                navRow(key: "cotizaciones",     icon: "📝", label: "Cotizaciones")
                navRow(key: "cvs",              icon: "🗂️", label: "CVs")
            }
            if panel == .ops {
                Section("OPS · Soporte") {
                    navRow(key: "noc",                  icon: "📡", label: "NOC · Monitoreo")
                    navRow(key: "support-sla",          icon: "⏱️", label: "SLA y tiempos")
                    navRow(key: "maintenance-contracts", icon: "📑", label: "Contratos de servicio")
                    navRow(key: "support",              icon: "🆘", label: "Bandeja de soporte")
                    navRow(key: "recruiting",           icon: "🔍", label: "Reclutamiento")
                }
            }
            if isAdmin {
                Section("Plataforma ERP") {
                    navRow(key: "executive",             icon: "📊", label: "Vista ejecutiva")
                    navRow(key: "bi",                    icon: "📈", label: "Business Intelligence")
                    navRow(key: "approvals",             icon: "🛡️", label: "Aprobaciones")
                    navRow(key: "notifications-center",  icon: "🔔", label: "Centro de notificaciones")
                    navRow(key: "calendar",              icon: "📅", label: "Mi calendario")
                    navRow(key: "companies",             icon: "🏛️", label: "Multi-empresa")
                    navRow(key: "kb",                    icon: "📚", label: "Knowledge Base")
                    navRow(key: "exports",               icon: "📥", label: "Exportaciones")
                    navRow(key: "architecture",          icon: "🗺️", label: "Arquitectura")
                    navRow(key: "orgchart",              icon: "🌳", label: "Organigrama")
                    navRow(key: "kpis-hr",               icon: "📊", label: "KPIs de personas")
                }
            }
            Section {
                Button(role: .destructive) { onExit() } label: {
                    Label("Cambiar panel", systemImage: "arrow.left.circle")
                }
            }
        }
        .navigationDestination(for: String.self) { key in
            ModuleRouter.view(for: panel, key: key)
        }
        .fullScreenCover(isPresented: $showContabilidad) {
            ContabilidadTabView(onExit: { showContabilidad = false })
        }
    }

    @ViewBuilder
    private func navRow(key: String, icon: String, label: String) -> some View {
        NavigationLink(value: key) {
            HStack(spacing: 12) {
                Text(icon).font(.title3)
                Text(label)
            }
        }
    }
}

// MARK: – Tab enum

private enum ConsoleTab: Hashable {
    case dashboard, activities, attendance, gps, more
}
