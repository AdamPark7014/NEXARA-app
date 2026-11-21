import Foundation

/// Captura guiada de vehículo (21-11-2026): salida y devolución en 5 pasos con video, el bloque
/// «Vehículo» de la actividad, las firmas, y la mesa de daños e incidencias de Liz. Espejo de
/// `apps/web/lib/vehiculos-captura.ts` y del `CapturaGuiadaRepository.kt` de Android.
///
/// La captura va a las mismas cuatro rutas de siempre (`ChecklistVehiculoAccion.path`) con
/// `capturaVersion=2`, los 12 cuadros/fotos, el video `video-vuelta` y `meta`. Igual que el check
/// list, no va a la cola sin conexión: el cuerpo es binario y la cola solo reenvía texto.
///
/// Todo campo opcional: un null del API deja la tarjeta incompleta, nunca tumba la pantalla.

// MARK: - DTOs

struct PasoCapturaApi: Decodable, Hashable {
    let paso: Int?
    let id: String?
    let etiqueta: String?
    let instruccion: String?
}

struct UltimoRegistroKm: Decodable, Hashable {
    let km: Int?
    let en: String?
    let origen: String?
}

/// `GET vehicles/captura-guiada?vehiculo=`. `exigida` = interruptor prendido: la salida solo entra
/// con la captura guiada.
struct CapturaGuiadaInfo: Decodable {
    let exigida: Bool?
    let pasos: [PasoCapturaApi]?
    let campoVideo: String?
    let ultimoRegistro: UltimoRegistroKm?

    var esExigida: Bool { exigida == true }

    /// Los pasos del servidor o, si no vinieron, los de siempre.
    var pasosParaMostrar: [CapturaGuiadaRules.Paso] {
        let delServidor = (pasos ?? []).compactMap { p -> CapturaGuiadaRules.Paso? in
            guard let paso = p.paso, let id = p.id else { return nil }
            return CapturaGuiadaRules.Paso(paso: paso, id: id, etiqueta: p.etiqueta ?? "", instruccion: p.instruccion ?? "")
        }
        return delServidor.isEmpty ? CapturaGuiadaRules.pasos : delServidor
    }
}

struct RefPersonaVehiculo: Decodable, Hashable {
    let id: Int?
    let nombre: String?
}

struct RefUnidadVehiculo: Decodable, Hashable {
    let id: Int?
    let nombre: String?
    let placas: String?
}

struct FotoUsoVehiculo: Decodable, Hashable {
    let slot: String?
    let url: String?
    let capturedAt: String?
    let lat: Double?
    let lng: Double?
}

struct MomentoUsoVehiculo: Decodable, Hashable {
    let en: String?
    let km: Int?
    let combustiblePct: Int?
    let fotos: [FotoUsoVehiculo]?
    let videoUrl: String?
}

/// `KM_SIN_REGISTRO`, `KM_DE_MAS`, `LECTURA_CORREGIDA` o `KM_MENOR`; `mensaje` ya viene en español.
struct AlertaKmVehiculo: Decodable, Hashable {
    let tipo: String?
    let km: Int?
    let mensaje: String?
    let en: String?
}

struct FirmaUsoVehiculo: Decodable, Hashable {
    let url: String?
    let nombre: String?
    let userId: Int?
    let firmadoEn: String?
    let registradoPorId: Int?
}

/// Firmas por momento (`salida`/`devolucion`) y rol (`entrega`/`recibe`).
struct FirmasUsoVehiculo: Decodable, Hashable {
    let salida: [String: FirmaUsoVehiculo]?
    let devolucion: [String: FirmaUsoVehiculo]?
}

struct ResumenDanosUso: Decodable, Hashable {
    let estatus: String?
    let propuestos: Int?
    let confirmados: Int?
}

struct IncidenciaDeUso: Decodable, Hashable {
    let id: Int?
    let tipo: String?
    let estatus: String?
    let descripcion: String?
    let quienPaga: String?
    let costo: Double?
}

struct UsoVehiculoActividad: Decodable, Hashable, Identifiable {
    let id: Int
    let estatus: String?
    let aprobacion: String?
    let capturaVersion: Int?
    let unidad: RefUnidadVehiculo?
    let solicitante: RefPersonaVehiculo?
    let encargado: RefPersonaVehiculo?
    let regresoPrevisto: String?
    let salida: MomentoUsoVehiculo?
    let devolucion: MomentoUsoVehiculo?
    let kmRecorridos: Int?
    let kmEsperados: Int?
    let alertasKm: [AlertaKmVehiculo]?
    let firmas: FirmasUsoVehiculo?
    let danos: ResumenDanosUso?
    let incidencias: [IncidenciaDeUso]?
    /// `nil` = a este rol no le toca ver montos.
    let costoIncidencias: Double?
    /// Lo que el libro de costos cargó al viaje; solo dirección.
    let costoViaje: Double?

