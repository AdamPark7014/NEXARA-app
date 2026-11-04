package mx.nexara.mobile.nativeapp.ui.console.gastos

import mx.nexara.mobile.nativeapp.data.api.GastoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dirección viene a autorizar, no a capturar: los demás siguen como estaban. */
class GastosPorRolTest {

    private fun gasto(id: Long, estatus: String) = GastoDto(id = id, estatusPago = estatus)

    @Test
    fun `direccion abre en lo que falta autorizar cuando hay`() {
        val conPendiente = listOf(gasto(1, "Pagado"), gasto(2, "Pendiente"))
        assertEquals(GastosRules.Filtro.POR_AUTORIZAR, GastosRules.filtroInicial(esDireccion = true, gastos = conPendiente))
    }

    @Test
    fun `sin nada por autorizar abre en todos`() {
        assertEquals(
            GastosRules.Filtro.TODOS,
            GastosRules.filtroInicial(esDireccion = true, gastos = listOf(gasto(1, "Pagado"))),
        )
        assertEquals(GastosRules.Filtro.TODOS, GastosRules.filtroInicial(esDireccion = true, gastos = emptyList()))
    }

    @Test
    fun `los demas abren como hoy, aunque haya pendientes`() {
        assertEquals(
            GastosRules.Filtro.TODOS,
            GastosRules.filtroInicial(esDireccion = false, gastos = listOf(gasto(1, "Pendiente"))),
        )
    }

    @Test
    fun `direccion no registra`() {
        assertFalse(GastosRules.puedeRegistrar(esDireccion = true))
        assertTrue(GastosRules.puedeRegistrar(esDireccion = false))
    }

    @Test
    fun `el vacio y el pie no le ofrecen registrar a direccion`() {
        assertFalse(GastosRules.vacio(esDireccion = true).contains("se registra con la foto"))
        assertTrue(GastosRules.vacio(esDireccion = true).contains("autorizas"))
        assertTrue(GastosRules.vacio(esDireccion = false).contains("se registra con la foto"))
        assertFalse(GastosRules.LIMITE_DIRECCION.contains("registras"))
    }
}
