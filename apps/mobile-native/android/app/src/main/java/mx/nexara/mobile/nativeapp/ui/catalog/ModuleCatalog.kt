package mx.nexara.mobile.nativeapp.ui.catalog

/**
 * Catálogo declarativo de módulos por portal, para mantener la paridad 1:1
 * con apps/mobile. Si un módulo aún no tiene implementación nativa real,
 * se usa PlaceholderScreen con el título y `webPath` declarado aquí.
 *
 * `webPath` apunta a la ruta equivalente en apps/mobile (sin host).
 */
data class ModuleEntry(
    val key: String,
    val label: String,
    val icon: String,
    val webPath: String,
    /** Lista de permisos que dan acceso. Vacía = abierto a cualquier usuario con acceso al portal. */
    val permissions: List<String> = emptyList(),
    /** Si true, solo super admin. */
    val superAdminOnly: Boolean = false,
    /** Marcador informativo: ya implementado nativo (no usa placeholder). */
    val nativeImplemented: Boolean = false,
)

object ModuleCatalog {

    /** Módulos de la consola (apps/mobile/app/(subdomains)/console). */
    val console: List<ModuleEntry> = listOf(
        ModuleEntry("dashboard", "Inicio", "📊", "/console/dashboard", nativeImplemented = true),
        ModuleEntry("activities", "Actividades", "🗂️", "/console/activities", nativeImplemented = true),
        ModuleEntry("my-activities", "Mis actividades", "📋", "/console/my-activities", nativeImplemented = true),
        ModuleEntry("evidences", "Evidencias", "📸", "/console/evidences", nativeImplemented = true),
        ModuleEntry("my-evidences", "Mis evidencias", "📸", "/console/my-evidences", nativeImplemented = true),
        ModuleEntry("viatics", "Viáticos", "💼", "/console/viatics", nativeImplemented = true),
        ModuleEntry("my-viatics", "Mis viáticos", "💼", "/console/my-viatics", nativeImplemented = true),
        ModuleEntry("vehicles", "Vehículos", "🚗", "/console/vehicles", nativeImplemented = true),
        ModuleEntry("my-vehicles", "Mis vehículos", "🚗", "/console/my-vehicles", nativeImplemented = true),
        ModuleEntry("gps", "GPS", "🗺️", "/console/gps", nativeImplemented = true),
        ModuleEntry("tools", "Herramientas", "🧰", "/console/tools", nativeImplemented = true),
        ModuleEntry("clients", "Clientes", "🤝", "/console/clients", nativeImplemented = true),
        ModuleEntry("service-clients", "Clientes de servicio", "🧾", "/console/service-clients", nativeImplemented = true),
        ModuleEntry("projects", "Proyectos", "🧩", "/console/projects", nativeImplemented = true),
        ModuleEntry("work-projects", "Proyectos internos", "🧱", "/console/work-projects", nativeImplemented = true),
        ModuleEntry("users", "Usuarios", "🧑‍💼", "/console/users", nativeImplemented = true),
        ModuleEntry("attendance", "Asistencia", "🕒", "/console/attendance", nativeImplemented = true),
        ModuleEntry("lunch-breaks", "Comidas", "🥪", "/console/lunch-breaks", nativeImplemented = true),
        ModuleEntry("my-lunch-breaks", "Mis comidas", "🥪", "/console/my-lunch-breaks", nativeImplemented = true),
        ModuleEntry("hr", "Recursos humanos", "👥", "/console/hr", nativeImplemented = true),
        ModuleEntry("employee-payments", "Pagos a empleados", "💵", "/console/employee-payments", nativeImplemented = true),
        ModuleEntry("accounting", "Contabilidad", "📒", "/console/accounting", nativeImplemented = true),
        ModuleEntry("banking", "Banca", "🏦", "/console/banking", nativeImplemented = true),
        ModuleEntry("invoicing", "Facturación", "🧾", "/console/invoicing", nativeImplemented = true),
        ModuleEntry("expenses", "Gastos", "💸", "/console/expenses", nativeImplemented = true),
        ModuleEntry("fines", "Multas", "⚠️", "/console/fines", nativeImplemented = true),
        ModuleEntry("cotizaciones", "Cotizaciones", "🧮", "/console/cotizaciones", nativeImplemented = true),
        ModuleEntry("gestion-vendedores", "Gestión vendedores", "📈", "/console/gestion-vendedores", nativeImplemented = true),
        ModuleEntry("analytics", "Analítica", "📈", "/console/analytics", nativeImplemented = true),
        ModuleEntry("audit", "Auditoría", "🔍", "/console/audit", nativeImplemented = true),
        ModuleEntry("assets", "Activos", "📦", "/console/assets", nativeImplemented = true),
        ModuleEntry("stock", "Almacén", "📦", "/console/stock", nativeImplemented = true),
        ModuleEntry("warehouse", "Bodega", "🏭", "/console/warehouse", nativeImplemented = true),
        ModuleEntry("procurement", "Compras", "🛒", "/console/procurement", nativeImplemented = true),
        ModuleEntry("production", "Producción", "⚙️", "/console/production", nativeImplemented = true),
        ModuleEntry("manufacturing", "Manufactura", "🏗️", "/console/manufacturing", nativeImplemented = true),
        ModuleEntry("maintenance", "Mantenimiento", "🔧", "/console/maintenance", nativeImplemented = true),
        ModuleEntry("quality", "Calidad", "✅", "/console/quality", nativeImplemented = true),
        ModuleEntry("safety", "Seguridad", "🦺", "/console/safety", nativeImplemented = true),
        ModuleEntry("workflow", "Flujos", "🔗", "/console/workflow", nativeImplemented = true),
        ModuleEntry("service-sheets", "Hojas de servicio", "📄", "/console/service-sheets", nativeImplemented = true),
        ModuleEntry("documents", "Documentos", "📁", "/console/documents", nativeImplemented = true),
        ModuleEntry("cvs", "CVs", "📑", "/console/cvs", nativeImplemented = true),
        ModuleEntry("client-tickets", "Tickets de clientes", "🎫", "/console/client-tickets", nativeImplemented = true),
        ModuleEntry("contact-messages", "Mensajes de contacto", "✉️", "/console/contact-messages", nativeImplemented = true),
        ModuleEntry("news", "Noticias", "📰", "/console/news", nativeImplemented = true),
        ModuleEntry("newsletter", "Newsletter", "📮", "/console/newsletter", nativeImplemented = true),
        ModuleEntry("my-profile", "Mi perfil", "👤", "/console/my-profile", nativeImplemented = true),
        ModuleEntry("my-preferences", "Mis preferencias", "⚙️", "/console/my-preferences", nativeImplemented = true),
        ModuleEntry("settings", "Ajustes", "⚙️", "/console/settings", nativeImplemented = true),
    )

