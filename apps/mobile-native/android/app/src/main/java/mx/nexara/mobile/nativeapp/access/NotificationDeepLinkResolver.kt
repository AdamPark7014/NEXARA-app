package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto

/**
 * Resuelve una notificación a un destino navegable en la app móvil.
 *
 * Orden: `relatedUrl` (nuevo `/erp/...` o legado `/ops/...`, ver [DeepLinkParser])
 * → `entityType` + `relatedEntityId` → `category`. En Core todo lo operativo
 * aterriza en ERP: no existe una superficie OPS.
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

        if (dest is DeepLinkDestination.Module && dest.key == "chat") {
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
        notification.relatedUrl?.trim()?.takeIf { it.isNotBlank() }?.let { url ->
            DeepLinkParser.parseWebPath(url)?.let { return it }
        }

        val entityType = notification.entityType?.trim()?.lowercase().orEmpty()
        val entityId = notification.relatedEntityId?.takeIf { it > 0L }
        val category = notification.category?.trim()?.lowercase().orEmpty()

        // El API manda toda notificación de actividad (asignada, evidencia,
        // despacho, reprogramación, revisión) como `Activity` + id de la
        // actividad: sin URL, se abre el detalle — en Evidencias si es de evidencias.
        if (entityType in ACTIVITY_ENTITY_TYPES && entityId != null) {
            return activityDetail(entityId, tab = if (category in EVIDENCE_CATEGORIES) "evidencias" else null)
        }

        if (entityType.isNotBlank()) {
            moduleForEntityType(entityType, entityId)?.let { return it }
        }

        if (category.isNotBlank()) {
            moduleForCategory(category, entityId)?.let { return it }
        }

        return null
    }

    private val ACTIVITY_ENTITY_TYPES = setOf("activity", "activities")
    private val EVIDENCE_CATEGORIES = setOf("evidences", "evidence")

    private fun activityDetail(activityId: Long, tab: String?) = DeepLinkDestination.Module(
        panel = PanelId.ERP,
        key = "activities",
        entityId = activityId,
        params = if (tab != null) mapOf("tab" to tab) else emptyMap(),
    )

    private fun moduleForEntityType(
        entityType: String,
        entityId: Long?,
    ): DeepLinkDestination.Module? {
        val (panel, key) = when (entityType) {
            "activity", "activities" -> PanelId.ERP to "activities"
            "evidence", "evidences", "activityevidence" -> PanelId.ERP to "evidences"
            "viatic", "viatico", "viatics" -> PanelId.ERP to "viatics"
            "tool_request", "toolrequest", "toolrenewal", "tool", "tools" -> PanelId.ERP to "tools"
            "vehicle", "vehicles", "vehiclecontrol" -> PanelId.ERP to "vehicles"
            "attendance", "lunch_break" -> PanelId.ERP to "attendance"
            "saleslead", "lead", "leads" -> PanelId.CRM to "leads"
            "salesopportunity", "opportunity", "opportunities" -> PanelId.CRM to "oportunidades"
            "client", "clients", "salesclient" -> PanelId.CRM to "clients"
            "cotizacion", "quote", "quotes" -> PanelId.CRM to "cotizaciones"
            "ticket", "tickets", "service_sheet" -> PanelId.PORTAL to "tickets"
            "clientticketrequest" -> PanelId.ERP to "client-tickets"
            "chat_message", "chat_channel", "chat", "channel" -> PanelId.ERP to "chat"
            "requisition", "purchase_order", "purchaserequisition", "purchaseorder", "procurement" ->
                PanelId.ERP to "procurement"
            "stocklevel", "warehouse", "movement" -> PanelId.ERP to "warehouse"
            "salesproject", "project", "projects" -> PanelId.ERP to "projects"
            "maintenancecontractvisit", "maintenance" -> PanelId.ERP to "maintenance-contracts"
            "user", "users" -> PanelId.ERP to "users"
            "fine", "fines" -> PanelId.ERP to "fines"
            "accounting", "entry" -> PanelId.ERP to "accounting"
            else -> return null
        }

        val resolvedEntityId = when (entityType) {
            // relatedEntityId es messageId; el canal viene en relatedUrl.
            "chat_message" -> null
            else -> entityId
        }

        return DeepLinkDestination.Module(
            panel = panel,
            key = key,
            entityId = resolvedEntityId,
        )
    }

    private fun moduleForCategory(
        category: String,
        entityId: Long?,
    ): DeepLinkDestination.Module? {
        if (category in EVIDENCE_CATEGORIES && entityId != null) {
            // Las notificaciones de evidencias traen el id de la actividad.
            return activityDetail(entityId, tab = "evidencias")
        }
        val (panel, key) = when (category) {
            "attendance", "lunch_breaks" -> PanelId.ERP to "attendance"
            "activities" -> PanelId.ERP to "activities"
            "evidences" -> PanelId.ERP to "evidences"
            "viatics" -> PanelId.ERP to "viatics"
            "tools" -> PanelId.ERP to "tools"
            "fines" -> PanelId.ERP to "fines"
            "profile" -> PanelId.ERP to "my-profile"
            "vehicles" -> PanelId.ERP to "vehicles"
            "quotes" -> PanelId.CRM to "cotizaciones"
            "orders" -> PanelId.ERP to "procurement"
            "projects" -> PanelId.ERP to "projects"
            "sales", "crm" -> PanelId.CRM to "dashboard"
            "erp" -> PanelId.ERP to "dashboard"
            "noc" -> PanelId.ERP to "noc"
            "chat" -> PanelId.ERP to "chat"
            "approval", "confirmations" -> PanelId.ERP to "approvals"
            "tickets" -> PanelId.PORTAL to "tickets"
            else -> return null
        }

        return DeepLinkDestination.Module(
            panel = panel,
            key = key,
            entityId = entityId,
        )
    }
}
