package mx.nexara.mobile.nativeapp.ui.catalog

/**
 * Catálogo declarativo de módulos por portal (espejo de `apps/web/lib/access-matrix.ts`).
 * Si un módulo no tiene pantalla nativa, `ConsoleNavHost` cae en PlaceholderScreen.
 *
 * `webPath` apunta a la ruta equivalente en apps/web (sin host).
 * `parityStatus` es la fuente de verdad; ver `docs/native-parity-matrix.md`.
 */
object ParityStatus {
    const val NATIVO = "NATIVO"
    const val SOLO_LECTURA = "SOLO_LECTURA"
    const val CASCARON = "CASCARON"
    const val AUSENTE = "AUSENTE"
    const val WEBVIEW = "WEBVIEW"
}

data class ModuleEntry(
    val key: String,
    val label: String,
    val icon: String,
    val webPath: String,
    /** Lista de permisos que dan acceso. Vacía = abierto a cualquier usuario con acceso al portal. */
    val permissions: List<String> = emptyList(),
    /** Si true, solo super admin. */
    val superAdminOnly: Boolean = false,
    val parityStatus: String = ParityStatus.AUSENTE,
) {
    /** true solo con CRUD/ops nativos reales (no listas finas ni placeholders). */
    val nativeImplemented: Boolean get() = parityStatus == ParityStatus.NATIVO
}

private fun mod(
    key: String,
    label: String,
    icon: String,
    webPath: String,
    status: String,
    permissions: List<String> = emptyList(),
    superAdminOnly: Boolean = false,
) = ModuleEntry(key, label, icon, webPath, permissions, superAdminOnly, status)

object ModuleCatalog {

