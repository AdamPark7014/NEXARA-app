package mx.nexara.mobile.nativeapp.ui.common

import mx.nexara.mobile.nativeapp.ui.common.CodigoBarrasRules.Tipo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CodigoBarrasRulesTest {
    @Test
    fun limpiaControlYPrefijoAim() {
        assertEquals("7501055363025", CodigoBarrasRules.limpiar("]E0 7501055363025\r\n"))
        assertEquals("ABC-1", CodigoBarrasRules.limpiar("\tABC-1 "))
        assertEquals("", CodigoBarrasRules.limpiar(null))
    }

    @Test
    fun clasificaGtinValidos() {
        assertEquals(Tipo.EAN_13, CodigoBarrasRules.clasificar("7501055363025").tipo)
        assertEquals(Tipo.UPC_A, CodigoBarrasRules.clasificar("036000291452").tipo)
        assertEquals(Tipo.EAN_8, CodigoBarrasRules.clasificar("96385074").tipo)
        assertEquals(Tipo.GTIN_14, CodigoBarrasRules.clasificar("10036000291459").tipo)
    }

    @Test
    fun verificadorMaloEsSospechoso() {
        val c = CodigoBarrasRules.clasificar("7501055363026")
        assertEquals(Tipo.INTERNO, c.tipo)
        assertTrue(c.sospechoso)
        assertEquals(
            "Parece un UPC/EAN pero el dígito verificador no cuadra. Vuelve a escanearlo.",
            CodigoBarrasRules.motivoInvalido("7501055363026"),
        )
    }

    @Test
    fun upcEDeOchoNoSeMarca() {
        val c = CodigoBarrasRules.clasificar("01234565")
        assertFalse(c.sospechoso)
        assertNull(CodigoBarrasRules.motivoInvalido("04252614"))
    }

    @Test
    fun motivosDeRechazo() {
        assertEquals("Escanea o escribe un código de barras", CodigoBarrasRules.motivoInvalido("  "))
        assertEquals(
            "El código es demasiado corto (mínimo 3 caracteres)",
            CodigoBarrasRules.motivoInvalido("AB"),
        )
        assertEquals(
            "El código es demasiado largo (máximo 64 caracteres)",
            CodigoBarrasRules.motivoInvalido("A".repeat(65)),
        )
        assertEquals(
            "El código trae caracteres que un lector no puede leer",
            CodigoBarrasRules.motivoInvalido("CÓDIGO-1"),
        )
        assertNull(CodigoBarrasRules.motivoInvalido("SKU-0001"))
    }

    @Test
    fun consultaInternacionalSoloGtinLargo() {
        assertTrue(CodigoBarrasRules.esConsultableInternacional("7501055363025"))
        assertTrue(CodigoBarrasRules.esConsultableInternacional("036000291452"))
        assertFalse(CodigoBarrasRules.esConsultableInternacional("96385074"))
        assertFalse(CodigoBarrasRules.esConsultableInternacional("SKU-0001"))
    }

    @Test
    fun etiquetaDeHerramientaEnMayusculas() {
        assertEquals("MUL-12345", CodigoBarrasRules.normalizarEtiquetaHerramienta(" mul-12345\n"))
        assertNull(CodigoBarrasRules.motivoEtiquetaInvalida("TAL-A1"))
        assertEquals(
            "Escanea o escribe la etiqueta de la herramienta",
            CodigoBarrasRules.motivoEtiquetaInvalida(""),
        )
    }

    @Test
    fun cantidades() {
        assertEquals(3.0, CodigoBarrasRules.parseCantidad("3")!!, 0.0)
        assertEquals(2.5, CodigoBarrasRules.parseCantidad("2,5")!!, 0.0)
        assertNull(CodigoBarrasRules.parseCantidad("0"))
        assertNull(CodigoBarrasRules.parseCantidad("-1"))
        assertNull(CodigoBarrasRules.parseCantidad("abc"))
    }
}
