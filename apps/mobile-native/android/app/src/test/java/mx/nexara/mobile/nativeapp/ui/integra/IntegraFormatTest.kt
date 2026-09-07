package mx.nexara.mobile.nativeapp.ui.integra

import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/**
 * Fechas y horas de INTEGRA.
 *
 * El defecto que motivó este formateador: las pantallas pintaban la marca cruda
 * `2026-09-06T19:24:11.000Z`, así que un acceso de las 13:24 de Puebla se leía
 * «19:24». Y el servidor mezcla tres formatos —con `Z`, con desfase, y hora de
 * pared sin desfase—, así que hay que aguantar los tres sin confundirlos.
 */
class IntegraFormatTest {

    private val mx: ZoneId = IntegraFormat.MexicoCity

    @Test
    fun `un instante UTC se pinta en la hora local del sitio`() {
        assertEquals("06/09/2026 13:24", IntegraFormat.dateTime("2026-09-06T19:24:11.000Z", mx))
        assertEquals("13:24", IntegraFormat.time("2026-09-06T19:24:11.000Z", mx))
    }

    @Test
    fun `una marca con desfase explicito se respeta`() {
        assertEquals("06/09/2026 13:24", IntegraFormat.dateTime("2026-09-06T13:24:11-06:00", mx))
    }

    @Test
    fun `la hora de pared sin desfase ya es la hora del terminal`() {
        // Los ISAPI mandan hora local sin zona: no hay nada que convertir.
        assertEquals("06/09/2026 13:24", IntegraFormat.dateTime("2026-09-06T13:24:11", mx))
        assertEquals("06/09 13:24", IntegraFormat.shortDateTime("2026-09-06 13:24:11", mx))
    }

    @Test
    fun `solo fecha se sitúa al principio del dia`() {
        assertEquals("06/09/2026 00:00", IntegraFormat.dateTime("2026-09-06", mx))
        assertNotNull(IntegraFormat.parse("2026-09-06", mx))
    }

    @Test
    fun `lo ilegible es un guion, no una excepcion ni la cadena cruda`() {
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.dateTime(null, mx))
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.dateTime("", mx))
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.dateTime("null", mx))
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.dateTime("undefined", mx))
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.dateTime("ayer por la tarde", mx))
        assertNull(IntegraFormat.parse("ayer por la tarde", mx))
    }

    @Test
    fun `las edades relativas se leen en la caseta`() {
        val ahora = Instant.parse("2026-09-06T20:00:00Z")
        assertEquals("ahora", IntegraFormat.relative("2026-09-06T19:59:30Z", mx, ahora))
        assertEquals("hace 30 min", IntegraFormat.relative("2026-09-06T19:30:00Z", mx, ahora))
        assertEquals("hace 3 h", IntegraFormat.relative("2026-09-06T17:00:00Z", mx, ahora))
        assertEquals("ayer", IntegraFormat.relative("2026-09-05T18:00:00Z", mx, ahora))
        assertEquals("hace 4 d", IntegraFormat.relative("2026-09-02T18:00:00Z", mx, ahora))
    }

    @Test
    fun `un reloj de terminal adelantado dice ahora, no en menos dos minutos`() {
        val ahora = Instant.parse("2026-09-06T20:00:00Z")
        assertEquals("ahora", IntegraFormat.relative("2026-09-06T20:02:00Z", mx, ahora))
    }

    @Test
    fun `la duracion nula es un guion, porque null es un dato`() {
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.duration(null))
        assertEquals(IntegraFormat.EMPTY, IntegraFormat.duration(-5))
        assertEquals("47 min", IntegraFormat.duration(47))
        assertEquals("8 h", IntegraFormat.duration(480))
        assertEquals("8 h 12 min", IntegraFormat.duration(492))
    }

    @Test
    fun `el dia absoluto no arrastra horas ni husos`() {
        val a = IntegraFormat.epochDay("2026-09-06T23:30:00Z", mx)
        val b = IntegraFormat.epochDay("2026-09-06T13:00:00-06:00", mx)
        // 23:30 UTC del día 6 son las 17:30 del día 6 en Puebla: mismo día.
        assertEquals(a, b)
        assertNull(IntegraFormat.epochDay("no es fecha", mx))
    }

    @Test
    fun `isoDate devuelve lo que aceptan validFrom y validTo`() {
        assertEquals("2026-09-06", IntegraFormat.isoDate("2026-09-06T19:24:11Z", mx))
        assertEquals("", IntegraFormat.isoDate(null, mx))
    }

    @Test
    fun `el dia largo encabeza los grupos de asistencia`() {
        // El formato exacto depende del ICU de la plataforma; lo que se fija es
        // que produce algo y no el marcador de vacío.
        val etiqueta = IntegraFormat.dayLabel("2026-09-06", mx)
        assertNotEquals("dayLabel devolvió vacío para una fecha válida", IntegraFormat.EMPTY, etiqueta)
        assertTrue("dayLabel debería nombrar el día 06: $etiqueta", etiqueta.contains("06"))
    }
}
