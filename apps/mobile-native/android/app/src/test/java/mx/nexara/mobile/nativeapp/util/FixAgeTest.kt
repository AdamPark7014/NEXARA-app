package mx.nexara.mobile.nativeapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * De cuándo es la ubicación, medido con el reloj monótono.
 *
 * Es lo que permite al servidor distinguir «estoy aquí» de «aquí estuve la última vez
 * que tuve señal», sin poder ser engañado moviendo la hora del teléfono.
 */
class FixAgeTest {

    private val unSegundo = 1_000_000_000L

    @Test
    fun `una medicion de hace tres segundos son tres mil milisegundos`() {
        val ahora = 100 * unSegundo
        assertEquals(3_000L, FixAge.millis(ahora, ahora - 3 * unSegundo))
    }

    @Test
    fun `una medicion de hace media hora se reporta entera`() {
        val ahora = 10_000 * unSegundo
        val mediaHora = 30 * 60 * unSegundo
        assertEquals(30 * 60 * 1_000L, FixAge.millis(ahora, ahora - mediaHora))
    }

    @Test
    fun `una medicion de este instante es cero, no null`() {
        val ahora = 5 * unSegundo
        assertEquals(0L, FixAge.millis(ahora, ahora))
    }

    @Test
    fun `sin dato del telefono no se inventa una edad`() {
        // Un `Location` sin `elapsedRealtimeNanos` contesta 0: no saber no es «es de ahora».
        assertNull(FixAge.millis(100 * unSegundo, 0L))
        assertNull(FixAge.millis(100 * unSegundo, -1L))
        assertNull(FixAge.millis(0L, 50 * unSegundo))
    }

    @Test
    fun `una medicion del futuro se trata como recien hecha`() {
        // En un reloj monótono esto solo pasa por redondeo; no es motivo para marcar a nadie.
        val ahora = 5 * unSegundo
        assertEquals(0L, FixAge.millis(ahora, ahora + unSegundo))
    }
}
