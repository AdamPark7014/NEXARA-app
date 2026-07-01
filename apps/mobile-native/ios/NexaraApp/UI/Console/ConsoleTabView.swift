import SwiftUI

/// Console (ERP/OPS) portal con TabView inferior — paridad con ConsoleNavHost de Android.
/// Tabs: Inicio · Actividades · Asistencia · GPS · Más
struct ConsoleTabView: View {
    let panel: PanelId   // .erp o .ops
    let onExit: () -> Void
    @State private var selectedTab: ConsoleTab = .dashboard
    @EnvironmentObject var session: SessionStore

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
                GenericListModuleView(
                    title: isAdmin ? "Actividades" : "Mis actividades"
                ) {
                    let all = await ExtraRepository.shared.activities()
                    let myId = session.currentUser?.id
                    let filtered: [[String: Any]] = isAdmin ? all : all.filter { row in
                        let uid = (row["usuarioId"] as? Int).map(String.init)
                            ?? ((row["responsable"] as? [String: Any]).flatMap { $0["id"] as? Int }.map(String.init))
                        return uid == myId
                    }
                    return filtered.map { toRow($0, title: ["titulo", "title"], subtitle: ["responsable", "asignadoNombre"]) }
                }
                .navigationTitle(isAdmin ? "Actividades" : "Mis actividades")
            }
            .tabItem { Label("Actividades", systemImage: "list.clipboard") }
            .tag(ConsoleTab.activities)

            // ── Asistencia
            NavigationStack {
                GenericListModuleView(title: "Asistencia") {
                    (await ExtraRepository.shared.attendance()).map {
                        toRow($0, title: ["userName", "nombre", "usuario"], subtitle: ["type", "tipo"], meta: ["createdAt", "date"])
                    }
                }
                .navigationTitle("Asistencia")
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
    }
}

// MARK: – More screen

private struct ConsoleMoreView: View {
    let panel: PanelId
    let onExit: () -> Void
    @State private var navPath: [String] = []

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
                navRow(key: "clients",         icon: "🏢", label: "Clientes")
                navRow(key: "projects",        icon: "📐", label: "Proyectos")
                navRow(key: "work-projects",   icon: "🛠️", label: "Proyectos internos")
                navRow(key: "service-sheets",  icon: "📋", label: "Hojas de servicio")
                navRow(key: "client-tickets",  icon: "🎫", label: "Tickets de clientes")
            }
            Section("RRHH · Finanzas") {
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
                navRow(key: "audit",            icon: "🔍", label: "Auditoría")
                navRow(key: "analytics",        icon: "📈", label: "Analítica")
                navRow(key: "documents",        icon: "📄", label: "Documentos")
                navRow(key: "news",             icon: "📰", label: "Noticias")
                navRow(key: "contact-messages", icon: "✉️", label: "Mensajes de contacto")
                navRow(key: "cotizaciones",     icon: "📝", label: "Cotizaciones")
                navRow(key: "cvs",              icon: "🗂️", label: "CVs")
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
