package mx.nexara.mobile.nativeapp.data.integra.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El patrón que estas pruebas persiguen está documentado en el proyecto: un
 * `data class` con un campo no nulable que recibe `null` revienta la
 * deserialización ENTERA y la pantalla sale vacía sin decir por qué. Aquí se
 * comprueba que una fila llena de nulos produce un objeto utilizable en vez de
 * una excepción, y que una fila inservible se descarta sola.
 */
class IntegraCameraTest {

    /** Fila del espejo tal como la arma `listCameras` (rama `source: mirror`). */
    private fun filaEspejo() = mapOf<String, Any?>(
        "id" to "cam-1",
        "name" to "Entrada principal",
        "region" to "Oficinas",
        "regionId" to "r1",
        "status" to "1",
        "encodeDevIndexCode" to "nvr-1",
        "hasAudio" to true,
        "doorIndexCode" to null,
        "isDoorCamera" to false,
        "sourceIp" to "192.168.9.34",
        "model" to "DS-2CD2143G0-I",
        "channelNumber" to 3.0,
        "isPtz" to true,
        "anprCapable" to false,
    )

    @Test
    fun fromMap_filaCompleta_mapeaTodo() {
        val c = IntegraCamera.fromMap(filaEspejo())
        assertNotNull(c)
        assertEquals("cam-1", c?.id)
        assertEquals("Entrada principal", c?.name)
        assertEquals("Oficinas", c?.region)
        assertEquals(true, c?.isPtz)
        assertEquals(true, c?.hasAudio)
        assertEquals("192.168.9.34", c?.sourceIp)
        // Moshi entrega los números JSON como Double; tiene que llegar como Int.
        assertEquals(3, c?.channelNumber)
    }

    @Test
    fun fromMap_todoNuloSalvoElId_noLanzaYRellenaConRespaldo() {
        val c = IntegraCamera.fromMap(
            mapOf(
                "id" to "cam-9",
                "name" to null,
                "region" to null,
                "status" to null,
                "isPtz" to null,
                "hasAudio" to null,
                "sourceIp" to null,
                "model" to null,
                "channelNumber" to null,
            ),
        )
        assertNotNull(c)
        // Sin nombre, el id es un nombre honesto; una tarjeta en blanco no.
        assertEquals("cam-9", c?.name)
        assertNull(c?.region)
        assertNull(c?.channelNumber)
        assertFalse(c?.isPtz ?: true)
    }

    @Test
    fun fromMap_sinIdentificador_seDescartaLaFila() {
        assertNull(IntegraCamera.fromMap(mapOf("name" to "Sin id")))
        assertNull(IntegraCamera.fromMap(mapOf("id" to null)))
        assertNull(IntegraCamera.fromMap(mapOf("id" to "")))
        assertNull(IntegraCamera.fromMap(emptyMap()))
    }

    @Test
    fun fromMap_camaraEnVivo_usaLosNombresDeArtemis() {
        // La rama `source: live` de la API usa otras claves.
        val c = IntegraCamera.fromMap(
            mapOf("cameraIndexCode" to "AA11", "cameraName" to "Patio", "regionName" to "Planta"),
        )
        assertEquals("AA11", c?.id)
        assertEquals("Patio", c?.name)
        assertEquals("Planta", c?.region)
    }

    /**
     * `onlineish` del muro web: un estado ausente NO es una cámara caída. Hay
     * sitios que no reportan estado y tratarlos como caídos escondería cámaras
     * que sí están viendo.
     */
    @Test
    fun online_estadoAusenteOVacio_cuentaComoEnLinea() {
        fun conEstado(v: Any?) = IntegraCamera.fromMap(mapOf("id" to "c", "status" to v))?.online
        assertEquals(true, conEstado(null))
        assertEquals(true, conEstado(""))
        assertEquals(true, conEstado("1"))
        assertEquals(true, conEstado(1.0))
        assertEquals(true, conEstado("online"))
        assertEquals(false, conEstado("0"))
        assertEquals(false, conEstado("offline"))
    }
}