    /** Módulos del portal de ventas. */
    val ventas: List<ModuleEntry> = listOf(
        ModuleEntry("dashboard", "Dashboard", "📊", "/ventas/dashboard", nativeImplemented = true),
        ModuleEntry("leads", "Leads", "📥", "/ventas/leads", nativeImplemented = true),
        ModuleEntry("oportunidades", "Oportunidades", "🎯", "/ventas/oportunidades", nativeImplemented = true),
        ModuleEntry("cotizaciones", "Cotizaciones", "🧮", "/ventas/cotizaciones", nativeImplemented = true),
        ModuleEntry("clientes", "Clientes", "🤝", "/ventas/clientes", nativeImplemented = true),
        ModuleEntry("proyectos", "Proyectos", "🧩", "/ventas/proyectos", nativeImplemented = true),
        ModuleEntry("plantillas", "Plantillas", "🧾", "/ventas/plantillas", nativeImplemented = true),
        ModuleEntry("gestion-vendedores", "Gestión vendedores", "📈", "/ventas/gestion-vendedores", nativeImplemented = true),
        ModuleEntry("equipo-comparativa", "Comparativa equipo", "⚖️", "/ventas/equipo-comparativa", nativeImplemented = true),
        ModuleEntry("crecimiento", "Crecimiento", "📈", "/ventas/crecimiento", nativeImplemented = true),
        ModuleEntry("reportes", "Reportes", "📑", "/ventas/reportes", nativeImplemented = true),
        ModuleEntry("notificaciones", "Notificaciones", "🔔", "/ventas/notificaciones", nativeImplemented = true),
        ModuleEntry("my-profile", "Mi perfil", "👤", "/ventas/my-profile", nativeImplemented = true),
    )

    /** Módulos del portal de contabilidad. */
    val contabilidad: List<ModuleEntry> = listOf(
        ModuleEntry("dashboard", "Dashboard", "📊", "/contabilidad/dashboard", nativeImplemented = true),
        ModuleEntry("accounting", "Contabilidad", "📒", "/contabilidad/accounting", nativeImplemented = true),
        ModuleEntry("banking", "Banca", "🏦", "/contabilidad/banking", nativeImplemented = true),
        ModuleEntry("invoicing", "Facturación", "🧾", "/contabilidad/invoicing", nativeImplemented = true),
        ModuleEntry("expenses", "Gastos", "💸", "/contabilidad/expenses", nativeImplemented = true),
        ModuleEntry("employee-payments", "Pagos a empleados", "💵", "/contabilidad/employee-payments", nativeImplemented = true),
        ModuleEntry("viaticos", "Viáticos", "💼", "/contabilidad/viaticos", nativeImplemented = true),
        ModuleEntry("pagos", "Pagos", "💳", "/contabilidad/pagos", nativeImplemented = true),
        ModuleEntry("horas", "Horas", "⏱️", "/contabilidad/horas", nativeImplemented = true),
        ModuleEntry("capital", "Capital", "💰", "/contabilidad/capital", nativeImplemented = true),
        ModuleEntry("proyectos", "Proyectos", "🧩", "/contabilidad/proyectos", nativeImplemented = true),
        ModuleEntry("work-projects", "Proyectos internos", "🧱", "/contabilidad/work-projects", nativeImplemented = true),
        ModuleEntry("multas", "Multas", "⚠️", "/contabilidad/multas", nativeImplemented = true),
    )

    /** Módulos del portal web. */
    val web: List<ModuleEntry> = listOf(
        ModuleEntry("dashboard", "Dashboard", "📊", "/web/dashboard", nativeImplemented = true),
        ModuleEntry("clientes", "Clientes", "🤝", "/web/clientes", nativeImplemented = true),
        ModuleEntry("proyectos", "Proyectos", "🧩", "/web/proyectos", nativeImplemented = true),
        ModuleEntry("noticias", "Noticias", "📰", "/web/noticias", nativeImplemented = true),
        ModuleEntry("contactos", "Contactos", "✉️", "/web/contactos", nativeImplemented = true),
    )
}
