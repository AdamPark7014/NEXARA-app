package mx.nexara.mobile.nativeapp.ui.tickets.screens

import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventoryItemDto
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusLabels
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

// Reglas puras del portal de clientes y sucursales (sin Compose ni red), para
// poder probarlas en la JVM. Referencia: iOS `UI/Portal` y la web de tickets.

/** Zona del portal: los clientes operan en hora de la Ciudad de México. */
internal val PORTAL_ZONE: ZoneId = ZoneId.of("America/Mexico_City")

/**
 * Rango `start`/`end` (ISO-8601) que se manda a `…/tickets` para filtrar por
 * `fechaAsignacion`. `all` = sin rango.
 *
 * «Hoy» empieza a la medianoche de la Ciudad de México. Antes se tomaba en UTC
 * (`ZoneOffset.UTC`): de 18:00 a 23:59 de México el día UTC ya era el
 * siguiente y «Hoy» arrancaba a las 18:00 locales, así que no traía nada de lo
 * asignado ese día.
 */
internal fun resolveTicketDateRange(
    range: String,
    now: Instant = Instant.now(),
    zone: ZoneId = PORTAL_ZONE,
): Pair<String?, String?> {
    if (range == "all") return null to null
    val start = when (range) {
        "today" -> now.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()
        "30d" -> now.minus(30, ChronoUnit.DAYS)
        else -> now.minus(7, ChronoUnit.DAYS)
    }
    return start.toString() to now.toString()
}

/** Un archivo de evidencia del ticket tal como lo ve el cliente. `url` puede ser relativa. */
internal data class PortalEvidenceFile(
    val title: String,
    val comments: String,
    val uploadedAt: String,
    val url: String,
) {
    val isPdf: Boolean get() = url.substringBefore('?').lowercase().endsWith(".pdf")
    val isImage: Boolean get() = url.isNotBlank() && !isPdf
}

/**
 * Evidencias del detalle de ticket: primero las de `evidencias` y luego las del
 * flujo de evidencia del técnico (foto de llegada, fotos de trabajo, PDF de la
 * hoja de servicio y foto de salida), sin repetir archivos.
 *
 * El flujo llega en `activityEvidences` (arreglo, `include` de
 * `client-portal/tickets/:id` y `branch-portal/tickets/:id`), con
 * `entryPhotoUrl`, `evidencePhotos`, `serviceSheetPdfUrl` y `exitPhotoUrl`.
 * Android lo buscaba en `activityEvidence` (singular) y además leía
 * `archivoUrl`, que el flujo no tiene: esas fotos nunca aparecían. Mismas
 * etiquetas que la web (`buildTicketEvidenceFiles`) e iOS.
 */
internal fun portalTicketEvidenceFiles(ticket: ClientPortalTicketDto): List<PortalEvidenceFile> {
    val out = mutableListOf<PortalEvidenceFile>()
    val seen = mutableSetOf<String>()
    fun add(item: PortalEvidenceFile) {
        val key = item.url.ifBlank { "sin-archivo-${out.size}" }
        if (!seen.add(key)) return
        out += item
    }

    for (ev in portalMapList(ticket.evidencias)) {
        add(
            PortalEvidenceFile(
                title = portalMapStr(ev, "tipoEvidencia", "description", "descripcion", "name", "tipo"),
                comments = portalMapStr(ev, "comentarios", "description", "descripcion"),
                uploadedAt = portalMapStr(ev, "subidoEn", "createdAt", "fecha", "uploadedAt"),
                url = portalMapStr(ev, "archivoUrl", "fileUrl", "url", "path"),
            ),
        )
    }

    val sheetPdf = portalAsMap(ticket.serviceSheet)?.let { portalMapStr(it, "pdfUrl") }.orEmpty()
    val flows = portalMapList(ticket.activityEvidences) + portalMapList(ticket.activityEvidence)
    for (flow in flows) {
        fun file(title: String, urlKey: String, whenKey: String) {
            val url = portalMapStr(flow, urlKey)
            if (url.isBlank()) return
            add(PortalEvidenceFile(title, "", portalMapStr(flow, whenKey), url))
        }
        file("Foto llegada", "entryPhotoUrl", "entryPhotoUploadedAt")
        val photos = (flow["evidencePhotos"] as? List<*>).orEmpty()
            .mapNotNull { (it as? String)?.trim()?.takeIf { url -> url.isNotEmpty() } }
        photos.forEachIndexed { index, url ->
            add(PortalEvidenceFile("Evidencia ${index + 1}", "", portalMapStr(flow, "evidencePhotosUploadedAt"), url))
        }
        val pdf = portalMapStr(flow, "serviceSheetPdfUrl").ifBlank { sheetPdf }
        if (pdf.isNotBlank()) {
            add(PortalEvidenceFile("PDF hoja de servicio", "", portalMapStr(flow, "serviceSheetUploadedAt"), pdf))
        }
        file("Foto salida", "exitPhotoUrl", "exitPhotoUploadedAt")
    }
    return out
}

