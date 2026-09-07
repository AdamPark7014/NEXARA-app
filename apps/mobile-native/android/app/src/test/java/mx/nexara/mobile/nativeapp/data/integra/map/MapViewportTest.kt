package mx.nexara.mobile.nativeapp.data.integra.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Los dos fallos de un visor con gestos son de aritmética: el plano que se
 * escapa del marco y el `NaN` que apaga la pantalla sin lanzar nada.
 */
class MapViewportTest {

    private val w = 1000f
    private val h = 800f

    @Test
    fun `sin zoom el plano no se puede arrastrar`() {
        // A escala 1 la imagen entera está a la vista: moverla sólo desorienta.
        val pan = MapViewport.clampPan(Pan(400f, -300f), scale = 1f, viewportWidth = w, viewportHeight = h)
        assertEquals(0f, pan.x, 0.001f)
        assertEquals(0f, pan.y, 0.001f)
    }

    @Test
    fun `el arrastre no pasa del borde`() {
        // A 2x sobra media pantalla por lado: 1000 * (2-1) / 2 = 500.
        val pan = MapViewport.clampPan(Pan(9000f, -9000f), scale = 2f, viewportWidth = w, viewportHeight = h)
        assertEquals(500f, pan.x, 0.001f)
        assertEquals(-400f, pan.y, 0.001f)
    }

    @Test
    fun `el zoom se queda entre sus topes`() {
        assertEquals(MapViewport.MIN_SCALE, MapViewport.clampScale(0.2f), 0.001f)
        assertEquals(MapViewport.MAX_SCALE, MapViewport.clampScale(99f), 0.001f)
        assertEquals(3f, MapViewport.clampScale(3f), 0.001f)
    }

    @Test
    fun `un NaN no apaga la pantalla`() {
        // Metido en un `graphicsLayer`, `Float.NaN` no lanza ninguna excepción:
        // simplemente deja de dibujarse todo. Se sanea en la entrada o no se
        // sanea nunca.
        assertEquals(MapViewport.MIN_SCALE, MapViewport.clampScale(Float.NaN), 0.001f)
        val pan = MapViewport.clampPan(Pan(Float.NaN, Float.POSITIVE_INFINITY), 3f, w, h)
        assertTrue(pan.x.isFinite())
        assertTrue(pan.y.isFinite())
    }

    @Test
    fun `alejar recentra en vez de dejar banda negra`() {
        // Arrastrado al máximo a 4x y luego alejado a 1x, el desplazamiento
        // tiene que volver a cero solo.
        val (scale, pan) = MapViewport.applyGesture(
            scale = 4f,
            pan = Pan(1400f, 1100f),
            zoomChange = 0.25f,
            panChange = Pan.ZERO,
            viewportWidth = w,
            viewportHeight = h,
        )
        assertEquals(1f, scale, 0.001f)
        assertEquals(0f, pan.x, 0.001f)
        assertEquals(0f, pan.y, 0.001f)
    }

    @Test
    fun `un gesto con zoom cero no colapsa el plano`() {
        val (scale, _) = MapViewport.applyGesture(2f, Pan.ZERO, 0f, Pan(10f, 10f), w, h)
        assertEquals(2f, scale, 0.001f)
    }

    @Test
    fun `el doble toque alterna y siempre recentra`() {
        val (acercado, panA) = MapViewport.toggleZoom(1f)
        assertEquals(MapViewport.DOUBLE_TAP_SCALE, acercado, 0.001f)
        assertEquals(Pan.ZERO, panA)

        val (alejado, panB) = MapViewport.toggleZoom(4f)
        assertEquals(MapViewport.MIN_SCALE, alejado, 0.001f)
        assertEquals(Pan.ZERO, panB)
    }

    @Test
    fun `el pin cae donde dice su porcentaje`() {
        val centro = MapViewport.pinOffset(50f, 50f, 400f, 200f)
        assertEquals(200f, centro.x, 0.001f)
        assertEquals(100f, centro.y, 0.001f)
    }

    @Test
    fun `un porcentaje fuera de rango se pega al borde y no desaparece`() {
        val fuera = MapViewport.pinOffset(180f, -40f, 400f, 200f)
        assertEquals(400f, fuera.x, 0.001f)
        assertEquals(0f, fuera.y, 0.001f)
    }

    @Test
    fun `una imagen degenerada no lanza en aspectRatio`() {
        // `Modifier.aspectRatio(0f)` lanza. Un cuadrado se ve mal; una excepción
        // tumba la pantalla.
        assertEquals(1f, MapViewport.aspectRatio(0, 100), 0.001f)
        assertEquals(1f, MapViewport.aspectRatio(100, 0), 0.001f)
        assertEquals(2f, MapViewport.aspectRatio(800, 400), 0.001f)
    }
}
