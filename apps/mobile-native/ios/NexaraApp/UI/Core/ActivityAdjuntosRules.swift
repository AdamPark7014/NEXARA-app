import SwiftUI
import UniformTypeIdentifiers

// Reglas puras de «Archivos de evidencia» (adjuntos de una actividad comercial): qué
// se puede adjuntar, icono y color por tipo, tamaño legible y fecha en hora de México.
// Los textos son los del contrato de las tres plataformas (web, Android, iOS).

/// Cómo se ve un adjunto: PDF rojo, Excel verde, Word azul, imagen, otro gris.
enum ActivityAdjuntoTipo: Equatable {
    case pdf, imagen, excel, csv, word, presentacion, otro

    var simbolo: String {
        switch self {
        case .pdf: return "doc.richtext"
        case .imagen: return "photo"
        case .excel, .csv: return "tablecells"
        case .word: return "doc.text"
        case .presentacion: return "rectangle.on.rectangle"
        case .otro: return "doc"
        }
    }

    var color: Color {
        switch self {
        case .pdf: return NxColors.rojo
        case .imagen: return NxColors.morado
        case .excel, .csv: return NxColors.verde
        case .word: return NxColors.azul
        case .presentacion: return NxColors.naranja
        case .otro: return NxColors.gris
        }
    }

    /// Para VoiceOver: «Excel, Propuesta Toks.xlsx».
    var etiqueta: String {
        switch self {
        case .pdf: return "PDF"
        case .imagen: return "Imagen"
        case .excel: return "Excel"
        case .csv: return "CSV"
        case .word: return "Word"
        case .presentacion: return "PowerPoint"
        case .otro: return "Archivo"
        }
    }
}

enum ActivityAdjuntosRules {
    // MARK: Textos

    static let titulo = "Archivos de evidencia"
    static let subtitulo = "Excel, Word, PDF o imágenes de la propuesta, minutas y lo que mande el cliente"
    static let vacio = "Aún no hay archivos"
    static let adjuntar = "Adjuntar archivo"
    static let subiendo = "Subiendo…"

    // MARK: Límites (los del API)

    /// 25 MB por archivo.
    static let limiteBytes = 25 * 1024 * 1024
    /// Hasta 10 archivos por envío.
    static let maximoPorEnvio = 10

    /// `EXTENSIONES_ADJUNTO` del API: oficina, PDF, imágenes y texto. Nada ejecutable.
    static let extensionesPermitidas: Set<String> = [
        "pdf", "png", "jpg", "jpeg", "webp", "gif", "heic", "heif",
        "xlsx", "xlsm", "xls", "csv", "docx", "doc", "pptx", "ppt", "txt",
    ]

    /// `MIME_POR_EXTENSION` del API (el servidor vuelve a decidirlo por la extensión).
    private static let mimePorExtension: [String: String] = [
        "pdf": "application/pdf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "gif": "image/gif",
        "heic": "image/heic",
        "heif": "image/heif",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
        "xls": "application/vnd.ms-excel",
        "csv": "text/csv",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "ppt": "application/vnd.ms-powerpoint",
        "txt": "text/plain",
    ]

    /// Lo que ofrece el selector de Archivos (varios a la vez).
    static var tiposImportables: [UTType] {
        var tipos: [UTType] = [.pdf, .image, .spreadsheet, .presentation, .plainText, .commaSeparatedText]
        let identificadores = [
            "org.openxmlformats.wordprocessingml.document",
            "com.microsoft.word.doc",
            "com.microsoft.excel.xls",
            "org.openxmlformats.spreadsheetml.sheet",
            "org.openxmlformats.presentationml.presentation",
            "com.microsoft.powerpoint.ppt",
        ]
        for identificador in identificadores {
            if let tipo = UTType(identificador), !tipos.contains(tipo) { tipos.append(tipo) }
        }
        return tipos
    }

    // MARK: Nombres y tipos

    /// «xlsx» de «Propuesta Toks.xlsx»; vacío si no trae.
    static func extensionDe(_ nombre: String) -> String {
        (nombre as NSString).pathExtension.lowercased()
    }

    static func mime(_ nombre: String) -> String {
        mimePorExtension[extensionDe(nombre)] ?? "application/octet-stream"
    }

    /// Extensión con que se guarda el archivo para Vista Rápida y para compartir: la del
    /// nombre; si no trae, la que corresponde al tipo.
    static func extensionParaGuardar(_ adjunto: ActivityAdjunto) -> String {
        let propia = extensionDe(adjunto.nombre)
        if !propia.isEmpty { return propia }
        if let mime = adjunto.mimeType?.lowercased(),
           let porMime = mimePorExtension.first(where: { $0.value.lowercased() == mime })?.key {
            return porMime
        }
        switch tipo(adjunto) {
        case .pdf: return "pdf"
        case .imagen: return "jpg"
        case .excel: return "xlsx"
        case .csv: return "csv"
        case .word: return "docx"
        case .presentacion: return "pptx"
        case .otro: return ""
        }
    }

    static func tipo(_ adjunto: ActivityAdjunto) -> ActivityAdjuntoTipo {
        tipo(api: adjunto.tipo, nombre: adjunto.nombre, mime: adjunto.mimeType)
    }

