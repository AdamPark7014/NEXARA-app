package mx.nexara.mobile.nativeapp.access

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepLinkParserTest {

    @Test
    fun parseWebPath_opportunityDetail() {
        val dest = DeepLinkParser.parseWebPath("/crm/opportunities/42") as DeepLinkDestination.Module
        assertEquals(PanelId.CRM, dest.panel)
        assertEquals("oportunidades", dest.key)
        assertEquals(42L, dest.entityId)
    }

    @Test
    fun parseWebPath_leadWithHighlight() {
        val dest = DeepLinkParser.parseWebPath("/crm/leads?highlight=15") as DeepLinkDestination.Module
        assertEquals(PanelId.CRM, dest.panel)
        assertEquals("leads", dest.key)
        assertEquals(15L, dest.entityId)
    }

    @Test
    fun parseWebPath_quoteDetail() {
        val dest = DeepLinkParser.parseWebPath("/crm/quotes/99") as DeepLinkDestination.Module
        assertEquals(PanelId.CRM, dest.panel)
        assertEquals("cotizaciones", dest.key)
        assertEquals(99L, dest.entityId)
    }

    @Test
    fun parseWebPath_activityDetail() {
        val dest = DeepLinkParser.parseWebPath("/ops/activities/501") as DeepLinkDestination.Module
        assertEquals(PanelId.OPS, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(501L, dest.entityId)
    }

    @Test
    fun parseWebPath_viaticHighlight() {
        val dest = DeepLinkParser.parseWebPath("/ops/viatics?highlight=7") as DeepLinkDestination.Module
        assertEquals(PanelId.OPS, dest.panel)
        assertEquals("viatics", dest.key)
        assertEquals(7L, dest.entityId)
    }

    @Test
    fun parseWebPath_chatChannel() {
        val dest = DeepLinkParser.parseWebPath("/erp/chat?channel=3&msg=88") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("chat", dest.key)
        assertEquals(3L, dest.entityId)
        assertEquals("88", dest.params["msg"])
    }

    @Test
    fun parseWebPath_portalTicket() {
        val dest = DeepLinkParser.parseWebPath("/portal/tickets/12") as DeepLinkDestination.Module
        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals("tickets", dest.key)
        assertEquals(12L, dest.entityId)
    }

    @Test
    fun parseWebPath_notificationsCenter() {
        val dest = DeepLinkParser.parseWebPath("/erp/notifications-center")
        assertTrue(dest is DeepLinkDestination.Notifications)
    }

    @Test
    fun parseWebPath_smartQuote() {
        val dest = DeepLinkParser.parseWebPath("/ventas/smart-quote") as DeepLinkDestination.Module
        assertEquals(PanelId.CRM, dest.panel)
        assertEquals("smart-quote", dest.key)
    }

    @Test
    fun parseWebPath_panelHub() {
        val dest = DeepLinkParser.parseWebPath("/panels")
        assertTrue(dest is DeepLinkDestination.PanelHub)
    }

    @Test
    fun notificationResolver_mapsEntityTypes() {
        val opp = NotificationDeepLinkResolver.resolve(
            notification(
                entityType = "SalesOpportunity",
                relatedEntityId = 10L,
            ),
        ) as DeepLinkDestination.Module
        assertEquals(PanelId.CRM, opp.panel)
        assertEquals("oportunidades", opp.key)
        assertEquals(10L, opp.entityId)

        val chat = NotificationDeepLinkResolver.resolve(
            notification(
                entityType = "chat_message",
                relatedEntityId = 55L,
                relatedUrl = "/erp/chat?channel=9&msg=55",
            ),
        ) as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, chat.panel)
        assertEquals("chat", chat.key)
        assertEquals(9L, chat.entityId)
        assertEquals("55", chat.params["msg"])
    }

    @Test
    fun deepLinkNavigation_buildsVentasRoutes() {
        val route = DeepLinkNavigation.ventasRoute(
            mx.nexara.mobile.nativeapp.navigation.PendingModuleLink("oportunidades", 33L),
        )
        assertEquals("v/opportunity/33", route)
    }

    @Test
    fun deepLinkNavigation_buildsVentasClientRoute() {
        assertEquals(
            "v/client/12",
            DeepLinkNavigation.ventasRoute(
                mx.nexara.mobile.nativeapp.navigation.PendingModuleLink("clients", 12L),
            ),
        )
    }

    @Test
    fun deepLinkNavigation_buildsConsoleAndTicketsRoutes() {
        assertEquals(
            "console/activity/8",
            DeepLinkNavigation.consoleRoute(
                mx.nexara.mobile.nativeapp.navigation.PendingModuleLink("activities", 8L),
            ),
        )
        assertEquals(
            "tickets/tickets/4",
            DeepLinkNavigation.ticketsRoute(
                mx.nexara.mobile.nativeapp.navigation.PendingModuleLink("tickets", 4L),
            ),
        )
    }

    @Test
    fun parseWebPath_blankReturnsNull() {
        assertNull(DeepLinkParser.parseWebPath(""))
        assertNull(DeepLinkParser.parseWebPath("   "))
    }

    private fun notification(
        entityType: String? = null,
        relatedEntityId: Long? = null,
        relatedUrl: String? = null,
        category: String? = null,
    ) = mx.nexara.mobile.nativeapp.data.api.NotificationRowDto(
        id = 1L,
        entityType = entityType,
        relatedEntityId = relatedEntityId,
        relatedUrl = relatedUrl,
        category = category,
    )
}
