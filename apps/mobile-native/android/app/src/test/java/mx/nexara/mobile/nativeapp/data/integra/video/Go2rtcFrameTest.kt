package mx.nexara.mobile.nativeapp.data.integra.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La derivación HLS → frame.jpeg es el único punto donde el muro de Android
 * puede quedarse mudo sin que nadie se entere: si el formato de la URL cambia en
 * la API, `parseHls` devuelve `null` y todas las celdas salen «sin imagen».
 * Estas pruebas fijan el contrato con `apps/web/app/(panels)/integra/_LivePlayer.tsx`.
 */
class Go2rtcFrameTest {

    /** La forma real de producción: `GO2RTC_PUBLIC_URL` con path `/go2rtc`. */
    private val hlsProduccion =
        "https://integra.nexara.com.mx/go2rtc/api/stream.m3u8?src=cam_192_168_9_34_301"

    @Test
    fun parseHls_urlDeProduccion_separaBaseYNombre() {
        val parsed = Go2rtcFrame.parseHls(hlsProduccion)
        assertEquals("https://integra.nexara.com.mx/go2rtc", parsed?.base)
        assertEquals("cam_192_168_9_34_301", parsed?.streamName)
    }

    @Test
    fun frameUrl_apuntaALaRutaDeLaListaBlancaDeTraefik() {
        val url = Go2rtcFrame.frameUrl(hlsProduccion, nonce = 7)
        // `Path(/go2rtc/api/frame.jpeg)` es la ruta que el parche P0 de Traefik
        // deja pasar. Si esto dejara de apuntar ahí, el muro móvil moriría en
        // cuanto se despliegue el endurecimiento.
        assertEquals(
            "https://integra.nexara.com.mx/go2rtc/api/frame.jpeg?src=cam_192_168_9_34_301&t=7",
            url,
        )
    }

    @Test
    fun frameUrl_cambiaConElNonce_paraNoServirLaImagenCacheada() {
        val a = Go2rtcFrame.frameUrl(hlsProduccion, nonce = 1)
        val b = Go2rtcFrame.frameUrl(hlsProduccion, nonce = 2)
        assertTrue(a != b)
    }

    @Test
    fun parseHls_sinPathDeGo2rtc_siguenFuncionandoLasBasesRaiz() {
        // Si `GO2RTC_PUBLIC_URL` no llevara sub-path, la base es solo el origen.
        val parsed = Go2rtcFrame.parseHls("https://video.example.com/api/stream.m3u8?src=cam1")
        assertEquals("https://video.example.com", parsed?.base)
        assertEquals("cam1", parsed?.streamName)
    }

    @Test
    fun parseHls_conPuerto_loConserva() {
        val parsed = Go2rtcFrame.parseHls("http://10.0.0.5:1984/api/stream.m3u8?src=cam1")
        assertEquals("http://10.0.0.5:1984", parsed?.base)
    }

    @Test
    fun parseHls_nombreCodificado_seDecodificaYSeVuelveACodificar() {
        val parsed = Go2rtcFrame.parseHls(
            "https://h.mx/go2rtc/api/stream.m3u8?src=cam%20uno",
        )
        assertEquals("cam uno", parsed?.streamName)
        // Al reconstruir, el espacio va como %20 y no como `+`: go2rtc no los
        // trata igual en la parte de consulta.
        assertTrue(Go2rtcFrame.frameUrl(parsed!!, 1).contains("src=cam%20uno"))
    }

    @Test
    fun parseHls_conOtrosParametros_encuentraSrcIgual() {
        val parsed = Go2rtcFrame.parseHls(
            "https://h.mx/go2rtc/api/stream.m3u8?mp4=flac&src=cam9&x=1",
        )
        assertEquals("cam9", parsed?.streamName)
    }

    /**
     * Todo lo que la API puede devolver cuando no consiguió abrir la cámara.
     * Ninguno de estos casos puede lanzar: una URL rara tiene que degradar en un
     * motivo escrito, no en un cierre de la pantalla.
     */
    @Test
    fun parseHls_entradasInvalidas_devuelvenNullSinLanzar() {
        val malas = listOf(
            null,
            "",
            "   ",
            // HCT y los sitios sin espejo devuelven `hls: null`.
            "null",
            // Sin el parámetro src no hay nombre de stream que pedir.
            "https://integra.nexara.com.mx/go2rtc/api/stream.m3u8",
            "https://integra.nexara.com.mx/go2rtc/api/stream.m3u8?other=1",
            // Otro sufijo: no es la URL del muro.
            "https://integra.nexara.com.mx/go2rtc/api/stream.mp4?src=cam1",
            // RTSP crudo: es lo que devuelve `POST cameras/:id/preview`, y no
            // se puede convertir en un JPEG.
            "rtsp://10.0.0.9:554/Streaming/Channels/101",
            // Relativa: sin host no se puede construir nada.
            "/go2rtc/api/stream.m3u8?src=cam1",
            "no es una url",
        )
        for (mala in malas) {
            assertNull("debería ser null: $mala", Go2rtcFrame.parseHls(mala))
            assertNull("debería ser null: $mala", Go2rtcFrame.frameUrl(mala, 1))
        }
    }
}

/**
 * El ritmo es lo que separa este muro de los 2 254 «broken pipe» que documentó
 * `.ai/RELEVO.md`. La política se prueba aparte, sin corrutinas ni reloj.
 */
class FramePacingTest {

    @Test
    fun sinFallos_esperaElHuecoMinimo() {
        assertEquals(FramePacing.MIN_GAP_MS, FramePacing.nextDelayMs(0))
        assertEquals(FramePacing.MIN_GAP_MS, FramePacing.nextDelayMs(-1))
    }

    @Test
    fun conFallos_elHuecoCreceParaNoMartillearUnaCamaraCaida() {
        val uno = FramePacing.nextDelayMs(1)
        val dos = FramePacing.nextDelayMs(2)
        val tres = FramePacing.nextDelayMs(3)
        assertTrue(uno > FramePacing.MIN_GAP_MS)
        assertTrue(dos > uno)
        assertTrue(tres > dos)
    }

    @Test
    fun elRetrocesoTieneTecho() {
        assertEquals(FramePacing.MAX_BACKOFF_MS, FramePacing.nextDelayMs(20))
        assertEquals(FramePacing.MAX_BACKOFF_MS, FramePacing.nextDelayMs(Int.MAX_VALUE))
    }

    /**
     * Guarda de regresión del desbordamiento: sin el tope del desplazamiento, un
     * contador de fallos grande daba un retraso negativo y el bucle se convertía
     * otra vez en una ráfaga sin freno — exactamente el fallo original.
     */
    @Test
    fun nuncaDevuelveUnRetrasoNegativoNiCero() {
        for (fallos in intArrayOf(0, 1, 5, 10, 63, 64, 1000, Int.MAX_VALUE)) {
            val d = FramePacing.nextDelayMs(fallos)
            assertTrue("fallos=$fallos dio $d", d >= FramePacing.MIN_GAP_MS)
            assertTrue("fallos=$fallos dio $d", d <= FramePacing.MAX_BACKOFF_MS)
        }
    }
}
