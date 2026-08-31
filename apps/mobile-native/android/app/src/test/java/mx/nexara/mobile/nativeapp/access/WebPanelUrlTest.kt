package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

/**
 * El botón "Abrir en la web" tiene que llevar al panel correcto, sin rebotes.
 *
 * `scripts/check-app-web-parity.py` comprueba además que esas rutas existan en
 * `apps/web`; aquí se fija el contrato de host y de forma.
 */
class WebPanelUrlTest {

    @Test
    fun mapsLegacyMobilePathsToTheCanonicalPanelHost() {
        assertEquals(
            "https://ops.nexara.com.mx/ops/activities",
            WebPanelUrl.forPath("/operacion/activities"),
        )
        assertEquals(
            "https://core.nexara.com.mx/erp/dashboard",
            WebPanelUrl.forPath("/console/dashboard"),
        )
        assertEquals(
            "https://sales.nexara.com.mx/crm/leads",
            WebPanelUrl.forPath("/ventas/leads"),
        )
        assertEquals(
            "https://studio.nexara.com.mx/studio/hero",
            WebPanelUrl.forPath("/studio/hero"),
        )
    }

    @Test
    fun translatesSpanishSlugsLikeTheWebMiddleware() {
        assertEquals(
            "https://sales.nexara.com.mx/crm/opportunities",
            WebPanelUrl.forPath("/ventas/oportunidades"),
        )
        assertEquals(
            "https://sales.nexara.com.mx/crm/quotes/new",
            WebPanelUrl.forPath("/ventas/cotizaciones/nueva"),
        )
    }

    /** La web metió `hr/` y `finance/`, y movió módulos de panel. */
    @Test
    fun followsModulesThatMovedInTheWebReorg() {
        assertEquals(
            "https://core.nexara.com.mx/erp/hr/attendance",
            WebPanelUrl.forPath("/console/attendance"),
        )
        assertEquals(
            "https://core.nexara.com.mx/erp/finance/viatics",
            WebPanelUrl.forPath("/contabilidad/viaticos"),
        )
        assertEquals(
            "https://ops.nexara.com.mx/ops/recruiting",
            WebPanelUrl.forPath("/console/cvs"),
        )
        assertEquals(
            "https://studio.nexara.com.mx/studio/contacts",
            WebPanelUrl.forPath("/console/contact-messages"),
        )
    }

    @Test
    fun returnsNullWhenTheModuleDoesNotExistOnTheWeb() {
        // Cola offline y preferencias son de la app; mandar al navegador daría 404.
        assertNull(WebPanelUrl.forPath("/console/offline-queue"))
        assertNull(WebPanelUrl.forPath("/console/my-preferences"))
        assertNull(WebPanelUrl.forPath("/operacion/service-sheets"))
        assertNull(WebPanelUrl.forPath(null))
        assertNull(WebPanelUrl.forPath("  "))
    }

    @Test
    fun keepsAbsoluteUrlsUntouched() {
        assertEquals(
            "https://nexara.com.mx/legal/privacidad",
            WebPanelUrl.forPath("https://nexara.com.mx/legal/privacidad"),
        )
    }

    /**
     * Ningún módulo del catálogo puede acabar en el host equivocado: el subdominio
     * tiene que corresponder al panel del que cuelga la ruta.
     */
    @Test
    fun everyCatalogModuleLandsOnItsOwnPanelHost() {
        val expectedHost = mapOf(
            "/erp" to "core", "/crm" to "sales", "/ops" to "ops",
            "/studio" to "studio", "/lab" to "lab", "/tickets" to "portal",
        )
        val catalogs = listOf(
            ModuleCatalog.console, ModuleCatalog.ventas, ModuleCatalog.contabilidad,
            ModuleCatalog.studio, ModuleCatalog.lab,
        )
        val problems = mutableListOf<String>()

        for (entry in catalogs.flatten()) {
            val url = WebPanelUrl.forPath(entry.webPath) ?: continue
            val host = url.removePrefix("https://").substringBefore('.')
            val path = "/" + url.substringAfter(".nexara.com.mx/", "")
            val panel = expectedHost.keys.firstOrNull { path == it || path.startsWith("$it/") }
            if (panel == null) {
                problems += "${entry.key}: '$url' no cuelga de ningún panel conocido"
            } else if (expectedHost[panel] != host) {
                problems += "${entry.key}: '$url' está en '$host', debería ir a '${expectedHost[panel]}'"
            }
        }

        if (problems.isNotEmpty()) {
            fail("Módulos apuntando al host equivocado:\n" + problems.joinToString("\n"))
        }
    }
}
