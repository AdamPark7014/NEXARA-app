import Foundation

/// Archivos adjuntos de una actividad (la evidencia que no es foto: la propuesta en
/// Excel, la minuta en Word, el PDF que mandó el cliente). Espejo de
/// `apps/api/src/activities/attachments`:
///
/// | Qué                 | Endpoint                                              |
/// |---------------------|-------------------------------------------------------|
/// | Lista               | `GET    activities/:id/adjuntos` (lo más reciente primero) |
/// | Adjuntar            | `POST   activities/:id/adjuntos` (multipart, campo `files`) |
/// | Quitar              | `DELETE activities/:id/adjuntos/:adjuntoId`           |
/// | Bytes del archivo   | `GET    activities/:id/adjuntos/:adjuntoId/archivo`   |
///
/// La `vista-previa` HTML del API no hace falta aquí: Vista Rápida abre Excel, Word,
/// PowerPoint, PDF e imágenes sin otra app.

// MARK: - Lectura tolerante

/// Lee un campo sin tumbar el registro entero cuando viene con otro tipo.
fileprivate enum AdjuntoLectura {
    static func texto<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> String? {
        if let valor = try? c.decodeIfPresent(String.self, forKey: key) { return valor }
        if let valor = try? c.decodeIfPresent(Int64.self, forKey: key) { return String(valor) }
        if let valor = try? c.decodeIfPresent(Double.self, forKey: key), valor.isFinite { return String(valor) }
        return nil
    }

    static func entero<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int? {
        if let valor = try? c.decodeIfPresent(Int.self, forKey: key) { return valor }
        if let valor = try? c.decodeIfPresent(Double.self, forKey: key), valor.isFinite, abs(valor) < 9e15 {
            return Int(valor)
        }
        if let valor = try? c.decodeIfPresent(String.self, forKey: key) {
            return Int(valor.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    static func booleano<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Bool? {
        if let valor = try? c.decodeIfPresent(Bool.self, forKey: key) { return valor }
        return nil
    }
}

// MARK: - Modelo

/// Quién subió el archivo.
struct ActivityAdjuntoAutor: Decodable, Hashable {
    var id: Int?
    var nombre: String?

    private enum CodingKeys: String, CodingKey { case id, nombre }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        id = AdjuntoLectura.entero(c, .id)
        nombre = AdjuntoLectura.texto(c, .nombre)
    }
}

/// Un archivo de la actividad (`AdjuntoDto` del API). Todo es opcional salvo `id` y
/// `nombre`, para que un campo que el servidor deje de mandar no tumbe la lista.
struct ActivityAdjunto: Decodable, Identifiable, Hashable {
    let id: Int
    /// Nombre original con extensión y acentos («Propuesta Toks.xlsx»).
    let nombre: String
    var activityId: Int?
    /// Ruta interna en el servidor; NO sirve para bajarlo (se baja por `/archivo` con la sesión).
    var url: String?
    var mimeType: String?
    var sizeBytes: Int?
    /// `pdf` · `imagen` · `excel` · `csv` · `word` · `otro`.
    var tipo: String?
    /// El API arma vista previa HTML (Excel, CSV, Word). En iOS no se usa: Vista Rápida los abre.
    var vistaPrevia: Bool?
    var createdAt: String?
    var subidoPor: ActivityAdjuntoAutor?
    /// Quien consulta lo puede quitar (lo decide el API).
    var puedeQuitar: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, nombre, activityId, url, mimeType, sizeBytes, tipo, vistaPrevia, createdAt, subidoPor, puedeQuitar
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let id = AdjuntoLectura.entero(c, .id) else {
            throw DecodingError.keyNotFound(
                CodingKeys.id,
                DecodingError.Context(codingPath: c.codingPath, debugDescription: "Adjunto sin id")
            )
        }
        self.id = id
        let nombre = (AdjuntoLectura.texto(c, .nombre) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        self.nombre = nombre.isEmpty ? "Archivo \(id)" : nombre
        activityId = AdjuntoLectura.entero(c, .activityId)
        url = AdjuntoLectura.texto(c, .url)
        mimeType = AdjuntoLectura.texto(c, .mimeType)
        sizeBytes = AdjuntoLectura.entero(c, .sizeBytes)
        tipo = AdjuntoLectura.texto(c, .tipo)
        vistaPrevia = AdjuntoLectura.booleano(c, .vistaPrevia)
        createdAt = AdjuntoLectura.texto(c, .createdAt)
        subidoPor = try? c.decodeIfPresent(ActivityAdjuntoAutor.self, forKey: .subidoPor)
        puedeQuitar = AdjuntoLectura.booleano(c, .puedeQuitar)
    }
}

/// Un renglón que no se pudo leer se salta en vez de vaciar la lista entera.
fileprivate struct AdjuntoTolerante: Decodable {
    let valor: ActivityAdjunto?

    init(from decoder: Decoder) throws {
        valor = try? ActivityAdjunto(from: decoder)
    }
}

/// Un archivo listo para subir: nombre con extensión, tipo y bytes.
struct ActivityAdjuntoArchivo {
    let nombre: String
    let mimeType: String
    let data: Data
}

/// Lo que pasó al adjuntar.
enum ActivityAdjuntosSubida {
    /// El API los guardó y devolvió cómo quedaron.
    case subidos([ActivityAdjunto])
    /// Sin conexión: quedaron en la cola y se mandan cuando regrese la señal.
    case enCola
}

// MARK: - Repositorio

final class ActivityAdjuntosRepository {
    static let shared = ActivityAdjuntosRepository()

    private init() {}

    private func ruta(_ activityId: Int) -> String { "activities/\(activityId)/adjuntos" }

    /// La lista, lo más reciente primero (así la manda el API).
    func listar(activityId: Int) async throws -> [ActivityAdjunto] {
        let data: Data
        do {
            data = try await ApiClient.shared.get(ruta(activityId))
        } catch {
            throw Self.legible(error)
        }
        return try Self.decodificarLista(data)
    }

    /// Sube hasta 10 archivos en un envío (el límite del API). Quien llama parte en lotes.
    func subir(activityId: Int, archivos: [ActivityAdjuntoArchivo]) async throws -> ActivityAdjuntosSubida {
        guard !archivos.isEmpty else { return .subidos([]) }
        let partes: [(field: String, data: Data, fileName: String, mimeType: String)] = archivos.map { archivo in
            (
                field: "files",
                data: archivo.data,
                fileName: ActivityAdjuntosRules.nombreParaEncabezado(archivo.nombre),
                mimeType: archivo.mimeType
            )
        }
        let data: Data
        do {
            data = try await ApiClient.shared.uploadMultipartFiles(ruta(activityId), fields: [:], files: partes)
        } catch {
            throw Self.legible(error)
        }
        if CoreRepository.isQueuedOffline(data) { return .enCola }
        // Si la respuesta no se entiende, igual se subieron: la lista se vuelve a pedir.
        return .subidos((try? Self.decodificarLista(data)) ?? [])
    }

    /// Lo quita de la actividad (el API no borra el archivo del disco). Necesita señal:
    /// encolado, el renglón volvería a salir de la caché hasta que se mandara.
    func quitar(activityId: Int, adjuntoId: Int) async throws {
        try await CoreRepository.requireOnline()
        do {
            try await ApiClient.shared.delete("\(ruta(activityId))/\(adjuntoId)")
        } catch {
            throw Self.legible(error)
        }
    }

    /// Los bytes del archivo, con la sesión.
    func archivo(activityId: Int, adjuntoId: Int) async throws -> Data {
        let data: Data
        do {
            data = try await ApiClient.shared.getBinary("\(ruta(activityId))/\(adjuntoId)/archivo")
        } catch {
            throw Self.legible(error)
        }
        guard !data.isEmpty else { throw CoreError.message("El archivo llegó vacío.") }
        return data
    }

    /// Lee un archivo elegido en Archivos. La URL trae un permiso temporal
    /// (security-scoped) que hay que abrir y cerrar; con iCloud, el coordinador lo baja
    /// primero si todavía no está en el teléfono. Revisa el tipo y el tamaño ANTES de
    /// cargar los bytes, para avisar sin gastar memoria ni datos.
    func leer(_ url: URL) async throws -> ActivityAdjuntoArchivo {
        let nombre = url.lastPathComponent
        let acceso = url.startAccessingSecurityScopedResource()
        defer {
            if acceso { url.stopAccessingSecurityScopedResource() }
        }
        let tamano = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
        if let aviso = ActivityAdjuntosRules.rechazo(nombre: nombre, bytes: tamano) {
            throw CoreError.message(aviso)
        }
        var errorCoordinado: NSError?
        var leido: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [.withoutChanges], error: &errorCoordinado) { lectura in
            leido = Result { try Data(contentsOf: lectura) }
        }
        if let errorCoordinado { throw errorCoordinado }
        guard let leido else { throw CoreError.message("No se pudo leer «\(nombre)».") }
        let data: Data
        switch leido {
        case .success(let bytes): data = bytes
        case .failure: throw CoreError.message("No se pudo leer «\(nombre)».")
        }
        if let aviso = ActivityAdjuntosRules.rechazo(nombre: nombre, bytes: data.count) {
            throw CoreError.message(aviso)
        }
        return ActivityAdjuntoArchivo(nombre: nombre, mimeType: ActivityAdjuntosRules.mime(nombre), data: data)
    }

    // MARK: Ayudas

    private static func decodificarLista(_ data: Data) throws -> [ActivityAdjunto] {
        if let filas = try? JSONDecoder().decode([AdjuntoTolerante].self, from: data) {
            return filas.compactMap(\.valor)
        }
        if let objeto = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for clave in ["items", "data", "results", "rows"] {
                if let lista = objeto[clave] as? [Any],
                   let sub = try? JSONSerialization.data(withJSONObject: lista),
                   let filas = try? JSONDecoder().decode([AdjuntoTolerante].self, from: sub) {
                    return filas.compactMap(\.valor)
                }
            }
        }
        // Una respuesta que no es una lista no es «cero archivos»: se dice.
        throw CoreError.message("No se pudieron leer los archivos que mandó el servidor.")
    }

    /// Errores del API con una frase que se puede enseñar tal cual.
    private static func legible(_ error: Error) -> Error {
        guard let api = error as? ApiError, case .http(let codigo, let cuerpo) = api else { return error }
        // «Cannot GET /api/activities/12/adjuntos»: el servidor todavía no tiene la función.
        if codigo == 404, (cuerpo ?? "").contains("Cannot ") {
            return CoreError.message("Los archivos de evidencia todavía no están disponibles en el servidor.")
        }
        // multer corta en 25 MB con «File too large».
        if codigo == 413 || (cuerpo ?? "").localizedCaseInsensitiveContains("file too large") {
            return CoreError.message("Uno de los archivos pesa más de 25 MB. Adjunta archivos de hasta 25 MB.")
        }
        return error
    }
}
