package mx.nexara.mobile.nativeapp.ui.console.pagos

import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoPersonaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Registrar y marcar pagado mueven dinero: solo se ofrece lo que el servidor va a aceptar, y la
 * confirmación dice a quién, cuánto y que genera la póliza.
 */
class PagosAccionesTest {

    private fun pago(
        status: String? = "Borrador",
        amount: String? = "12345.5",
        id: Long? = 7L,
        nombre: String? = "Ana López",
    ) = PagoEmpleadoDto(
        id = id,
        userId = 3L,
        status = status,
        amount = amount,
        user = nombre?.let { PagoEmpleadoPersonaDto(nombre = it) },
    )

    @Test
    fun `solo un borrador con cifra legible se marca pagado`() {
        assertTrue(PagosRules.puedeMarcarPagado(pago()))
        assertFalse(PagosRules.puedeMarcarPagado(pago(status = "Pagado")))
        assertFalse(PagosRules.puedeMarcarPagado(pago(status = "Anulado")))
    }

    @Test
    fun `lo que no se entiende no se ofrece`() {
        // Un estado raro podría ya estar pagado; sin cifra, la confirmación no diría cuánto.
        assertFalse(PagosRules.puedeMarcarPagado(pago(status = "raro")))
        assertFalse(PagosRules.puedeMarcarPagado(pago(status = null)))
        assertFalse(PagosRules.puedeMarcarPagado(pago(amount = null)))
        assertFalse(PagosRules.puedeMarcarPagado(pago(amount = "abc")))
        assertFalse(PagosRules.puedeMarcarPagado(pago(id = null)))
    }

    @Test
    fun `la confirmacion dice a quien, cuanto y que genera la poliza`() {
        val texto = PagosRules.confirmacionPago(pago())
        assertTrue(texto, texto.contains("Ana López"))
        assertTrue(texto, texto.contains("$12,345.50"))
        assertTrue(texto, texto.contains("póliza contable"))
    }

    @Test
    fun `el aviso nombra a la persona`() {
        assertTrue(PagosRules.avisoPagoMarcado(pago()).contains("Ana López"))
        assertTrue(PagosRules.avisoPagoMarcado(pago(nombre = null)).contains("Usuario #3"))
        assertTrue(PagosRules.AVISO_PAGO_REGISTRADO.contains("borrador"))
    }

    @Test
    fun `registrar dice que falta, en orden`() {
        val desde = "2026-11-01"
        val hasta = "2026-11-15"
        assertEquals(
            "Elige a quién se le paga.",
            PagosRules.faltaParaRegistrar(null, "100", "Quincena", desde, hasta),
        )
        assertEquals("Escribe el importe.", PagosRules.faltaParaRegistrar(1L, "", "Quincena", desde, hasta))
        assertEquals("Escribe el importe.", PagosRules.faltaParaRegistrar(1L, "0", "Quincena", desde, hasta))
        assertEquals("Escribe el importe.", PagosRules.faltaParaRegistrar(1L, "abc", "Quincena", desde, hasta))
        assertEquals("Escribe el concepto.", PagosRules.faltaParaRegistrar(1L, "100", "  ", desde, hasta))
        assertEquals(
            "Elige el periodo: desde y hasta.",
            PagosRules.faltaParaRegistrar(1L, "100", "Quincena", "", hasta),
        )
        assertEquals(
            "Elige el periodo: desde y hasta.",
            PagosRules.faltaParaRegistrar(1L, "100", "Quincena", desde, ""),
        )
        assertNull(PagosRules.faltaParaRegistrar(1L, "1,500.50", "Quincena", desde, hasta))
    }

    @Test
    fun `el periodo no termina antes de empezar`() {
        assertEquals(
            "El periodo no puede terminar antes de empezar.",
            PagosRules.faltaParaRegistrar(1L, "100", "Quincena", "2026-11-15", "2026-11-01"),
        )
        // Un solo día es un periodo válido: el servidor solo rechaza `desde > hasta`.
        assertNull(PagosRules.faltaParaRegistrar(1L, "100", "Quincena", "2026-11-15", "2026-11-15"))
    }
}
