package mx.nexara.mobile.nativeapp.ui.common

/*
 * Reglas puras del visor de documentos (`DocumentoViewer.kt`): sin Android, para probarlas en la JVM.
 * La tabla de tipos es la misma que usa el API para los adjuntos (`MIME_POR_EXTENSION`).
 */

/** El tipo MIME por la extensión, para compartir y guardar con el tipo correcto. */
fun mimeDeArchivo(nombre: String): String {
    return when (nombre.lowercase().substringAfterLast('.', "")) {
        "pdf" -> "application/pdf"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "heic" -> "image/heic"
        "heif" -> "image/heif"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "xlsm" -> "application/vnd.ms-excel.sheet.macroEnabled.12"
        "xls" -> "application/vnd.ms-excel"
        "csv" -> "text/csv"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "doc" -> "application/msword"
        "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        "ppt" -> "application/vnd.ms-powerpoint"
        "txt" -> "text/plain"
        "zip" -> "application/zip"
        "xml" -> "application/xml"
        else -> MIME_GENERICO
    }
}

const val MIME_GENERICO = "application/octet-stream"

/** ¿El API arma vista previa HTML de este archivo? (Excel, CSV, Word). */
fun tieneVistaPreviaHtml(nombre: String): Boolean =
    nombre.lowercase().substringAfterLast('.', "") in setOf("xlsx", "xlsm", "csv", "docx")

/** Nombre de archivo válido conservando acentos y espacios («Cotización COT-0012.pdf»). */
fun nombreDeArchivoSeguro(nombre: String, extensionPorOmision: String = ""): String {
    var base = nombre.trim().replace(Regex("[/\\\\:?%*|\"<>\\n\\r]"), "-").ifBlank { "documento" }
    // Se fuerza aunque el nombre ya tenga un punto: los folios con varios participantes llevan
    // uno («NEX-…-JA.CE-R2») y sin `.pdf` las otras apps no sabrían qué es.
    if (extensionPorOmision.isNotBlank() && !base.lowercase().endsWith(".${extensionPorOmision.lowercase()}")) {
        base += ".$extensionPorOmision"
    }
    return base
}
