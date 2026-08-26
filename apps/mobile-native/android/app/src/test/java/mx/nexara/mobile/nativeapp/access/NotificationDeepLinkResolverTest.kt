package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import org.junit.Assert.assertEquals
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

        assertEquals(PanelId.OPS, dest.panel)
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

        assertEquals(PanelId.OPS, dest.panel)
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
