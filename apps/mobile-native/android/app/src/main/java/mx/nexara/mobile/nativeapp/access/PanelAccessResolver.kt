package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.SessionUser

/**
 * A qué superficie entra una sesión.
 *
 * Core-only (`apps/web/lib/core-surface.ts`): no hay selector de paneles.
 *   - Cuenta de cliente o de sucursal (`portal/login`, `branch-portal`) → portal.
 *   - Cualquier otra sesión → NEXARA Core, que abre en Actividades (`/erp/pizarra`).
 */
object PanelAccessResolver {

    /** Solo las cuentas que entraron por el portal de clientes o de sucursal. */
    fun isPortalAccount(user: SessionUser?): Boolean =
        user != null && (user.isClient || user.isBranchUser)

    /** Superficie de la sesión, o null sin sesión. */
    fun homePanel(user: SessionUser?): PanelId? = when {
        user == null -> null
        isPortalAccount(user) -> PanelId.PORTAL
        else -> PanelId.ERP
    }

    /** Ruta del NavHost raíz para cada superficie. */
    fun routeForPanel(panel: PanelId): String = when (panel) {
        PanelId.ERP -> "erp"
        PanelId.PORTAL -> "portal"
    }

    /**
     * ¿Puede esta sesión abrir un destino de [panel]? El personal interno no abre
     * el portal y una cuenta de cliente no abre Core.
     */
    fun canOpen(user: SessionUser?, panel: PanelId): Boolean = homePanel(user) == panel
}
