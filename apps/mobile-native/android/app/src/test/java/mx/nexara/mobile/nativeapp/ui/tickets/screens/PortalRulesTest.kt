package mx.nexara.mobile.nativeapp.ui.tickets.screens

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventoryItemDto
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

class PortalRulesTest {

    // ── «Hoy» en Tickets ────────────────────────────────────────────────

    @Test
    fun `hoy a las 1930 de Mexico empieza a la medianoche de Mexico y no de UTC`() {
        // 2026-10-04 19:30 en CDMX (UTC-6) = 2026-10-05 01:30Z: en UTC ya es «mañana».
        val now = Instant.parse("2026-10-05T01:30:00Z")
        val (start, end) = resolveTicketDateRange("today", now)
        assertEquals("2026-10-04T06:00:00Z", start)
        assertEquals("2026-10-05T01:30:00Z", end)
    }

    @Test
    fun `hoy por la manana tambien arranca a las 0000 de Mexico`() {
        val now = Instant.parse("2026-10-05T14:00:00Z") // 08:00 en CDMX
        assertEquals("2026-10-05T06:00:00Z", resolveTicketDateRange("today", now).first)
    }

    @Test
    fun `hoy justo antes de medianoche sigue siendo el mismo dia en Mexico`() {
        val now = Instant.parse("2026-10-06T05:59:00Z") // 2026-10-05 23:59 en CDMX
        assertEquals("2026-10-05T06:00:00Z", resolveTicketDateRange("today", now).first)
    }

    @Test
    fun `7 y 30 dias cuentan hacia atras y todos no manda rango`() {
        val now = Instant.parse("2026-10-05T12:00:00Z")
        assertEquals(now.minus(7, ChronoUnit.DAYS).toString(), resolveTicketDateRange("7d", now).first)
        assertEquals(now.minus(30, ChronoUnit.DAYS).toString(), resolveTicketDateRange("30d", now).first)
        assertEquals(null to null, resolveTicketDateRange("all", now))
    }

    // ── Evidencias del ticket ───────────────────────────────────────────

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private fun ticket(json: String): ClientPortalTicketDto =
        moshi.adapter(ClientPortalTicketDto::class.java).fromJson(json)!!

    @Test
    fun `lee el flujo del tecnico de activityEvidences`() {
        // Forma real de `GET client-portal/tickets/:id` (include `activityEvidences`).
        val t = ticket(
            """
            {
              "id": 10, "titulo": "Falla cámara", "estatus": "FINALIZADA",
              "evidencias": [
                { "tipoEvidencia": "Foto adicional", "archivoUrl": "/uploads/ev/extra.jpg", "comentarios": "Poste" }
              ],
              "serviceSheet": { "status": "SIGNED", "pdfUrl": "/uploads/sheets/hoja.pdf" },
              "activityEvidences": [
                {
                  "id": 1, "userId": 4, "status": "COMPLETED",
                  "entryPhotoUrl": "/uploads/flow/llegada.jpg", "entryPhotoUploadedAt": "2026-10-05T15:00:00.000Z",
                  "evidencePhotos": ["/uploads/flow/t1.jpg", "/uploads/flow/t2.jpg"],
                  "serviceSheetPdfUrl": null,
                  "exitPhotoUrl": "/uploads/flow/salida.jpg"
                }
              ]
            }
            """.trimIndent(),
        )
        val files = portalTicketEvidenceFiles(t)
        assertEquals(
            listOf("Foto adicional", "Foto llegada", "Evidencia 1", "Evidencia 2", "PDF hoja de servicio", "Foto salida"),
            files.map { it.title },
        )
        assertEquals(
            listOf(
                "/uploads/ev/extra.jpg",
                "/uploads/flow/llegada.jpg",
                "/uploads/flow/t1.jpg",
                "/uploads/flow/t2.jpg",
                "/uploads/sheets/hoja.pdf",
                "/uploads/flow/salida.jpg",
            ),
            files.map { it.url },
        )
        assertEquals("Poste", files[0].comments)
        assertEquals("2026-10-05T15:00:00.000Z", files[1].uploadedAt)
        assertTrue(files[4].isPdf)
        assertFalse(files[4].isImage)
        assertTrue(files[1].isImage)
    }

