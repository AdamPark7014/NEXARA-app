package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.SessionUser

private val CLIENT_OR_BRANCH_PERMISSION_PREFIXES = listOf(
    "client-portal.",
    "branch-portal.",
    "client-auth.",
    "branch-auth.",
    "client-tickets.",
)

private val ERP_ROLE_KEYS = setOf(
    "ceo", "super_admin", "dir_admin", "coord_admin", "administrativo",
    "rh", "contabilidad", "dir_operaciones",
)
private val CRM_ROLE_KEYS = setOf(
    "ceo", "super_admin", "coord_ventas", "vendedor", "dir_admin",
)
private val OPS_ROLE_KEYS = setOf(
    "ceo", "super_admin", "dir_operaciones", "coord_operaciones", "arquitecto",
    "ing_campo", "ing_soporte", "noc_lead", "noc_operator",
)
private val STUDIO_ROLE_KEYS = setOf(
    "ceo", "super_admin", "lider_diseno", "disenador",
)
private val LAB_ROLE_KEYS = setOf("ceo", "super_admin", "developer")

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

/** Prefer snake_case roleKey-like tokens; also keep display-name substrings as fallback. */
private fun roleTokens(role: String): Set<String> {
    val raw = role.trim().lowercase()
    if (raw.isBlank()) return emptySet()
    val snake = raw.replace(Regex("[\\s\\-]+"), "_")
    return buildSet {
        add(raw)
        add(snake)
        raw.split(Regex("[\\s_\\-/,]+")).filter { it.length >= 2 }.forEach { add(it) }
    }
}

/**
 * Resuelve paneles accesibles — alineado con apps/web/lib/access-matrix.ts + panel-routing legacy.
 * Usa claves v2 (`rh`, `ing_soporte`, …) además de substrings del nombre de rol.
 */
object PanelAccessResolver {
    fun accessiblePanels(user: SessionUser?): List<PanelId> {
        if (user == null) return emptyList()

        if (user.isClient || user.isBranchUser || isClientOrBranchAccount(user.role, user.permissions)) {
            return listOf(PanelId.PORTAL)
        }

        val perms = user.normalizedPerms()
        val tokens = roleTokens(user.role)

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
        ) || tokens.any { it in ERP_ROLE_KEYS }
            || tokens.any { t ->
                t.contains("admin") || t.contains("rh") || t.contains("people")
                    || t.contains("contab") || t.contains("administrativ")
                    || t.contains("recurso") || t.contains("humano")
            }

        val crm = hasAny(
            perms,
            listOf("panel.ventas", "sales.view", "sales.manage", "sales.reports.view"),
            user.isSuperAdmin,
        ) || tokens.any { it in CRM_ROLE_KEYS }
            || tokens.any { t -> t.contains("vendedor") || t.contains("ventas") || t.contains("sales") }

        val ops = hasAny(
            perms,
            listOf("console.access", "console.admin", "gps.view", "gps.manage", "activities.view"),
            user.isSuperAdmin,
        ) || tokens.any { it in OPS_ROLE_KEYS }
            || tokens.any { t ->
                t.contains("ingenier") || t.contains("soporte") || t.contains("campo")
                    || t.contains("operac") || t.contains("noc") || t.contains("arquitect")
            }

        val studio = hasAny(perms, listOf("panel.web", "studio.access"), user.isSuperAdmin)
            || tokens.any { it in STUDIO_ROLE_KEYS }
            || tokens.any { t -> t.contains("diseño") || t.contains("diseno") || t.contains("studio") }

        val lab = user.isSuperAdmin
            || tokens.any { it in LAB_ROLE_KEYS }
            || tokens.any { t -> t.contains("developer") || t.contains("desarroll") }

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
