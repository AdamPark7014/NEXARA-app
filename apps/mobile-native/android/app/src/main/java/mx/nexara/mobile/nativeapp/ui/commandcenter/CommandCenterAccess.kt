package mx.nexara.mobile.nativeapp.ui.commandcenter

import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.ExecutiveCLevelDto

data class CommandWidget(
    val id: String,
    val label: String,
    val moduleKey: String,
    val icon: String,
    val hint: String = "",
    val biSection: String? = null,
)

enum class CommandPanelFilter { OPS, CRM, ERP, ALL }

/** Maps web href paths to native console module keys. */
fun hrefToModuleKey(href: String): String = when {
    href.startsWith("/ops/dispatch") -> "dispatch"
    href.startsWith("/erp/executive") -> "executive"
    href.startsWith("/erp/approvals") -> "approvals"
    href.startsWith("/erp/invoicing") -> "invoicing"
    href.startsWith("/erp/procurement") -> "procurement"
    href.startsWith("/erp/warehouse") -> "warehouse"
    href.startsWith("/crm/leads") -> "leads"
    href.startsWith("/erp/notifications") -> "notifications-center"
    href.startsWith("/erp/analytics/bi") -> "bi"
    href.startsWith("/crm/dashboard") -> "dashboard"
    href.startsWith("/ops/dashboard") -> "dashboard"
    href.startsWith("/erp/dashboard") -> "dashboard"
    href.startsWith("/ops/activities") -> "activities"
    href.startsWith("/ops/my-activities") -> "my-activities"
    href.startsWith("/ops/my-evidences") -> "my-evidences"
    href.startsWith("/ops/my-viatics") -> "my-viatics"
    href.startsWith("/ops/tools") -> "tools"
    href.startsWith("/ops/gps") -> "gps"
    href.startsWith("/ops/noc") -> "noc"
    href.startsWith("/ops/support") -> "support"
    href.startsWith("/ops/chat") -> "chat"
    href.startsWith("/crm/quotes/nueva") -> "cotizaciones"
    href.startsWith("/crm/quotes") -> "cotizaciones"
    href.startsWith("/crm/clients") -> "clients"
    href.startsWith("/crm/agenda") -> "calendar"
    href.startsWith("/crm/chat") -> "chat"
    href.startsWith("/crm/pipeline") -> "pipeline"
    href.startsWith("/erp/chat") -> "chat"
    else -> href.trim('/').substringAfterLast('/').ifBlank { "dashboard" }
}

private val ROLE_WIDGETS: Map<String, List<CommandWidget>> = mapOf(
    "ceo" to listOf(
        CommandWidget("executive", "Vista ejecutiva", "executive", "📊", "KPIs globales"),
        CommandWidget("approvals", "Aprobaciones", "approvals", "✅", "Pendientes"),
        CommandWidget("dispatch", "Despacho", "dispatch", "🗺️", "OT en campo"),
        CommandWidget("crm-dash", "Pipeline", "pipeline", "💼", "Comercial"),
        CommandWidget("notifications", "Notificaciones", "notifications-center", "🔔"),
        CommandWidget("feed", "Actividad reciente", "notifications-center", "📡", "Feed global"),
    ),
    "ops_manager" to listOf(
        CommandWidget("dispatch", "Centro de despacho", "dispatch", "🗺️"),
        CommandWidget("ops-dash", "Hoy en OPS", "dashboard", "🚀"),
        CommandWidget("activities", "Todas las OT", "activities", "📋"),
        CommandWidget("gps", "GPS en vivo", "gps", "📍"),
        CommandWidget("noc", "NOC", "noc", "📡"),
        CommandWidget("support", "Soporte", "support", "🎫"),
    ),
    "field" to listOf(
        CommandWidget("my-activities", "Mis OT", "my-activities", "🧰"),
        CommandWidget("my-evidences", "Mis evidencias", "my-evidences", "📷"),
        CommandWidget("my-viatics", "Mis viáticos", "my-viatics", "💸"),
        CommandWidget("tools", "Herramientas", "tools", "🛠️"),
        CommandWidget("chat", "Chat equipo", "chat", "💬"),
    ),
    "sales" to listOf(
        CommandWidget("crm-dash", "Mi pipeline", "pipeline", "💼"),
        CommandWidget("quotes", "Cotizaciones", "cotizaciones", "📄"),
        CommandWidget("smart-quote", "Cotizador inteligente", "cotizaciones", "✨"),
        CommandWidget("clients", "Clientes 360", "clients", "👥"),
        CommandWidget("agenda", "Agenda", "calendar", "📅"),
        CommandWidget("crm-chat", "Chat comercial", "chat", "💬"),
    ),
    "default" to listOf(
        CommandWidget("erp-dash", "Resumen ERP", "dashboard", "🏠"),
        CommandWidget("chat", "Chat", "chat", "💬"),
        CommandWidget("notifications", "Notificaciones", "notifications-center", "🔔"),
    ),
)

private fun bucketForRole(user: SessionUser?): String {
    if (user == null) return "default"
    if (user.isSuperAdmin) return "ceo"
    val r = user.role.lowercase()
    if (r.contains("ceo") || r.contains("arquitecto") || r == "super_admin") return "ceo"
    if (
        r.contains("dir_operaciones") ||
        (r.contains("director") && r.contains("operacion")) ||
        r.contains("coord_operaciones") ||
        (r.contains("coord") && r.contains("operacion")) ||
        r.contains("ing_soporte") ||
        (r.contains("soporte") && r.contains("ing"))
    ) {
        return "ops_manager"
    }
    if (r.contains("ing_campo") || (r.contains("ingenier") && r.contains("campo"))) return "field"
    if (
        r.contains("vendedor") ||
        r.contains("coord_ventas") ||
        (r.contains("coord") && r.contains("ventas")) ||
        r.contains("dir_admin") ||
        (r.contains("director") && r.contains("admin"))
    ) {
        return "sales"
    }
    return "default"
}

