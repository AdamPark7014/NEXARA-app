import Foundation

/// Vehículos utilitarios (`apps/api/src/vehicles`): qué traigo asignado, qué
/// puedo solicitar y el check list de salida y devolución con foto en vivo.
///
/// Todo campo que el API pueda mandar en `null` se decodifica con valor por
/// omisión: un registro raro deja la tarjeta incompleta, nunca tumba la pantalla.

// MARK: - DTOs

/// El vehículo, tal como lo nombra la asignación activa.
struct VehiculoRef: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""
    var placas: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, placas }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
        placas = try? c.decode(String.self, forKey: .placas)
    }

    /// «Ranger · ABC-123» / «Ranger» si no hay placas.
    var titulo: String {
        let base = nombre.isEmpty ? "Vehículo" : nombre
        guard let placas, !placas.isEmpty else { return base }
        return "\(base) · \(placas)"
    }
}

struct ConductorRef: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""

    private enum CodingKeys: String, CodingKey { case id, nombre }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
    }
}

/// Lo que traigo ahora mismo: de una solicitud aprobada o tomado del inventario.
struct AsignacionActiva: Decodable, Identifiable, Hashable {
    var id: Int = 0
    /// `"solicitud"` o `"inventario"`: decide a qué par de rutas va el check list.
    var origen: String = "solicitud"
    var vehiculo: VehiculoRef?
    var inicio: String?
    var fin: String?
    var odometroInicio: Int?
    var combustibleInicioPct: Int?
    var requiereSalida: Bool = false
    var requiereDevolucion: Bool = false

    private enum CodingKeys: String, CodingKey {
        case id, origen, vehiculo, inicio, fin
        case odometroInicio, combustibleInicioPct, requiereSalida, requiereDevolucion
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        origen = (try? c.decode(String.self, forKey: .origen)) ?? "solicitud"
        vehiculo = try? c.decode(VehiculoRef.self, forKey: .vehiculo)
        inicio = try? c.decode(String.self, forKey: .inicio)
        fin = try? c.decode(String.self, forKey: .fin)
        odometroInicio = try? c.decode(Int.self, forKey: .odometroInicio)
        combustibleInicioPct = try? c.decode(Int.self, forKey: .combustibleInicioPct)
        requiereSalida = (try? c.decode(Bool.self, forKey: .requiereSalida)) ?? false
        requiereDevolucion = (try? c.decode(Bool.self, forKey: .requiereDevolucion)) ?? false
    }

    var esInventario: Bool { origen.lowercased() == "inventario" }

    /// Nivel de gasolina con el que salió, para pintarlo en la tarjeta.
    var nivelInicio: NivelCombustible? { NivelCombustible.from(pct: combustibleInicioPct) }
}

/// Una solicitud mía en curso (pendiente, aprobada o rechazada).
struct SolicitudResumen: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var nombreVehiculo: String?
    var placasVehiculo: String?
    var estatusAprobacion: String = ""
    var entregaEstatus: String = ""
    var fechaInicioSolicitada: String?
    var fechaFinSolicitada: String?

    private enum CodingKeys: String, CodingKey {
        case id, nombreVehiculo, placasVehiculo, estatusAprobacion, entregaEstatus
        case fechaInicioSolicitada, fechaFinSolicitada
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombreVehiculo = try? c.decode(String.self, forKey: .nombreVehiculo)
        placasVehiculo = try? c.decode(String.self, forKey: .placasVehiculo)
        estatusAprobacion = (try? c.decode(String.self, forKey: .estatusAprobacion)) ?? ""
        entregaEstatus = (try? c.decode(String.self, forKey: .entregaEstatus)) ?? ""
        fechaInicioSolicitada = try? c.decode(String.self, forKey: .fechaInicioSolicitada)
        fechaFinSolicitada = try? c.decode(String.self, forKey: .fechaFinSolicitada)
    }

    var titulo: String {
        let base = (nombreVehiculo ?? "").isEmpty ? "Vehículo" : (nombreVehiculo ?? "")
        guard let placas = placasVehiculo, !placas.isEmpty else { return base }
        return "\(base) · \(placas)"
    }

    var aprobada: Bool {
        ["aprobada", "aprobado"].contains(estatusAprobacion.lowercased())
    }

    var rechazada: Bool {
        ["rechazada", "rechazado"].contains(estatusAprobacion.lowercased())
    }
}

