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
        mod("my-viatics", "Mis viáticos", "💼", "/operacion/my-viatics", ParityStatus.NATIVO),
        mod("vehicles", "Vehículos", "🚗", "/operacion/vehicles", ParityStatus.NATIVO),
        mod("my-vehicles", "Mis vehículos", "🚗", "/operacion/my-vehicles", ParityStatus.NATIVO),
        mod("gps", "GPS", "🗺️", "/operacion/gps", ParityStatus.NATIVO),
        mod("tools", "Herramientas", "🧰", "/operacion/tools", ParityStatus.NATIVO),
        mod("clients", "Clientes", "🤝", "/console/clients", ParityStatus.NATIVO),
        mod("projects", "Proyectos", "🧩", "/operacion/projects", ParityStatus.NATIVO),
        mod("work-projects", "Proyectos internos", "🧱", "/operacion/work-projects", ParityStatus.NATIVO),
        mod("users", "Usuarios", "🧑‍💼", "/console/users", ParityStatus.NATIVO),
        mod("attendance", "Asistencia", "🕒", "/console/attendance", ParityStatus.NATIVO),
        mod("lunch-breaks", "Comidas", "🥪", "/console/lunch-breaks", ParityStatus.NATIVO),
        mod("my-lunch-breaks", "Mis comidas", "🥪", "/console/my-lunch-breaks", ParityStatus.NATIVO),
        mod("hr", "Recursos humanos", "👥", "/console/hr", ParityStatus.NATIVO),
        mod("employee-payments", "Pagos a empleados", "💵", "/console/employee-payments", ParityStatus.NATIVO),
        mod("accounting", "Contabilidad", "📒", "/console/accounting", ParityStatus.NATIVO),
        mod("banking", "Banca", "🏦", "/console/banking", ParityStatus.NATIVO),
        mod("invoicing", "Facturación", "🧾", "/console/invoicing", ParityStatus.NATIVO),
        mod("expenses", "Gastos", "💸", "/console/expenses", ParityStatus.NATIVO),
        mod("fines", "Multas", "⚠️", "/console/fines", ParityStatus.NATIVO),
        mod("cotizaciones", "Cotizaciones", "🧮", "/console/cotizaciones", ParityStatus.SOLO_LECTURA),
        mod("gestion-vendedores", "Gestión vendedores", "📈", "/console/gestion-vendedores", ParityStatus.SOLO_LECTURA),
        mod("executive", "Vista ejecutiva", "📊", "/erp/executive", ParityStatus.SOLO_LECTURA),
        mod("dispatch", "Despacho OT", "🗺️", "/ops/dispatch", ParityStatus.NATIVO),
        mod("approvals", "Aprobaciones", "🛡️", "/erp/approvals", ParityStatus.NATIVO),
        mod("notifications-center", "Notificaciones", "🔔", "/erp/notifications-center", ParityStatus.NATIVO),
        mod("chat", "Chat", "💬", "/erp/chat", ParityStatus.NATIVO),
        // `MeetingsApi.kt` llevaba escrito sin que lo referenciara nadie, ni
        // siquiera el cliente HTTP. Con el módulo montado encima, pasa a NATIVO.
        mod("reuniones", "Reuniones", "📅", "/erp/reuniones", ParityStatus.NATIVO),
        mod("bi", "Business Intelligence", "📈", "/erp/analytics/bi", ParityStatus.SOLO_LECTURA),
        mod("analytics", "Analítica", "📈", "/console/analytics", ParityStatus.SOLO_LECTURA),
        mod("audit", "Auditoría", "🔍", "/console/audit", ParityStatus.SOLO_LECTURA),
        mod("assets", "Activos", "📦", "/operacion/assets", ParityStatus.SOLO_LECTURA),
        mod("stock", "Almacén", "📦", "/console/stock", ParityStatus.NATIVO),
        mod("warehouse", "Bodega", "🏭", "/console/warehouse", ParityStatus.NATIVO),
        mod("procurement", "Compras", "🛒", "/console/procurement", ParityStatus.NATIVO),
        mod("maintenance", "Mantenimiento", "🔧", "/operacion/maintenance", ParityStatus.NATIVO),
        mod("service-sheets", "Hojas de servicio", "📄", "/operacion/service-sheets", ParityStatus.SOLO_LECTURA),
        mod("documents", "Documentos", "📁", "/console/documents", ParityStatus.NATIVO),
        mod("cvs", "CVs", "📑", "/console/cvs", ParityStatus.NATIVO),
        mod("recruiting", "Reclutamiento", "🔍", "/ops/recruiting", ParityStatus.NATIVO),
        mod("client-tickets", "Tickets de clientes", "🎫", "/operacion/client-tickets", ParityStatus.NATIVO),
        mod("service-clients", "Clientes de servicio", "🏬", "/ops/service-clients", ParityStatus.NATIVO),
        mod("support", "Bandeja de soporte", "🆘", "/ops/support", ParityStatus.NATIVO),
        mod("noc", "NOC · Monitoreo", "📡", "/ops/noc", ParityStatus.SOLO_LECTURA),
        mod("support-sla", "SLA y tiempos", "⏱️", "/ops/support/sla", ParityStatus.SOLO_LECTURA),
        mod("maintenance-contracts", "Contratos de servicio", "📑", "/ops/maintenance/contracts", ParityStatus.NATIVO),
        mod("contact-messages", "Mensajes de contacto", "✉️", "/console/contact-messages", ParityStatus.SOLO_LECTURA),
        mod("news", "Noticias", "📰", "/console/news", ParityStatus.SOLO_LECTURA),
        mod("newsletter", "Newsletter", "📮", "/console/newsletter", ParityStatus.SOLO_LECTURA),
        mod("my-profile", "Mi perfil", "👤", "/console/my-profile", ParityStatus.NATIVO),
        mod("my-preferences", "Mis preferencias", "⚙️", "/console/my-preferences", ParityStatus.SOLO_LECTURA),
        mod("offline-queue", "Cola offline", "☁️", "/console/offline-queue", ParityStatus.NATIVO),
        mod("settings", "Ajustes", "⚙️", "/console/settings", ParityStatus.NATIVO),
        mod("companies", "Multi-empresa", "🏛️", "/erp/companies", ParityStatus.NATIVO),
        mod("kb", "Knowledge Base", "📚", "/erp/kb", ParityStatus.SOLO_LECTURA),
        mod("exports", "Exportaciones", "📥", "/erp/exports", ParityStatus.SOLO_LECTURA),
        mod("architecture", "Arquitectura", "🗺️", "/erp/architecture", ParityStatus.SOLO_LECTURA),
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
        mod("proyectos", "Proyectos", "🧩", "/ventas/proyectos", ParityStatus.NATIVO),
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
        mod("my-profile", "Mi perfil", "👤", "/ventas/my-profile", ParityStatus.NATIVO),
    )

    /** Módulos del portal de contabilidad. */
    val contabilidad: List<ModuleEntry> = listOf(
        mod("dashboard", "Dashboard", "📊", "/contabilidad/dashboard", ParityStatus.SOLO_LECTURA),
        mod("accounting", "Contabilidad", "📒", "/contabilidad/accounting", ParityStatus.NATIVO),
        mod("banking", "Banca", "🏦", "/contabilidad/banking", ParityStatus.NATIVO),
        mod("invoicing", "Facturación", "🧾", "/contabilidad/invoicing", ParityStatus.NATIVO),
        mod("expenses", "Gastos", "💸", "/contabilidad/expenses", ParityStatus.NATIVO),
        mod("employee-payments", "Pagos a empleados", "💵", "/contabilidad/employee-payments", ParityStatus.NATIVO),
        mod("viaticos", "Viáticos", "💼", "/contabilidad/viaticos", ParityStatus.NATIVO),
        mod("pagos", "Pagos", "💳", "/contabilidad/pagos", ParityStatus.NATIVO),
        mod("horas", "Horas", "⏱️", "/contabilidad/horas", ParityStatus.SOLO_LECTURA),
        mod("proyectos", "Proyectos", "🧩", "/contabilidad/proyectos", ParityStatus.NATIVO),
        mod("work-projects", "Proyectos internos", "🧱", "/contabilidad/work-projects", ParityStatus.NATIVO),
        mod("multas", "Multas", "⚠️", "/contabilidad/multas", ParityStatus.NATIVO),
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
        mod("newsletter", "Newsletter", "📬", "/studio/newsletter", ParityStatus.SOLO_LECTURA),
        mod("contacts", "Contactos", "✉️", "/studio/contacts", ParityStatus.NATIVO),
        mod("leads", "Leads", "✨", "/studio/leads", ParityStatus.NATIVO),
        mod("chat", "Chat equipo", "💬", "/erp/chat", ParityStatus.NATIVO),
    )

    /** Alias legacy mobile → studio. */
    val web: List<ModuleEntry> get() = studio

    /** Módulos INTEGRA (control de acceso / ACS). */
    val integra: List<ModuleEntry> = listOf(
        mod("integra-home", "Inicio", "🏠", "/integra/", ParityStatus.NATIVO),
        mod("integra-access", "Acceso", "🚪", "/integra/access", ParityStatus.NATIVO),
        mod("integra-events", "Eventos", "📋", "/integra/events", ParityStatus.NATIVO),
        mod("integra-people", "Personas", "👤", "/integra/people", ParityStatus.NATIVO),
        mod("integra-attendance", "Asistencia ACS", "🕒", "/integra/attendance", ParityStatus.NATIVO),
        mod("integra-visitors", "Visitantes", "🪪", "/integra/visitors", ParityStatus.NATIVO),
        mod("integra-alarms", "Alarmas", "🚨", "/integra/alarms", ParityStatus.NATIVO),
        // Sin página web dedicada aún: "Abrir en web" → access/settings cercanos.
        mod("integra-occupancy", "En sitio", "📍", "/integra/access", ParityStatus.NATIVO),
        mod("integra-devices", "Equipos", "🖥️", "/integra/access", ParityStatus.NATIVO),
        // Sube de SOLO_LECTURA: la pantalla de Ajustes da de alta, etiqueta,
        // activa, marca predeterminado, configura módulos por sitio, sincroniza
        // y da de baja. La baja exige teclear el nombre del sitio.
        mod("integra-sites", "Ajustes", "⚙️", "/integra/settings", ParityStatus.NATIVO),

        // ── Cableados el 2026-09-07 ──────────────────────────────────────
        // Estado de paridad HONESTO: `NATIVO` solo donde la pantalla escribe
        // de verdad contra la API. Donde hay recorte, se dice cuál.

        // Rejilla con vista previa autorregulada, PTZ con presets y captura.
        // NO es transmisión en vivo: el muro con MSE sobre WebSocket se queda
        // en la consola web. La pantalla no miente con una etiqueta «EN VIVO».
        mod("integra-video", "Cámaras", "🎥", "/integra/video", ParityStatus.NATIVO),
        mod("integra-vehicles", "Vehículos", "🚙", "/integra/vehicles", ParityStatus.NATIVO),
        mod("integra-anpr", "ANPR", "🔎", "/integra/anpr", ParityStatus.NATIVO),
        mod("integra-schedules", "Horarios", "🗓️", "/integra/schedules", ParityStatus.NATIVO),
        mod("integra-espacios", "Espacios", "🏛️", "/integra/espacios", ParityStatus.NATIVO),
        // Sensibilidad, confianza, objetivo, horario, guardar y aplicar al
        // equipo se hacen desde el teléfono. Los polígonos de zona SE VEN pero
        // NO se editan: dibujar con el dedo un polígono de detección daba peor
        // resultado que no ofrecerlo. El recorte está dicho en pantalla.
        mod("integra-detection", "Detección", "🎯", "/integra/detection", ParityStatus.NATIVO),
        mod("integra-audit", "Bitácora", "🧾", "/integra/audit", ParityStatus.NATIVO),
        mod("integra-notifications", "Avisos", "🔔", "/integra/notifications-center", ParityStatus.NATIVO),
        mod("integra-my-profile", "Mi perfil", "🆔", "/integra/my-profile", ParityStatus.NATIVO),
        // Plano: se ve y se consulta, NO se sitúan ni se borran pines. El
        // servidor hace `upsert` por equipo, así que un pin mal puesto con el
        // dedo sobre una planta al 40 % pisa el bueno. En la web, tocar un pin
        // lo borraba sin preguntar; aquí no hay gesto que borre porque no hay
        // nada que borrar.
        mod("integra-map", "Plano", "🗺️", "/integra/map", ParityStatus.SOLO_LECTURA),
        // Panorama: solo consulta y salta a otros módulos.
        mod("integra-dashboard", "Panorama", "📊", "/integra/dashboard", ParityStatus.SOLO_LECTURA),
    )

    /** Módulos LAB. */
    val lab: List<ModuleEntry> = listOf(
        mod("health", "API Health", "❤️", "/lab/health", ParityStatus.SOLO_LECTURA),
        mod("flags", "Feature flags", "🚩", "/lab/flags", ParityStatus.NATIVO),
        mod("ai", "AI Sandbox", "🤖", "/lab/ai", ParityStatus.NATIVO),
        mod("chat", "Chat del equipo", "💬", "/lab/chat", ParityStatus.NATIVO),
    )
}
