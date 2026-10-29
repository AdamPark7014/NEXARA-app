package mx.nexara.mobile.nativeapp.data.offline

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineQueueRulesTest {
    private val base = "https://api.nexara.com.mx/api"

    @Test
    fun `lo cotidiano se encola sin conexion`() {
        assertTrue(OfflineHttpInterceptor.isQueueable("$base/ventas/clientes", "POST"))
        assertTrue(OfflineHttpInterceptor.isQueueable("$base/activity-evidence/12/entrada", "POST"))
    }

    @Test
    fun `decisiones de un superior solo en linea`() {
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/ventas/clientes/5/desactivar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/operational-projects/3/reactivar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/ventas/clientes/5", "DELETE"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/operational-projects/3", "DELETE"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/activities/9/cancelar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/activities/9/reasignar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/attendance/justificaciones", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/auth/login", "POST"))
    }

    @Test
    fun `el asistente y las tarjetas del chat solo en linea`() {
        // Encolada, la pregunta gastaría IA horas después y la respuesta no le llegaría a nadie.
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/chat/asistente", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/chat/ligas", "POST"))
        // Un mensaje del chat sí se encola, como siempre.
        assertTrue(OfflineHttpInterceptor.isQueueable("$base/chat/channels/3/messages", "POST"))
    }

    @Test
    fun `iniciar una actividad solo en linea`() {
        // Guarda la hora real de inicio: encolada quedaría la hora de cuando regrese la señal.
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/9/iniciar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/9/aceptar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/9/rechazar", "POST"))
    }

    @Test
    fun `pausar y reanudar el reloj solo en linea`() {
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/9/pausar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/9/reanudar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/board/4/activities/9/pausar", "POST"))
    }

    @Test
    fun `escaner de almacen y herramientas solo en linea`() {
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/stock/movements/por-codigo", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/stock/products/por-codigo", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/ai/complejidad/sugerir", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/7/trayectos", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/me/activities/7/trayectos/terminar", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/tool-requests/7/deliver", "POST"))
        assertFalse(OfflineHttpInterceptor.isQueueable("$base/tool-requests/7/return", "POST"))
        // La prórroga del propio préstamo sí se encola.
        assertTrue(OfflineHttpInterceptor.isQueueable("$base/tool-requests/7/renewal-request", "POST"))
    }
}
