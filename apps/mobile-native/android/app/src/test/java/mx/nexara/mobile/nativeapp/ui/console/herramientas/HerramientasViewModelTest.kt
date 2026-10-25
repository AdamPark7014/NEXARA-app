package mx.nexara.mobile.nativeapp.ui.console.herramientas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** El aviso al pedir la prórroga cabe en una frase y sigue diciendo lo mismo. */
class HerramientasViewModelTest {

    @Test
    fun laProrrogaSolicitadaCabeEnUnaFrase() {
        val aviso = avisoProrrogaSolicitada()
        val textoViejo =
            "Prórroga solicitada. Queda pendiente de que la autoricen."
        assertEquals(
            "Prórroga solicitada: queda pendiente de que la autoricen.",
            aviso,
        )
        assertTrue(aviso != textoViejo)
        assertEquals(1, aviso.count { it == '.' })
        assertTrue(aviso.contains("solicitada"))
        assertTrue(aviso.contains("autoricen"))
    }
}
