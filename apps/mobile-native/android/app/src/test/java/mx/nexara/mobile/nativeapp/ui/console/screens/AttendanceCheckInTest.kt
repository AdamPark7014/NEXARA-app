package mx.nexara.mobile.nativeapp.ui.console.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato A: el 422 de ubicación simulada se dice completo, no como «Error al registrar». */
class AttendanceCheckInTest {

    @Test
    fun `el 422 del servidor es ubicacion simulada`() {
        assertTrue(AttendanceCheckIn.esUbicacionSimulada(422, AttendanceCheckIn.MOCK_MENSAJE))
        assertTrue(AttendanceCheckIn.esUbicacionSimulada(422, null))
    }

    @Test
    fun `el mensaje solo tambien lo delata`() {
        assertTrue(
            AttendanceCheckIn.esUbicacionSimulada(
                400,
                "Detectamos una ubicación simulada. Desactiva el GPS falso.",
            ),
        )
    }

    @Test
    fun `otros errores no se disfrazan de gps falso`() {
        assertFalse(AttendanceCheckIn.esUbicacionSimulada(400, "Ya registraste tu entrada de hoy"))
        assertFalse(AttendanceCheckIn.esUbicacionSimulada(null, "Sin conexión. Revisa tu red e intenta de nuevo."))
        assertFalse(AttendanceCheckIn.esUbicacionSimulada(500, "Error del servidor"))
    }

    @Test
    fun `la nota de gps dice la precision y cuando quedara para revisar`() {
        assertEquals(" (sin GPS — activa ubicación)", AttendanceCheckIn.notaGps(hayCoords = false, accuracyM = null))
        assertEquals(" · GPS ok", AttendanceCheckIn.notaGps(hayCoords = true, accuracyM = null))
        assertEquals(" · GPS ±12m", AttendanceCheckIn.notaGps(hayCoords = true, accuracyM = 12f))
        assertEquals(" · GPS ±150m (baja precisión)", AttendanceCheckIn.notaGps(hayCoords = true, accuracyM = 150f))
        assertEquals(
            " · GPS ±320m (quedará para revisar)",
            AttendanceCheckIn.notaGps(hayCoords = true, accuracyM = 320f),
        )
        assertEquals(
            " · ubicación simulada detectada",
            AttendanceCheckIn.notaGps(hayCoords = true, accuracyM = 5f, mock = true),
        )
    }
}
