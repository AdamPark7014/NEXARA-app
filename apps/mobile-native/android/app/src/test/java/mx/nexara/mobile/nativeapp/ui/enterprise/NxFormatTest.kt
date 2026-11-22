package mx.nexara.mobile.nativeapp.ui.enterprise

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.util.TimeZone

/**
 * Una visita programada, una vigencia o una emisión son días de calendario: el API los manda a
 * medianoche UTC. Con el teléfono en hora de México, `Instant.parse` los dejaba en la tarde del día
 * anterior y el cliente leía «9 dic 2026, 18:00» para la visita del 10.
 */
class NxFormatTest {
    private lateinit var zonaAnterior: TimeZone

    @Before
    fun telefonoEnMexico() {
        zonaAnterior = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("America/Mexico_City"))
    }

    @After
    fun restauraZona() {
        TimeZone.setDefault(zonaAnterior)
    }

    @Test
    fun `un dia de calendario a medianoche UTC se pinta ese dia y no el anterior`() {
        assertEquals("10 dic 2026", NxFormat.date("2026-12-10T00:00:00.000Z"))
        assertEquals("10 dic 2026", NxFormat.date("2026-12-10T00:00:00Z"))
        assertEquals("10 dic 2026", NxFormat.date("2026-12-10"))
    }

    @Test
    fun `un dia de calendario no inventa una hora`() {
        assertEquals("10 dic 2026", NxFormat.dateTime("2026-12-10T00:00:00.000Z"))
        assertEquals("10 dic 2026", NxFormat.dateTime("2026-12-10"))
    }

    @Test
    fun `un instante con hora sigue en la hora del telefono`() {
        // 03:30 UTC del 2 de diciembre son las 21:30 del 1 en México.
        assertEquals("1 dic 2026, 21:30", NxFormat.dateTime("2026-12-02T03:30:00.000Z"))
        assertEquals("1 dic 2026", NxFormat.date("2026-12-02T03:30:00.000Z"))
        assertEquals("26 ene 2026, 14:30", NxFormat.dateTime("2026-01-26T20:30:00Z"))
    }

    @Test
    fun `sin fecha o con texto ilegible no inventa nada`() {
        assertEquals("—", NxFormat.date(null))
        assertEquals("—", NxFormat.dateTime(""))
        assertEquals("pronto", NxFormat.date("pronto"))
    }
}
