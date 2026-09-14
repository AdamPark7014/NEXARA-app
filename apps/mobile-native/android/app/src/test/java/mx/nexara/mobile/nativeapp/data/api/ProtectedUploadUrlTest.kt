package mx.nexara.mobile.nativeapp.data.api

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Las fotos y PDF de evidencias se guardan como `/activities/x.jpg` y se sirven
 * en `<origen>/uploads/activities/x.jpg` con token. Espejo de `resolveAssetUrl`
 * (apps/web/lib/evidence-display.ts).
 */
class ProtectedUploadUrlTest {
    private val origin = "https://api.nexara.com.mx"

    @Test
    fun relativeUploadGainsTheUploadsPrefix() {
        assertEquals(
            "https://api.nexara.com.mx/uploads/activities/x.jpg",
            resolveProtectedUploadUrl("/activities/x.jpg", origin),
        )
        assertEquals(
            "https://api.nexara.com.mx/uploads/activities/x.jpg",
            resolveProtectedUploadUrl("activities/x.jpg", origin),
        )
    }

    @Test
    fun uploadsPrefixIsNotDuplicated() {
        assertEquals(
            "https://api.nexara.com.mx/uploads/activities/x.jpg",
            resolveProtectedUploadUrl("/uploads/activities/x.jpg", origin),
        )
        assertEquals(
            "https://api.nexara.com.mx/uploads/activities/x.jpg",
            resolveProtectedUploadUrl("/api/uploads/activities/x.jpg", origin),
        )
    }

    @Test
    fun absoluteApiUploadIsNormalizedAndEncoded() {
        assertEquals(
            "https://api.nexara.com.mx/uploads/activities/foto%20salida.jpg",
            resolveProtectedUploadUrl("http://10.0.2.2:3001/api/uploads/activities/foto salida.jpg", origin),
        )
    }

    @Test
    fun foreignUrlsAndDataUrlsAreUntouched() {
        assertEquals("https://cdn.example.com/logo.png", resolveProtectedUploadUrl("https://cdn.example.com/logo.png", origin))
        assertEquals("data:image/jpeg;base64,AAA", resolveProtectedUploadUrl("data:image/jpeg;base64,AAA", origin))
        assertEquals("", resolveProtectedUploadUrl("   ", origin))
        assertEquals("", resolveProtectedUploadUrl(null, origin))
    }
}
