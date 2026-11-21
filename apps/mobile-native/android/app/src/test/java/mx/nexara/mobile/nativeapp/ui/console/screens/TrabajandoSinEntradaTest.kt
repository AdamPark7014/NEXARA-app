package mx.nexara.mobile.nativeapp.ui.console.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TrabajandoSinEntradaTest {
    @Test
    fun marcaAusenteConActividad() {
        val ids = TrabajandoSinEntrada.ids(
            listOf(
                TrabajandoSinEntrada.BoardHint(1, entradaHoyAt = null, status = "activo"),
                TrabajandoSinEntrada.BoardHint(2, entradaHoyAt = "2026-11-20T16:00:00Z", status = "activo"),
                TrabajandoSinEntrada.BoardHint(3, entradaHoyAt = null, status = null),
            ),
        )
        assertEquals(setOf(1L), ids)
        assertEquals(TrabajandoSinEntrada.ETIQUETA, TrabajandoSinEntrada.etiqueta(1, true, ids))
        assertNull(TrabajandoSinEntrada.etiqueta(1, false, ids))
        assertNull(TrabajandoSinEntrada.etiqueta(2, true, ids))
        assertTrue(TrabajandoSinEntrada.ETIQUETA.contains("sin entrada", ignoreCase = true))
    }
}
