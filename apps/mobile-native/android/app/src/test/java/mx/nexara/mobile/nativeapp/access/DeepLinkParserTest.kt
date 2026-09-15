package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepLinkParserTest {

    private fun module(path: String) = DeepLinkParser.parseWebPath(path) as DeepLinkDestination.Module

    private fun link(dest: DeepLinkDestination.Module) =
        PendingModuleLink(key = dest.key, entityId = dest.entityId, params = dest.params)

    // ── Core (/erp) se conserva ────────────────────────────────────────────

    @Test
    fun erpActividadDetalle() {
        val dest = module("/erp/actividades/12")
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(12L, dest.entityId)
        assertNull(dest.params["tab"])
        assertEquals("console/activity/12", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun erpActividadEvidenciasEHistorial() {
        val ev = module("/erp/actividades/12/evidencias")
        assertEquals(12L, ev.entityId)
        assertEquals("evidencias", ev.params["tab"])
        assertEquals("console/activity/12?tab=evidencias", DeepLinkNavigation.consoleRoute(link(ev)))

        val hist = module("/erp/actividades/12/historial")
        assertEquals(12L, hist.entityId)
        assertEquals("historial", hist.params["tab"])
    }

    @Test
    fun pizarraWithVista() {
        val dest = module("/erp/pizarra?vista=equipo")
        assertEquals("activities", dest.key)
        assertNull(dest.entityId)
        assertEquals("equipo", DeepLinkNavigation.actividadesVista(link(dest)))
        assertNull(DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun pizarraPersonOpensTheirDay() {
        val dest = module("/erp/pizarra/33")
        assertEquals("activities", dest.key)
        assertEquals("console/board/33", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun misActividadesOpensMine() {
        val dest = module("/erp/mis-actividades")
        assertEquals("my-activities", dest.key)
        assertEquals("mias", DeepLinkNavigation.actividadesVista(link(dest)))
    }

    @Test
    fun asistenciasAndComidas() {
        assertEquals("attendance", module("/erp/asistencias").key)
        val comidas = module("/erp/asistencias?tab=comidas")
        assertEquals("attendance", comidas.key)
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(comidas)))
        assertNull(DeepLinkNavigation.attendanceTab(PendingModuleLink("attendance")))
    }

    @Test
    fun chatChannelAndMessage() {
        val dest = module("/erp/chat?channel=3&msg=88")
        assertEquals("chat", dest.key)
        assertEquals(3L, dest.entityId)
        assertEquals("88", dest.params["msg"])
        assertEquals(3L, DeepLinkNavigation.chatChannelId(link(dest)))
        assertEquals(88L, DeepLinkNavigation.chatMessageId(link(dest)))
    }

    @Test
    fun miPerfilYClientes() {
        assertEquals("my-profile", module("/erp/my-profile").key)
        assertEquals("erp-clients", module("/erp/clientes").key)
        val detalle = module("/erp/clientes/7")
        assertEquals("erp-clients", detalle.key)
        assertEquals(7L, detalle.entityId)
    }

    @Test
    fun notificationsCenter() {
        assertTrue(DeepLinkParser.parseWebPath("/erp/notifications-center") is DeepLinkDestination.Notifications)
    }

    // ── Fuera de Core → casa (coreSurfaceRedirect) ─────────────────────────

    @Test
    fun legacyOpsActivityKeepsTheId() {
        val dest = module("/ops/activities/501")
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("activities", dest.key)
        assertEquals(501L, dest.entityId)

        val ev = module("/ops/activities/7/evidences")
        assertEquals(7L, ev.entityId)
        assertEquals("evidencias", ev.params["tab"])
    }

    @Test
    fun legacyEvidenceListsWithActivityIdOpenTheDetail() {
        val ev = module("/ops/my-evidences?activityId=9")
        assertEquals("activities", ev.key)
        assertEquals(9L, ev.entityId)
        assertEquals("evidencias", ev.params["tab"])
        assertNull("activityId no viaja suelto", ev.params["activityid"])

        val act = module("/ops/activities?activityId=4")
        assertEquals(4L, act.entityId)
        assertNull(act.params["tab"])
    }

    @Test
    fun legacyMyActivitiesAndProfile() {
        assertEquals("my-activities", module("/ops/my-activities").key)
        assertEquals("my-profile", module("/console/my-profile").key)
        assertEquals("my-profile", module("/crm/my-profile").key)
    }

    @Test
    fun everythingElseLandsInCoreHome() {
        listOf(
            "/crm/opportunities/42",
            "/crm/leads?highlight=15",
            "/ventas/smart-quote",
            "/ops/viatics?highlight=7",
            "/ops/projects/3",
            "/ops/maintenance?woId=1",
            "/ops/vehicles",
            "/ops/chat",
            "/operacion/vehicles",
            "/integra/access",
            "/studio/hero",
            "/lab/flags",
            "/contabilidad/pagos",
            "/erp/dashboard",
            "/erp/hr/fines?highlight=1",
            "/erp/finance/viatics",
            "/panels",
        ).forEach { url ->
            assertEquals("$url debe abrir la casa de Core", DeepLinkParser.CORE_HOME, DeepLinkParser.parseWebPath(url))
        }
    }

    @Test
    fun oldAttendanceUrlsOpenAsistencias() {
        assertEquals("attendance", module("/erp/hr/attendance?tab=day&highlight=1").key)
        val lunch = module("/erp/hr/lunch-breaks")
        assertEquals("attendance", lunch.key)
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(lunch)))
    }

    // ── Portal ─────────────────────────────────────────────────────────────

    @Test
    fun portalTicket() {
        val dest = module("/portal/tickets/12")
        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals("tickets", dest.key)
        assertEquals(12L, dest.entityId)
        assertEquals("tickets/tickets/12", DeepLinkNavigation.ticketsRoute(link(dest)))

        val home = module("/tickets")
        assertEquals(PanelId.PORTAL, home.panel)
        assertEquals("portal", home.key)
    }

    @Test
    fun blankReturnsNull() {
        assertNull(DeepLinkParser.parseWebPath(""))
        assertNull(DeepLinkParser.parseWebPath("   "))
    }

    @Test
    fun pendingDeepLinkIsConsumedOnce() {
        PendingDeepLink.publish(DeepLinkDestination.Module(panel = PanelId.ERP, key = "activities", entityId = 5L))
        assertNull(PendingDeepLink.consumeModuleDestination(PanelId.PORTAL))
        val consumed = PendingDeepLink.consume() as DeepLinkDestination.Module
        assertEquals(5L, consumed.entityId)
        assertNull(PendingDeepLink.consume())
    }
}