    @Test
    fun `no repite archivos y acepta el campo viejo en singular`() {
        val t = ticket(
            """
            {
              "id": 11,
              "evidencias": [ { "tipoEvidencia": "Llegada", "archivoUrl": "/uploads/flow/a.jpg" } ],
              "activityEvidence": {
                "entryPhotoUrl": "/uploads/flow/a.jpg",
                "serviceSheetPdfUrl": "/uploads/flow/hoja.pdf?v=2"
              }
            }
            """.trimIndent(),
        )
        val files = portalTicketEvidenceFiles(t)
        assertEquals(listOf("Llegada", "PDF hoja de servicio"), files.map { it.title })
        assertTrue(files[1].isPdf)
    }

    @Test
    fun `sin evidencias no hay archivos`() {
        assertTrue(portalTicketEvidenceFiles(ClientPortalTicketDto(id = 1)).isEmpty())
    }

    // ── Textos del portal en español ────────────────────────────────────

    @Test
    fun `comparacion y estatus del equipo en espanol`() {
        assertEquals("Sin cambios", inventoryCompareStateLabel("UNCHANGED"))
        assertEquals("Actualizado", inventoryCompareStateLabel("updated"))
        assertNull(inventoryCompareStateLabel("  "))
        val item = ClientPortalInventoryItemDto(serialNumber = "SN-9", compareState = "UNCHANGED", itemStatus = "ACTIVE")
        assertEquals("SN: SN-9 · Sin cambios · Activo", inventoryItemMeta(item))
        assertEquals("", inventoryItemMeta(ClientPortalInventoryItemDto()))
    }

    @Test
    fun `urgencias y tipos de solicitud con su etiqueta`() {
        assertEquals(listOf("Baja", "Media", "Alta"), PORTAL_URGENCIES.map { it.second })
        assertEquals(listOf("LOW", "MEDIUM", "HIGH"), PORTAL_URGENCIES.map { it.first })
        assertEquals("Media", portalOptionLabel(PORTAL_URGENCIES, "MEDIUM"))
        assertEquals("Ticket por problema", portalOptionLabel(PORTAL_REQUEST_TYPES, "ISSUE"))
        assertEquals("Mantenimiento e inventario", portalOptionLabel(PORTAL_REQUEST_TYPES, "PREVENTIVE_INVENTORY"))
    }

    // ── Coordenadas de sucursal ─────────────────────────────────────────

    @Test
    fun `la longitud negativa se captura y se lee`() {
        assertEquals(-98.2063, parseCoordinate("-98.2063")!!, 1e-9)
        assertEquals(-98.2063, parseCoordinate(" −98,2063 ")!!, 1e-9)
        assertEquals(19.0414, parseCoordinate("19.0414")!!, 1e-9)
        assertNull(parseCoordinate(""))
        assertNull(parseCoordinate("-"))
        assertNull(parseCoordinate("abc"))
    }

    @Test
    fun `el boton mas menos cambia el signo`() {
        assertEquals("-98.2", toggleCoordinateSign("98.2"))
        assertEquals("98.2", toggleCoordinateSign("-98.2"))
        assertEquals("98.2", toggleCoordinateSign("−98.2"))
        assertEquals("-", toggleCoordinateSign(""))
    }

    @Test
    fun `el campo solo admite caracteres de coordenada`() {
        assertEquals("-98.2063", sanitizeCoordinateInput("-98.2063"))
        assertEquals("19,04", sanitizeCoordinateInput("19,04 N"))
    }

    @Test
    fun `coordenadas invalidas o fuera de rango no se guardan en silencio`() {
        assertNull(branchCoordinatesError("19.0414", "-98.2063"))
        assertNull(branchCoordinatesError("", ""))
        assertTrue(branchCoordinatesError("x", "")!!.startsWith("Latitud inválida"))
        assertTrue(branchCoordinatesError("", "-")!!.startsWith("Longitud inválida"))
        assertEquals("La latitud va de -90 a 90", branchCoordinatesError("91", ""))
        assertEquals("La longitud va de -180 a 180", branchCoordinatesError("", "-181"))
    }
}
