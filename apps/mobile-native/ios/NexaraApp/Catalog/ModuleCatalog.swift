import Foundation

/// Entrada del catálogo de módulos (espejo 1:1 del Android).
struct ModuleEntry: Identifiable, Hashable {
    let key: String
    let label: String
    let icon: String           // emoji (consistente con Android)
    let webPath: String
    let permissions: [String]
    let superAdminOnly: Bool
    let parityStatus: ParityStatus

    /// true solo con CRUD/ops nativos reales (no listas finas ni placeholders).
    var nativeImplemented: Bool { parityStatus == .nativo }

    var id: String { key }

    init(_ key: String, _ label: String, _ icon: String, _ webPath: String,
         permissions: [String] = [], superAdminOnly: Bool = false,
         parityStatus: ParityStatus = .nativo) {
        self.key = key
        self.label = label
        self.icon = icon
        self.webPath = webPath
        self.permissions = permissions
        self.superAdminOnly = superAdminOnly
        self.parityStatus = parityStatus
    }
}

enum ModuleCatalog {
    static let console: [ModuleEntry] = [
        ModuleEntry("dashboard", "Inicio", "📊", "/console/dashboard"),
        ModuleEntry("activities", "Actividades", "🗂️", "/operacion/activities"),
        ModuleEntry("my-activities", "Mis actividades", "📋", "/operacion/my-activities"),
        ModuleEntry("evidences", "Evidencias", "📸", "/operacion/evidences"),
        ModuleEntry("my-evidences", "Mis evidencias", "📸", "/operacion/my-evidences"),
        ModuleEntry("viatics", "Viáticos", "💼", "/operacion/viatics"),
        ModuleEntry("my-viatics", "Mis viáticos", "💼", "/operacion/my-viatics"),
        ModuleEntry("vehicles", "Vehículos", "🚗", "/operacion/vehicles"),
        ModuleEntry("my-vehicles", "Mis vehículos", "🚗", "/operacion/my-vehicles"),
        ModuleEntry("gps", "GPS", "🗺️", "/operacion/gps"),
        ModuleEntry("tools", "Herramientas", "🧰", "/operacion/tools"),
        ModuleEntry("clients", "Clientes", "🤝", "/console/clients"),
        ModuleEntry("projects", "Proyectos", "🧩", "/operacion/projects"),
        ModuleEntry("work-projects", "Proyectos internos", "🧱", "/operacion/work-projects"),
        ModuleEntry("users", "Usuarios", "🧑‍💼", "/console/users"),
        ModuleEntry("attendance", "Asistencia", "🕒", "/console/attendance"),
        ModuleEntry("lunch-breaks", "Comidas", "🥪", "/console/lunch-breaks"),
        ModuleEntry("my-lunch-breaks", "Mis comidas", "🥪", "/console/my-lunch-breaks"),
        ModuleEntry("hr", "Recursos humanos", "👥", "/console/hr"),
        ModuleEntry("employee-payments", "Pagos a empleados", "💵", "/console/employee-payments"),
        ModuleEntry("accounting", "Contabilidad", "📒", "/console/accounting"),
        ModuleEntry("banking", "Banca", "🏦", "/console/banking"),
        ModuleEntry("invoicing", "Facturación", "🧾", "/console/invoicing"),
        ModuleEntry("expenses", "Gastos", "💸", "/console/expenses"),
        ModuleEntry("fines", "Multas", "⚠️", "/console/fines"),
        ModuleEntry("cotizaciones", "Cotizaciones", "🧮", "/console/cotizaciones", parityStatus: .soloLectura),
        ModuleEntry("gestion-vendedores", "Gestión vendedores", "📈", "/console/gestion-vendedores", parityStatus: .soloLectura),
        ModuleEntry("executive", "Vista ejecutiva", "📊", "/erp/executive", parityStatus: .soloLectura),
        ModuleEntry("dispatch", "Despacho OT", "🗺️", "/ops/dispatch"),
        ModuleEntry("approvals", "Aprobaciones", "🛡️", "/erp/approvals"),
        ModuleEntry("notifications-center", "Notificaciones", "🔔", "/erp/notifications-center"),
        ModuleEntry("chat", "Chat", "💬", "/erp/chat"),
        ModuleEntry("reuniones", "Reuniones", "📅", "/erp/reuniones"),
        ModuleEntry("bi", "Business Intelligence", "📈", "/erp/analytics/bi", parityStatus: .soloLectura),
        ModuleEntry("analytics", "Analítica", "📈", "/console/analytics", parityStatus: .soloLectura),
        ModuleEntry("audit", "Auditoría", "🔍", "/console/audit", parityStatus: .soloLectura),
        ModuleEntry("assets", "Activos", "📦", "/operacion/assets", parityStatus: .soloLectura),
        ModuleEntry("stock", "Almacén", "📦", "/console/stock"),
        ModuleEntry("warehouse", "Bodega", "🏭", "/console/warehouse"),
        ModuleEntry("procurement", "Compras", "🛒", "/console/procurement"),
        ModuleEntry("maintenance", "Mantenimiento", "🔧", "/operacion/maintenance"),
        ModuleEntry("service-sheets", "Hojas de servicio", "📄", "/operacion/service-sheets", parityStatus: .soloLectura),
        ModuleEntry("documents", "Documentos", "📁", "/console/documents"),
        ModuleEntry("cvs", "CVs", "📑", "/console/cvs"),
        ModuleEntry("recruiting", "Reclutamiento", "🔍", "/ops/recruiting"),
        ModuleEntry("client-tickets", "Tickets de clientes", "🎫", "/operacion/client-tickets"),
        ModuleEntry("service-clients", "Clientes de servicio", "🏬", "/ops/service-clients"),
        ModuleEntry("support", "Bandeja de soporte", "🆘", "/ops/support"),
        ModuleEntry("noc", "NOC · Monitoreo", "📡", "/ops/noc", parityStatus: .soloLectura),
        ModuleEntry("support-sla", "SLA y tiempos", "⏱️", "/ops/support/sla", parityStatus: .soloLectura),
        ModuleEntry("maintenance-contracts", "Contratos de servicio", "📑", "/ops/maintenance/contracts"),
        ModuleEntry("contact-messages", "Mensajes de contacto", "✉️", "/console/contact-messages", parityStatus: .soloLectura),
        ModuleEntry("news", "Noticias", "📰", "/console/news", parityStatus: .soloLectura),
        ModuleEntry("newsletter", "Newsletter", "📮", "/console/newsletter", parityStatus: .soloLectura),
        ModuleEntry("my-profile", "Mi perfil", "👤", "/console/my-profile"),
        ModuleEntry("my-preferences", "Mis preferencias", "⚙️", "/console/my-preferences", parityStatus: .soloLectura),
        ModuleEntry("offline-queue", "Cola offline", "☁️", "/console/offline-queue"),
        ModuleEntry("settings", "Ajustes", "⚙️", "/console/settings"),
        ModuleEntry("companies", "Multi-empresa", "🏛️", "/erp/companies"),
        ModuleEntry("kb", "Knowledge Base", "📚", "/erp/kb", parityStatus: .soloLectura),
        ModuleEntry("exports", "Exportaciones", "📥", "/erp/exports", parityStatus: .soloLectura),
        ModuleEntry("architecture", "Arquitectura", "🗺️", "/erp/architecture", parityStatus: .soloLectura),
        ModuleEntry("calendar", "Mi calendario", "📅", "/erp/calendar", parityStatus: .soloLectura),
        ModuleEntry("orgchart", "Organigrama", "🌳", "/erp/hr/orgchart", parityStatus: .soloLectura),
        ModuleEntry("kpis-hr", "KPIs de personas", "📊", "/erp/hr/kpis", parityStatus: .soloLectura),
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
        ModuleEntry("dashboard", "Dashboard", "📊", "/ventas/dashboard", parityStatus: .soloLectura),
        ModuleEntry("leads", "Leads", "📥", "/ventas/leads"),
        ModuleEntry("oportunidades", "Oportunidades", "🎯", "/ventas/oportunidades"),
        ModuleEntry("cotizaciones", "Cotizaciones", "🧮", "/ventas/cotizaciones"),
        ModuleEntry("smart-quote", "Cotizador inteligente", "✨", "/ventas/cotizaciones/nueva"),
        ModuleEntry("productos", "Catálogo IT/CCTV", "📦", "/ventas/productos", parityStatus: .soloLectura),
        ModuleEntry("clientes", "Clientes", "🤝", "/ventas/clientes"),
        ModuleEntry("proyectos", "Proyectos", "🧩", "/ventas/proyectos"),
        ModuleEntry("pipeline", "Pipeline", "📊", "/crm/pipeline"),
        ModuleEntry("agenda", "Agenda", "📅", "/crm/agenda"),
        ModuleEntry("licitaciones", "Licitaciones", "📑", "/crm/tenders", parityStatus: .soloLectura),
        ModuleEntry("metas", "Metas comerciales", "🎯", "/crm/targets", parityStatus: .soloLectura),
        ModuleEntry("plantillas", "Plantillas", "🧾", "/ventas/plantillas"),
        ModuleEntry("gestion-vendedores", "Gestión vendedores", "📈", "/ventas/gestion-vendedores", parityStatus: .soloLectura),
        ModuleEntry("equipo-comparativa", "Comparativa equipo", "⚖️", "/ventas/equipo-comparativa", parityStatus: .soloLectura),
        ModuleEntry("crecimiento", "Crecimiento", "📈", "/ventas/crecimiento", parityStatus: .soloLectura),
        ModuleEntry("reportes", "Reportes", "📑", "/ventas/reportes", parityStatus: .soloLectura),
        ModuleEntry("notificaciones", "Notificaciones", "🔔", "/ventas/notificaciones"),
        ModuleEntry("chat", "Chat equipo", "💬", "/erp/chat"),
        ModuleEntry("my-profile", "Mi perfil", "👤", "/ventas/my-profile"),
    ]

