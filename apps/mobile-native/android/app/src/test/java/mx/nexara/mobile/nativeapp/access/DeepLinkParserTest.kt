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
    fun pizarraSolaAbreLaPestanaDelEquipo() {
        // Sin esto, `/erp/pizarra` y `/erp/mis-actividades` llevaban a la MISMA
        // pantalla con la MISMA pestaña: el aviso que decía «ve a la pizarra»
        // te dejaba mirando tu propia lista, y las capturas de la tienda salían
        // repetidas sin que nada avisara.
        val dest = module("/erp/pizarra")
        assertEquals("equipo", DeepLinkNavigation.actividadesVista(link(dest)))
    }

    @Test
    fun misActividadesSigueAbriendoLoTuyo() {
        val dest = module("/erp/mis-actividades")
        assertEquals("mias", DeepLinkNavigation.actividadesVista(link(dest)))
    }

    @Test
    fun laVistaPedidaAManoGanaSobreElValorDePizarra() {
        val dest = module("/erp/pizarra?vista=mias")
        assertEquals("mias", DeepLinkNavigation.actividadesVista(link(dest)))
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
            "/ops/maintenance?woId=1",
            "/ops/chat",
            // Las rutas de «operacion» no son las de «ops»: la web tampoco las lleva a un módulo.
            "/operacion/vehicles",
            "/integra/access",
            "/studio/hero",
            "/lab/flags",
            "/contabilidad/pagos",
            "/erp/dashboard",
            "/erp/hr/fines?highlight=1",
            "/panels",
        ).forEach { url ->
            assertEquals("$url debe abrir la casa de Core", DeepLinkParser.CORE_HOME, DeepLinkParser.parseWebPath(url))
        }
    }

    // ── «Más»: el resto de Core (`CoreExtraModule`) ────────────────────────

    @Test
    fun losModulosDeMasResuelvenASuClave() {
        assertEquals(CoreKeys.COTIZACIONES, module("/erp/cotizaciones").key)
        assertEquals(17L, module("/erp/cotizaciones/17").entityId)
        assertEquals(CoreKeys.PROYECTOS, module("/erp/proyectos/42").key)
        assertEquals(42L, module("/erp/proyectos/42").entityId)
        assertEquals(CoreKeys.KPIS_EQUIPO, module("/erp/asistencias/indicadores").key)
        // Asistencias a secas sigue siendo Asistencias.
        assertEquals(CoreKeys.ATTENDANCE, module("/erp/asistencias").key)
        assertEquals(CoreKeys.ALMACEN, module("/erp/almacen?productId=3").key)
        assertEquals(CoreKeys.ALMACEN, module("/erp/warehouse?movementId=9").key)
        assertEquals(CoreKeys.HERRAMIENTAS, module("/erp/almacen/herramientas?tab=requests").key)
        assertEquals(CoreKeys.VEHICULOS, module("/erp/vehiculos").key)
        assertEquals(CoreKeys.VEHICULOS, module("/erp/vehiculos/mis-vehiculos?highlight=4").key)
        assertEquals(7L, module("/erp/vehiculos/7").entityId)
        assertEquals(CoreKeys.ORGANIGRAMA, module("/erp/organigrama").key)
        assertEquals(CoreKeys.ORGANIGRAMA, module("/erp/hr/orgchart").key)
        // Viáticos vive bajo /erp/finance en la web; el id se conserva para
        // abrir el viático del aviso y no la lista.
        assertEquals(CoreKeys.VIATICOS, module("/erp/finance/viatics").key)
        assertEquals(31L, module("/erp/finance/viatics/31").entityId)
        assertEquals(CoreKeys.VIATICOS, module("/erp/viaticos").key)
        assertEquals(12L, module("/erp/viaticos/12").entityId)
    }

    /** Las rutas viejas de viáticos (`/ops` y `/finance`) abren la misma pantalla. */
    @Test
    fun lasRutasViejasDeViaticosAbrenElModulo() {
        assertEquals(CoreKeys.VIATICOS, module("/ops/viatics").key)
        assertEquals(7L, module("/ops/viatics?highlight=7").entityId)
        assertEquals(9L, module("/ops/viatics/9").entityId)
        assertEquals(CoreKeys.VIATICOS, module("/ops/my-viatics").key)
        assertEquals(CoreKeys.VIATICOS, module("/finance/viatics").key)
        assertEquals(4L, module("/finance/viatics/4").entityId)
    }

    @Test
    fun lasRutasViejasDeOpsAbrenElModuloDeCore() {
        // Espejo de `MOVED_TO_CORE` en apps/web/lib/core-surface.ts.
        assertEquals(CoreKeys.VEHICULOS, module("/ops/vehicles").key)
        assertEquals(5L, module("/ops/vehicles/5").entityId)
        assertEquals(CoreKeys.VEHICULOS, module("/ops/my-vehicles?highlight=3").key)
        assertEquals(CoreKeys.HERRAMIENTAS, module("/ops/tools?tab=requests&highlight=8").key)
        assertEquals(CoreKeys.PROYECTOS, module("/ops/projects/3").key)
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
