package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.util.UbicacionFalla
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
    fun `sin coordenadas la nota dice por que`() {
        assertEquals(
            " · sin ubicación: NEXARA no tiene permiso de ubicación",
            AttendanceCheckIn.notaGps(hayCoords = false, accuracyM = null, falla = UbicacionFalla.PERMISO_NEGADO),
        )
        assertEquals(
            " · sin ubicación: la ubicación del teléfono está apagada",
            AttendanceCheckIn.notaGps(hayCoords = false, accuracyM = null, falla = UbicacionFalla.UBICACION_APAGADA),
        )
        assertEquals(
            " · sin ubicación: el teléfono no consiguió señal a tiempo",
            AttendanceCheckIn.notaGps(hayCoords = false, accuracyM = null, falla = UbicacionFalla.SIN_SENAL),
        )
        assertEquals(
            " · sin ubicación",
            AttendanceCheckIn.notaGps(hayCoords = false, accuracyM = null, falla = UbicacionFalla.ERROR),
        )
        // Sin motivo no se adivina uno (antes decía «activa ubicación» a quien ya la tenía).
        assertEquals(" · sin ubicación", AttendanceCheckIn.notaGps(hayCoords = false, accuracyM = null))
    }

    @Test
    fun `con coordenadas el motivo no se muestra`() {
        assertEquals(
            " · GPS ±12m",
            AttendanceCheckIn.notaGps(hayCoords = true, accuracyM = 12f, falla = UbicacionFalla.SIN_SENAL),
        )
    }

    @Test
    fun `la nota de gps dice la precision y cuando quedara para revisar`() {
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
