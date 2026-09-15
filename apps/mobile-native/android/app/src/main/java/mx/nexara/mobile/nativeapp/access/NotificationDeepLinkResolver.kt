package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto

/**
 * Resuelve una notificación a un destino navegable en la app.
 *
 * Orden: `relatedUrl` (ver [DeepLinkParser], que ya aplica `coreSurfaceRedirect`)
 * → `entityType` + `relatedEntityId` → `category`. Solo existe NEXARA Core: lo que
 * apunte a un módulo que ya no está en la app abre la casa de Core (Actividades).
 */
object NotificationDeepLinkResolver {

    /** Resuelve payload FCM (extras `nexara_*` en el intent de MainActivity). */
    fun resolveFromPushData(data: Map<String, String>): DeepLinkDestination? {
        if (data.isEmpty() || !hasNavigationData(data)) return null

        val entityType = data["entityType"]
        val relatedEntityId = data["relatedEntityId"]?.toLongOrNull()
            ?: data["entityId"]?.toLongOrNull()
        val relatedUrl = data["relatedUrl"]?.takeIf { it.isNotBlank() }
            ?: data["url"]?.takeIf { it.isNotBlank() }
        val channelId = data["channelId"]?.toLongOrNull()
            ?: data["channel"]?.toLongOrNull()

        val notification = NotificationRowDto(
            id = data["notificationId"]?.toLongOrNull()
                ?: data["nexara_notification_id"]?.toLongOrNull()
                ?: 0L,
            entityType = entityType,
            relatedEntityId = relatedEntityId,
            relatedUrl = relatedUrl,
            category = data["category"],
        )

        var dest = resolve(notification) ?: return null

        if (dest is DeepLinkDestination.Module && dest.key == CoreKeys.CHAT) {
            val msgId = relatedEntityId?.takeIf {
                entityType?.trim()?.lowercase() == "chat_message"
            }
            val channel = channelId ?: dest.entityId ?: dest.params["channel"]?.toLongOrNull()
            if (channel != null || msgId != null) {
                dest = dest.copy(
                    entityId = channel ?: dest.entityId,
                    params = buildMap {
                        putAll(dest.params)
                        if (msgId != null) put("msg", msgId.toString())
                        if (channel != null && dest.entityId == null) put("channel", channel.toString())
                    },
                )
            }
        }

        return dest
    }

    private fun hasNavigationData(data: Map<String, String>): Boolean {
        val keys = setOf("entityType", "relatedEntityId", "entityId", "relatedUrl", "url", "category", "channelId", "channel")
        return data.keys.any { key -> key in keys && !data[key].isNullOrBlank() }
    }

    fun resolve(notification: NotificationRowDto): DeepLinkDestination? {
        val entityType = notification.entityType?.trim()?.lowercase().orEmpty()
        val entityId = notification.relatedEntityId?.takeIf { it > 0L }
        val category = notification.category?.trim()?.lowercase().orEmpty()
        val isLunch = category in LUNCH_CATEGORIES || entityType in LUNCH_ENTITY_TYPES

        notification.relatedUrl?.trim()?.takeIf { it.isNotBlank() }?.let { url ->
            DeepLinkParser.parseWebPath(url)?.let { dest ->
                // Avisos de comida con URL de Asistencias sin pestaña: se abre Comidas.
                if (isLunch && dest is DeepLinkDestination.Module && dest.key == CoreKeys.ATTENDANCE && dest.params["tab"] == null) {
                    return dest.copy(params = dest.params + ("tab" to "comidas"))
                }
                return dest
            }
        }

        if (isLunch) return attendance(comidas = true)

        // El API manda toda notificación de actividad (asignada, evidencia,
        // despacho, reprogramación, revisión) como `Activity` + id de la
        // actividad: sin URL, se abre el detalle — en Evidencias si es de evidencias.
        if (entityType in ACTIVITY_ENTITY_TYPES && entityId != null) {
            return activityDetail(entityId, tab = if (category in EVIDENCE_CATEGORIES) "evidencias" else null)
        }
        if (category in EVIDENCE_CATEGORIES && entityId != null) {
            // Las notificaciones de evidencias traen el id de la actividad.
            return activityDetail(entityId, tab = "evidencias")
        }

        if (entityType.isNotBlank()) {
            forEntityType(entityType, entityId)?.let { return it }
        }
        if (category.isNotBlank()) {
            forCategory(category)?.let { return it }
        }
        return null
    }

