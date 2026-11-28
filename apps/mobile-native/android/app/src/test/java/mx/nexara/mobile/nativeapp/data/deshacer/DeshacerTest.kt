package mx.nexara.mobile.nativeapp.data.deshacer

import mx.nexara.mobile.nativeapp.data.offline.OfflineHttpInterceptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeshacerTest {
    @Test
    fun sinIdsNoSeOfreceNada() {
        val antes = Deshacer.oferta.value
        Deshacer.ofrecer("Actividad asignada", Deshacer.TIPO_ACTIVIDAD, emptyList())
        Deshacer.ofrecer("Actividad asignada", Deshacer.TIPO_ACTIVIDAD, listOf(0L, -3L))
        assertEquals(antes, Deshacer.oferta.value)
    }

    @Test
    fun laNuevaReemplazaALaAnteriorYSoloSeDescartaLaPropia() {
        Deshacer.ofrecer("Primera", Deshacer.TIPO_ACTIVIDAD, listOf(5L, 5L))
        val primera = Deshacer.oferta.value!!
        assertEquals(listOf(5L), primera.ids)
        Deshacer.ofrecer("Segunda", Deshacer.TIPO_VIATICO, listOf(9L))
        val segunda = Deshacer.oferta.value!!
        assertNotEquals(primera.clave, segunda.clave)
        // La primera ya no está: descartarla no quita la segunda.
        Deshacer.descartar(primera.clave)
        assertEquals("Segunda", Deshacer.oferta.value?.mensaje)
        Deshacer.descartar(segunda.clave)
        assertNull(Deshacer.oferta.value)
    }

    @Test
    fun deshacerNuncaSeEncolaSinConexion() {
        assertFalse(OfflineHttpInterceptor.isQueueable("https://app.nexara.com.mx/api/deshacer"))
        assertFalse(OfflineHttpInterceptor.isQueueable("https://app.nexara.com.mx/api/attendance/salida/deshacer"))
    }
}
