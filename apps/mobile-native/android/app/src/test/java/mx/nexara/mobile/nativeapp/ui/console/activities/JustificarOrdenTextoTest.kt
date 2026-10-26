package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** El aviso de que la justificación es opcional cabe en una frase. */
class JustificarOrdenTextoTest {

    @Test
    fun elAvisoOpcionalEsUnaFrase() {
        val viejo =
            "Puedes seguir sin escribir nada. Si dices por qué, queda guardado junto a la actividad y tus jefes lo ven."
        val aviso = JustificarOrdenTexto.AVISO_OPCIONAL
        assertFalse(aviso.contains(viejo))
        assertEquals(
            "Puedes seguir sin escribir nada: si dices por qué, queda guardado junto a la actividad y tus jefes lo ven.",
            aviso,
        )
        assertEquals(1, aviso.count { it == '.' })
    }
}