    /** Módulos de la consola (ERP + OPS vía ModulePanelMap). */
    val console: List<ModuleEntry> = listOf(
        mod("dashboard", "Inicio", "📊", "/console/dashboard", ParityStatus.NATIVO),
        mod("activities", "Actividades", "🗂️", "/operacion/activities", ParityStatus.NATIVO),
        mod("my-activities", "Mis actividades", "📋", "/operacion/my-activities", ParityStatus.NATIVO),
        mod("evidences", "Evidencias", "📸", "/operacion/evidences", ParityStatus.NATIVO),
        mod("my-evidences", "Mis evidencias", "📸", "/operacion/my-evidences", ParityStatus.NATIVO),
        mod("viatics", "Viáticos", "💼", "/operacion/viatics", ParityStatus.NATIVO),
        mod("my-viatics", "Mis viáticos", "💼", "/operacion/my-viatics", ParityStatus.CASCARON),
        mod("vehicles", "Vehículos", "🚗", "/operacion/vehicles", ParityStatus.CASCARON),
        mod("my-vehicles", "Mis vehículos", "🚗", "/operacion/my-vehicles", ParityStatus.NATIVO),
        mod("gps", "GPS", "🗺️", "/operacion/gps", ParityStatus.NATIVO),
        mod("tools", "Herramientas", "🧰", "/operacion/tools", ParityStatus.NATIVO),
        mod("clients", "Clientes", "🤝", "/console/clients", ParityStatus.NATIVO),
        mod("projects", "Proyectos", "🧩", "/operacion/projects", ParityStatus.NATIVO),
        mod("work-projects", "Proyectos internos", "🧱", "/operacion/work-projects", ParityStatus.CASCARON),
        mod("users", "Usuarios", "🧑‍💼", "/console/users", ParityStatus.CASCARON),
        mod("attendance", "Asistencia", "🕒", "/console/attendance", ParityStatus.NATIVO),
        mod("lunch-breaks", "Comidas", "🥪", "/console/lunch-breaks", ParityStatus.NATIVO),
        mod("my-lunch-breaks", "Mis comidas", "🥪", "/console/my-lunch-breaks", ParityStatus.NATIVO),
        mod("hr", "Recursos humanos", "👥", "/console/hr", ParityStatus.CASCARON),
        mod("employee-payments", "Pagos a empleados", "💵", "/console/employee-payments", ParityStatus.CASCARON),
        mod("accounting", "Contabilidad", "📒", "/console/accounting", ParityStatus.NATIVO),
        mod("banking", "Banca", "🏦", "/console/banking", ParityStatus.NATIVO),
        mod("invoicing", "Facturación", "🧾", "/console/invoicing", ParityStatus.NATIVO),
        mod("expenses", "Gastos", "💸", "/console/expenses", ParityStatus.NATIVO),
        mod("fines", "Multas", "⚠️", "/console/fines", ParityStatus.CASCARON),
        mod("cotizaciones", "Cotizaciones", "🧮", "/console/cotizaciones", ParityStatus.SOLO_LECTURA),
        mod("gestion-vendedores", "Gestión vendedores", "📈", "/console/gestion-vendedores", ParityStatus.SOLO_LECTURA),
        mod("executive", "Vista ejecutiva", "📊", "/erp/executive", ParityStatus.SOLO_LECTURA),
        mod("dispatch", "Despacho OT", "🗺️", "/ops/dispatch", ParityStatus.CASCARON),
        mod("approvals", "Aprobaciones", "🛡️", "/erp/approvals", ParityStatus.NATIVO),
        mod("notifications-center", "Notificaciones", "🔔", "/erp/notifications-center", ParityStatus.NATIVO),
        mod("chat", "Chat", "💬", "/erp/chat", ParityStatus.NATIVO),
        mod("bi", "Business Intelligence", "📈", "/erp/analytics/bi", ParityStatus.SOLO_LECTURA),
        mod("analytics", "Analítica", "📈", "/console/analytics", ParityStatus.SOLO_LECTURA),
        mod("audit", "Auditoría", "🔍", "/console/audit", ParityStatus.SOLO_LECTURA),
        mod("assets", "Activos", "📦", "/operacion/assets", ParityStatus.NATIVO),
        mod("stock", "Almacén", "📦", "/console/stock", ParityStatus.NATIVO),
        mod("warehouse", "Bodega", "🏭", "/console/warehouse", ParityStatus.NATIVO),
        mod("procurement", "Compras", "🛒", "/console/procurement", ParityStatus.NATIVO),
        mod("maintenance", "Mantenimiento", "🔧", "/operacion/maintenance", ParityStatus.NATIVO),
        mod("service-sheets", "Hojas de servicio", "📄", "/operacion/service-sheets", ParityStatus.NATIVO),
        mod("documents", "Documentos", "📁", "/console/documents", ParityStatus.CASCARON),
        mod("cvs", "CVs", "📑", "/console/cvs", ParityStatus.CASCARON),
        mod("recruiting", "Reclutamiento", "🔍", "/ops/recruiting", ParityStatus.CASCARON),
        mod("client-tickets", "Tickets de clientes", "🎫", "/operacion/client-tickets", ParityStatus.NATIVO),
        mod("service-clients", "Clientes de servicio", "🏬", "/ops/service-clients", ParityStatus.NATIVO),
        mod("support", "Bandeja de soporte", "🆘", "/ops/support", ParityStatus.NATIVO),
        mod("noc", "NOC · Monitoreo", "📡", "/ops/noc", ParityStatus.SOLO_LECTURA),
        mod("support-sla", "SLA y tiempos", "⏱️", "/ops/support/sla", ParityStatus.SOLO_LECTURA),
        mod("maintenance-contracts", "Contratos de servicio", "📑", "/ops/maintenance/contracts", ParityStatus.CASCARON),
        mod("contact-messages", "Mensajes de contacto", "✉️", "/console/contact-messages", ParityStatus.SOLO_LECTURA),
        mod("news", "Noticias", "📰", "/console/news", ParityStatus.CASCARON),
        mod("newsletter", "Newsletter", "📮", "/console/newsletter", ParityStatus.CASCARON),
        mod("my-profile", "Mi perfil", "👤", "/console/my-profile", ParityStatus.CASCARON),
        mod("my-preferences", "Mis preferencias", "⚙️", "/console/my-preferences", ParityStatus.SOLO_LECTURA),
        mod("offline-queue", "Cola offline", "☁️", "/console/offline-queue", ParityStatus.NATIVO),
        mod("settings", "Ajustes", "⚙️", "/console/settings", ParityStatus.NATIVO),
        mod("companies", "Multi-empresa", "🏛️", "/erp/companies", ParityStatus.NATIVO),
        mod("kb", "Knowledge Base", "📚", "/erp/kb", ParityStatus.SOLO_LECTURA),
        mod("exports", "Exportaciones", "📥", "/erp/exports", ParityStatus.NATIVO),
        mod("architecture", "Arquitectura", "🗺️", "/erp/architecture", ParityStatus.CASCARON),
        mod("calendar", "Mi calendario", "📅", "/erp/calendar", ParityStatus.SOLO_LECTURA),
        mod("orgchart", "Organigrama", "🌳", "/erp/hr/orgchart", ParityStatus.SOLO_LECTURA),
        mod("kpis-hr", "KPIs de personas", "📊", "/erp/hr/kpis", ParityStatus.SOLO_LECTURA),
    )

