package mx.nexara.mobile.nativeapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** El aviso expandido de la notificación fija cabe en una frase. */
class JornadaGpsAvisoTest {

    @Test
    fun `el aviso expandido cabe en una frase`() {
        val viejo =
            "Se comparte tu ubicación con NEXARA hasta que registres tu salida. Registra la salida para dejar de compartirla."
        val nuevo =
            "Se comparte tu ubicación con NEXARA hasta que registres tu salida: regístrala para dejar de compartirla."

        assertEquals(nuevo, AVISO_UBICACION_EXPANDIDO)
        assertFalse(AVISO_UBICACION_EXPANDIDO == viejo)
        assertFalse(AVISO_UBICACION_EXPANDIDO.contains(". "))
        assertEquals(1, AVISO_UBICACION_EXPANDIDO.count { it == '.' })

        val fuente = leerFuente()
        assertFalse(fuente.contains(viejo))
        assertTrue(fuente.contains(".bigText(AVISO_UBICACION_EXPANDIDO)"))
        assertTrue(
            fuente.contains(
                ".setContentText(\"Se comparte tu ubicación con NEXARA hasta que registres tu salida.\")",
            ),
        )
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
