package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.SessionUser

private fun normalizePerms(perms: List<String>): Set<String> =
    perms.map { it.trim().lowercase().replace('_', '.').replace('-', '.') }.toSet()

private fun SessionUser.normalizedPerms(): Set<String> = normalizePerms(permissions)

private fun hasAny(perms: Set<String>, required: List<String>, isSuperAdmin: Boolean): Boolean {
    if (isSuperAdmin) return true
    return required.any { perms.contains(it) }
}

/**
 * Claves de panel de `GET /me/navigation` (`me.service.ts · PANEL_PREFIXES`)
 * más los alias legacy que aún viven en deep links y bookmarks.
 */
private fun panelFromNavKey(key: String): PanelId? = when (val k = key.trim().lowercase()) {
    "erp", "core" -> PanelId.ERP
    "crm", "sales" -> PanelId.CRM
    "ops" -> PanelId.OPS
    "studio" -> PanelId.STUDIO
    "lab" -> PanelId.LAB
    "integra" -> PanelId.INTEGRA
    "portal" -> PanelId.PORTAL
    // `console`, `ventas`, `operacion`, `web`, `tickets` — rutas legacy.
    else -> PanelId.fromKey(k)
}

/** Panel mínimo de un usuario interno autenticado — nunca una pantalla muerta. */
private val BASE_INTERNAL_PANEL = PanelId.ERP

private val ALL_INTERNAL_PANELS = listOf(
    PanelId.ERP, PanelId.CRM, PanelId.OPS, PanelId.STUDIO, PanelId.LAB, PanelId.INTEGRA,
)

/**
 * Resuelve paneles accesibles — alineado con `apps/api/src/common/rbac/roles.v2.ts`
 * y `apps/web/lib/access-matrix.ts`.
 *
 * Orden de decisión (el primero que da resultado, manda):
 *   1. Cuenta externa (cliente / sucursal) → solo PORTAL.
 *   2. Super admin → todos los paneles internos.
 *   3. `navPanels` de `GET /me/navigation` — la API es la fuente de verdad.
 *   4. Rol canónico (`RolePanelMatrix`) — respaldo sin conexión, por igualdad
 *      exacta de clave, nunca por subcadena del nombre visible del rol.
 *   5. Permisos efectivos de la sesión.
 *   6. Panel base: un usuario interno autenticado siempre entra a algún lado.
 */
object PanelAccessResolver {
    fun accessiblePanels(user: SessionUser?): List<PanelId> {
        if (user == null) return emptyList()

        val canonicalRole = RolePanelMatrix.canonicalRoleKey(
            roleKey = user.roleKey,
            orgRoleKey = user.orgRoleKey,
            roleDisplayName = user.role,
        )

        // 1. Externos: los marca el servidor (`portal/login`) o el rol canónico.
        if (user.isClient || user.isBranchUser || RolePanelMatrix.isExternalRole(canonicalRole)) {
            return listOf(PanelId.PORTAL)
        }

        // 2. Bypass total.
        if (user.isSuperAdmin) return ALL_INTERNAL_PANELS

        // 3. La API manda cuando responde.
        val fromNav = user.navPanels
            ?.mapNotNull { panelFromNavKey(it) }
            ?.filter { it != PanelId.PORTAL }
            ?.distinct()
            .orEmpty()
        if (fromNav.isNotEmpty()) return fromNav

        // 4. Rol canónico — respaldo determinista sin conexión.
        val fromRole = RolePanelMatrix.panelsForRole(canonicalRole).filter { it != PanelId.PORTAL }
        if (fromRole.isNotEmpty()) return fromRole

        // 5. Permisos efectivos.
        val fromPerms = panelsFromPermissions(user)
        if (fromPerms.isNotEmpty()) return fromPerms

        // 6. Nunca cero paneles con sesión válida.
        return listOf(BASE_INTERNAL_PANEL)
    }

    /** Último recurso antes del panel base: qué abre la lista de permisos. */
    private fun panelsFromPermissions(user: SessionUser): List<PanelId> {
        val perms = user.normalizedPerms()
        if (perms.isEmpty()) return emptyList()
        val superAdmin = user.isSuperAdmin

        val erp = hasAny(
            perms,
            listOf(
                "console.access", "console.admin", "users.manage",
                "contabilidad.view", "contabilidad.manage",
                "attendance.view", "attendance.manage",
                "hr.view", "hr.manage", "cvs.manage",
            ),
            superAdmin,
        )
        val crm = hasAny(
            perms,
            listOf("panel.ventas", "sales.view", "sales.manage", "sales.reports.view"),
            superAdmin,
        )
        val ops = hasAny(
            perms,
            listOf(
                "gps.view", "gps.manage", "activities.view", "activities.manage",
                "evidences.view", "dispatch.manage",
            ),
            superAdmin,
        )
        val studio = hasAny(
            perms,
            listOf("panel.web", "studio.content.view", "studio.content.manage"),
            superAdmin,
        )
        val lab = hasAny(perms, listOf("lab.access", "lab.ai.live"), superAdmin)
        val integra = superAdmin || perms.any { it.startsWith("integra.") }

        return buildList {
            if (erp) add(PanelId.ERP)
            if (crm) add(PanelId.CRM)
            if (ops) add(PanelId.OPS)
            if (studio) add(PanelId.STUDIO)
            if (lab) add(PanelId.LAB)
            if (integra) add(PanelId.INTEGRA)
        }.distinct()
    }

    fun routeForPanel(panel: PanelId): String = when (panel) {
        PanelId.ERP -> "erp"
        PanelId.CRM -> "crm"
        PanelId.OPS -> "ops"
        PanelId.STUDIO -> "studio"
        PanelId.LAB -> "lab"
        PanelId.PORTAL -> "portal"
        PanelId.INTEGRA -> "integra"
    }

    fun routeForSinglePanelUser(user: SessionUser?): String? {
        val panels = accessiblePanels(user)
        if (panels.size != 1) return null
        return routeForPanel(panels.first())
    }
}
