package mx.nexara.mobile.nativeapp.ui.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveCameraCaptureCopyTest {

    @Test
    fun `el aviso de la foto cabe en una frase`() {
        val viejo = "¿Se ve bien? Si salió oscura o movida, toma otra."
        assertEquals(2, frases(viejo))
        assertTrue(viejo.contains("¿Se ve bien?"))
        assertTrue(viejo.contains("Si salió oscura o movida, toma otra."))

        assertNotEquals(viejo, AVISO_REVISAR_FOTO)
        assertFalse(AVISO_REVISAR_FOTO.contains("¿Se ve bien?"))
        assertEquals("Si no se ve bien porque salió oscura o movida, toma otra.", AVISO_REVISAR_FOTO)
        assertEquals(1, frases(AVISO_REVISAR_FOTO))
        assertTrue(AVISO_REVISAR_FOTO.contains("se ve bien"))
        assertTrue(AVISO_REVISAR_FOTO.contains("oscura o movida"))
        assertTrue(AVISO_REVISAR_FOTO.contains("toma otra"))
    }

    private fun frases(texto: String) = texto.count { it == '.' || it == '?' || it == '!' }
}
