package mx.nexara.mobile.nativeapp.ui.console.horarios

import mx.nexara.mobile.nativeapp.data.api.DiaHorarioDto
import mx.nexara.mobile.nativeapp.data.api.HorarioCitadoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HorariosRulesTest {
    private val citado = HorarioCitadoDto(horaEntrada = "10:00", horaSalida = "18:00")

    @Test
    fun `un dia de descanso o sin datos no inventa un horario`() {
        assertEquals("10:00–18:00", HorariosRules.rango(DiaHorarioDto(horario = citado, trabaja = true)))
        assertEquals("Descansas", HorariosRules.rango(DiaHorarioDto(horario = citado, trabaja = false)))
        assertEquals("Descansas", HorariosRules.rango(DiaHorarioDto()))
        assertEquals("", HorariosRules.dia(null))
        assertEquals("miércoles 25", HorariosRules.dia("2026-11-25"))
    }

    @Test
    fun `dice quien lo cambio y por que`() {
        val d = DiaHorarioDto(
            horario = citado.copy(motivo = "Cerrar rack"),
            programado = true,
            ajuste = "extender",
            loPuso = "Luis",
        )
        assertEquals("Extendido por Luis: Cerrar rack", HorariosRules.quienYPorQue(d))
        assertEquals("Programado", HorariosRules.quienYPorQue(DiaHorarioDto(programado = true)))
        assertNull(HorariosRules.quienYPorQue(DiaHorarioDto(horario = citado)))
    }

    @Test
    fun `extender va despues y terminar antes va antes, tambien de noche`() {
        assertNull(HorariosRules.falta("20:00", "10:00", "18:00", extender = true))
        assertEquals(
            "Para extender, la salida va después de las 18:00",
            HorariosRules.falta("17:00", "10:00", "18:00", extender = true),
        )
        assertEquals(
            "Para terminar antes, la salida va antes de las 18:00",
            HorariosRules.falta("19:00", "10:00", "18:00", extender = false),
        )
        assertNull(HorariosRules.falta("05:00", "22:00", "06:00", extender = false))
        assertNull(HorariosRules.falta("07:00", "22:00", "06:00", extender = true))
        assertEquals("Escribe la hora como 20:00", HorariosRules.falta("8 pm", "10:00", "18:00", extender = true))
        assertEquals("La salida no puede ser igual a la entrada", HorariosRules.falta("10:00", "10:00", "18:00", extender = true))
    }

    @Test
    fun `las sugerencias cruzan la medianoche y no pasan de la entrada`() {
        assertEquals(listOf("23:00", "00:00", "01:00"), HorariosRules.sugerenciasExtender("22:00"))
        assertEquals(listOf("17:00", "16:00", "15:00"), HorariosRules.sugerenciasRecortar("10:00", "18:00"))
        assertEquals(listOf("11:00"), HorariosRules.sugerenciasRecortar("10:00", "12:00"))
        assertEquals(listOf("18:00", "17:00", "16:00"), HorariosRules.sugerenciasRecortar("10:00", "18:30"))
        assertEquals(emptyList<String>(), HorariosRules.sugerenciasExtender(null))
    }

    @Test
    fun `horas y checadas`() {
        assertEquals("2 h 30", HorariosRules.horas(150))
        assertEquals("45 min", HorariosRules.horas(45))
        assertEquals("09:56", HorariosRules.horaDe("2026-11-25T15:56:00.000Z"))
        assertNull(HorariosRules.horaDe("no es fecha"))
    }
}
