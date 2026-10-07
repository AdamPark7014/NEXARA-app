package mx.nexara.mobile.nativeapp.ui.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentoRulesTest {

    @Test
    fun folioConPuntoLlevaPdfDeTodasFormas() {
        // El bug de iOS/Android: «NEX-1-JA.CE-R2» parecía tener extensión «CE-R2» y se compartía sin `.pdf`.
        assertEquals("NEX-1-JA.CE-R2.pdf", nombreDeArchivoSeguro("NEX-1-JA.CE-R2", "pdf"))
        assertEquals("NEX-1-JA.CE-R2-interno.pdf", nombreDeArchivoSeguro("NEX-1-JA.CE-R2-interno", "pdf"))
    }

    @Test
    fun noDuplicaLaExtension() {
        assertEquals("NEX-0007.pdf", nombreDeArchivoSeguro("NEX-0007.pdf", "pdf"))
        assertEquals("NEX-0007.PDF", nombreDeArchivoSeguro("NEX-0007.PDF", "pdf"))
    }

    @Test
    fun conservaAcentosYEspaciosPeroNoSeparadores() {
        assertEquals("Cotización Toks.xlsx", nombreDeArchivoSeguro("  Cotización Toks.xlsx "))
        assertEquals("NEX-2026-7 R2.pdf", nombreDeArchivoSeguro("NEX/2026\\7 R2", "pdf"))
        assertEquals("a-b-c-.txt", nombreDeArchivoSeguro("a:b*c?.txt"))
        assertEquals("documento.pdf", nombreDeArchivoSeguro("   ", "pdf"))
    }

    @Test
    fun mimePorExtensionComoElApi() {
        assertEquals("application/pdf", mimeDeArchivo("NEX-1-JA.CE-R2.pdf"))
        assertEquals("image/jpeg", mimeDeArchivo("foto.JPG"))
        assertEquals("image/heif", mimeDeArchivo("foto.heif"))
        assertEquals("application/vnd.ms-excel.sheet.macroEnabled.12", mimeDeArchivo("Costos.xlsm"))
        assertEquals("application/vnd.ms-powerpoint", mimeDeArchivo("Junta.ppt"))
        assertEquals("text/csv", mimeDeArchivo("lista.csv"))
        assertEquals(MIME_GENERICO, mimeDeArchivo("NEX-1-JA.CE-R2"))
        assertEquals(MIME_GENERICO, mimeDeArchivo("sin-extension"))
    }

    @Test
    fun vistaPreviaSoloExcelCsvYWord() {
        assertTrue(tieneVistaPreviaHtml("Propuesta.XLSX"))
        assertTrue(tieneVistaPreviaHtml("Minuta.docx"))
        assertTrue(tieneVistaPreviaHtml("lista.csv"))
        assertFalse(tieneVistaPreviaHtml("Propuesta.pdf"))
        assertFalse(tieneVistaPreviaHtml("foto.png"))
    }
}
