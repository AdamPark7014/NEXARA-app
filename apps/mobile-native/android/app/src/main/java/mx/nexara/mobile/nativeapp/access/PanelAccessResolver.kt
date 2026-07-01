package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.SessionUser

private val CLIENT_OR_BRANCH_PERMISSION_PREFIXES = listOf(
    "client-portal.",
    "branch-portal.",
    "client-auth.",
    "branch-auth.",
    "client-tickets.",
)

private fun normalizePerms(perms: List<String>): Set<String> =
    perms.map { it.trim().lowercase().replace('_', '.').replace('-', '.') }.toSet()

private fun SessionUser.normalizedPerms(): Set<String> = normalizePerms(permissions)

private fun hasAny(perms: Set<String>, required: List<String>, isSuperAdmin: Boolean): Boolean {
    if (isSuperAdmin) return true
    return required.any { perms.contains(it) }
}

private fun isClientOrBranchAccount(role: String, permissions: List<String>): Boolean {
    val byRole = Regex("(cliente|client|sucursal|branch)", RegexOption.IGNORE_CASE).containsMatchIn(role)
    val byPerm = permissions.any { p ->
        val n = p.trim().lowercase()
        CLIENT_OR_BRANCH_PERMISSION_PREFIXES.any { n.startsWith(it) }
    }
    return byRole || byPerm
}

private fun roleHint(role: String): String = role.trim().lowercase()

/**
 * Resuelve paneles accesibles — alineado con apps/web/lib/access-matrix.ts + panel-routing legacy.
 */
object PanelAccessResolver {
    fun accessiblePanels(user: SessionUser?): List<PanelId> {
        if (user == null) return emptyList()

        if (user.isClient || user.isBranchUser || isClientOrBranchAccount(user.role, user.permissions)) {
            return listOf(PanelId.PORTAL)
        }

        val perms = user.normalizedPerms()
        val role = roleHint(user.role)

        if (user.isSuperAdmin) {
            return listOf(PanelId.ERP, PanelId.CRM, PanelId.OPS, PanelId.STUDIO, PanelId.LAB)
        }

        val erp = hasAny(
            perms,
            listOf(
                "console.access", "console.admin", "users.manage",
                "contabilidad.view", "contabilidad.manage",
                "attendance.view", "attendance.manage",
                "console_access", "console_admin",
            ),
            user.isSuperAdmin,
        ) || role.contains("admin") || role.contains("rh") || role.contains("contab")

        val crm = hasAny(
            perms,
            listOf("panel.ventas", "sales.view", "sales.manage", "sales.reports.view"),
            user.isSuperAdmin,
        ) || role.contains("vendedor") || role.contains("ventas")

        val ops = hasAny(
            perms,
            listOf("console.access", "console.admin", "gps.view", "gps.manage", "activities.view"),
            user.isSuperAdmin,
        ) || role.contains("ingenier") || role.contains("soporte") || role.contains("campo")
            || role.contains("operac") || role.contains("noc")

        val studio = hasAny(perms, listOf("panel.web", "studio.access"), user.isSuperAdmin)
            || role.contains("diseño") || role.contains("diseno") || role.contains("studio")

        val lab = user.isSuperAdmin || role.contains("developer") || role.contains("desarroll")

        return buildList {
            if (erp) add(PanelId.ERP)
            if (crm) add(PanelId.CRM)
            if (ops) add(PanelId.OPS)
            if (studio) add(PanelId.STUDIO)
            if (lab) add(PanelId.LAB)
        }.distinct()
    }

    fun routeForPanel(panel: PanelId): String = when (panel) {
        PanelId.ERP -> "erp"
        PanelId.CRM -> "crm"
        PanelId.OPS -> "ops"
        PanelId.STUDIO -> "studio"
        PanelId.LAB -> "lab"
        PanelId.PORTAL -> "portal"
    }

    fun routeForSinglePanelUser(user: SessionUser?): String? {
        val panels = accessiblePanels(user)
        if (panels.size != 1) return null
        return routeForPanel(panels.first())
    }
}
