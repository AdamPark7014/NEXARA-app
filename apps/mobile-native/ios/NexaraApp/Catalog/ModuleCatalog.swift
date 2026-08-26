import Foundation

/// Entrada del catálogo de módulos (espejo 1:1 del Android).
struct ModuleEntry: Identifiable, Hashable {
    let key: String
    let label: String
    let icon: String           // emoji (consistente con Android)
    let webPath: String
    let permissions: [String]
    let superAdminOnly: Bool
    let nativeImplemented: Bool

    var id: String { key }

    init(_ key: String, _ label: String, _ icon: String, _ webPath: String,
         permissions: [String] = [], superAdminOnly: Bool = false, nativeImplemented: Bool = true) {
        self.key = key
        self.label = label
        self.icon = icon
        self.webPath = webPath
        self.permissions = permissions
        self.superAdminOnly = superAdminOnly
        self.nativeImplemented = nativeImplemented
    }
}

enum ModuleCatalog {
    static let console: [ModuleEntry] = [
        ModuleEntry("dashboard", "Dashboard", "📊", "/console/dashboard"),
        ModuleEntry("activities", "Actividades", "📝", "/operacion/activities"),
        ModuleEntry("my-activities", "Mis actividades", "📝", "/operacion/my-activities"),
        ModuleEntry("evidences", "Evidencias", "📷", "/operacion/evidences"),
        ModuleEntry("my-evidences", "Mis evidencias", "📷", "/operacion/my-evidences"),
        ModuleEntry("viatics", "Viáticos", "💼", "/operacion/viatics"),
        ModuleEntry("my-viatics", "Mis viáticos", "💼", "/operacion/my-viatics"),
        ModuleEntry("vehicles", "Vehículos", "🚗", "/operacion/vehicles"),
        ModuleEntry("my-vehicles", "Mis vehículos", "🚗", "/operacion/my-vehicles"),
        ModuleEntry("gps", "GPS", "🗺️", "/operacion/gps"),
        ModuleEntry("tools", "Herramientas", "🧰", "/operacion/tools"),
        ModuleEntry("clients", "Clientes", "🤝", "/console/clients"),
        ModuleEntry("projects", "Proyectos", "🧩", "/operacion/projects"),
        ModuleEntry("work-projects", "Proyectos internos", "🧱", "/operacion/work-projects"),
        ModuleEntry("users", "Usuarios", "👥", "/console/users"),
        ModuleEntry("attendance", "Asistencia", "⏰", "/console/attendance"),
        ModuleEntry("lunch-breaks", "Comidas", "🥪", "/console/lunch-breaks"),
        ModuleEntry("my-lunch-breaks", "Mis comidas", "🥪", "/console/my-lunch-breaks"),
        ModuleEntry("hr", "Recursos humanos", "👥", "/console/hr"),
        ModuleEntry("employee-payments", "Pagos a empleados", "💵", "/console/employee-payments"),
        ModuleEntry("accounting", "Contabilidad", "📒", "/console/accounting"),
        ModuleEntry("banking", "Banca", "🏦", "/console/banking"),
        ModuleEntry("invoicing", "Facturación", "🧾", "/console/invoicing"),
        ModuleEntry("expenses", "Gastos", "💸", "/console/expenses"),
        ModuleEntry("fines", "Multas", "⚠️", "/console/fines"),
        ModuleEntry("cotizaciones", "Cotizaciones", "🧮", "/console/cotizaciones"),
        ModuleEntry("gestion-vendedores", "Gestión vendedores", "📈", "/console/gestion-vendedores"),
        ModuleEntry("executive", "Vista ejecutiva", "📊", "/erp/executive"),
        ModuleEntry("dispatch", "Despacho OT", "🗺️", "/ops/dispatch"),
        ModuleEntry("approvals", "Aprobaciones", "🛡️", "/erp/approvals"),
        ModuleEntry("notifications-center", "Notificaciones", "🔔", "/erp/notifications-center"),
        ModuleEntry("bi", "Business Intelligence", "📈", "/erp/analytics/bi"),
        ModuleEntry("analytics", "Analítica", "📈", "/console/analytics"),
        ModuleEntry("audit", "Auditoría", "🔍", "/console/audit"),
        ModuleEntry("assets", "Activos", "📦", "/operacion/assets"),
        ModuleEntry("stock", "Almacén", "📦", "/console/stock"),
        ModuleEntry("warehouse", "Bodega", "🏭", "/console/warehouse"),
        ModuleEntry("procurement", "Compras", "🛒", "/console/procurement"),
        ModuleEntry("maintenance", "Mantenimiento", "🔧", "/operacion/maintenance"),
        ModuleEntry("service-sheets", "Hojas de servicio", "📄", "/operacion/service-sheets"),
        ModuleEntry("documents", "Documentos", "📁", "/console/documents"),
        ModuleEntry("cvs", "CVs", "📑", "/console/cvs"),
        ModuleEntry("recruiting", "Reclutamiento", "🔍", "/ops/recruiting"),
        ModuleEntry("client-tickets", "Tickets de clientes", "🎫", "/operacion/client-tickets"),
        ModuleEntry("service-clients", "Clientes de servicio", "🏬", "/ops/service-clients"),
        ModuleEntry("support", "Bandeja de soporte", "🆘", "/ops/support"),
        ModuleEntry("noc", "NOC · Monitoreo", "📡", "/ops/noc"),
        ModuleEntry("support-sla", "SLA y tiempos", "⏱️", "/ops/support/sla"),
        ModuleEntry("maintenance-contracts", "Contratos de servicio", "📑", "/ops/maintenance/contracts"),
        ModuleEntry("contact-messages", "Mensajes de contacto", "✉️", "/console/contact-messages"),
        ModuleEntry("news", "Noticias", "📰", "/console/news"),
        ModuleEntry("newsletter", "Newsletter", "📮", "/console/newsletter"),
        ModuleEntry("my-profile", "Mi perfil", "👤", "/console/my-profile"),
        ModuleEntry("my-preferences", "Mis preferencias", "⚙️", "/console/my-preferences"),
        ModuleEntry("offline-queue", "Cola offline", "☁️", "/console/offline-queue"),
        ModuleEntry("settings", "Ajustes", "⚙️", "/console/settings"),
        ModuleEntry("companies", "Multi-empresa", "🏛️", "/erp/companies"),
        ModuleEntry("kb", "Knowledge Base", "📚", "/erp/kb"),
        ModuleEntry("exports", "Exportaciones", "📥", "/erp/exports"),
        ModuleEntry("architecture", "Arquitectura", "🗺️", "/erp/architecture"),
        ModuleEntry("calendar", "Mi calendario", "📅", "/erp/calendar"),
        ModuleEntry("orgchart", "Organigrama", "🌳", "/erp/hr/orgchart"),
        ModuleEntry("kpis-hr", "KPIs de personas", "📊", "/erp/hr/kpis"),
    ]

