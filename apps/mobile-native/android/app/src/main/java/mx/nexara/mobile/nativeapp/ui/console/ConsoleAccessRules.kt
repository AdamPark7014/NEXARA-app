package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleEntry

private object ConsolePermissions {
    const val CONSOLE_ADMIN = "console.admin"
    const val COTIZACIONES_ACCESS = "cotizaciones.access"
    const val CVS_MANAGE = "cvs.manage"
    const val CVS_ADMIN_REVIEW = "cvs.admin.review"
    const val CVS_SUPERADMIN_REVIEW = "cvs.superadmin.review"
    const val PANEL_VENTAS = "panel.ventas"
    const val SALES_VIEW = "sales.view"
    const val SALES_MANAGE = "sales.manage"
    const val SALES_REPORTS_VIEW = "sales.reports.view"
}

private fun SessionUser.hasAnyPermission(vararg required: String): Boolean {
    if (isSuperAdmin) return true
    return required.any { permissions.contains(it) }
}

private fun SessionUser.canAccessCotizaciones(): Boolean {
    return hasAnyPermission(ConsolePermissions.COTIZACIONES_ACCESS)
}

private fun SessionUser.canAccessCvs(): Boolean {
    return hasAnyPermission(
        ConsolePermissions.CVS_MANAGE,
        ConsolePermissions.CVS_ADMIN_REVIEW,
        ConsolePermissions.CVS_SUPERADMIN_REVIEW,
        ConsolePermissions.CONSOLE_ADMIN,
    )
}

private fun SessionUser.canAccessVentas(): Boolean {
    return hasAnyPermission(
        ConsolePermissions.PANEL_VENTAS,
        ConsolePermissions.SALES_VIEW,
        ConsolePermissions.SALES_MANAGE,
        ConsolePermissions.SALES_REPORTS_VIEW,
    )
}

private fun SessionUser.isPlatformAdmin(): Boolean {
    return isSuperAdmin || permissions.contains(ConsolePermissions.CONSOLE_ADMIN)
}

/** Rol «Administrativo» — operación día a día (espejo page-matrix web). */
fun SessionUser.isAdministrativoRole(): Boolean {
    if (isSuperAdmin || isPlatformAdmin()) return false
    val r = role.lowercase()
    if (r == "coord_admin" || r == "dir_admin") return false
    if (r.contains("coord") && r.contains("admin")) return false
    if (r.contains("director") && r.contains("admin")) return false
    return r == "administrativo" || r.contains("administrativ")
}

/** Módulos ERP permitidos para personal administrativo (Mónica / admin_staff). */
val ADMINISTRATIVO_ERP_MODULE_KEYS: Set<String> = setOf(
    "dashboard",
    "approvals",
    "companies",
    "calendar",
    "documents",
    "viatics",
    "expenses",
    "notifications-center",
    "my-profile",
    "my-preferences",
    "news",
    "attendance",
    "my-lunch-breaks",
    "lunch-breaks",
)

private fun normalizedConsolePath(module: ModuleEntry): String {
    return when {
        module.webPath.startsWith("/operacion") -> module.webPath.removePrefix("/operacion")
        module.webPath.startsWith("/console") -> module.webPath.removePrefix("/console")
        else -> module.webPath
    }
}

