package mx.nexara.mobile.nativeapp.ui.console.inicio

import mx.nexara.mobile.nativeapp.data.api.ActividadEnRiesgoDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRegisterResponse
import mx.nexara.mobile.nativeapp.data.api.RiesgoSalidaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TerminarJornadaRulesTest {
    private fun a(folio: String, id: Long = 1) = ActividadEnRiesgoDto(id = id, folio = folio, titulo = "x")

    @Test
    fun `sin nada en juego no hay nota`() {
        assertNull(TerminarJornadaRules.textoSiSigues(null))
        assertNull(TerminarJornadaRules.textoSiSigues(RiesgoSalidaDto()))
    }

    @Test
    fun `la misma actividad corre y vence como en el mockup`() {
        assertEquals(
            "Si sigues: se detiene el reloj de AN-0368 y queda «No cumplida» porque vence hoy y no la has entregado.",
            TerminarJornadaRules.textoSiSigues(RiesgoSalidaDto(listOf(a("AN-0368")), listOf(a("AN-0368")))),
        )
    }

    @Test
    fun `actividades distintas se nombran`() {
        assertEquals(
            "Si sigues: se detiene el reloj de AN-1 y AN-2 queda «No cumplida» porque vence hoy y no la has entregado.",
            TerminarJornadaRules.textoSiSigues(RiesgoSalidaDto(listOf(a("AN-1")), listOf(a("AN-2")))),
        )
        assertEquals(
            "Si sigues: se detienen los relojes de AN-1, AN-2.",
            TerminarJornadaRules.textoSiSigues(RiesgoSalidaDto(listOf(a("AN-1"), a("AN-2")))),
        )
        assertEquals(
            "Si sigues: AN-1, AN-2 quedan «No cumplida» porque vencen hoy y no las has entregado.",
            TerminarJornadaRules.textoSiSigues(RiesgoSalidaDto(porCerrar = listOf(a("AN-1"), a("AN-2")))),
        )
    }

    @Test
    fun `lleva a la que corre y si no a la que vence`() {
        assertEquals(1L, TerminarJornadaRules.actividadParaTerminar(RiesgoSalidaDto(listOf(a("A", 1)), listOf(a("B", 2)))))
        assertEquals(2L, TerminarJornadaRules.actividadParaTerminar(RiesgoSalidaDto(porCerrar = listOf(a("B", 2)))))
        assertNull(TerminarJornadaRules.actividadParaTerminar(RiesgoSalidaDto()))
    }

    @Test
    fun `quedan minutos solo dentro de los diez`() {
        val salida = "2026-11-10T22:14:00Z"
        val ms = java.time.Instant.parse(salida).toEpochMilli()
        assertEquals(10, TerminarJornadaRules.minutosParaDeshacer(salida, ms))
        assertEquals(8, TerminarJornadaRules.minutosParaDeshacer(salida, ms + 2 * 60_000))
        assertEquals(1, TerminarJornadaRules.minutosParaDeshacer(salida, ms + 10 * 60_000 - 1000))
        assertEquals(1, TerminarJornadaRules.minutosParaDeshacer(salida, ms + 10 * 60_000))
        assertNull(TerminarJornadaRules.minutosParaDeshacer(salida, ms + 10 * 60_000 + 1))
        assertNull(TerminarJornadaRules.minutosParaDeshacer(salida, ms - 1))
        assertNull(TerminarJornadaRules.minutosParaDeshacer(null, ms))
        assertNull(TerminarJornadaRules.minutosParaDeshacer("no es fecha", ms))
    }

    @Test
    fun `sin señal no dice registrada`() {
        assertEquals(
            "Sin señal: tu salida se enviará en cuanto vuelva la red",
            TerminarJornadaRules.mensajeChecada("salida", AttendanceRegisterResponse(queued = true)),
        )
        assertEquals(
            "Sin señal: tu entrada se enviará en cuanto vuelva la red",
            TerminarJornadaRules.mensajeChecada("entrada", AttendanceRegisterResponse(queued = true)),
        )
        assertEquals("Salida registrada", TerminarJornadaRules.mensajeChecada("salida", AttendanceRegisterResponse()))
        assertEquals("Hola", TerminarJornadaRules.mensajeChecada("salida", AttendanceRegisterResponse(message = "Hola")))
    }

    @Test
    fun `dice lo que regresó`() {
        assertEquals("Tu jornada sigue abierta", TerminarJornadaRules.mensajeDeshecha(null))
        assertEquals(
            "Tu jornada sigue abierta y AN-1 ya no queda «No cumplida»",
            TerminarJornadaRules.mensajeDeshecha(listOf("AN-1", null)),
        )
        assertEquals(
            "Tu jornada sigue abierta y AN-1, AN-2 ya no quedan «No cumplida»",
            TerminarJornadaRules.mensajeDeshecha(listOf("AN-1", "AN-2")),
        )
    }
}