    private val ACTIVITY_ENTITY_TYPES = setOf("activity", "activities")
    private val LUNCH_CATEGORIES = setOf("lunch_breaks", "lunch_break", "lunch-breaks", "comidas")
    private val LUNCH_ENTITY_TYPES = setOf("lunchbreak", "lunch_break", "lunch_breaks")
    private val EVIDENCE_CATEGORIES = setOf("evidences", "evidence")
    private val CHAT_ENTITY_TYPES = setOf("chat_message", "chat_channel", "chat", "channel")
    private val TICKET_ENTITY_TYPES = setOf("ticket", "tickets", "service_sheet")

    /**
     * Tipos que apuntaban a módulos que ya no existen en la app (viáticos,
     * herramientas, vehículos, CRM, compras, almacén, proyectos, mantenimiento,
     * usuarios, multas, contabilidad): abren la casa de Core, igual que la web.
     */
    private val NON_CORE_ENTITY_TYPES = setOf(
        "evidence", "evidences", "activityevidence",
        "viatic", "viatico", "viatics",
        "tool_request", "toolrequest", "toolrenewal", "tool", "tools",
        "vehicle", "vehicles", "vehiclecontrol",
        "saleslead", "lead", "leads",
        "salesopportunity", "opportunity", "opportunities",
        "cotizacion", "quote", "quotes",
        "clientticketrequest",
        "requisition", "purchase_order", "purchaserequisition", "purchaseorder", "procurement",
        "stocklevel", "warehouse", "movement",
        "salesproject", "project", "projects",
        "maintenancecontractvisit", "maintenance",
        "user", "users", "fine", "fines", "accounting", "entry",
    )

    private val NON_CORE_CATEGORIES = setOf(
        "viatics", "tools", "fines", "vehicles", "quotes", "orders", "projects",
        "sales", "crm", "erp", "noc", "approval", "confirmations",
    )

    private fun forEntityType(entityType: String, entityId: Long?): DeepLinkDestination? = when (entityType) {
        in ACTIVITY_ENTITY_TYPES -> DeepLinkParser.CORE_HOME
        "attendance", "attendanceday" -> attendance(comidas = false)
        // relatedEntityId de `chat_message` es el mensaje; el canal viene en la URL o en el push.
        in CHAT_ENTITY_TYPES -> DeepLinkDestination.Module(
            panel = PanelId.ERP,
            key = CoreKeys.CHAT,
            entityId = if (entityType == "chat_message") null else entityId,
        )
        in TICKET_ENTITY_TYPES -> DeepLinkDestination.Module(panel = PanelId.PORTAL, key = "tickets", entityId = entityId)
        "client", "clients", "salesclient" -> DeepLinkDestination.Module(panel = PanelId.ERP, key = CoreKeys.CLIENTS, entityId = entityId)
        in NON_CORE_ENTITY_TYPES -> DeepLinkParser.CORE_HOME
        else -> null
    }

    private fun forCategory(category: String): DeepLinkDestination? = when (category) {
        "attendance" -> attendance(comidas = false)
        "activities", "evidences", "evidence" -> DeepLinkParser.CORE_HOME
        "chat" -> DeepLinkDestination.Module(panel = PanelId.ERP, key = CoreKeys.CHAT)
        "profile" -> DeepLinkDestination.Module(panel = PanelId.ERP, key = CoreKeys.MY_PROFILE)
        "tickets" -> DeepLinkDestination.Module(panel = PanelId.PORTAL, key = "tickets")
        in NON_CORE_CATEGORIES -> DeepLinkParser.CORE_HOME
        else -> null
    }

    private fun attendance(comidas: Boolean) = DeepLinkDestination.Module(
        panel = PanelId.ERP,
        key = CoreKeys.ATTENDANCE,
        params = if (comidas) mapOf("tab" to "comidas") else emptyMap(),
    )

    private fun activityDetail(activityId: Long, tab: String?) = DeepLinkDestination.Module(
        panel = PanelId.ERP,
        key = CoreKeys.ACTIVITIES,
        entityId = activityId,
        params = if (tab != null) mapOf("tab" to tab) else emptyMap(),
    )
}
