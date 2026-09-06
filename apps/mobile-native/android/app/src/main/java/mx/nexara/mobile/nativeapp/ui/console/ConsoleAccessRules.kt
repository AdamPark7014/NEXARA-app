package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.access.RolePanelMatrix
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

/**
 * Clave canónica del rol (`roles.v2.ts`). Una sola normalización por igualdad
 * exacta contra la tabla de alias — nunca `role.contains("…")`, que es lo que
 * dejaba a «Recursos Humanos» sin paneles y a «Ingeniero de Soporte» con los
 * de un ingeniero de campo según cómo estuviera escrito el nombre en la BD.
 */
private fun SessionUser.canonicalRole(): String? = RolePanelMatrix.canonicalRoleKey(
    roleKey = roleKey,
    orgRoleKey = orgRoleKey,
    roleDisplayName = role,
)

/** Rol «Administrativo» — operación día a día (espejo page-matrix web). */
fun SessionUser.isAdministrativoRole(): Boolean {
    if (isSuperAdmin || isPlatformAdmin()) return false
    return canonicalRole() == RolePanelMatrix.ADMINISTRATIVO
}

private fun SessionUser.isIngenieroRole(): Boolean {
    val key = canonicalRole()
    return key == RolePanelMatrix.ING_CAMPO || key == RolePanelMatrix.ING_SOPORTE
}

private fun SessionUser.isVendedorRole(): Boolean {
    val key = canonicalRole()
    return key == RolePanelMatrix.VENDEDOR || key == RolePanelMatrix.COORD_VENTAS
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
    "invoicing",
    "procurement",
    "warehouse",
    "clients",
    "cotizaciones",
    "notifications-center",
    "my-profile",
    "my-preferences",
    "news",
    "attendance",
    "my-lunch-breaks",
    "lunch-breaks",
    "chat",
)

/**
 * Prefijos de panel que hay que quitar para comparar contra las listas de
 * módulos permitidos por rol.
 *
 * `/ops` y `/erp` son los prefijos canónicos nuevos (`url-matrix.ts`); sin
 * ellos aquí, módulos como `chat` (`/erp/chat`), `dispatch` (`/ops/dispatch`),
 * `support` (`/ops/support`) y `noc` (`/ops/noc`) nunca casaban con la lista
 * del ingeniero y quedaban invisibles para todo el personal de campo.
 */
private val PANEL_PATH_PREFIXES = listOf("/operacion", "/console", "/ops", "/erp", "/crm")

private fun normalizedConsolePath(module: ModuleEntry): String {
    val prefix = PANEL_PATH_PREFIXES.firstOrNull { module.webPath.startsWith("$it/") }
        ?: return module.webPath
    return module.webPath.removePrefix(prefix)
}

/** Match url-matrix paths (con o sin comodín **) contra webPath del módulo. */
private fun navigationPathAllows(module: ModuleEntry, navPaths: List<String>): Boolean {
    val candidates = buildList {
        val raw = module.webPath.trim()
        if (raw.isNotBlank()) {
            add(if (raw.startsWith("/")) raw else "/$raw")
            add(normalizedConsolePath(module).let { if (it.startsWith("/")) it else "/$it" })
        }
    }.distinct().filter { it.isNotBlank() && it != "/" }
    if (candidates.isEmpty()) return false

    return navPaths.any { rule ->
        val base = rule
            .replace(Regex("/\\*\\*$"), "")
            .replace(Regex("/\\*$"), "")
            .trimEnd('/')
        if (base.isBlank() || base.startsWith("/api")) return@any false
        candidates.any { path ->
            path == base || path.startsWith("$base/") || base.startsWith(path)
        }
    }
}

