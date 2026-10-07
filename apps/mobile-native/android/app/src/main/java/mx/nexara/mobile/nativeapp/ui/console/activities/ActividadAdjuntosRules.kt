package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.AdjuntoDto
import mx.nexara.mobile.nativeapp.ui.common.MIME_GENERICO
import mx.nexara.mobile.nativeapp.ui.common.mimeDeArchivo

/**
 * «Archivos de evidencia» de una actividad comercial: Excel, Word, PDF o imágenes de la
 * propuesta, minutas y lo que mande el cliente (Adam, 07-10). Reglas puras de la sección;
 * los textos son los mismos que en la web y en iOS.
 */
object ActividadAdjuntosRules {
    const val TITULO = "Archivos de evidencia"
    const val SUBTITULO = "Excel, Word, PDF o imágenes de la propuesta, minutas y lo que mande el cliente"
    const val VACIO = "Aún no hay archivos"
    const val BOTON = "Adjuntar archivo"

    /** Iguales que en el API (`ADJUNTO_MAX_BYTES`, `ADJUNTOS_MAX_POR_ENVIO`). */
    const val MAX_BYTES: Long = 25L * 1024 * 1024
    const val MAX_POR_ENVIO = 10

    /** Lo que acepta el API (`EXTENSIONES_ADJUNTO`): documentos de oficina, PDF, imágenes y texto. */
    val EXTENSIONES: Set<String> = setOf(
        "pdf", "png", "jpg", "jpeg", "webp", "gif", "heic", "heif",
        "xlsx", "xlsm", "xls", "csv", "docx", "doc", "pptx", "ppt", "txt",
    )

    /** Tipos que ofrece el selector de Android (`OpenMultipleDocuments`). */
    val MIMES_SELECTOR: Array<String> = arrayOf(
        "application/pdf",
        "image/*",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel.sheet.macroEnabled.12",
        "application/vnd.ms-excel",
        "text/csv",
        "text/comma-separated-values",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "text/plain",
    )

    /** Solo las actividades comerciales llevan la sección. */
    fun aplica(coreKind: String?): Boolean = CoreActivityRules.esComercial(coreKind)

    // ── Cómo se ve cada archivo ─────────────────────────────────────────────

    enum class Icono { PDF, HOJA, DOCUMENTO, IMAGEN, PRESENTACION, ARCHIVO }

    /** PDF rojo, Excel verde, Word azul, imagen morada, lo demás gris. */
    enum class Tipo(val icono: Icono, val color: Long) {
        PDF(Icono.PDF, 0xFFDC2626L),
        EXCEL(Icono.HOJA, 0xFF16A34AL),
        CSV(Icono.HOJA, 0xFF16A34AL),
        WORD(Icono.DOCUMENTO, 0xFF2563EBL),
        IMAGEN(Icono.IMAGEN, 0xFF7C3AEDL),
        OTRO(Icono.ARCHIVO, 0xFF64748BL),
    }

    /** El `tipo` que manda el API; si no llega (o no se conoce), se deduce por la extensión. */
    fun tipo(tipoApi: String?, nombre: String?): Tipo {
        when (tipoApi?.trim()?.lowercase()) {
            "pdf" -> return Tipo.PDF
            "imagen" -> return Tipo.IMAGEN
            "excel" -> return Tipo.EXCEL
            "csv" -> return Tipo.CSV
            "word" -> return Tipo.WORD
            "otro" -> return Tipo.OTRO
        }
        return when (extension(nombre)) {
            "pdf" -> Tipo.PDF
            "png", "jpg", "jpeg", "webp", "gif", "heic", "heif" -> Tipo.IMAGEN
            "xlsx", "xlsm", "xls" -> Tipo.EXCEL
            "csv" -> Tipo.CSV
            "docx", "doc" -> Tipo.WORD
            else -> Tipo.OTRO
        }
    }

