package mx.nexara.mobile.nativeapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * El aviso de la notificación fija cabe en una frase, también expandido.
 *
 * Desde el 25-10 el texto dice cuándo se tomó la última ubicación (`JornadaGpsReglas.textoUltimo`)
 * y es el mismo en la línea corta y al expandirla.
 */
class JornadaGpsAvisoTest {

    @Test
    fun `el aviso cabe en una frase`() {
        val viejo =
            "Se comparte tu ubicación con NEXARA hasta que registres tu salida. Registra la salida para dejar de compartirla."
        for (texto in listOf(JornadaGpsReglas.textoUltimo("10:30"), JornadaGpsReglas.textoUltimo(null))) {
            assertFalse(texto.contains(". "))
            assertEquals(1, texto.count { it == '.' })
            assertTrue(texto.contains("salida"))
        }

        val fuente = leerFuente()
        assertFalse(fuente.contains(viejo))
        assertTrue(fuente.contains(".bigText(texto)"))
        assertTrue(fuente.contains(".setContentText(texto)"))
    }

    private fun leerFuente(): String {
        val relativo = "src/main/java/mx/nexara/mobile/nativeapp/util/JornadaGpsService.kt"
        var dir = File(".").absoluteFile
        repeat(8) {
            val candidato = File(dir, relativo)
            if (candidato.isFile) return candidato.readText()
            dir = dir.parentFile ?: return@repeat
        }
        error("No se encontró JornadaGpsService.kt desde ${File(".").absolutePath}")
    }
}
