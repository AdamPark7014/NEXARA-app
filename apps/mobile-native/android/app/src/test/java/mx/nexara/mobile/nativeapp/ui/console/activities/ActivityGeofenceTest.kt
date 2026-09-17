package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.GeocercaDto
import mx.nexara.mobile.nativeapp.data.api.GeocercaOrigenDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mismas cifras que `apps/api/src/activities/geofence/geocerca.spec.ts`. */
class ActivityGeofenceTest {
    private val inicio = GeocercaDto(origen = GeocercaOrigenDto(latitude = 19.0414, longitude = -98.2063), radioM = 100)

    @Test
    fun `0_001 grados de latitud son unos 111 m`() {
        val d = ActivityGeofence.distanciaM(19.0414, -98.2063, 19.0424, -98.2063)
        assertTrue("d=$d", d in 109..113)
    }

    @Test
    fun `a 55 m esta dentro y a 150 m fuera`() {
        assertTrue(ActivityGeofence.distanciaAlInicio(inicio, 19.0419, -98.2063)!! <= 100)
        assertTrue(ActivityGeofence.distanciaAlInicio(inicio, 19.04275, -98.2063)!! > 100)
    }

    @Test
    fun `sin punto de inicio no hay contra que medir`() {
        assertNull(ActivityGeofence.distanciaAlInicio(GeocercaDto(), 19.0, -98.0))
        assertNull(ActivityGeofence.distanciaAlInicio(inicio, null, null))
    }

    @Test
    fun `el mensaje dice la distancia y el maximo`() {
        val m = ActivityGeofence.mensajeSalida(245)
        assertTrue(m.contains("245 m"))
        assertTrue(m.contains("100 m"))
        assertEquals(100, ActivityGeofence.RADIO_M)
    }
}