    /// Para el aviso «devuelve la unidad» al cerrar la actividad.
    var sigueFuera: Bool {
        CapturaGuiadaRules.unidadSigueFuera(estatus: estatus, conSalida: salida != nil, conDevolucion: devolucion != nil)
    }
}

struct RefActividadVehiculo: Decodable, Hashable {
    let id: Int?
    let folio: String?
    let titulo: String?
    let estatus: String?
}

struct VehiculosDeActividad: Decodable {
    let actividad: RefActividadVehiculo?
    let usos: [UsoVehiculoActividad]?
}

struct ActividadCortaVehiculo: Decodable, Hashable {
    let id: Int?
    let anNumber: String?
    let titulo: String?
}

struct ControlDeHallazgo: Decodable, Hashable {
    let id: Int?
    let nombreVehiculo: String?
    let placasVehiculo: String?
    let fechaFin: String?
    let odometroInicio: Int?
    let odometroFin: Int?
    let kmEsperados: Int?
    let vehiculo: RefUnidadVehiculo?
    let solicitante: RefPersonaVehiculo?
    let encargado: RefPersonaVehiculo?
    let actividad: ActividadCortaVehiculo?
}

struct RefIncidenciaVehiculo: Decodable, Hashable {
    let id: Int?
    let estatus: String?
}

/// `severidad`: `leve` · `media` · `grave`. `estatus`: `PROPUESTO` · `CONFIRMADO` · `DESCARTADO`.
struct HallazgoDanoVehiculo: Decodable, Hashable, Identifiable {
    let id: Int
    let controlId: Int?
    let zona: String?
    let etiquetaZona: String?
    let descripcion: String?
    let severidad: String?
    let confianza: Double?
    let fotoSalidaUrl: String?
    let fotoDevolucionUrl: String?
    let estatus: String?
    let motivoDescarte: String?
    let createdAt: String?
    let control: ControlDeHallazgo?
    let incidencia: RefIncidenciaVehiculo?
}

private struct HallazgosRespuesta: Decodable {
    let hallazgos: [HallazgoDanoVehiculo]?
}

struct ControlDeIncidencia: Decodable, Hashable {
    let id: Int?
    let actividad: ActividadCortaVehiculo?
}

/// `cobroEstatus`: `PENDIENTE` · `APROBADO` · `RECHAZADO`, o `nil` si no se le cobra a nadie.
struct IncidenciaVehiculo: Decodable, Hashable, Identifiable {
    let id: Int
    let tipo: String?
    let descripcion: String?
    let estatus: String?
    let quienPaga: String?
    let cobroEstatus: String?
    let costoEstimado: Double?
    let costoReal: Double?
    let fotos: [String]?
    let createdAt: String?
    let vehiculo: RefUnidadVehiculo?
    let responsable: RefPersonaVehiculo?
    let control: ControlDeIncidencia?
}

private struct IncidenciasRespuesta: Decodable {
    let incidencias: [IncidenciaVehiculo]?
}

private struct AnalisisDanosRespuesta: Decodable {
    let estatus: String?
    let hallazgos: Int?
}

/// Lo que la pantalla de 5 pasos entrega ya capturado.
struct EnvioCapturaGuiada {
    /// 8 cuadros de la vuelta (de `CuadrosVuelta`) + las 4 fotos, en JPEG, por slot.
    var imagenes: [String: Data]
    /// Hora y GPS de cada imagen, por slot.
    var tomas: [String: CapturaGuiadaRules.Toma]
    /// Archivo del video en el teléfono (`.mp4` de preferencia: la web lo reproduce en cualquier navegador).
    var video: URL
    var videoMeta: CapturaGuiadaRules.Video
    var odometroKm: Int
    var combustible: NivelCombustible
    var lecturaIa: CapturaGuiadaRules.LecturaIa?
    /// Solo cuenta si quien registra revisa vehículos (Liz): el km anterior estaba mal.
    var forzarKm = false
    /// Salida de inventario: a qué actividad va y quién responde.
    var actividadId: Int?
    var encargadoId: Int?

    /// Una foto de la cámara en vivo, lista para `imagenes` y `tomas`.
    static func toma(de foto: CapturedGeoPhoto) -> (Data, CapturaGuiadaRules.Toma) {
        (foto.jpeg, CapturaGuiadaRules.Toma(capturedAt: foto.capturedAt, lat: foto.coords?.latitude, lng: foto.coords?.longitude))
    }
}

// MARK: - Repositorio

final class CapturaGuiadaRepository {
    static let shared = CapturaGuiadaRepository()
    private let api = ApiClient.shared
    private init() {}