    static let tickets: [ModuleEntry] = [
        ModuleEntry("portal", "Portal", "🏢", "/tickets/portal"),
        ModuleEntry("tickets", "Tickets", "🎫", "/tickets"),
        ModuleEntry("requests", "Solicitudes", "📨", "/tickets/requests"),
        ModuleEntry("request-new", "Nueva solicitud", "➕", "/tickets/requests/new"),
        ModuleEntry("branches", "Sucursales", "🏬", "/tickets/branches"),
        ModuleEntry("inventories", "Inventarios", "📦", "/tickets/inventories"),
        ModuleEntry("feedback-pending", "Feedback pendiente", "💬", "/tickets/feedback-pending"),
        ModuleEntry("profile", "Perfil", "👤", "/tickets/profile"),
    ]

    static let ventas: [ModuleEntry] = [
        ModuleEntry("dashboard", "Dashboard", "📊", "/ventas/dashboard"),
        ModuleEntry("leads", "Leads", "📥", "/ventas/leads"),
        ModuleEntry("oportunidades", "Oportunidades", "🎯", "/ventas/oportunidades"),
        ModuleEntry("cotizaciones", "Cotizaciones", "🧮", "/ventas/cotizaciones"),
        ModuleEntry("productos", "Catálogo IT/CCTV", "📦", "/ventas/productos"),
        ModuleEntry("clientes", "Clientes", "🤝", "/ventas/clientes"),
        ModuleEntry("proyectos", "Proyectos", "🧩", "/ventas/proyectos"),
        ModuleEntry("pipeline", "Pipeline", "📊", "/crm/pipeline"),
        ModuleEntry("agenda", "Agenda", "📅", "/crm/agenda"),
        ModuleEntry("licitaciones", "Licitaciones", "📑", "/crm/tenders"),
        ModuleEntry("metas", "Metas comerciales", "🎯", "/crm/targets"),
        ModuleEntry("plantillas", "Plantillas", "🧾", "/ventas/plantillas"),
        ModuleEntry("gestion-vendedores", "Gestión vendedores", "📈", "/ventas/gestion-vendedores"),
        ModuleEntry("equipo-comparativa", "Comparativa equipo", "⚖️", "/ventas/equipo-comparativa"),
        ModuleEntry("crecimiento", "Crecimiento", "📈", "/ventas/crecimiento"),
        ModuleEntry("reportes", "Reportes", "📑", "/ventas/reportes"),
        ModuleEntry("notificaciones", "Notificaciones", "🔔", "/ventas/notificaciones"),
        ModuleEntry("my-profile", "Mi perfil", "👤", "/ventas/my-profile"),
    ]