    /** Módulos del portal de ventas (CRM). */
    val ventas: List<ModuleEntry> = listOf(
        mod("dashboard", "Dashboard", "📊", "/ventas/dashboard", ParityStatus.SOLO_LECTURA),
        mod("leads", "Leads", "📥", "/ventas/leads", ParityStatus.NATIVO),
        mod("oportunidades", "Oportunidades", "🎯", "/ventas/oportunidades", ParityStatus.NATIVO),
        mod("cotizaciones", "Cotizaciones", "🧮", "/ventas/cotizaciones", ParityStatus.NATIVO),
        mod("smart-quote", "Cotizador inteligente", "✨", "/ventas/cotizaciones/nueva", ParityStatus.NATIVO),
        mod("productos", "Catálogo IT/CCTV", "📦", "/ventas/productos", ParityStatus.SOLO_LECTURA),
        mod("clientes", "Clientes", "🤝", "/ventas/clientes", ParityStatus.NATIVO),
        mod("proyectos", "Proyectos", "🧩", "/ventas/proyectos", ParityStatus.CASCARON),
        mod("pipeline", "Pipeline", "📊", "/crm/pipeline", ParityStatus.NATIVO),
        mod("agenda", "Agenda", "📅", "/crm/agenda", ParityStatus.NATIVO),
        mod("licitaciones", "Licitaciones", "📑", "/crm/tenders", ParityStatus.SOLO_LECTURA),
        mod("metas", "Metas comerciales", "🎯", "/crm/targets", ParityStatus.SOLO_LECTURA),
        mod("plantillas", "Plantillas", "🧾", "/ventas/plantillas", ParityStatus.NATIVO),
        mod("gestion-vendedores", "Gestión vendedores", "📈", "/ventas/gestion-vendedores", ParityStatus.SOLO_LECTURA),
        mod("equipo-comparativa", "Comparativa equipo", "⚖️", "/ventas/equipo-comparativa", ParityStatus.SOLO_LECTURA),
        mod("crecimiento", "Crecimiento", "📈", "/ventas/crecimiento", ParityStatus.SOLO_LECTURA),
        mod("reportes", "Reportes", "📑", "/ventas/reportes", ParityStatus.SOLO_LECTURA),
        mod("notificaciones", "Notificaciones", "🔔", "/ventas/notificaciones", ParityStatus.NATIVO),
        mod("chat", "Chat equipo", "💬", "/erp/chat", ParityStatus.NATIVO),
        mod("my-profile", "Mi perfil", "👤", "/ventas/my-profile", ParityStatus.CASCARON),
    )

