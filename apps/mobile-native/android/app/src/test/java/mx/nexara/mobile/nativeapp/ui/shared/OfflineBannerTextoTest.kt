package mx.nexara.mobile.nativeapp.ui.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** La banda pone un dato por renglón y ofrece Reintentar solo cuando puede salir algo. */
class OfflineBannerTextoTest {

    @Test
    fun unDatoPorRenglon() {
        assertEquals(
            listOf("Sin conexión", "3 en cola (incl. fotos)"),
            lineasOfflineBanner(isOffline = true, pendingMutations = 3),
        )
        assertEquals(
            listOf("Sin conexión", "cambios y fotos se encolan localmente"),
            lineasOfflineBanner(isOffline = true, pendingMutations = 0),
        )
        assertEquals(listOf("Pendientes de sync: 3"), lineasOfflineBanner(isOffline = false, pendingMutations = 3))
        assertEquals(emptyList<String>(), lineasOfflineBanner(isOffline = false, pendingMutations = 0))
    }

    @Test
    fun reintentarSoloConSenalYCola() {
        assertTrue(ofreceReintentarOffline(isOffline = false, pendingMutations = 3))
        assertFalse(ofreceReintentarOffline(isOffline = true, pendingMutations = 3))
        assertFalse(ofreceReintentarOffline(isOffline = false, pendingMutations = 0))
    }
}