    static let contabilidad: [ModuleEntry] = [
        ModuleEntry("dashboard", "Dashboard", "📊", "/contabilidad/dashboard"),
        ModuleEntry("accounting", "Contabilidad", "📒", "/contabilidad/accounting"),
        ModuleEntry("banking", "Banca", "🏦", "/contabilidad/banking"),
        ModuleEntry("invoicing", "Facturación", "🧾", "/contabilidad/invoicing"),
        ModuleEntry("expenses", "Gastos", "💸", "/contabilidad/expenses"),
        ModuleEntry("employee-payments", "Pagos a empleados", "💵", "/contabilidad/employee-payments"),
        ModuleEntry("viaticos", "Viáticos", "💼", "/contabilidad/viaticos"),
        ModuleEntry("pagos", "Pagos", "💳", "/contabilidad/pagos"),
        ModuleEntry("horas", "Horas", "⏱️", "/contabilidad/horas"),
        ModuleEntry("proyectos", "Proyectos", "🧩", "/contabilidad/proyectos"),
        ModuleEntry("work-projects", "Proyectos internos", "🧱", "/contabilidad/work-projects"),
        ModuleEntry("multas", "Multas", "⚠️", "/contabilidad/multas"),
    ]

    static let studio: [ModuleEntry] = [
        ModuleEntry("dashboard", "Dashboard", "📊", "/studio/dashboard"),
        ModuleEntry("hero", "Carrusel inicio", "🖼️", "/studio/hero"),
        ModuleEntry("pages", "Secciones del sitio", "🌐", "/studio/pages"),
        ModuleEntry("cases", "Casos de éxito", "🏆", "/studio/cases"),
        ModuleEntry("news", "Noticias", "📰", "/studio/news"),
        ModuleEntry("social", "Redes sociales", "📱", "/studio/social"),
        ModuleEntry("newsletter", "Newsletter", "📬", "/studio/newsletter"),
        ModuleEntry("contacts", "Contactos", "✉️", "/studio/contacts"),
        ModuleEntry("leads", "Leads", "✨", "/studio/leads"),
    ]

    static let web: [ModuleEntry] = studio

    static let lab: [ModuleEntry] = [
        ModuleEntry("health", "API Health", "❤️", "/lab/health"),
        ModuleEntry("flags", "Feature flags", "🚩", "/lab/flags"),
        ModuleEntry("ai", "AI Sandbox", "🤖", "/lab/ai"),
    ]

    static func modules(for panel: PanelId) -> [ModuleEntry] {
        let base: [ModuleEntry] = switch panel {
        case .erp, .ops:
            let keys = ModulePanelMap.consoleKeys(for: panel)
            if let keys {
                console.filter { keys.contains($0.key) }
            } else {
                console
            }
        case .crm: return ventas
        case .studio: return studio
        case .portal: return tickets
        case .lab: return lab
        }
        return base
    }
}