fun canAccessConsoleModule(user: SessionUser?, module: ModuleEntry): Boolean {
    if (user == null) return false

    if (module.superAdminOnly && !user.isSuperAdmin) return false
    if (module.permissions.isNotEmpty() && !user.hasAnyPermission(*module.permissions.toTypedArray())) return false

    // Integración /me/navigation: allow por clave O por path; si no matchea, cae a reglas legacy
    // (nunca clip duro incompleto que esconda pantallas ya pagadas).
    val navKeys = user.navModuleKeys
    val navPaths = user.navPaths?.filter { !it.startsWith("/api/") }
    if (!user.isSuperAdmin) {
        if (!navKeys.isNullOrEmpty() && module.key in navKeys) {
            return true
        }
        if (!navPaths.isNullOrEmpty() && navigationPathAllows(module, navPaths)) {
            return true
        }
    }

    val path = normalizedConsolePath(module)

    val isPlatformAdmin = user.isPlatformAdmin()
    val isAdmin = !user.isSuperAdmin && isPlatformAdmin
    val isIngeniero = !user.isSuperAdmin && !isAdmin && user.isIngenieroRole()
    val isAdministrativo = user.isAdministrativoRole()
    val isVendedor = !user.isSuperAdmin && !isAdmin && !isIngeniero && !isAdministrativo &&
        user.isVendedorRole()

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
        // Espejo de URL_MATRIX[ING_CAMPO] ∪ URL_MATRIX[ING_SOPORTE] (url-matrix.ts):
        // la app tiene un solo cubo «ingeniero», así que se toma la unión.
        val baseAllowed = setOf(
            "/dashboard", "/cotizaciones", "/cvs", "/ventas", "/attendance",
            "/activities", "/evidences", "/viatics", "/vehicles", "/gps", "/tools",
            "/lunch-breaks", "/chat", "/dispatch", "/support", "/noc",
            "/service-sheets", "/client-tickets",
            "/support/sla", "/maintenance", "/maintenance/contracts", "/assets",
            "/service-clients", "/kb", "/notifications-center",
        )
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
        // `chat` y `notifications-center` son transversales: los tiene todo el
        // personal interno en url-matrix, incluido el equipo comercial.
        val baseAllowed = setOf(
            "/dashboard", "/ventas", "/cotizaciones", "/cvs", "/attendance",
            "/chat", "/notifications-center", "/clients",
        )
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
    // Un módulo se muestra en el PRIMER grupo que lo reclama: `chat`, `dispatch`
    // y `recruiting` estaban declarados en dos grupos y salían duplicados.
    val alreadyShown = mutableSetOf<String>()
    fun pick(vararg keys: String): List<ModuleEntry> =
        keys.mapNotNull { byKey[it] }
            .filter { canAccessConsoleModule(user, it) }
            .filter { allowedKeys == null || it.key in allowedKeys }
            .filter { alreadyShown.add(it.key) }

    val groups = listOf(
        ConsoleSidebarGroup("profile", "Cuenta personal", pick("my-profile", "my-preferences", "calendar")),
        ConsoleSidebarGroup(
            "employee", "Mi espacio de trabajo",
            pick("dashboard", "my-activities", "my-evidences", "my-viatics", "my-vehicles", "my-lunch-breaks", "chat"),
        ),
        ConsoleSidebarGroup(
            "operations", "Supervisión operativa",
            pick("activities", "evidences", "viatics", "vehicles", "gps", "service-clients", "maintenance", "assets", "service-sheets", "dispatch"),
        ),
        ConsoleSidebarGroup(
            "people", "RRHH y control de personal",
            pick("attendance", "lunch-breaks", "fines", "cvs", "recruiting", "users", "hr", "orgchart", "kpis-hr"),
        ),
        ConsoleSidebarGroup(
            "commercial", "Clientes y comercial",
            pick("clients", "projects", "cotizaciones", "gestion-vendedores", "contact-messages"),
        ),
        ConsoleSidebarGroup(
            "system", "Administración interna",
            pick("tools", "news", "newsletter", "settings", "companies", "kb", "architecture", "offline-queue"),
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
            pick("documents", "audit", "analytics", "bi", "executive", "approvals", "notifications-center", "chat", "exports"),
        ),
        ConsoleSidebarGroup(
            "ops-monitoring", "Monitoreo y soporte",
            pick("noc", "client-tickets", "support", "support-sla", "maintenance-contracts", "dispatch", "recruiting"),
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
        ConsoleSidebarGroup("finance", "Finanzas", pick("viatics", "expenses", "invoicing", "procurement")),
        ConsoleSidebarGroup("commercial", "Comercial", pick("clients", "cotizaciones")),
        ConsoleSidebarGroup("people", "Personas", pick("attendance", "my-lunch-breaks")),
        ConsoleSidebarGroup("logistics", "Logística", pick("documents", "warehouse")),
        ConsoleSidebarGroup("audit", "Auditoría", pick("notifications-center", "chat")),
        ConsoleSidebarGroup("account", "Mi cuenta", pick("my-profile", "my-preferences", "calendar", "news")),
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

    val isSuperAdmin = user.isSuperAdmin
    val isAdmin = !isSuperAdmin && user.isPlatformAdmin()
    val isIngeniero = !isSuperAdmin && !isAdmin && user.isIngenieroRole()
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
        ConsoleSidebarGroup("account", "Mi cuenta", pick("my-profile", "notificaciones", "chat")),
    ).filter { it.modules.isNotEmpty() }
}
