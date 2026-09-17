package mx.nexara.mobile.nativeapp.data.offline

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contrato A: `offline: true` lo pone la cola al encolar, nunca la pantalla.
 * Si lo pusiera la pantalla, toda checada diría «sin conexión».
 */
class OfflineQueueBodyTest {
    private val base = "https://api.nexara.com.mx/api"
    private val json = "application/json"

    @Test
    fun `la checada encolada queda marcada`() {
        val body = """{"type":"entrada","capturedAt":"2026-09-17T15:00:00Z"}"""
        val marked = OfflineQueueBody.markOffline("$base/attendance", "POST", json, body)
        assertTrue(marked!!.contains("\"offline\":true"))
        assertTrue(marked.contains("\"type\":\"entrada\""))
        assertTrue(marked.contains("\"capturedAt\""))
    }

    @Test
    fun `no se marca dos veces`() {
        val body = """{"offline":true,"type":"salida"}"""
        assertEquals(body, OfflineQueueBody.markOffline("$base/attendance", "POST", json, body))
    }

    @Test
    fun `otras rutas no se tocan`() {
        val body = """{"motivo":"algo"}"""
        assertEquals(body, OfflineQueueBody.markOffline("$base/attendance/justificaciones", "POST", json, body))
        assertEquals(body, OfflineQueueBody.markOffline("$base/activity-evidence/1/entry-photo", "POST", json, body))
        assertEquals(body, OfflineQueueBody.markOffline("$base/attendance", "PATCH", json, body))
    }

    @Test
    fun `un cuerpo que no es json se deja igual`() {
        val bin = "nexara-media-bin://0f6d3a2e-0000-4000-8000-000000000000"
        assertEquals(bin, OfflineQueueBody.markOffline("$base/attendance", "POST", "multipart/form-data", bin))
        assertEquals(bin, OfflineQueueBody.markOffline("$base/attendance", "POST", json, bin))
        assertEquals(null, OfflineQueueBody.markOffline("$base/attendance", "POST", json, null))
    }

    @Test
    fun `cuerpo vacio sigue siendo json valido`() {
        assertEquals(
            """{"offline":true}""",
            OfflineQueueBody.markOffline("$base/attendance", "POST", json, "{}"),
        )
    }

    @Test
    fun `reconoce la ruta de la checada con query o barra final`() {
        assertTrue(OfflineQueueBody.isAttendanceCheckIn("$base/attendance?x=1", "POST"))
        assertTrue(OfflineQueueBody.isAttendanceCheckIn("$base/attendance/", "post"))
        assertFalse(OfflineQueueBody.isAttendanceCheckIn("$base/attendance/history", "POST"))
    }
}