class IntegraStreamSlotTest {

    @Test
    fun fromBatchItem_camaraQueAbrio_traeElHls() {
        val slot = IntegraStreamSlot.fromBatchItem(
            mapOf(
                "cameraIndexCode" to "cam-1",
                "ok" to true,
                "error" to null,
                "stream" to mapOf(
                    "cameraIndexCode" to "cam-1",
                    "provider" to "ISAPI",
                    "rtsp" to "rtsp://***@10.0.0.9/101",
                    "hls" to "https://integra.nexara.com.mx/go2rtc/api/stream.m3u8?src=cam_1",
                    "hasAudio" to false,
                    "note" to null,
                ),
            ),
        )
        assertEquals("cam-1", slot?.cameraId)
        assertEquals(true, slot?.ok)
        assertTrue(slot?.hls?.contains("stream.m3u8") == true)
        assertEquals("", motivoSinImagen(slot))
    }

    /** Regla que no se negocia en la API: una cámara rota no tumba el lote. */
    @Test
    fun fromBatchItem_camaraQueFallo_conservaElMotivo() {
        val slot = IntegraStreamSlot.fromBatchItem(
            mapOf(
                "cameraIndexCode" to "cam-7",
                "ok" to false,
                "stream" to null,
                "error" to "Cámara cam-7 no está en el espejo del sitio. Corre el sync.",
            ),
        )
        assertEquals(false, slot?.ok)
        assertNull(slot?.hls)
        assertEquals(
            "Cámara cam-7 no está en el espejo del sitio. Corre el sync.",
            motivoSinImagen(slot),
        )
    }

    @Test
    fun fromBatchItem_sinIdentificador_seDescarta() {
        assertNull(IntegraStreamSlot.fromBatchItem(mapOf("ok" to true)))
    }
}

/**
 * El requisito explícito del encargo: si una cámara no da imagen, hay que decir
 * el motivo. Ninguna de estas ramas puede devolver cadena vacía, porque una
 * cadena vacía significa «sí hay imagen» y dejaría la celda muda.
 */
class MotivoSinImagenTest {

    @Test
    fun sinRespuestaDelServidor_loDice() {
        assertTrue(motivoSinImagen(null).isNotBlank())
    }

    @Test
    fun sitioEnLaNube_explicaQueHctNoDaFotogramas() {
        val motivo = motivoSinImagen(
            IntegraStreamSlot(cameraId = "c", ok = true, provider = "HCT", hls = null),
        )
        assertTrue(motivo.contains("HCT"))
    }

    @Test
    fun sinHls_usaLaNotaDelServidorSiLaHay() {
        val motivo = motivoSinImagen(
            IntegraStreamSlot(
                cameraId = "c",
                ok = true,
                hls = null,
                note = "Cámara c no está en el espejo del sitio. Corre el sync.",
            ),
        )
        assertTrue(motivo.contains("espejo"))
    }

    @Test
    fun sinHlsNiNota_daUnMotivoGenericoPeroNoVacio() {
        assertTrue(motivoSinImagen(IntegraStreamSlot("c", ok = true, hls = null)).isNotBlank())
    }

    @Test
    fun hlsConFormatoDesconocido_seDetectaAntesDePintarNada() {
        val motivo = motivoSinImagen(
            IntegraStreamSlot("c", ok = true, hls = "rtsp://10.0.0.9/101"),
        )
        assertTrue(motivo.isNotBlank())
    }

    @Test
    fun okConHlsValido_devuelveVacio() {
        assertEquals(
            "",
            motivoSinImagen(
                IntegraStreamSlot(
                    "c",
                    ok = true,
                    hls = "https://h.mx/go2rtc/api/stream.m3u8?src=cam1",
                ),
            ),
        )
    }
}

