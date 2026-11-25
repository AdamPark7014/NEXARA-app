package mx.nexara.mobile.nativeapp.ui.console.pagos

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PagoSemanalRulesTest {
    @Test
    fun `la semana empieza en lunes y su titulo cruza de mes`() {
        assertEquals(LocalDate.of(2026, 11, 16), PagoSemanalRules.lunes(LocalDate.of(2026, 11, 22)))
        assertEquals("16 al 22 de noviembre", PagoSemanalRules.titulo(LocalDate.of(2026, 11, 16)))
        assertEquals("30 de noviembre al 6 de diciembre", PagoSemanalRules.titulo(LocalDate.of(2026, 11, 30)))
    }

    @Test
    fun `no deja pagar de mas ni en cero`() {
        assertNull(PagoSemanalRules.faltaParaPagar("1,290.00", 1290.0))
        assertNull(PagoSemanalRules.faltaParaPagar("500", 1290.0))
        assertEquals("Solo faltan $1,290.00 por pagar", PagoSemanalRules.faltaParaPagar("1290.01", 1290.0))
        assertEquals("Escribe cuánto pagas", PagoSemanalRules.faltaParaPagar("0", 1290.0))
        assertEquals("Escribe cuánto pagas", PagoSemanalRules.faltaParaPagar("", 1290.0))
    }

    @Test
    fun `los centavos no se pierden y el negativo se lee`() {
        assertEquals(29L, PagoSemanalRules.centavos(0.29))
        assertEquals("−$120.00", PagoSemanalRules.pesos(-120.0))
        assertEquals("+$150.00", PagoSemanalRules.ajuste(150.0))
        assertEquals("$0.00", PagoSemanalRules.pesos(null))
        assertEquals("Sin monto", PagoSemanalRules.estado(null))
    }
}