    private func decodificar<T: Decodable>(_ tipo: T.Type, _ data: Data) throws -> T {
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `GET vehicles/captura-guiada?vehiculo=`: si se exige y el último km de la unidad.
    func info(vehiculoId: Int?) async throws -> CapturaGuiadaInfo {
        var query: [String: String] = [:]
        if let vehiculoId { query["vehiculo"] = String(vehiculoId) }
        let data = try await api.get("vehicles/captura-guiada", query: query)
        return try decodificar(CapturaGuiadaInfo.self, data)
    }

    /// `GET vehicles/por-actividad/:id`: el bloque «Vehículo» de la actividad.
    func porActividad(_ actividadId: Int) async throws -> VehiculosDeActividad {
        let data = try await api.get("vehicles/por-actividad/\(actividadId)")
        return try decodificar(VehiculosDeActividad.self, data)
    }

    /// Valida con las reglas de la API y manda. Devuelve el id del uso (para firmar en seguida) cuando
    /// el servidor lo da: en una solicitud es el mismo id; en inventario viene como `usoId`.
    @discardableResult
    func enviar(accion: ChecklistVehiculoAccion, envio: EnvioCapturaGuiada, kmAnterior: Int? = nil) async throws -> Int? {
        try await CoreRepository.requireOnline()
        let videoData: Data
        do {
            videoData = try Data(contentsOf: envio.video)
        } catch {
            throw CoreError.message("Falta el video de la vuelta completa")
        }
        var meta = envio.videoMeta
        meta.bytes = videoData.count
        let tomas = envio.tomas.filter { envio.imagenes[$0.key] != nil }
        if let error = CapturaGuiadaRules.validar(
            tomas: tomas,
            video: meta,
            odometroKm: envio.odometroKm,
            combustible: envio.combustible,
            kmAnterior: kmAnterior,
            forzarKm: envio.forzarKm
        ).first {
            throw CoreError.message(error)
        }

        var files: [(field: String, data: Data, fileName: String, mimeType: String)] = []
        for slot in CapturaGuiadaRules.slots {
            guard let jpeg = envio.imagenes[slot] else { continue }
            files.append((field: slot, data: jpeg, fileName: "\(slot).jpg", mimeType: "image/jpeg"))
        }
        let esMov = envio.video.pathExtension.lowercased() == "mov"
        files.append((
            field: CapturaGuiadaRules.campoVideo,
            data: videoData,
            fileName: "\(CapturaGuiadaRules.campoVideo).\(esMov ? "mov" : "mp4")",
            mimeType: esMov ? "video/quicktime" : "video/mp4"
        ))

        let data = try await api.uploadMultipartFiles(
            accion.path,
            fields: CapturaGuiadaRules.camposTexto(
                tomas: tomas,
                video: meta,
                odometroKm: envio.odometroKm,
                combustible: envio.combustible,
                lecturaIa: envio.lecturaIa,
                forzarKm: envio.forzarKm,
                actividadId: envio.actividadId,
                encargadoId: envio.encargadoId
            ),
            files: files
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        switch accion {
        case .salida(let id, let inventario), .devolucion(let id, let inventario):
            if !inventario { return id }
            let objeto = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            return (objeto?["usoId"] as? NSNumber)?.intValue
        }
    }

    /// Firma de quien entrega o recibe, dibujada en el teléfono (PNG).
    func firmar(usoId: Int, momento: String, rol: String, nombre: String, userId: Int?, firmaPng: Data) async throws {
        let limpio = nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { throw CoreError.message("Escribe el nombre de quien firma") }
        try await CoreRepository.requireOnline()
        var campos = ["momento": momento, "rol": rol, "nombre": limpio]
        if let userId, userId > 0 { campos["userId"] = String(userId) }
        let data = try await api.uploadMultipartFiles(
            "vehicles/\(usoId)/firmas",
            fields: campos,
            files: [(field: "firma", data: firmaPng, fileName: "firma.png", mimeType: "image/png")]
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    // MARK: Liz: daños e incidencias

    func danos(estatus: String? = "PROPUESTO", usoId: Int? = nil) async throws -> [HallazgoDanoVehiculo] {
        var query: [String: String] = [:]
        if let estatus { query["estatus"] = estatus }
        if let usoId { query["uso"] = String(usoId) }
        let data = try await api.get("vehicles/danos", query: query)
        return try decodificar(HallazgosRespuesta.self, data).hallazgos ?? []
    }

    private struct RevisionDano: Encodable {
        let accion: String
        var motivo: String?
        var responsableId: Int?
        var costoEstimado: Double?
        var quienPaga: String?
        var nota: String?
    }

    /// Confirmar abre una incidencia con responsable y costo. `quienPaga`: `EMPRESA` · `RESPONSABLE` · `SEGURO`.
    func confirmarDano(id: Int, responsableId: Int?, costoEstimado: Double?, quienPaga: String, nota: String? = nil) async throws {
        try await CoreRepository.requireOnline()
        let body = RevisionDano(
            accion: "confirmar",
            responsableId: responsableId,
            costoEstimado: costoEstimado,
            quienPaga: quienPaga,
            nota: Self.limpio(nota)
        )
        let data = try await api.patchJSON("vehicles/danos/\(id)", body: body)
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `motivo`: `YA_ESTABA` · `REFLEJO_O_SUCIEDAD` · `NO_ES_DANO` · `OTRO`.
    func descartarDano(id: Int, motivo: String, nota: String? = nil) async throws {
        try await CoreRepository.requireOnline()
        let data = try await api.patchJSON(
            "vehicles/danos/\(id)",
            body: RevisionDano(accion: "descartar", motivo: motivo, nota: Self.limpio(nota))
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// Volver a correr la comparación antes/después. Devuelve cuántos daños propuso.
    func analizarDanos(usoId: Int) async throws -> Int {
        try await CoreRepository.requireOnline()
        struct Vacio: Encodable {}
        let data = try await api.postJSON("vehicles/\(usoId)/analizar-danos", body: Vacio())
        return try decodificar(AnalisisDanosRespuesta.self, data).hallazgos ?? 0
    }

    func incidencias(estatus: String? = nil, vehiculoId: Int? = nil, responsableId: Int? = nil) async throws -> [IncidenciaVehiculo] {
        var query: [String: String] = [:]
        if let estatus { query["estatus"] = estatus }
        if let vehiculoId { query["vehiculo"] = String(vehiculoId) }
        if let responsableId { query["responsable"] = String(responsableId) }
        let data = try await api.get("vehicles/incidencias", query: query)
        return try decodificar(IncidenciasRespuesta.self, data).incidencias ?? []
    }

    private struct NuevaIncidencia: Encodable {
        let tipo: String
        let descripcion: String
        let vehicleAssetId: Int?
        let controlId: Int?
        let responsableId: Int?
        let costoEstimado: Double?
        let quienPaga: String?
    }

    /// `tipo`: `DANO` · `MULTA` · `FALLA` · `KM_SIN_REGISTRO` · `RETRASO` · `OTRO`.
    func crearIncidencia(
        tipo: String,
        descripcion: String,
        vehicleAssetId: Int? = nil,
        controlId: Int? = nil,
        responsableId: Int? = nil,
        costoEstimado: Double? = nil,
        quienPaga: String? = nil
    ) async throws -> IncidenciaVehiculo {
        let texto = descripcion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard texto.count >= 5 else { throw CoreError.message("Describe qué pasó") }
        try await CoreRepository.requireOnline()
        let body = NuevaIncidencia(
            tipo: tipo,
            descripcion: texto,
            vehicleAssetId: vehicleAssetId,
            controlId: controlId,
            responsableId: responsableId,
            costoEstimado: costoEstimado,
            quienPaga: quienPaga
        )
        let data = try await api.postJSON("vehicles/incidencias", body: body)
        return try decodificar(IncidenciaVehiculo.self, data)
    }

    private struct CambiosIncidencia: Encodable {
        let estatus: String?
        let costoEstimado: Double?
        let costoReal: Double?
        let quienPaga: String?
        let responsableId: Int?
    }

    /// Solo viajan los campos que cambian (`nil` no se manda).
    func actualizarIncidencia(
        id: Int,
        estatus: String? = nil,
        costoEstimado: Double? = nil,
        costoReal: Double? = nil,
        quienPaga: String? = nil,
        responsableId: Int? = nil
    ) async throws -> IncidenciaVehiculo {
        try await CoreRepository.requireOnline()
        let body = CambiosIncidencia(
            estatus: estatus,
            costoEstimado: costoEstimado,
            costoReal: costoReal,
            quienPaga: quienPaga,
            responsableId: responsableId
        )
        let data = try await api.patchJSON("vehicles/incidencias/\(id)", body: body)
        return try decodificar(IncidenciaVehiculo.self, data)
    }

    /// Cobrar el daño al responsable: solo dirección.
    func revisarCobro(id: Int, aprobar: Bool) async throws -> IncidenciaVehiculo {
        try await CoreRepository.requireOnline()
        struct Decision: Encodable { let decision: String }
        let data = try await api.patchJSON(
            "vehicles/incidencias/\(id)/cobro",
            body: Decision(decision: aprobar ? "APROBADO" : "RECHAZADO")
        )
        return try decodificar(IncidenciaVehiculo.self, data)
    }

    private static func limpio(_ texto: String?) -> String? {
        guard let t = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }
}
