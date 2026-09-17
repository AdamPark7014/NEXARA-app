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
}