    /** Módulos del portal de contabilidad. */
    val contabilidad: List<ModuleEntry> = listOf(
        mod("dashboard", "Dashboard", "📊", "/contabilidad/dashboard", ParityStatus.SOLO_LECTURA),
        mod("accounting", "Contabilidad", "📒", "/contabilidad/accounting", ParityStatus.NATIVO),
        mod("banking", "Banca", "🏦", "/contabilidad/banking", ParityStatus.NATIVO),
        mod("invoicing", "Facturación", "🧾", "/contabilidad/invoicing", ParityStatus.NATIVO),
        mod("expenses", "Gastos", "💸", "/contabilidad/expenses", ParityStatus.NATIVO),
        mod("employee-payments", "Pagos a empleados", "💵", "/contabilidad/employee-payments", ParityStatus.CASCARON),
        mod("viaticos", "Viáticos", "💼", "/contabilidad/viaticos", ParityStatus.CASCARON),
        mod("pagos", "Pagos", "💳", "/contabilidad/pagos", ParityStatus.CASCARON),
        mod("horas", "Horas", "⏱️", "/contabilidad/horas", ParityStatus.SOLO_LECTURA),
        mod("proyectos", "Proyectos", "🧩", "/contabilidad/proyectos", ParityStatus.NATIVO),
        mod("work-projects", "Proyectos internos", "🧱", "/contabilidad/work-projects", ParityStatus.CASCARON),
        mod("multas", "Multas", "⚠️", "/contabilidad/multas", ParityStatus.CASCARON),
        mod("chat", "Chat equipo", "💬", "/erp/chat", ParityStatus.NATIVO),
    )

    /** Módulos del panel STUDIO (paridad web rutas /studio). */
    val studio: List<ModuleEntry> = listOf(
        mod("dashboard", "Dashboard", "📊", "/studio/dashboard", ParityStatus.SOLO_LECTURA),
        mod("hero", "Carrusel inicio", "🖼️", "/studio/hero", ParityStatus.NATIVO),
        mod("pages", "Secciones del sitio", "🌐", "/studio/pages", ParityStatus.NATIVO),
        mod("cases", "Casos de éxito", "🏆", "/studio/cases", ParityStatus.NATIVO),
        mod("news", "Noticias", "📰", "/studio/news", ParityStatus.NATIVO),
        mod("social", "Redes sociales", "📱", "/studio/social", ParityStatus.NATIVO),
        mod("newsletter", "Newsletter", "📬", "/studio/newsletter", ParityStatus.CASCARON),
        mod("contacts", "Contactos", "✉️", "/studio/contacts", ParityStatus.NATIVO),
        mod("leads", "Leads", "✨", "/studio/leads", ParityStatus.NATIVO),
        mod("chat", "Chat equipo", "💬", "/erp/chat", ParityStatus.NATIVO),
    )

    /** Alias legacy mobile → studio. */
    val web: List<ModuleEntry> get() = studio

    /** Módulos INTEGRA (control de acceso / ACS). */
    val integra: List<ModuleEntry> = listOf(
        ModuleEntry("integra-home", "Inicio", "🏠", "/integra/", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-access", "Acceso", "🚪", "/integra/access", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-events", "Eventos", "📋", "/integra/events", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-people", "Personas", "👤", "/integra/people", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-attendance", "Asistencia ACS", "🕒", "/integra/attendance", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-visitors", "Visitantes", "🪪", "/integra/visitors", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-alarms", "Alarmas", "🚨", "/integra/alarms", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-occupancy", "En sitio", "📍", "/integra/occupancy", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-devices", "Equipos", "🖥️", "/integra/devices", parityStatus = ParityStatus.NATIVO),
        ModuleEntry("integra-sites", "Sitios", "🏢", "/integra/settings", parityStatus = ParityStatus.SOLO_LECTURA),
    )

    /** Módulos LAB. */
    val lab: List<ModuleEntry> = listOf(
        mod("health", "API Health", "❤️", "/lab/health", ParityStatus.SOLO_LECTURA),
        mod("flags", "Feature flags", "🚩", "/lab/flags", ParityStatus.NATIVO),
        mod("ai", "AI Sandbox", "🤖", "/lab/ai", ParityStatus.NATIVO),
        mod("chat", "Chat del equipo", "💬", "/lab/chat", ParityStatus.NATIVO),
    )
}