    static let contabilidad: [ModuleEntry] = [
        ModuleEntry("dashboard", "Dashboard", "📊", "/contabilidad/dashboard", parityStatus: .soloLectura),
        ModuleEntry("accounting", "Contabilidad", "📒", "/contabilidad/accounting"),
        ModuleEntry("banking", "Banca", "🏦", "/contabilidad/banking"),
        ModuleEntry("invoicing", "Facturación", "🧾", "/contabilidad/invoicing"),
        ModuleEntry("expenses", "Gastos", "💸", "/contabilidad/expenses"),
        ModuleEntry("employee-payments", "Pagos a empleados", "💵", "/contabilidad/employee-payments"),
        ModuleEntry("viaticos", "Viáticos", "💼", "/contabilidad/viaticos"),
        ModuleEntry("pagos", "Pagos", "💳", "/contabilidad/pagos"),
        ModuleEntry("horas", "Horas", "⏱️", "/contabilidad/horas", parityStatus: .soloLectura),
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
        ModuleEntry("health", "API Health", "❤️", "/lab/health", parityStatus: .soloLectura),
        ModuleEntry("flags", "Feature flags", "🚩", "/lab/flags"),
        ModuleEntry("ai", "AI Sandbox", "🤖", "/lab/ai"),
        ModuleEntry("chat", "Chat del equipo", "💬", "/lab/chat"),
    ]

