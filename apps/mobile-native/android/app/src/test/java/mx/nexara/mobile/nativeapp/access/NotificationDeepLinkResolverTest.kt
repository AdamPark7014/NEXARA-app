package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationDeepLinkResolverTest {

    private val coreKeys = setOf("activities", "my-activities", "attendance", "chat", "my-profile", "erp-clients")

    @Test
    fun pushTicketGoesToThePortal() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("entityType" to "ticket", "relatedEntityId" to "22"),
        ) as DeepLinkDestination.Module
        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals("tickets", dest.key)
        assertEquals(22L, dest.entityId)
    }

    @Test
    fun pushChatMessageWithChannel() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("entityType" to "chat_message", "relatedEntityId" to "55", "channelId" to "9"),
        ) as DeepLinkDestination.Module
        assertEquals(PanelId.ERP, dest.panel)
        assertEquals("chat", dest.key)
        assertEquals(9L, dest.entityId)
        assertEquals("55", dest.params["msg"])
    }

    @Test
    fun pushUrlOnly() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(mapOf("url" to "/portal/tickets/4")) as DeepLinkDestination.Module
        assertEquals(PanelId.PORTAL, dest.panel)
        assertEquals(4L, dest.entityId)
    }

    @Test
    fun pushWithoutNavigationDataIsIgnored() {
        assertNull(NotificationDeepLinkResolver.resolveFromPushData(mapOf("title" to "Hola", "body" to "Mundo")))
    }

    @Test
    fun relatedUrlWinsOverEntityType() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "SalesOpportunity", relatedEntityId = 10L, relatedUrl = "/ops/activities/501"),
        ) as DeepLinkDestination.Module
        assertEquals("activities", dest.key)
        assertEquals(501L, dest.entityId)
    }

    @Test
    fun chatMessageEntityStripsTheMessageId() {
        val dest = NotificationDeepLinkResolver.resolve(
            notification(entityType = "chat_message", relatedEntityId = 99L),
        ) as DeepLinkDestination.Module
        assertEquals("chat", dest.key)
        assertNull(dest.entityId)
    }

    @Test
    fun notificationsCenterUrl() {
        assertTrue(
            NotificationDeepLinkResolver.resolve(notification(relatedUrl = "/erp/notifications-center"))
                is DeepLinkDestination.Notifications,
        )
    }

    @Test
    fun unknownEntityAndCategoryReturnNull() {
        assertNull(NotificationDeepLinkResolver.resolve(notification(entityType = "unknown_widget", category = "misc")))
    }

    // ── Actividades ─────────────────────────────────────────────────────────

    @Test
    fun erpEvidenceUrlOpensTheEvidencesTab() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf(
                "url" to "/erp/actividades/88/evidencias",
                "entityType" to "Activity",
                "relatedEntityId" to "88",
                "category" to "evidences",
                "channel" to "ops",
            ),
        ) as DeepLinkDestination.Module
        assertEquals(88L, dest.entityId)
        assertEquals("evidencias", dest.params["tab"])
        assertEquals("console/activity/88?tab=evidencias", DeepLinkNavigation.consoleRoute(link(dest)))
    }

    @Test
    fun erpHistorialUrl() {
        val dest = NotificationDeepLinkResolver.resolveFromPushData(
            mapOf("url" to "/erp/actividades/14/historial", "category" to "activities"),
        ) as DeepLinkDestination.Module
        assertEquals(14L, dest.entityId)
        assertEquals("historial", dest.params["tab"])
    }

    @Test
    fun activityEntityWithoutUrlOpensTheDetail() {
        val plain = NotificationDeepLinkResolver.resolve(
            notification(entityType = "Activity", relatedEntityId = 42L, category = "activities"),
        ) as DeepLinkDestination.Module
        assertEquals(42L, plain.entityId)
        assertNull(plain.params["tab"])

        val evidences = NotificationDeepLinkResolver.resolve(
            notification(entityType = "Activity", relatedEntityId = 42L, category = "evidences"),
        ) as DeepLinkDestination.Module
        assertEquals("evidencias", evidences.params["tab"])
    }

    // ── Asistencias y comidas ───────────────────────────────────────────────

    @Test
    fun attendanceByUrlAndByCategory() {
        assertEquals("attendance", (NotificationDeepLinkResolver.resolve(notification(relatedUrl = "/erp/asistencias", category = "attendance")) as DeepLinkDestination.Module).key)
        val byCategory = NotificationDeepLinkResolver.resolve(notification(category = "attendance")) as DeepLinkDestination.Module
        assertEquals("attendance", byCategory.key)
        assertNull(DeepLinkNavigation.attendanceTab(link(byCategory)))
    }

    @Test
    fun lunchNotificationsOpenComidas() {
        val withUrl = NotificationDeepLinkResolver.resolve(
            notification(relatedUrl = "/erp/asistencias", category = "lunch_breaks"),
        ) as DeepLinkDestination.Module
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(withUrl)))

        val categoryOnly = NotificationDeepLinkResolver.resolve(
            notification(category = "lunch_breaks", relatedEntityId = 9L),
        ) as DeepLinkDestination.Module
        assertEquals("attendance", categoryOnly.key)
        assertEquals("comidas", DeepLinkNavigation.attendanceTab(link(categoryOnly)))
    }

    // ── Lo que ya no existe en la app ───────────────────────────────────────

    @Test
    fun nonCoreNotificationsOpenCoreHome() {
        listOf(
            "ToolRequest", "ToolRenewal",
            "MaintenanceContractVisit", "evidence", "SalesOpportunity", "quote", "requisition", "fine",
        ).forEach { type ->
            assertEquals(
                "$type debe abrir la casa de Core",
                DeepLinkParser.CORE_HOME,
                NotificationDeepLinkResolver.resolve(notification(entityType = type, relatedEntityId = 1L)),
            )
        }
        listOf("tools", "noc", "crm", "approval", "quotes").forEach { category ->
            assertEquals(
                "categoría $category debe abrir la casa de Core",
                DeepLinkParser.CORE_HOME,
                NotificationDeepLinkResolver.resolve(notification(category = category)),
            )
        }
    }

    // ── Módulos de «Más» que ya tienen pantalla ─────────────────────────────

    /**
     * Lo que estrenó pantalla deja de caer en Actividades. Es el fallo que
     * volvía inútil un aviso: te avisaban de un proyecto retrasado, tocabas, y
     * aterrizabas en la pizarra sin saber de qué te hablaban.
     */
    @Test
    fun entityTypesWithAScreenOpenTheirModule() {
        mapOf(
            "SalesProject" to CoreKeys.PROYECTOS,
            "project" to CoreKeys.PROYECTOS,
            "OperationalProject" to CoreKeys.PROYECTOS,
            "StockLevel" to CoreKeys.ALMACEN,
            "warehouse" to CoreKeys.ALMACEN,
            "movement" to CoreKeys.ALMACEN,
            "VehicleControl" to CoreKeys.VEHICULOS,
            // El aviso de viático trae el id del viático: con él, `ConsoleNavHost`
            // abre ESE viático y no la lista. Antes caía en la pizarra.
            "Viatico" to CoreKeys.VIATICOS,
            "viatic" to CoreKeys.VIATICOS,
            "viatics" to CoreKeys.VIATICOS,
        ).forEach { (type, key) ->
            val dest = NotificationDeepLinkResolver.resolve(
                notification(entityType = type, relatedEntityId = 7L),
            ) as DeepLinkDestination.Module
            assertEquals("$type debe abrir su módulo", key, dest.key)
            assertEquals(PanelId.ERP, dest.panel)
            assertEquals(7L, dest.entityId)
        }
    }

    @Test
    fun categoriesWithAScreenOpenTheirModule() {
        mapOf(
            "projects" to CoreKeys.PROYECTOS,
            "vehicles" to CoreKeys.VEHICULOS,
            "warehouse" to CoreKeys.ALMACEN,
            "kpis" to CoreKeys.KPIS_EQUIPO,
            "viatics" to CoreKeys.VIATICOS,
        ).forEach { (category, key) ->
            val dest = NotificationDeepLinkResolver.resolve(
                notification(category = category),
            ) as DeepLinkDestination.Module
            assertEquals("categoría $category debe abrir su módulo", key, dest.key)
        }
    }

    /**
     * El organigrama NO es el destino de un aviso de usuario: una cuenta
     * bloqueada o un alta no son «quién reporta a quién».
     */
    @Test
    fun userNotificationsStillOpenCoreHome() {
        listOf("user", "users").forEach { type ->
            assertEquals(
                DeepLinkParser.CORE_HOME,
                NotificationDeepLinkResolver.resolve(notification(entityType = type, relatedEntityId = 3L)),
            )
        }
    }

    @Test
    fun erpDestinationsAreAlwaysCoreModules() {
        val samples = listOf(
            notification(entityType = "Activity", relatedEntityId = 1L),
            notification(entityType = "client", relatedEntityId = 3L),
            notification(category = "profile"),
            notification(relatedUrl = "/crm/quotes/1"),
            notification(relatedUrl = "/erp/users?highlight=1"),
        )
        samples.forEach { n ->
            val dest = NotificationDeepLinkResolver.resolve(n) as DeepLinkDestination.Module
            assertTrue("${dest.key} no es un módulo de Core", dest.key in coreKeys)
        }
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
