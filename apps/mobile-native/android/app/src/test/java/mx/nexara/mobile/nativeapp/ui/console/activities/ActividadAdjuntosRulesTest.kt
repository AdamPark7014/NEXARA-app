package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.AdjuntoAutorDto
import mx.nexara.mobile.nativeapp.data.api.AdjuntoDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadAdjuntosRules.Icono
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadAdjuntosRules.Tipo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ActividadAdjuntosRulesTest {

    /** Miércoles 7 de octubre de 2026, 13:45 en México (UTC−6, sin horario de verano). */
    private val ahora: Instant = Instant.parse("2026-10-07T19:45:00Z")

    private fun adjunto(
        id: Long = 1L,
        nombre: String? = "Propuesta Toks.xlsx",
        tipo: String? = "excel",
        sizeBytes: Long? = 2_411_725L,
        createdAt: String? = "2026-10-07T19:39:00Z",
        subidoPor: String? = "Luis Joel",
        mimeType: String? = null,
    ) = AdjuntoDto(
        id = id,
        activityId = 10L,
        nombre = nombre,
        mimeType = mimeType,
        sizeBytes = sizeBytes,
        tipo = tipo,
        createdAt = createdAt,
        subidoPor = subidoPor?.let { AdjuntoAutorDto(id = 7L, nombre = it) },
    )

    // ── Solo en comerciales ─────────────────────────────────────────────────

    @Test
    fun soloLasComercialesLlevanLaSeccion() {
        assertTrue(ActividadAdjuntosRules.aplica("comercial"))
        assertTrue(ActividadAdjuntosRules.aplica(" Comercial "))
        assertFalse(ActividadAdjuntosRules.aplica("instalacion"))
        assertFalse(ActividadAdjuntosRules.aplica(null))
    }

    // ── Tamaño legible ──────────────────────────────────────────────────────

    @Test
    fun tamanoEnBytesKbYMb() {
        assertEquals("0 B", ActividadAdjuntosRules.tamanoLegible(0L))
        assertEquals("512 B", ActividadAdjuntosRules.tamanoLegible(512L))
        assertEquals("2 KB", ActividadAdjuntosRules.tamanoLegible(1_536L))
        assertEquals("48 KB", ActividadAdjuntosRules.tamanoLegible(48L * 1024))
        assertEquals("2.3 MB", ActividadAdjuntosRules.tamanoLegible(2_411_725L))
        assertEquals("25 MB", ActividadAdjuntosRules.tamanoLegible(25L * 1024 * 1024))
    }

    @Test
    fun casiUnMegaSeLeeEnMegas() {
        // 1000 KB o más ya no se escribe «1023 KB».
        assertEquals("1 MB", ActividadAdjuntosRules.tamanoLegible(1_048_000L))
    }

    @Test
    fun sinTamanoNoSeInventa() {
        assertNull(ActividadAdjuntosRules.tamanoLegible(null))
        assertNull(ActividadAdjuntosRules.tamanoLegible(-1L))
    }

    // ── Icono y color por tipo ──────────────────────────────────────────────

    @Test
    fun colorPorTipoDelApi() {
        assertEquals(Tipo.PDF, ActividadAdjuntosRules.tipo("pdf", "x.pdf"))
        assertEquals(0xFFDC2626L, Tipo.PDF.color) // rojo
        assertEquals(0xFF16A34AL, ActividadAdjuntosRules.tipo("excel", "x.xlsx").color) // verde
        assertEquals(0xFF16A34AL, ActividadAdjuntosRules.tipo("csv", "x.csv").color) // verde también
        assertEquals(0xFF2563EBL, ActividadAdjuntosRules.tipo("word", "x.docx").color) // azul
        assertEquals(0xFF64748BL, ActividadAdjuntosRules.tipo("otro", "x.txt").color) // gris
    }

    @Test
    fun iconoPorTipo() {
        assertEquals(Icono.PDF, ActividadAdjuntosRules.icono(Tipo.PDF, "a.pdf"))
        assertEquals(Icono.HOJA, ActividadAdjuntosRules.icono(Tipo.EXCEL, "a.xlsx"))
        assertEquals(Icono.HOJA, ActividadAdjuntosRules.icono(Tipo.CSV, "a.csv"))
        assertEquals(Icono.DOCUMENTO, ActividadAdjuntosRules.icono(Tipo.WORD, "a.docx"))
        assertEquals(Icono.IMAGEN, ActividadAdjuntosRules.icono(Tipo.IMAGEN, "a.jpg"))
        assertEquals(Icono.ARCHIVO, ActividadAdjuntosRules.icono(Tipo.OTRO, "a.txt"))
        // Una presentación sigue siendo gris, pero con su icono.
        assertEquals(Icono.PRESENTACION, ActividadAdjuntosRules.icono(Tipo.OTRO, "Junta.PPTX"))
    }

    @Test
    fun sinTipoDelApiSeDeducePorLaExtension() {
        assertEquals(Tipo.EXCEL, ActividadAdjuntosRules.tipo(null, "Cotización.XLSM"))
        assertEquals(Tipo.IMAGEN, ActividadAdjuntosRules.tipo("", "foto.heic"))
        assertEquals(Tipo.WORD, ActividadAdjuntosRules.tipo("nuevo-tipo", "Minuta.doc"))
        assertEquals(Tipo.OTRO, ActividadAdjuntosRules.tipo(null, "sin-extension"))
    }

    // ── Fecha relativa en hora de México ───────────────────────────────────

    @Test
    fun fechaRelativaEnHoraDeMexico() {
        assertEquals("hoy 13:39", ActividadAdjuntosRules.fechaTexto("2026-10-07T19:39:00Z", ahora))
        // 00:30 UTC del 7 es todavía el 6 en México: «ayer», no «hoy».
        assertEquals("ayer 18:30", ActividadAdjuntosRules.fechaTexto("2026-10-07T00:30:00Z", ahora))
        assertEquals("lun 5 oct 09:05", ActividadAdjuntosRules.fechaTexto("2026-10-05T15:05:00Z", ahora))
        assertEquals("", ActividadAdjuntosRules.fechaTexto(null, ahora))
    }

    @Test
    fun pieDelRenglon() {
        assertEquals("2.3 MB · Luis Joel · hoy 13:39", ActividadAdjuntosRules.pie(adjunto(), ahora))
        // Lo que falta no deja separadores sueltos.
        assertEquals("hoy 13:39", ActividadAdjuntosRules.pie(adjunto(sizeBytes = null, subidoPor = null), ahora))
        assertEquals("", ActividadAdjuntosRules.pie(adjunto(sizeBytes = null, subidoPor = " ", createdAt = null), ahora))
    }

    // ── Antes de subir ──────────────────────────────────────────────────────

    @Test
    fun masDe25MbSeAvisaAntesDeSubir() {
        val limite = 25L * 1024 * 1024
        assertNull(ActividadAdjuntosRules.motivoRechazo("Propuesta.pdf", limite))
        val aviso = ActividadAdjuntosRules.motivoRechazo("Video planta.pdf", limite + 1)
        assertNotNull(aviso)
        assertTrue(aviso!!.contains("«Video planta.pdf»"))
        assertTrue(aviso.contains("25 MB"))
    }

    @Test
    fun tipoNoAceptadoConElTextoDelApi() {
        assertEquals(
            "No se puede adjuntar «instalador.exe». Se aceptan PDF, Excel, Word, PowerPoint, imágenes y texto.",
            ActividadAdjuntosRules.motivoRechazo("instalador.exe", 10L),
        )
        assertNotNull(ActividadAdjuntosRules.motivoRechazo("sin-extension", 10L))
        // Tamaño desconocido: se revisa al copiarlo, no aquí.
        assertNull(ActividadAdjuntosRules.motivoRechazo("Minuta.DOCX", null))
    }

    @Test
    fun mimeParaVerYCompartir() {
        assertEquals(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ActividadAdjuntosRules.mime(adjunto()),
        )
        // Sin extensión manda el tipo del API.
        assertEquals("application/pdf", ActividadAdjuntosRules.mime(adjunto(nombre = "contrato", mimeType = "application/pdf")))
        assertEquals("application/octet-stream", ActividadAdjuntosRules.mime(adjunto(nombre = "contrato")))
    }

    @Test
    fun losNuevosVanArribaSinRepetir() {
        val viejos = listOf(adjunto(id = 2L), adjunto(id = 1L))
        val nuevos = listOf(adjunto(id = 4L), adjunto(id = 3L), adjunto(id = 2L))
        assertEquals(listOf(4L, 3L, 2L, 1L), ActividadAdjuntosRules.conNuevos(viejos, nuevos).map { it.id })
    }

    @Test
    fun textosDeSubida() {
        assertEquals("Subiendo…", ActividadAdjuntosRules.textoSubiendo(1))
        assertEquals("Subiendo 3 archivos…", ActividadAdjuntosRules.textoSubiendo(3))
        assertEquals("Archivo adjuntado", ActividadAdjuntosRules.textoSubidos(1))
        assertEquals("2 archivos adjuntados", ActividadAdjuntosRules.textoSubidos(2))
    }

    @Test
    fun nombreDeRespaldo() {
        assertEquals("Archivo 9", ActividadAdjuntosRules.nombre(adjunto(id = 9L, nombre = "  ")))
        assertEquals("Propuesta Toks.xlsx", ActividadAdjuntosRules.nombre(adjunto()))
    }
}
