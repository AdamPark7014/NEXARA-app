package mx.nexara.mobile.nativeapp.ui.integra.governance

/**
 * Contrato de cableado de los tres módulos de gobierno.
 *
 * Este archivo existe para que quien conecte `IntegraNavHost` no tenga que
 * inventarse las cadenas: aquí están las rutas, las claves de módulo y los
 * títulos de la barra superior, en un solo sitio y compiladas. Las pantallas se
 * registran desde `IntegraNavHost` (que este turno no toca).
 *
 * Pantallas listas:
 *   · [IntegraAuditScreen]
 *   · [IntegraNotificationsCenterScreen]
 *   · [IntegraMyProfileScreen]
 */
object IntegraGovernanceRoutes {

    const val AUDIT = "integra/audit"
    const val NOTIFICATIONS = "integra/notifications-center"
    const val MY_PROFILE = "integra/my-profile"

    /** Claves de `ModuleCatalog.integra` / `ModulePanelMap.INTEGRA_KEYS`. */
    const val KEY_AUDIT = "integra-audit"
    const val KEY_NOTIFICATIONS = "integra-notifications"
    const val KEY_MY_PROFILE = "integra-my-profile"

    /** Título de `NxModuleScaffold` para cada ruta, o `null` si no es de aquí. */
    fun tituloDeRuta(route: String?): String? = when (route) {
        AUDIT -> "Bitácora y auditoría"
        NOTIFICATIONS -> "Centro de notificaciones"
        MY_PROFILE -> "Mi perfil"
        else -> null
    }

    /**
     * Ruta para una clave de módulo, admitiendo los alias que ya usa
     * `integraRouteForKey`. `null` si la clave no es de gobierno.
     */
    fun rutaDeClave(key: String): String? = when (key.lowercase()) {
        KEY_AUDIT, "audit", "bitacora", "auditoria" -> AUDIT
        KEY_NOTIFICATIONS, "notifications", "notifications-center", "notificaciones" -> NOTIFICATIONS
        KEY_MY_PROFILE, "my-profile", "mi-perfil", "perfil" -> MY_PROFILE
        else -> null
    }
}
