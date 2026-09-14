package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink

/** Construye rutas internas de NavHost a partir de un deep link de módulo. */
object DeepLinkNavigation {

    private val ACTIVITY_KEYS = setOf("activities", "my-activities")

    fun ventasRoute(link: PendingModuleLink): String {
        link.entityId?.let { id ->
            return when (link.key) {
                "oportunidades", "opportunities" -> "v/opportunity/$id"
                "leads" -> "v/lead/$id"
                "cotizaciones", "quotes" -> "v/quote/$id"
                "clients", "clientes" -> "v/client/$id"
                else -> "v/m/${link.key}"
            }
        }
        return "v/m/${link.key}"
    }

    /**
     * Ruta directa de consola: el día de una persona (`/erp/pizarra/:userId`)
     * o el detalle de una actividad con su pestaña (`/erp/actividades/:id/evidencias`).
     */
    fun consoleRoute(link: PendingModuleLink): String? {
        if (link.key in ACTIVITY_KEYS) {
            boardUserId(link)?.let { return "console/board/$it" }
        }
        link.entityId?.let { id ->
            return when (link.key) {
                "activities", "my-activities" -> {
                    val tab = link.params["tab"]
                    if (!tab.isNullOrBlank()) "console/activity/$id?tab=$tab"
                    else "console/activity/$id"
                }
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
        return if (link.key == "my-activities") "mias" else null
    }

    fun consoleModuleKey(link: PendingModuleLink): String = link.key

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

    fun viaticHighlightId(link: PendingModuleLink): Long? =
        link.entityId?.takeIf { link.key in VIATIC_KEYS }

    private val VIATIC_KEYS = setOf("viatics", "my-viatics")
}
