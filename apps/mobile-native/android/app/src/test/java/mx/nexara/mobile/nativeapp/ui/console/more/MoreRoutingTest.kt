package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.ui.console.ConsoleRoutes
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El cableado de «Más»: que cada módulo con pantalla propia llegue a la suya, y
 * que la lista sepa cuáles siguen echando al navegador.
 *
 * El fallo que esto vigila ya pasó una vez: Vehículos estrenó pantalla nativa y
 * la ficha «ábrelo en la web» se quedó igual, así que un enlace entrante seguía
 * sacando a la gente de la app.
 */
class MoreRoutingTest {

    /** Los cuatro de solo consulta de esta ola. */
    private val deConsulta = listOf(
        CoreExtraModule.KPIS_EQUIPO,
        CoreExtraModule.ORGANIGRAMA,
        CoreExtraModule.PROYECTOS,
        CoreExtraModule.ALMACEN,
    )

    @Test
    fun theQueryOnlyModulesOpenInsideTheApp() {
        deConsulta.forEach { module ->
            assertTrue(
                "${module.key} debe abrirse dentro de la app, no en la web",
                ConsoleRoutes.tienePantallaNativa(module),
            )
        }
    }

    @Test
    fun eachQueryModuleHasItsOwnRoute() {
        val rutas = deConsulta.map { ConsoleRoutes.forExtra(it) }
        assertEquals("dos módulos comparten ruta: $rutas", rutas.distinct(), rutas)
        assertEquals(ConsoleRoutes.KpisEquipo, ConsoleRoutes.forExtra(CoreExtraModule.KPIS_EQUIPO))
        assertEquals(ConsoleRoutes.Organigrama, ConsoleRoutes.forExtra(CoreExtraModule.ORGANIGRAMA))
        assertEquals(ConsoleRoutes.Proyectos, ConsoleRoutes.forExtra(CoreExtraModule.PROYECTOS))
        assertEquals(ConsoleRoutes.Almacen, ConsoleRoutes.forExtra(CoreExtraModule.ALMACEN))
    }

    /** Ninguna de las nuevas puede colgar de `console/more/`: ésa es la de la web. */
    @Test
    fun noQueryModuleFallsBackToThePlaceholder() {
        deConsulta.forEach { module ->
            assertFalse(
                "${module.key} cayó en la ficha de «ábrelo en la web»",
                ConsoleRoutes.forExtra(module).startsWith("console/more/"),
            )
        }
    }

    /**
     * Los que siguen sin pantalla sí van a la ficha, y la lista lo dice con la
     * etiqueta «En la web» antes de que nadie los toque.
     */
    @Test
    fun whatHasNoScreenYetSaysSo() {
        listOf(CoreExtraModule.COTIZACIONES, CoreExtraModule.HERRAMIENTAS).forEach { module ->
            assertFalse(ConsoleRoutes.tienePantallaNativa(module))
            assertEquals(ConsoleRoutes.modulePlaceholder(module.key), ConsoleRoutes.forExtra(module))
        }
    }

    /** Dos módulos distintos nunca comparten ruta, tengan pantalla o no. */
    @Test
    fun noTwoModulesShareARoute() {
        val rutas = CoreExtraModule.entries.map { ConsoleRoutes.forExtra(it) }
        val repetidas = rutas.groupingBy { it }.eachCount().filterValues { it > 1 }
        assertTrue("rutas repetidas en «Más»: $repetidas", repetidas.isEmpty())
    }
}
