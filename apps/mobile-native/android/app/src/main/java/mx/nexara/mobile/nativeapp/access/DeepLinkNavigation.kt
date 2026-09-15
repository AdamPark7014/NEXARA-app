package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink

/** Construye rutas internas de NavHost a partir de un deep link de módulo. */
object DeepLinkNavigation {

    private val ACTIVITY_KEYS = setOf(CoreKeys.ACTIVITIES, CoreKeys.MY_ACTIVITIES)

    /**
     * Ruta directa de Core: el día de una persona (`/erp/pizarra/:userId`)
     * o el detalle de una actividad con su pestaña (`/erp/actividades/:id/evidencias`).
     */
    fun consoleRoute(link: PendingModuleLink): String? {
        if (link.key in ACTIVITY_KEYS) {
            boardUserId(link)?.let { return "console/board/$it" }
        }
        link.entityId?.let { id ->
            return when (link.key) {
                CoreKeys.ACTIVITIES, CoreKeys.MY_ACTIVITIES -> {
                    val tab = link.params["tab"]
                    if (!tab.isNullOrBlank()) "console/activity/$id?tab=$tab"
                    else "console/activity/$id"
                }
                CoreKeys.CLIENTS -> "console/clients/$id"
                else -> null
            }
        }
        return null
    }

    fun boardUserId(link: PendingModuleLink): Long? =
        link.params[DeepLinkParser.BOARD_USER_PARAM]?.toLongOrNull()?.takeIf { it > 0L }

    /** `?vista=mias|equipo` de /erp/pizarra; «Mis actividades» siempre abre lo propio. */
    fun actividadesVista(link: PendingModuleLink): String? {
        if (link.key !in ACTIVITY_KEYS) return null
        link.params["vista"]?.trim()?.lowercase()?.let { v ->
            if (v == "mias" || v == "equipo") return v
        }
        return if (link.key == CoreKeys.MY_ACTIVITIES) "mias" else null
    }

    fun ticketsRoute(link: PendingModuleLink): String? {
        link.entityId?.let { id ->
            return when (link.key) {
                "tickets", "client-tickets" -> "tickets/tickets/$id"
                else -> null
            }
        }
        return null
    }

    fun ticketsModuleKey(link: PendingModuleLink): String = when (link.key) {
        "client-tickets" -> "tickets"
        else -> link.key
    }

    fun chatChannelId(link: PendingModuleLink): Long? =
        link.entityId ?: link.params["channel"]?.toLongOrNull()?.takeIf { it > 0L }

    fun chatMessageId(link: PendingModuleLink): Long? =
        link.params["msg"]?.toLongOrNull()?.takeIf { it > 0L }

    private val LUNCH_TAB_VALUES = setOf("comidas", "comida", "lunch", "lunch-breaks")

    /** `comidas` para /erp/asistencias?tab=comidas. */
    fun attendanceTab(link: PendingModuleLink): String? {
        if (link.key != CoreKeys.ATTENDANCE) return null
        val tab = link.params["tab"]?.trim()?.lowercase()
        return if (tab in LUNCH_TAB_VALUES) "comidas" else null
    }
}