    /// El `tipo` del API manda; si dice «otro» (o no viene) se mira la extensión, para que
    /// un `.xls`, un `.doc` o un `.pptx` no salgan grises.
    static func tipo(api: String?, nombre: String, mime: String? = nil) -> ActivityAdjuntoTipo {
        switch (api ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case "pdf": return .pdf
        case "imagen": return .imagen
        case "excel": return .excel
        case "csv": return .csv
        case "word": return .word
        default: break
        }
        let ext = extensionDe(nombre)
        let m = (mime ?? "").lowercased()
        if ext == "pdf" || m == "application/pdf" { return .pdf }
        if ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"].contains(ext) || m.hasPrefix("image/") { return .imagen }
        if ["xlsx", "xlsm", "xls"].contains(ext) || m.contains("spreadsheet") || m.contains("ms-excel") { return .excel }
        if ext == "csv" || m == "text/csv" { return .csv }
        if ["docx", "doc"].contains(ext) || m.contains("wordprocessing") || m == "application/msword" { return .word }
        if ["pptx", "ppt"].contains(ext) || m.contains("presentation") || m.contains("powerpoint") { return .presentacion }
        return .otro
    }

    /// El nombre tal cual, sin lo que rompería la cabecera del multipart (comillas y saltos).
    static func nombreParaEncabezado(_ nombre: String) -> String {
        let limpio = nombre
            .replacingOccurrences(of: "\"", with: "'")
            .components(separatedBy: .newlines)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        return limpio.isEmpty ? "archivo" : limpio
    }

    /// Fotos de la galería: «Foto 7 oct 13.39.jpg»; con varias, «Foto 7 oct 13.39 (2).jpg».
    static func nombreDeFoto(_ fecha: Date, indice: Int, total: Int) -> String {
        let p = calendario.dateComponents([.month, .day], from: fecha)
        let mes = meses[max(0, min(11, (p.month ?? 1) - 1))]
        let hora = ActivityDetailFormat.clock(fecha).replacingOccurrences(of: ":", with: ".")
        let sufijo = total > 1 ? " (\(indice + 1))" : ""
        return "Foto \(p.day ?? 1) \(mes) \(hora)\(sufijo).jpg"
    }

    // MARK: Validación antes de subir

    static func mensajeTipoNoPermitido(_ nombre: String) -> String {
        "No se puede adjuntar «\(nombre)». Se aceptan PDF, Excel, Word, PowerPoint, imágenes y texto."
    }

    static func mensajeDemasiadoGrande(_ nombre: String) -> String {
        "«\(nombre)» pesa más de 25 MB. Adjunta archivos de hasta 25 MB."
    }

    /// `nil` si se puede subir; si no, el aviso para la persona.
    static func rechazo(nombre: String, bytes: Int?) -> String? {
        if !extensionesPermitidas.contains(extensionDe(nombre)) { return mensajeTipoNoPermitido(nombre) }
        if let bytes, bytes > limiteBytes { return mensajeDemasiadoGrande(nombre) }
        return nil
    }

    // MARK: Renglón

    /// «2.3 MB», «840 KB», «512 B».
    static func tamano(_ bytes: Int?) -> String? {
        guard let bytes, bytes >= 0 else { return nil }
        if bytes < 1024 { return "\(bytes) B" }
        let kb = Double(bytes) / 1024
        if kb < 1023.5 { return "\(Int(kb.rounded())) KB" }
        return String(format: "%.1f MB", locale: Locale(identifier: "en_US_POSIX"), kb / 1024)
    }

    private static let calendario: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = ActivityDetailFormat.mexico
        return c
    }()

    /// Abreviaturas fijas de Android (`NxFormat`): «sept», «mié», «sáb».
    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
    /// `Calendar.weekday`: 1 = domingo.
    private static let dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

    /// Cuándo se subió, en hora de México y 24 h: «hoy 13:39», «ayer 18:05», «lun 5 oct»
    /// (de otro año: «lun 5 oct 2025»). `nil` sin fecha legible.
    static func cuando(_ iso: String?, ahora: Date = Date()) -> String? {
        guard let fecha = ActivityDetailFormat.parse(iso) else { return nil }
        let hora = ActivityDetailFormat.clock(fecha)
        let hoy = calendario.startOfDay(for: ahora)
        let dia = calendario.startOfDay(for: fecha)
        let diferencia = calendario.dateComponents([.day], from: dia, to: hoy).day ?? 0
        if diferencia == 0 { return "hoy \(hora)" }
        if diferencia == 1 { return "ayer \(hora)" }
        let p = calendario.dateComponents([.year, .month, .day, .weekday], from: fecha)
        let nombreDia = dias[max(0, min(6, (p.weekday ?? 1) - 1))]
        let mes = meses[max(0, min(11, (p.month ?? 1) - 1))]
        let base = "\(nombreDia) \(p.day ?? 1) \(mes)"
        let anioActual = calendario.component(.year, from: ahora)
        guard let anio = p.year, anio != anioActual else { return base }
        return "\(base) \(anio)"
    }

    /// «2.3 MB · Luis Joel · hoy 13:39» (lo que falte no se escribe).
    static func meta(_ adjunto: ActivityAdjunto, ahora: Date = Date()) -> String {
        let quien = CoreFormat.shortName(adjunto.subidoPor?.nombre)
        return [tamano(adjunto.sizeBytes), quien, cuando(adjunto.createdAt, ahora: ahora)]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}