/// Un vehículo del inventario que podría tomar.
struct VehiculoFlota: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var nombre: String = ""
    var placas: String?
    var estatus: String = ""
    var activo: Bool = true
    var disponible: Bool = false
    var conductor: ConductorRef?
    var desde: String?
    var proximaDevolucion: String?
    var odometroUltimo: Int?
    var combustibleUltimoPct: Int?
    var gpsProveedor: String?
    var tieneRastreador: Bool = false

    private enum CodingKeys: String, CodingKey {
        case id, nombre, placas, estatus, activo, disponible, conductor, desde
        case proximaDevolucion, odometroUltimo, combustibleUltimoPct, gpsProveedor, tieneRastreador
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
        placas = try? c.decode(String.self, forKey: .placas)
        estatus = (try? c.decode(String.self, forKey: .estatus)) ?? ""
        activo = (try? c.decode(Bool.self, forKey: .activo)) ?? true
        disponible = (try? c.decode(Bool.self, forKey: .disponible)) ?? false
        conductor = try? c.decode(ConductorRef.self, forKey: .conductor)
        desde = try? c.decode(String.self, forKey: .desde)
        proximaDevolucion = try? c.decode(String.self, forKey: .proximaDevolucion)
        odometroUltimo = try? c.decode(Int.self, forKey: .odometroUltimo)
        combustibleUltimoPct = try? c.decode(Int.self, forKey: .combustibleUltimoPct)
        gpsProveedor = try? c.decode(String.self, forKey: .gpsProveedor)
        tieneRastreador = (try? c.decode(Bool.self, forKey: .tieneRastreador)) ?? false
    }

    var titulo: String {
        let base = nombre.isEmpty ? "Vehículo" : nombre
        guard let placas, !placas.isEmpty else { return base }
        return "\(base) · \(placas)"
    }
}

/// `GET vehicles/mis-vehiculos`.
struct MisVehiculosResponse: Decodable {
    var activa: AsignacionActiva?
    var solicitudes: [SolicitudResumen] = []
    var disponibles: [VehiculoFlota] = []

    private enum CodingKeys: String, CodingKey { case activa, solicitudes, disponibles }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        activa = try? c.decode(AsignacionActiva.self, forKey: .activa)
        solicitudes = (try? c.decode([SolicitudResumen].self, forKey: .solicitudes)) ?? []
        disponibles = (try? c.decode([VehiculoFlota].self, forKey: .disponibles)) ?? []
    }
}

// MARK: - A qué ruta va el check list

/// Salida o devolución, de una solicitud aprobada o del inventario. Las cuatro
/// rutas piden exactamente el mismo multipart.
enum ChecklistVehiculoAccion: Hashable {
    case salida(asignacion: Int, inventario: Bool)
    case devolucion(asignacion: Int, inventario: Bool)

    init(salida: Bool, asignacion: AsignacionActiva) {
        if salida {
            self = .salida(asignacion: asignacion.id, inventario: asignacion.esInventario)
        } else {
            self = .devolucion(asignacion: asignacion.id, inventario: asignacion.esInventario)
        }
    }

    var path: String {
        switch self {
        case .salida(let id, let inventario):
            return inventario ? "vehicles/inventory/\(id)/checkout" : "vehicles/\(id)/start-use"
        case .devolucion(let id, let inventario):
            return inventario ? "vehicles/inventory/\(id)/return" : "vehicles/\(id)/end-use"
        }
    }

