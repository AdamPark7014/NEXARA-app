package mx.nexara.mobile.nativeapp.ui.console.viaticos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AsignarViaticoRulesTest {
    @Test
    fun `pide persona, actividad, importe y concepto`() {
        assertTrue(AsignarViaticoRules.completo(1, 2, 100, "Gasolina"))
        assertFalse(AsignarViaticoRules.completo(null, 2, 100, "Gasolina"))
        assertFalse(AsignarViaticoRules.completo(1, null, 100, "Gasolina"))
        assertFalse(AsignarViaticoRules.completo(1, 2, 0, "Gasolina"))
        assertFalse(AsignarViaticoRules.completo(1, 2, 100, "   "))
    }

    @Test
    fun `sin actividades dice que hacer`() {
        assertEquals("Carolina no tiene actividades abiertas. Asígnale una primero.", AsignarViaticoRules.avisoSinActividades("Carolina"))
        assertEquals("Esta persona no tiene actividades abiertas. Asígnale una primero.", AsignarViaticoRules.avisoSinActividades(null))
    }

    @Test
    fun `busca sin importar mayusculas`() {
        val p = listOf(1L to "Carolina Juárez", 2L to "Iván Camargo")
        assertEquals(listOf(2L to "Iván Camargo"), AsignarViaticoRules.filtrarPersonas(p, " iván "))
        assertEquals(p, AsignarViaticoRules.filtrarPersonas(p, ""))
    }
}