/**
 * Comparación del equipo contra el inventario anterior (`compareState` del API:
 * `UNCHANGED` / `UPDATED`). Android lo pintaba en inglés y en mayúsculas.
 */
internal fun inventoryCompareStateLabel(raw: String?): String? {
    val key = raw?.trim().orEmpty()
    if (key.isEmpty()) return null
    return when (key.uppercase()) {
        "UNCHANGED" -> "Sin cambios"
        "UPDATED" -> "Actualizado"
        else -> NxStatusLabels.label(key)
    }
}

/** «SN: ABC123 · Sin cambios · Activo» (antes «… · UNCHANGED · ACTIVE»). */
internal fun inventoryItemMeta(item: ClientPortalInventoryItemDto): String = buildList {
    item.serialNumber?.trim()?.takeIf { it.isNotEmpty() }?.let { add("SN: $it") }
    inventoryCompareStateLabel(item.compareState)?.let { add(it) }
    item.itemStatus?.trim()?.takeIf { it.isNotEmpty() }?.let { add(NxStatusLabels.label(it)) }
}.joinToString(" · ")

/** Urgencias que acepta el API con su texto en español (antes «LOW/MEDIUM/HIGH»). */
internal val PORTAL_URGENCIES: List<Pair<String, String>> = listOf(
    "LOW" to "Baja",
    "MEDIUM" to "Media",
    "HIGH" to "Alta",
)

/** Tipos de solicitud con el texto de la web (`getFlowLabel`), no «ISSUE». */
internal val PORTAL_REQUEST_TYPES: List<Pair<String, String>> = listOf(
    "ISSUE" to "Ticket por problema",
    "PREVENTIVE_INVENTORY" to "Mantenimiento e inventario",
)

internal fun portalOptionLabel(options: List<Pair<String, String>>, key: String): String =
    options.firstOrNull { it.first.equals(key, ignoreCase = true) }?.second ?: NxStatusLabels.label(key)

/**
 * Latitud o longitud escrita a mano; `null` si está vacía o no es un número.
 * Acepta el menos tipográfico («−», que meten algunos teclados al pegar) y la
 * coma decimal. En México la longitud es negativa.
 */
internal fun parseCoordinate(raw: String): Double? {
    val s = raw.trim().replace('−', '-').replace(',', '.')
    if (s.isEmpty()) return null
    return s.toDoubleOrNull()?.takeIf { it.isFinite() }
}

/**
 * Sólo deja en el campo lo que puede formar una coordenada (dígitos, punto,
 * coma y signo menos), sea que llegue tecleado o pegado.
 */
internal fun sanitizeCoordinateInput(raw: String): String =
    raw.filter { it.isDigit() || it == '.' || it == ',' || it == '-' || it == '−' }

/**
 * Botón «±» del campo. `KeyboardType.Decimal` de Compose no pide signo
 * (`TYPE_NUMBER_FLAG_SIGNED`) y varios teclados no enseñan «-»; en México la
 * longitud es negativa, así que sin esto no había forma de capturarla.
 */
internal fun toggleCoordinateSign(raw: String): String {
    val s = raw.trim()
    return when {
        s.startsWith("-") || s.startsWith("−") -> s.drop(1)
        else -> "-$s"
    }
}

/** Error de coordenadas para el formulario de sucursal, o `null` si están bien (o vacías). */
internal fun branchCoordinatesError(latitud: String, longitud: String): String? {
    if (latitud.isNotBlank()) {
        val lat = parseCoordinate(latitud) ?: return "Latitud inválida. Ejemplo: 19.0414"
        if (lat < -90.0 || lat > 90.0) return "La latitud va de -90 a 90"
    }
    if (longitud.isNotBlank()) {
        val lng = parseCoordinate(longitud) ?: return "Longitud inválida. Ejemplo: -98.2063"
        if (lng < -180.0 || lng > 180.0) return "La longitud va de -180 a 180"
    }
    return null
}

@Suppress("UNCHECKED_CAST")
internal fun portalAsMap(value: Any?): Map<String, Any?>? = value as? Map<String, Any?>

@Suppress("UNCHECKED_CAST")
internal fun portalMapList(value: Any?): List<Map<String, Any?>> = when (value) {
    is List<*> -> value.mapNotNull { it as? Map<String, Any?> }
    is Map<*, *> -> listOf(value as Map<String, Any?>)
    else -> emptyList()
}

internal fun portalMapStr(map: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val s = map[k]?.toString()?.trim() ?: continue
        if (s.isNotEmpty() && s != "null") return s
    }
    return ""
}