    var esSalida: Bool {
        if case .salida = self { return true }
        return false
    }

    var titulo: String { esSalida ? "Salida" : "Regreso" }
}

// MARK: - Repositorio

final class VehiculosRepository {
    static let shared = VehiculosRepository()
    private let api = ApiClient.shared
    private init() {}

    /// `GET vehicles/mis-vehiculos`.
    func misVehiculos() async throws -> MisVehiculosResponse {
        let data = try await api.get("vehicles/mis-vehiculos")
        do {
            return try JSONDecoder().decode(MisVehiculosResponse.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `POST vehicles` — pide un vehículo para una actividad.
    func solicitar(
        actividadId: Int,
        vehicleId: Int,
        motivoUso: String,
        fechaInicioSolicitada: Date,
        fechaFinSolicitada: Date
    ) async throws {
        struct Body: Encodable {
            let actividadId: Int
            let vehicleId: Int
            let motivoUso: String
            let fechaInicioSolicitada: String
            let fechaFinSolicitada: String
        }
        let body = Body(
            actividadId: actividadId,
            vehicleId: vehicleId,
            motivoUso: motivoUso,
            fechaInicioSolicitada: CoreFormat.isoString(fechaInicioSolicitada),
            fechaFinSolicitada: CoreFormat.isoString(fechaFinSolicitada)
        )
        let data = try await api.postJSON("vehicles", body: body)
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// Check list de salida o devolución: las siete fotos, su `meta` y el tablero.
    ///
    /// No va a la cola sin conexión: el cuerpo es binario y la cola solo sabe
    /// reenviar texto, así que las fotos se perderían sin que nadie se entere.
    func enviarChecklist(
        path: String,
        fotos: [String: CapturedGeoPhoto],
        odometroKm: Int,
        combustible: String
    ) async throws {
        try await CoreRepository.requireOnline()

        var meta: [String: Any] = [:]
        for (field, photo) in fotos {
            var entry: [String: Any] = ["capturedAt": CoreFormat.isoString(photo.capturedAt)]
            if let coords = photo.coords {
                entry["lat"] = coords.latitude
                entry["lng"] = coords.longitude
            } else {
                entry["lat"] = NSNull()
                entry["lng"] = NSNull()
            }
            meta[field] = entry
        }
        let metaJson = (try? JSONSerialization.data(withJSONObject: meta, options: [.sortedKeys]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"

        // Primero los siete slots en su orden de pantalla; después, por si acaso,
        // cualquier campo extra que traiga quien llame.
        var pendientes = fotos
        var files: [(field: String, data: Data, fileName: String, mimeType: String)] = []
        for slot in ChecklistVehiculoRules.slots {
            guard let photo = pendientes.removeValue(forKey: slot.field) else { continue }
            files.append((field: slot.field, data: photo.jpeg, fileName: "\(slot.field).jpg", mimeType: "image/jpeg"))
        }
        for field in pendientes.keys.sorted() {
            guard let photo = pendientes[field] else { continue }
            files.append((field: field, data: photo.jpeg, fileName: "\(field).jpg", mimeType: "image/jpeg"))
        }

        let data = try await api.uploadMultipartFiles(
            path,
            fields: [
                "meta": metaJson,
                "odometroKm": String(odometroKm),
                "combustible": combustible,
            ],
            files: files
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// Misma llamada, con los tipos del check list en vez de cadenas sueltas.
    func enviarChecklist(
        accion: ChecklistVehiculoAccion,
        fotos: [SlotChecklist: CapturedGeoPhoto],
        odometroKm: Int,
        combustible: NivelCombustible
    ) async throws {
        var porCampo: [String: CapturedGeoPhoto] = [:]
        for (slot, photo) in fotos { porCampo[slot.field] = photo }
        try await enviarChecklist(
            path: accion.path,
            fotos: porCampo,
            odometroKm: odometroKm,
            combustible: combustible.apiValue
        )
    }
}