fun getCommandWidgetsForUser(user: SessionUser?): List<CommandWidget> =
    ROLE_WIDGETS[bucketForRole(user)] ?: ROLE_WIDGETS["default"]!!

fun filterCommandWidgetsForPanel(widgets: List<CommandWidget>, panel: CommandPanelFilter): List<CommandWidget> {
    if (panel == CommandPanelFilter.ALL) return widgets
    val prefixes = when (panel) {
        CommandPanelFilter.OPS -> setOf(
            "dispatch", "dashboard", "activities", "my-activities", "my-evidences", "my-viatics",
            "tools", "gps", "noc", "support",
        )
        CommandPanelFilter.CRM -> setOf(
            "pipeline", "cotizaciones", "clients", "calendar", "leads", "chat",
        )
        CommandPanelFilter.ERP -> setOf(
            "executive", "approvals", "invoicing", "procurement", "warehouse",
            "notifications-center", "bi", "dashboard", "chat",
        )
        CommandPanelFilter.ALL -> emptySet()
    }
    return widgets.filter { it.moduleKey in prefixes }
}

fun mergeCommandWidgets(extra: List<CommandWidget>, base: List<CommandWidget>): List<CommandWidget> {
    val seen = mutableSetOf<String>()
    return (extra + base).filter { seen.add(it.id) }
}

/** Enlaces de drill-down ejecutivo → módulos nativos (paridad web `executive-widgets.ts`). */
fun buildExecutiveBiDrillLinks(data: ExecutiveCLevelDto): List<CommandWidget> {
    val links = mutableListOf(
        CommandWidget("bi-intelligence", "Inteligencia y recomendaciones", "bi", "🧠", "Análisis BI", "intelligence"),
        CommandWidget("bi-margins", "Margen por línea de negocio", "bi", "📊", "Márgenes", "margins"),
    )
    val headline = data.headline
    val ops = data.operations
    val proc = data.raw["procurement"] as? Map<String, Any?>
    val lowStock = (proc?.get("lowStockItems") as? Number)?.toInt() ?: 0

    if (headline.revenueMtd > 0 && headline.arOutstanding > headline.revenueMtd * 0.3) {
        links.add(
            0,
            CommandWidget("bi-clients", "ROI por cliente", "bi", "👥", "Cuentas clave", "clients"),
        )
    }
    if (ops.otOverdue > 0 || ops.otOpen > 10) {
        links += CommandWidget("bi-engineers", "Eficiencia de ingenieros", "bi", "👷", "Productividad campo", "engineers")
    }
    if (lowStock > 0) {
        links += CommandWidget("bi-stock", "$lowStock SKUs críticos", "warehouse", "📉", "Almacén")
    }
    if (headline.pipelineValue > 0) {
        links += CommandWidget("bi-pipeline", "Pipeline comercial", "pipeline", "🎯", "Ventas")
    }
    return links.take(6)
}

fun buildExecutiveDynamicWidgets(data: ExecutiveCLevelDto): List<CommandWidget> {
    val widgets = mutableListOf<CommandWidget>()
    val ops = data.operations
    val proc = data.raw["procurement"] as? Map<String, Any?>
    val sales = data.raw["sales"] as? Map<String, Any?>
    val pendingReq = (proc?.get("pendingRequisitions") as? Number)?.toInt() ?: 0
    val lowStock = (proc?.get("lowStockItems") as? Number)?.toInt() ?: 0
    val hotLeads = (sales?.get("hotLeads") as? Number)?.toInt() ?: 0
    val overdueInvoices = (data.raw["finance"] as? Map<String, Any?>)?.let {
        (it["overdueInvoices"] as? Number)?.toInt()
    } ?: 0

    if (ops.otOverdue > 0) {
        widgets += CommandWidget("dyn-ot-overdue", "${ops.otOverdue} OT vencidas", "dispatch", "⚠️", "Centro de despacho")
    }
    if (ops.ticketsOpen > 5) {
        widgets += CommandWidget("dyn-tickets", "${ops.ticketsOpen} tickets abiertos", "support", "🎫", "Bandeja de soporte")
    }
    if (overdueInvoices > 0) {
        widgets += CommandWidget("dyn-ar-overdue", "$overdueInvoices facturas vencidas", "invoicing", "💳", "Cobranza")
    }
    if (pendingReq > 0) {
        widgets += CommandWidget("dyn-req", "$pendingReq requisiciones", "procurement", "📦", "Compras")
    }
    if (lowStock > 0) {
        widgets += CommandWidget("dyn-stock", "$lowStock SKUs críticos", "warehouse", "📉", "Almacén")
    }
    if (hotLeads >= 3) {
        widgets += CommandWidget("dyn-leads", "$hotLeads leads calientes", "leads", "🔥", "Pipeline comercial")
    }
    val critical = data.alerts.count { it.title.contains("crít", ignoreCase = true) }
    if (critical > 0) {
        widgets += CommandWidget("dyn-alerts", "$critical alertas críticas", "notifications-center", "🚨", "Centro de notificaciones")
    }
    return widgets
}