fun canAccessConsoleModule(user: SessionUser?, module: ModuleEntry): Boolean {
    if (user == null) return false

    if (module.superAdminOnly && !user.isSuperAdmin) return false
    if (module.permissions.isNotEmpty() && !user.hasAnyPermission(*module.permissions.toTypedArray())) return false

    val path = normalizedConsolePath(module)
    val roleLower = user.role.lowercase()

    val isPlatformAdmin = user.isPlatformAdmin()
    val isAdmin = !user.isSuperAdmin && isPlatformAdmin
    val isIngeniero = !user.isSuperAdmin && !isAdmin && roleLower.contains("ingenier")
    val isAdministrativo = user.isAdministrativoRole()
    val isVendedor = !user.isSuperAdmin && !isAdmin && !isIngeniero && !isAdministrativo &&
        (roleLower.contains("vendedor") || roleLower.contains("ventas"))

    if (user.isSuperAdmin) {
        if (path.startsWith("/my-")) return false
        return true
    }

    if (isAdmin) {
        if (path.startsWith("/my-")) return false
        if (path.startsWith("/ventas") || path.startsWith("/accounting") || path.startsWith("/newsletter") || path.startsWith("/news")) return false
        if (path == "/cotizaciones" && !user.canAccessCotizaciones()) return false
        if (path == "/cvs" && !user.canAccessCvs()) return false
        return true
    }

    if (isIngeniero) {
        val baseAllowed = setOf("/dashboard", "/cotizaciones", "/cvs", "/ventas", "/attendance")
        if (!path.startsWith("/my-") && path !in baseAllowed) return false
        if (path == "/cotizaciones" && !user.canAccessCotizaciones()) return false
        if (path == "/cvs" && !user.canAccessCvs()) return false
        if (path == "/ventas" && !user.canAccessVentas()) return false
        return true
    }

    if (isAdministrativo) {
        return module.key in ADMINISTRATIVO_ERP_MODULE_KEYS
    }

    if (isVendedor) {
        val baseAllowed = setOf("/dashboard", "/ventas", "/cotizaciones", "/cvs", "/attendance")
        if (!path.startsWith("/my-") && path !in baseAllowed) return false
        if (path == "/cotizaciones" && !user.canAccessCotizaciones()) return false
        if (path == "/cvs" && !user.canAccessCvs()) return false
        if (path == "/ventas" && !user.canAccessVentas()) return false
        return true
    }

    return true
}

data class ConsoleSidebarGroup(
    val id: String,
    val title: String,
    val modules: List<ModuleEntry>,
)

/**
 * Replica los grupos del sidebar web (apps/web/app/(subdomains)/console/Sidebar.tsx)
 * filtrando por permisos/rol del usuario actual. Agrupa los módulos del
 * catálogo nativo para mantener paridad 1:1 con la web.
 */
fun consoleSidebarGroups(user: SessionUser?, panelId: mx.nexara.mobile.nativeapp.access.PanelId? = null): List<ConsoleSidebarGroup> {
    if (user == null) return emptyList()
    if (user.isAdministrativoRole()) {
        return administrativoSidebarGroups(user)
    }
    val allowedKeys = panelId?.let { mx.nexara.mobile.nativeapp.access.ModulePanelMap.consoleKeysFor(it) }
    val byKey = ModuleCatalog.console.associateBy { it.key }
    fun pick(vararg keys: String): List<ModuleEntry> =
        keys.mapNotNull { byKey[it] }
            .filter { canAccessConsoleModule(user, it) }
            .filter { allowedKeys == null || it.key in allowedKeys }

    val groups = listOf(
        ConsoleSidebarGroup("profile", "Cuenta personal", pick("my-profile", "calendar")),
        ConsoleSidebarGroup(
            "employee", "Mi espacio de trabajo",
            pick("dashboard", "my-activities", "my-evidences", "my-viatics", "my-vehicles", "my-lunch-breaks"),
        ),
        ConsoleSidebarGroup(
            "operations", "Supervisión operativa",
            pick("activities", "evidences", "viatics", "vehicles", "gps", "service-clients", "maintenance", "assets", "service-sheets"),
        ),
        ConsoleSidebarGroup(
            "people", "RRHH y control de personal",
            pick("attendance", "lunch-breaks", "fines", "cvs", "users", "hr", "orgchart", "kpis-hr"),
        ),
        ConsoleSidebarGroup(
            "commercial", "Clientes y comercial",
            pick("clients", "projects", "cotizaciones", "gestion-vendedores", "contact-messages"),
        ),
        ConsoleSidebarGroup(
            "system", "Administración interna",
            pick("tools", "news", "newsletter", "settings", "companies", "kb", "architecture"),
        ),
        ConsoleSidebarGroup(
            "inventory", "Inventario y compras",
            pick("warehouse", "stock", "procurement"),
        ),
        ConsoleSidebarGroup(
            "finance", "Finanzas y banca",
            pick("accounting", "employee-payments", "expenses", "work-projects", "invoicing", "banking"),
        ),
        ConsoleSidebarGroup(
            "compliance", "Cumplimiento y BI",
            pick("documents", "audit", "analytics", "bi", "executive", "approvals", "notifications-center", "exports"),
        ),
        ConsoleSidebarGroup(
            "ops-monitoring", "Monitoreo y soporte",
            pick("noc", "client-tickets", "support", "support-sla", "maintenance-contracts"),
        ),
    )

    return groups.filter { it.modules.isNotEmpty() }
}

