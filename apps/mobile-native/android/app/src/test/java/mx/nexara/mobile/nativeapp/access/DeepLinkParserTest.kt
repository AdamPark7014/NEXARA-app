package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink
import org.junit.Assert.assertEquals
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
    fun parseWebPath_legacyOpsActivityDetailLandsInErp() {
        // Core-only: no hay superficie OPS; el enlace viejo abre el detalle dentro de ERP.
        val dest = DeepLinkParser.parseWebPath("/ops/activities/501") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(501L, dest.entityId)
    }

    @Test
    fun parseWebPath_legacyOpsViaticHighlightLandsInErp() {
        val dest = DeepLinkParser.parseWebPath("/ops/viatics?highlight=7") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
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

    // ── Core (/erp) ─────────────────────────────────────────────────────────

    @Test
    fun parseWebPath_erpActividadDetalle() {
        val dest = DeepLinkParser.parseWebPath("/erp/actividades/12") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(12L, dest.entityId)
        assertNull(dest.params["tab"])
        assertEquals("console/activity/12", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun parseWebPath_erpActividadEvidencias() {
        val dest = DeepLinkParser.parseWebPath("/erp/actividades/12/evidencias") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(12L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
        assertEquals("console/activity/12?tab=evidencias", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun parseWebPath_erpActividadHistorial() {
        val dest = DeepLinkParser.parseWebPath("/erp/actividades/12/historial") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals(12L, dest.entityId)
        assertEquals("historial", dest.params["tab"])
    }

    @Test
    fun parseWebPath_legacyOpsActivityEvidencesKeepsTheTab() {
        val dest = DeepLinkParser.parseWebPath("/ops/activities/7/evidences") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(7L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
    }

    @Test
    fun parseWebPath_legacyMyEvidencesWithActivityIdOpensTheEvidencesTab() {
        // coreSurfaceRedirect: /ops/my-evidences?activityId=N → /erp/actividades/N/evidencias
        val dest = DeepLinkParser.parseWebPath("/ops/my-evidences?activityId=9") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(9L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
        assertNull("activityId no debe viajar como parámetro suelto", dest.params["activityid"])
    }

    @Test
    fun parseWebPath_legacyActivitiesWithActivityIdOpensTheDetail() {
        val dest = DeepLinkParser.parseWebPath("/ops/activities?activityId=4") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(4L, dest.entityId)
        assertNull(dest.params["tab"])
    }

    @Test
    fun parseWebPath_pizarraWithVista() {
        val dest = DeepLinkParser.parseWebPath("/erp/pizarra?vista=equipo") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertNull(dest.entityId)
        assertEquals("equipo", DeepLinkNavigation.actividadesVista(link(dest)))
        assertNull(DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun parseWebPath_pizarraPersonOpensTheirDay() {
        val dest = DeepLinkParser.parseWebPath("/erp/pizarra/33") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals("console/board/33", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun parseWebPath_legacyMyActivitiesOpensMine() {
        val dest = DeepLinkParser.parseWebPath("/ops/my-activities") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("my-activities", dest.key)
        assertEquals("mias", DeepLinkNavigation.actividadesVista(link(dest)))
    }

    @Test
    fun parseWebPath_erpAsistencias() {
        val dest = DeepLinkParser.parseWebPath("/erp/asistencias") as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("attendance", dest.key)
    }

    @Test
    fun parseWebPath_noOpsPanelSurvives() {
        listOf(
            "/ops/activities/1",
            "/ops/my-evidences?activityId=1",
            "/ops/support/1",
            "/ops/tools?highlight=2",
            "/operacion/vehicles",
            "/ops/dashboard",
        ).forEach { url ->
            val dest = DeepLinkParser.parseWebPath(url) as DeepLinkDestination.Module
            assertEquals("$url debe abrir en ERP", PanelId.ERP, dest.panel)
        }
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
        val route = DeepLinkNavigation.ventasRoute(PendingModuleLink("oportunidades", 33L))
        assertEquals("v/opportunity/33", route)
    }

    @Test
    fun deepLinkNavigation_buildsVentasClientRoute() {
        assertEquals(
            "v/client/12",
            DeepLinkNavigation.ventasRoute(PendingModuleLink("clients", 12L)),
        )
    }

    @Test
    fun deepLinkNavigation_buildsConsoleAndTicketsRoutes() {
        assertEquals(
            "console/activity/8",
            DeepLinkNavigation.consoleRoute(PendingModuleLink("activities", 8L)),
        )
        assertEquals(
            "tickets/tickets/4",
            DeepLinkNavigation.ticketsRoute(PendingModuleLink("tickets", 4L)),
        )
    }

    @Test
    fun parseWebPath_blankReturnsNull() {
        assertNull(DeepLinkParser.parseWebPath(""))
        assertNull(DeepLinkParser.parseWebPath("   "))
    }

    @Test
    fun pendingDeepLink_foldsOpsIntoErp() {
        mx.nexara.mobile.nativeapp.navigation.PendingDeepLink.publish(
            DeepLinkDestination.Module(panel = PanelId.OPS, key = "activities", entityId = 5L),
        )
        val consumed = mx.nexara.mobile.nativeapp.navigation.PendingDeepLink.consumeModuleDestination(PanelId.ERP)
        assertEquals("activities", consumed?.key)
        assertEquals(5L, consumed?.entityId)
    }

    private fun link(dest: DeepLinkDestination.Module) =
        PendingModuleLink(key = dest.key, entityId = dest.entityId, params = dest.params)

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
