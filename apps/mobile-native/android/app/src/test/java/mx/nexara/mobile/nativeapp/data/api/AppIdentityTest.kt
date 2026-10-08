package mx.nexara.mobile.nativeapp.data.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lo que manda [ApiClient.aplicarIdentidad] en Retrofit, la cola sin conexión y
 * las descargas. Sin `NexaraApp/` ni `NEXARA App` el servidor ve un navegador de
 * PC y, con la excepción web cerrada, rechaza la checada.
 */
class AppIdentityTest {

    private val cabeceras = AppIdentity.cabeceras(
        version = "1.0.6",
        release = "14",
        modelo = AppIdentity.modelo("samsung", "SM-A536B"),
        nombreVisible = "Galaxy A53 de Iván",
    )

    @Test
    fun `el user agent dice que es la app en android`() {
        val ua = cabeceras.getValue("User-Agent")
        assertTrue(ua.startsWith("NexaraApp/"))
        assertEquals("NexaraApp/1.0.6 (Android 14; samsung SM-A536B) OkHttp", ua)
    }

    @Test
    fun `el navegador es la app`() {
        assertEquals("NEXARA App", cabeceras.getValue("X-Device-Browser"))
        assertEquals("samsung SM-A536B", cabeceras.getValue("X-Device-Model"))
        assertEquals("Android 14", cabeceras.getValue("X-Device-OS"))
    }

    @Test
    fun `el nombre del telefono viaja codificado`() {
        val nombre = cabeceras.getValue("X-Device-Name")
        assertEquals("Galaxy+A53+de+Iv%C3%A1n", nombre)
        assertTrue(nombre.all { it.code < 128 })
    }

    @Test
    fun `sin nombre ni datos del telefono no se inventa nada`() {
        val minimas = AppIdentity.cabeceras(
            version = "",
            release = null,
            modelo = AppIdentity.modelo(null, " "),
            nombreVisible = "  ",
        )
        assertEquals("NexaraApp/0 (Android ?; Android) OkHttp", minimas.getValue("User-Agent"))
        assertEquals("Android", minimas.getValue("X-Device-OS"))
        assertEquals("NEXARA App", minimas.getValue("X-Device-Browser"))
        assertFalse(minimas.containsKey("X-Device-Name"))
    }
}