/** Menú agrupado como sidebar web para rol Administrativo. */
private fun administrativoSidebarGroups(user: SessionUser): List<ConsoleSidebarGroup> {
    val byKey = ModuleCatalog.console.associateBy { it.key }
    fun pick(vararg keys: String): List<ModuleEntry> =
        keys.mapNotNull { byKey[it] }.filter { canAccessConsoleModule(user, it) }
    return listOf(
        ConsoleSidebarGroup("board", "Tablero", pick("dashboard", "approvals")),
        ConsoleSidebarGroup("governance", "Gobierno", pick("companies")),
        ConsoleSidebarGroup("finance", "Finanzas", pick("viatics", "expenses")),
        ConsoleSidebarGroup("people", "Personas", pick("attendance", "my-lunch-breaks")),
        ConsoleSidebarGroup("logistics", "Logística", pick("documents")),
        ConsoleSidebarGroup("audit", "Auditoría", pick("notifications-center")),
        ConsoleSidebarGroup("account", "Mi cuenta", pick("my-profile", "calendar", "news")),
    ).filter { it.modules.isNotEmpty() }
}

/** Módulos ya visibles en la barra inferior — no repetir en «Más». */
fun consoleBottomTabModuleKeys(
    user: SessionUser?,
    panelId: mx.nexara.mobile.nativeapp.access.PanelId,
): Set<String> {
    if (user == null) return emptySet()
    val allowedKeys = mx.nexara.mobile.nativeapp.access.ModulePanelMap.consoleKeysFor(panelId)
    val visible = ModuleCatalog.console
        .filter { canAccessConsoleModule(user, it) && (allowedKeys == null || it.key in allowedKeys) }
        .map { it.key }
        .toSet()
    fun has(key: String) = key in visible

    val roleLower = user.role.lowercase()
    val isSuperAdmin = user.isSuperAdmin
    val isAdmin = !isSuperAdmin && user.isPlatformAdmin()
    val isIngeniero = !isSuperAdmin && !isAdmin && roleLower.contains("ingenier")
    val isAdministrativo = user.isAdministrativoRole()

    return buildSet {
        if (has("dashboard")) add("dashboard")
        when {
            isSuperAdmin || isAdmin -> {
                if (has("activities")) add("activities")
                if (has("evidences")) add("evidences")
                if (has("attendance")) add("attendance")
            }
            isAdministrativo -> {
                if (has("attendance")) add("attendance")
            }
            else -> {
                if (has("my-activities")) add("my-activities")
                if (has("my-evidences")) add("my-evidences")
                if (has("attendance")) add("attendance")
                else if (has("gps")) add("gps")
            }
        }
    }
}

fun consoleSidebarGroupsForMore(user: SessionUser?, panelId: mx.nexara.mobile.nativeapp.access.PanelId?): List<ConsoleSidebarGroup> {
    val tabKeys = consoleBottomTabModuleKeys(user, panelId ?: mx.nexara.mobile.nativeapp.access.PanelId.ERP)
    return consoleSidebarGroups(user, panelId)
        .map { g -> g.copy(modules = g.modules.filter { it.key !in tabKeys }) }
        .filter { it.modules.isNotEmpty() }
}

fun ventasBottomTabModuleKeys(): Set<String> = setOf("dashboard", "cotizaciones", "leads")

fun ventasSidebarGroups(@Suppress("UNUSED_PARAMETER") user: SessionUser?): List<ConsoleSidebarGroup> {
    val byKey = mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog.ventas.associateBy { it.key }
    fun pick(vararg keys: String): List<ModuleEntry> =
        keys.mapNotNull { byKey[it] }
            .filter { it.key !in ventasBottomTabModuleKeys() }

    return listOf(
        ConsoleSidebarGroup("pipeline", "Pipeline y catálogo", pick(
            "oportunidades", "pipeline", "agenda", "plantillas",
            "clientes", "productos", "proyectos", "licitaciones",
        )),
        ConsoleSidebarGroup("team", "Equipo y métricas", pick(
            "gestion-vendedores", "metas", "reportes", "crecimiento", "equipo-comparativa",
        )),
        ConsoleSidebarGroup("account", "Mi cuenta", pick("my-profile", "notificaciones")),
    ).filter { it.modules.isNotEmpty() }
}
