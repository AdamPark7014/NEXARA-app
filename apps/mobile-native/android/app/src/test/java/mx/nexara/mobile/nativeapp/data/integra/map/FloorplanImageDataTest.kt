package mx.nexara.mobile.nativeapp.data.integra.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El plano viaja dentro del JSON, y ahí es donde se rompe.
 *
 * Estas pruebas cubren los casos que dejan la pantalla en blanco sin decir por
 * qué, que es el peor desenlace posible para un visor de planos.
 */
class FloorplanImageDataTest {

    private val base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"

    @Test
    fun `separa la cabecera del uri de datos`() {
        val payload = FloorplanImageData.parse("data:image/png;base64,$base64")
        assertEquals("image/png", payload?.mimeType)
        assertEquals(base64, payload?.base64)
    }

    @Test
    fun `quita los saltos de linea de dentro del base64`() {
        // Un URI de datos generado a mano llega troceado en líneas. `Base64.decode`
        // no siempre lo perdona, y el fallo se ve como un plano en blanco.
        val troceado = "data:image/png;base64,${base64.chunked(20).joinToString("\n")}"
        assertEquals(base64, FloorplanImageData.parse(troceado)?.base64)
    }

    @Test
    fun `acepta base64 pelado sin cabecera`() {
        // El servidor sólo exige que `imageData` mida más de 32 caracteres: nada
        // garantiza la cabecera, y un plano que existe tiene que verse.
        val payload = FloorplanImageData.parse(base64)
        assertNull(payload?.mimeType)
        assertEquals(base64, payload?.base64)
    }

    @Test
    fun `una url no es una imagen incrustada`() {
        // Este es el caso que hay que distinguir para poder decirlo con palabras
        // en vez de enseñar un recuadro vacío.
        assertNull(FloorplanImageData.parse("https://cdn.example.com/planta.png"))
        assertNull(FloorplanImageData.parse("/uploads/planta-baja.png"))
        assertTrue(FloorplanImageData.isRemoteUrl("http://10.0.0.5/plano.jpg"))
        assertFalse(FloorplanImageData.isRemoteUrl("data:image/png;base64,$base64"))
    }

    @Test
    fun `data uri sin marca base64 no se adivina`() {
        assertNull(FloorplanImageData.parse("data:image/svg+xml,<svg/>"))
    }

    @Test
    fun `vacio y nulo no revientan`() {
        assertNull(FloorplanImageData.parse(null))
        assertNull(FloorplanImageData.parse("   "))
        assertNull(FloorplanImageData.parse("data:image/png;base64,"))
    }

    @Test
    fun `basura corta no pasa por base64 pelado`() {
        assertNull(FloorplanImageData.parse("no soy una imagen"))
    }
}