    /// 21 módulos INTEGRA — paridad honesta espejo Android (map/dashboard SOLO_LECTURA).
    /// Las pantallas nativas las cablea otro agente; el catálogo ya no miente el alcance.
    static let integra: [ModuleEntry] = [
        ModuleEntry("integra-home", "Inicio", "🏠", "/integra/"),
        ModuleEntry("integra-access", "Acceso", "🚪", "/integra/access"),
        ModuleEntry("integra-events", "Eventos", "📋", "/integra/events"),
        ModuleEntry("integra-people", "Personas", "👤", "/integra/people"),
        ModuleEntry("integra-attendance", "Asistencia ACS", "🕒", "/integra/attendance"),
        ModuleEntry("integra-visitors", "Visitantes", "🪪", "/integra/visitors"),
        ModuleEntry("integra-alarms", "Alarmas", "🚨", "/integra/alarms"),
        ModuleEntry("integra-occupancy", "En sitio", "📍", "/integra/access"),
        ModuleEntry("integra-devices", "Equipos", "🖥️", "/integra/access"),
        ModuleEntry("integra-sites", "Ajustes", "⚙️", "/integra/settings"),
        ModuleEntry("integra-video", "Cámaras", "🎥", "/integra/video"),
        ModuleEntry("integra-vehicles", "Vehículos", "🚙", "/integra/vehicles"),
        ModuleEntry("integra-anpr", "ANPR", "🔎", "/integra/anpr"),
        ModuleEntry("integra-schedules", "Horarios", "🗓️", "/integra/schedules"),
        ModuleEntry("integra-espacios", "Espacios", "🏛️", "/integra/espacios"),
        ModuleEntry("integra-detection", "Detección", "🎯", "/integra/detection"),
        ModuleEntry("integra-audit", "Bitácora", "🧾", "/integra/audit"),
        ModuleEntry("integra-notifications", "Avisos", "🔔", "/integra/notifications-center"),
        ModuleEntry("integra-my-profile", "Mi perfil", "🆔", "/integra/my-profile"),
        ModuleEntry("integra-map", "Plano", "🗺️", "/integra/map", parityStatus: .soloLectura),
        ModuleEntry("integra-dashboard", "Panorama", "📊", "/integra/dashboard", parityStatus: .soloLectura),
    ]

    static func modules(for panel: PanelId) -> [ModuleEntry] {
        switch panel {
        case .erp, .ops:
            if let keys = ModulePanelMap.consoleKeys(for: panel) {
                return console.filter { keys.contains($0.key) }
            }
            return console
        case .crm:
            return ventas
        case .studio:
            return studio
        case .portal:
            return tickets
        case .lab:
            return lab
        case .integra:
            if let keys = ModulePanelMap.integraKeys(for: .integra) {
                return integra.filter { keys.contains($0.key) }
            }
            return integra
        }
    }
}
