package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * La URL web de un módulo de Core: siempre `core.nexara.com.mx/erp/...`.
 * `scripts/check-app-web-parity.py` comprueba además que esas rutas existan en `apps/web`.
 */
class WebPanelUrlTest {

    @Test
    fun coreModulesLandOnTheCoreHost() {
        assertEquals("https://core.nexara.com.mx/erp/pizarra", WebPanelUrl.forPath("/erp/pizarra"))
        assertEquals("https://core.nexara.com.mx/erp/my-profile", WebPanelUrl.forPath("/console/my-profile"))
        assertEquals("https://core.nexara.com.mx/erp/my-profile", WebPanelUrl.forPath("/erp/mi-perfil"))
        assertEquals("https://core.nexara.com.mx/erp/pizarra", WebPanelUrl.forPath("/erp/actividades"))
        assertEquals("https://core.nexara.com.mx/erp/clientes", WebPanelUrl.forPath("/erp/clients"))
    }

    @Test
    fun thePortalKeepsItsOwnHost() {
        assertEquals("https://portal.nexara.com.mx/tickets", WebPanelUrl.forPath("/portal"))
    }

    @Test
    fun panelsThatNoLongerExistHaveNoUrl() {
        assertNull(WebPanelUrl.forPath("/crm/leads"))
        assertNull(WebPanelUrl.forPath("/ops/activities"))
        assertNull(WebPanelUrl.forPath("/integra/access"))
    }

    @Test
    fun appOnlyScreensHaveNoUrl() {
        assertNull(WebPanelUrl.forPath("/erp/offline-queue"))
        assertNull(WebPanelUrl.forPath(null))
        assertNull(WebPanelUrl.forPath("  "))
    }

    @Test
    fun absoluteUrlsAreUntouched() {
        assertEquals(
            "https://nexara.com.mx/legal/privacidad",
            WebPanelUrl.forPath("https://nexara.com.mx/legal/privacidad"),
        )
    }

    @Test
    fun everyCatalogModuleLandsOnCore() {
        ModuleCatalog.core.forEach { entry ->
            assertEquals(entry.key, "https://core.nexara.com.mx${entry.webPath}", WebPanelUrl.forPath(entry.webPath))
        }
    }
}
