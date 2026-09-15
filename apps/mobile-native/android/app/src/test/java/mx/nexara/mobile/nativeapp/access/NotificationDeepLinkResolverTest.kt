package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationDeepLinkResolverTest {

    @Test
    fun resolveFromPushData_ticket() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf(
                "entityType" to "ticket",
                "relatedEntityId" to "22",
            ),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals("tickets", dest.key)
        assertEquals(22L, dest.entityId)
    }

    @Test
    fun resolveFromPushData_chatMessage_withChannelId() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf(
                "entityType" to "chat_message",
                "relatedEntityId" to "55",
                "channelId" to "9",
            ),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("chat", dest.key)
        assertEquals(9L, dest.entityId)
        assertEquals("55", dest.params["msg"])
    }

    @Test
    fun resolveFromPushData_urlOnly() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("url" to "/portal/tickets/4"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals("tickets", dest.key)
        assertEquals(4L, dest.entityId)
    }

    @Test
    fun resolveFromPushData_titleBodyOnly_returnsNull() {
        assertNull(
            NotificationDeepLinkResolver.resolveFromPushData(
                mapOf("title" to "Hola", "body" to "Mundo"),
            ),
        )
    }

    @Test
    fun resolve_prefersRelatedUrlOverEntityType() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(
                entityType = "SalesOpportunity",
                relatedEntityId = 10L,
                relatedUrl = "/ops/activities/501",
            ),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(501L, dest.entityId)
    }

    @Test
    fun resolve_entityType_ticket() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "ticket", relatedEntityId = 22L),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals("tickets", dest.key)
        assertEquals(22L, dest.entityId)
    }

    @Test
    fun resolve_entityType_chatMessage_stripsEntityId() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "chat_message", relatedEntityId = 99L),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("chat", dest.key)
        assertNull(dest.entityId)
    }

    @Test
    fun resolve_category_approvals() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(category = "approval", relatedEntityId = 5L),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("approvals", dest.key)
        assertEquals(5L, dest.entityId)
    }

    @Test
    fun resolve_category_crmDashboard() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(category = "crm"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.CRM, dest.panel)
        assertEquals("dashboard", dest.key)
        assertNull(dest.entityId)
    }

    @Test
    fun resolve_unknownEntityAndCategory_returnsNull() {
        assertNull(
            NotificationDeepLinkResolver.resolve(
                notification(entityType = "unknown_widget", category = "misc"),
            ),
        )
    }

    @Test
    fun resolve_blankRelatedUrl_fallsBackToEntityType() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(
                entityType = "quote",
                relatedEntityId = 77L,
                relatedUrl = "   ",
            ),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.CRM, dest.panel)
        assertEquals("cotizaciones", dest.key)
        assertEquals(77L, dest.entityId)
    }

    @Test
    fun resolve_entityType_caseInsensitive() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "  Viatic  ", relatedEntityId = 3L),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("viatics", dest.key)
        assertEquals(3L, dest.entityId)
    }

    @Test
    fun resolve_relatedUrl_notificationsCenter() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(relatedUrl = "/erp/notifications-center"),
        )
        assertTrue(dest is DeepLinkDestination.Notifications)
    }

    // ── Core (/erp) ─────────────────────────────────────────────────────────

    @Test
    fun resolveFromPushData_erpEvidenceUrl_opensTheEvidencesTab() {
        // Lo que manda notification-hierarchy.service.ts al terminar el equipo.
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf(
                "url" to "/erp/actividades/88/evidencias",
                "entityType" to "Activity",
                "relatedEntityId" to "88",
                "category" to "evidences",
                "channel" to "ops",
            ),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(88L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
        assertEquals("console/activity/88?tab=evidencias", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun resolveFromPushData_erpHistorialUrl_opensTheHistoryTab() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("url" to "/erp/actividades/14/historial", "category" to "activities"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals(14L, dest.entityId)
        assertEquals("historial", dest.params["tab"])
    }

    @Test
    fun resolveFromPushData_legacyMyEvidencesUrl() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("url" to "/ops/my-evidences?activityId=5", "category" to "evidences"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(5L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
    }

    @Test
    fun resolve_activityEntityWithoutUrl_opensTheDetail() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "Activity", relatedEntityId = 42L, category = "activities"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(42L, dest.entityId)
        assertNull(dest.params["tab"])
    }

    @Test
    fun resolve_activityEntityWithEvidenceCategory_opensTheEvidencesTab() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "Activity", relatedEntityId = 42L, category = "evidences"),
        ) as DeepLinkDestination.Module

        assertEquals(42L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
    }

    @Test
    fun resolve_attendanceUrl() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(relatedUrl = "/erp/asistencias", category = "attendance"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("attendance", dest.key)
    }

    @Test
    fun resolve_attendanceCategoryOnly() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(category = "attendance"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("attendance", dest.key)
    }

    @Test
    fun resolve_operationalNotificationsNeverLandInOps() {
        val entityTypes = listOf(
            "Activity", "Viatico", "ToolRequest", "ToolRenewal", "VehicleControl",
            "SalesProject", "MaintenanceContractVisit", "evidence",
        )
        entityTypes.forEach { type ->
            val dest = NotificationDeepLinkResolver.resolve(
                notification(entityType = type, relatedEntityId = 1L),
            ) as DeepLinkDestination.Module
            assertNotEquals("$type no debe abrir OPS", PanelId.OPS, dest.panel)
        }
        listOf("activities", "evidences", "viatics", "tools", "vehicles", "projects", "noc").forEach { category ->
            val dest = NotificationDeepLinkResolver.resolve(
                notification(category = category),
            ) as DeepLinkDestination.Module
            assertNotEquals("categoría $category no debe abrir OPS", PanelId.OPS, dest.panel)
        }
    }

    // ── Hora de comida ──────────────────────────────────────────────────────

    @Test
    fun resolveFromPushData_lunchUrlOpensComidas() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("url" to "/erp/asistencias?tab=comidas", "category" to "lunch_breaks", "relatedEntityId" to "31"),
        ) as DeepLinkDestination.Module

        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("attendance", dest.key)
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(dest)))
    }

    @Test
    fun resolve_lunchCategoryWithoutTabStillOpensComidas() {
        val withUrl = NotificationDeepLinkResolver.resolve(
            notification(relatedUrl = "/erp/asistencias", category = "lunch_breaks"),
        ) as DeepLinkDestination.Module
        assertEquals("attendance", withUrl.key)
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(withUrl)))

        val categoryOnly = NotificationDeepLinkResolver.resolve(
            notification(category = "lunch_breaks", relatedEntityId = 9L),
        ) as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, categoryOnly.panel)
        assertEquals("attendance", categoryOnly.key)
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(categoryOnly)))
    }

    @Test
    fun resolve_plainAttendanceStaysOnTheAttendanceTab() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(relatedUrl = "/erp/asistencias", category = "attendance"),
        ) as DeepLinkDestination.Module
        assertEquals("attendance", dest.key)
        assertNull(DeepLinkNavigation.attendanceTab(link(dest)))
    }

    private fun link(dest: DeepLinkDestination.Module) =
        PendingModuleLink(key = dest.key, entityId = dest.entityId, params = dest.params)

    private fun notification(
        entityType: String? = null,
        relatedEntityId: Long? = null,
        relatedUrl: String? = null,
        category: String? = null,
    ) = NotificationRowDto(
        id = 1L,
        entityType = entityType,
        relatedEntityId = relatedEntityId,
        relatedUrl = relatedUrl,
        category = category,
    )
}