    /** Icono del renglón: una presentación sigue siendo «otro» (gris), pero se reconoce. */
    fun icono(tipo: Tipo, nombre: String?): Icono =
        if (tipo == Tipo.OTRO && extension(nombre) in setOf("ppt", "pptx")) Icono.PRESENTACION else tipo.icono

    fun extension(nombre: String?): String =
        nombre?.trim()?.lowercase()?.substringAfterLast('.', "")?.takeIf { it.length in 1..5 }.orEmpty()

    fun nombre(adjunto: AdjuntoDto): String =
        adjunto.nombre?.trim()?.ifEmpty { null } ?: "Archivo ${adjunto.id}"

    /** El tipo para ver, guardar y compartir: por la extensión y, si no la hay, el que manda el API. */
    fun mime(adjunto: AdjuntoDto): String {
        val porNombre = mimeDeArchivo(nombre(adjunto))
        if (porNombre != MIME_GENERICO) return porNombre
        return adjunto.mimeType?.trim()?.ifEmpty { null } ?: MIME_GENERICO
    }

    // ── El renglón: «2.3 MB · Luis Joel · hoy 13:39» ────────────────────────

    /** «512 B», «48 KB», «2.3 MB», «25 MB». `null` si el API no lo manda. */
    fun tamanoLegible(bytes: Long?): String? {
        if (bytes == null || bytes < 0) return null
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1000) return "${Math.round(kb).coerceAtLeast(1)} KB"
        val mb = kb / 1024.0
        if (mb < 1000) return "${unDecimal(mb)} MB"
        return "${unDecimal(mb / 1024.0)} GB"
    }

    /** Un decimal con punto (es-MX) y sin «.0» de sobra: «2.3», «25». */
    private fun unDecimal(valor: Double): String {
        val texto = String.format(Locale.US, "%.1f", valor)
        return if (texto.endsWith(".0")) texto.dropLast(2) else texto
    }

    /** Hora de México, 24 h: «hoy 13:39», «ayer 09:05», «lun 5 oct 18:11». */
    fun fechaTexto(iso: String?, ahora: Instant = Instant.now()): String = EquipoEstado.cuandoMx(iso, ahora)

    fun pie(adjunto: AdjuntoDto, ahora: Instant = Instant.now()): String = listOfNotNull(
        tamanoLegible(adjunto.sizeBytes),
        adjunto.subidoPor?.nombre?.trim()?.ifEmpty { null },
        fechaTexto(adjunto.createdAt, ahora).ifEmpty { null },
    ).joinToString(" · ")

    // ── Antes de subir ──────────────────────────────────────────────────────

    /**
     * Por qué no se sube un archivo, o `null` si se puede. Se avisa antes de mandar nada:
     * subir 30 MB por datos para que el API lo rechace al final es tirar el saldo de quien está en campo.
     */
    fun motivoRechazo(nombre: String, bytes: Long?): String? {
        if (extension(nombre) !in EXTENSIONES) {
            return "No se puede adjuntar «$nombre». Se aceptan PDF, Excel, Word, PowerPoint, imágenes y texto."
        }
        if (bytes != null && bytes > MAX_BYTES) {
            return "«$nombre» pesa más de 25 MB, el máximo por archivo."
        }
        return null
    }

    fun textoSubiendo(cuantos: Int): String =
        if (cuantos <= 1) "Subiendo…" else "Subiendo $cuantos archivos…"

    fun textoSubidos(cuantos: Int): String =
        if (cuantos == 1) "Archivo adjuntado" else "$cuantos archivos adjuntados"

    /** Los recién subidos arriba (la lista viene «lo más reciente primero»), sin repetir. */
    fun conNuevos(actual: List<AdjuntoDto>, nuevos: List<AdjuntoDto>): List<AdjuntoDto> {
        val ids = nuevos.map { it.id }.toSet()
        return nuevos + actual.filter { it.id !in ids }
    }
}
