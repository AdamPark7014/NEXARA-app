package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.PuntoFormatoDto
import mx.nexara.mobile.nativeapp.data.api.RenglonFormatoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FormatosRulesTest {
    private val montaje = RenglonFormatoDto(titulo = "Montaje", minutosBase = 30, minutosPorUnidad = 45)

    @Test
    fun `base más lo que suma cada unidad, nunca menos de 5`() {
        assertEquals(210, FormatosRules.minutos(montaje, 4))
        assertEquals(5, FormatosRules.minutos(RenglonFormatoDto(minutosBase = 0, minutosPorUnidad = 45), 0))
    }

    @Test
    fun `el total dice cuántas jornadas de 7 horas`() {
        assertEquals("Total 30 min · cabe en 1 jornada", FormatosRules.total(30))
        assertEquals("Total 7 h · cabe en 1 jornada", FormatosRules.total(420))
        assertEquals("Total 9 h 5 min · cabe en 2 jornadas", FormatosRules.total(545))
    }

    @Test
    fun `la evidencia se nombra si tiene puntos, si no se cuentan las fotos`() {
        assertEquals("4 fotos", FormatosRules.evidencia(montaje))
        assertEquals("Rack", FormatosRules.evidencia(montaje.copy(puntos = listOf(PuntoFormatoDto("Rack", listOf("DESPUES"))))))
    }

    @Test
    fun `el siguiente día laboral salta el fin de semana`() {
        assertEquals(LocalDate.of(2026, 11, 11), FormatosRules.siguienteDiaLaboral(LocalDate.of(2026, 11, 10)))
        assertEquals(LocalDate.of(2026, 11, 16), FormatosRules.siguienteDiaLaboral(LocalDate.of(2026, 11, 13)))
    }

    @Test
    fun `dice lo que falta`() {
        val r = RenglonEditable(montaje, "Montaje", 210)
        assertNull(FormatosRules.faltante(1, null, listOf(r)))
        assertEquals("Elige quién la lleva", FormatosRules.faltante(null, null, listOf(r)))
        assertEquals("Deja al menos una actividad", FormatosRules.faltante(1, null, emptyList()))
        assertEquals("A una actividad le falta el título", FormatosRules.faltante(1, null, listOf(r.copy(titulo = " "))))
        val servicio = r.copy(base = montaje.copy(coreKind = "servicio"))
        assertEquals("Elige el cliente: lleva actividades de servicio", FormatosRules.faltante(1, null, listOf(servicio)))
        assertNull(FormatosRules.faltante(1, 3, listOf(servicio)))
    }

    @Test
    fun `el botón cuenta bien`() {
        assertEquals("Asignar 1 actividad", FormatosRules.etiqueta(1))
        assertEquals("Asignar 5 actividades", FormatosRules.etiqueta(5))
    }
}