class IntegraPtzPresetTest {

    @Test
    fun fromMap_presetValido() {
        val p = IntegraPtzPreset.fromMap(mapOf("id" to 3.0, "name" to "Portón"))
        assertEquals(3, p?.id)
        assertEquals("Portón", p?.name)
    }

    /** `ptzPresets` de ISAPI ya filtra los vacíos, pero el equipo los devuelve. */
    @Test
    fun fromMap_presetSinNombreOSinId_seDescarta() {
        assertNull(IntegraPtzPreset.fromMap(mapOf("id" to 3.0, "name" to null)))
        assertNull(IntegraPtzPreset.fromMap(mapOf("id" to null, "name" to "X")))
        assertNull(IntegraPtzPreset.fromMap(emptyMap()))
    }
}

class IntegraCaptureResultTest {

    @Test
    fun fromMap_respuestaAnidadaEnData() {
        val r = IntegraCaptureResult.fromMap(
            mapOf("code" to "0", "data" to mapOf("picUrl" to "http://10.0.0.9/pic/1.jpg")),
        )
        assertEquals("http://10.0.0.9/pic/1.jpg", r.picUrl)
    }

    /** La API devuelve el crudo de Artemis: no se puede prometer forma. */
    @Test
    fun fromMap_sinUrlReconocible_noLanzaYConservaElCrudo() {
        val r = IntegraCaptureResult.fromMap(mapOf("code" to "0", "msg" to "success"))
        assertNull(r.picUrl)
        assertEquals(2, r.raw.size)
    }

    @Test
    fun fromMap_respuestaVacia_noLanza() {
        assertNull(IntegraCaptureResult.fromMap(emptyMap()).picUrl)
    }
}

/** Los ayudantes de lectura de mapas son la red que evita los `!!`. */
class LecturaDeMapasTest {

    @Test
    fun str_saltaNulosYVaciosHastaEncontrarAlgoUtil() {
        val m = mapOf<String, Any?>("a" to null, "b" to "  ", "c" to "valor")
        assertEquals("valor", m.str("a", "b", "c"))
        assertNull(m.str("a", "b"))
    }

    @Test
    fun str_ignoraLosNulosDeTexto() {
        // Un JSON mal serializado puede traer la cadena "null"; no es un valor.
        assertNull(mapOf<String, Any?>("a" to "null").str("a"))
        assertNull(mapOf<String, Any?>("a" to "undefined").str("a"))
    }

    @Test
    fun int_aceptaElDoubleDeMoshiYElTextoNumerico() {
        assertEquals(3, mapOf<String, Any?>("a" to 3.0).int("a"))
        assertEquals(3, mapOf<String, Any?>("a" to "3").int("a"))
        assertNull(mapOf<String, Any?>("a" to "tres").int("a"))
        assertNull(mapOf<String, Any?>("a" to null).int("a"))
    }

    @Test
    fun bool_aceptaLasTresFormasQueUsaLaApi() {
        assertEquals(true, mapOf<String, Any?>("a" to true).bool("a"))
        assertEquals(true, mapOf<String, Any?>("a" to 1.0).bool("a"))
        assertEquals(true, mapOf<String, Any?>("a" to "true").bool("a"))
        assertEquals(false, mapOf<String, Any?>("a" to "0").bool("a"))
        assertNull(mapOf<String, Any?>("a" to null).bool("a"))
    }

    @Test
    fun asMap_conCualquierOtraCosa_devuelveNullEnVezDeLanzar() {
        assertNull(asMap(null))
        assertNull(asMap("texto"))
        assertNull(asMap(listOf(1, 2)))
        assertNotNull(asMap(mapOf("a" to 1)))
    }

    @Test
    fun asMapList_filtraLoQueNoSeaMapa() {
        val lista = asMapList(listOf(mapOf("a" to 1), "basura", null, mapOf("b" to 2)))
        assertEquals(2, lista.size)
    }
}
