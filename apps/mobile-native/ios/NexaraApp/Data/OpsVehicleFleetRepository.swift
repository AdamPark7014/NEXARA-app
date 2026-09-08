import Foundation

/// Vehículo del inventario (flota) — `GET vehicles/inventory`.
/// Ojo con la distinción: esto es la **unidad**, no la solicitud de uso. Las
/// solicitudes viven en `GET vehicles` y ya las lista `VehiclesView`.
struct OpsVehicleAsset: Identifiable, Hashable {
    let id: Int64
    let nombre: String
    let placas: String
    let estatus: String
    let activo: Bool
    let notas: String

    /// El backend usa "Disponible" / "Asignado" (y "Mantenimiento" en la web).
    /// No es un enum de Prisma sino texto libre, por eso se compara en minúsculas
    /// y se conserva el valor original al reenviarlo.
    var isAssigned: Bool { estatus.lowercased().contains("asignad") }

    var displayName: String {
        if !nombre.isEmpty && !placas.isEmpty { return "\(nombre) · \(placas)" }
        if !nombre.isEmpty { return nombre }
        if !placas.isEmpty { return placas }
        return "Vehículo \(id)"
    }

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        nombre = ActivityParse.str(raw["nombre"], raw["name"])
        placas = ActivityParse.str(raw["placas"], raw["plates"])
        estatus = ActivityParse.str(raw["estatus"], raw["status"])
        activo = (raw["activo"] as? Bool) ?? (raw["active"] as? Bool) ?? true
        notas = ActivityParse.str(raw["notas"], raw["notes"])
    }

    static func == (lhs: OpsVehicleAsset, rhs: OpsVehicleAsset) -> Bool {
        lhs.id == rhs.id && lhs.estatus == rhs.estatus && lhs.activo == rhs.activo
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Solicitud de uso de vehículo — `GET vehicles`, aprobación en
/// `PATCH vehicles/:id/approve`.
struct OpsVehicleRequest: Identifiable, Hashable {
    let id: Int64
    let solicitante: String
    let vehiculo: String
    let motivo: String
    let estatus: String
    let fechaInicio: String
    let fechaFin: String

    /// Solo lo pendiente se puede aprobar o rechazar; lo demás ya lo decidió
    /// alguien y volver a tocarlo desde el móvil pisaría su decisión.
    var isPending: Bool {
        let s = estatus.lowercased()
        return s.isEmpty || s.contains("pend") || s.contains("solicit")
    }

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        solicitante = ActivityParse.nestedName(raw["solicitante"], raw["usuario"], raw["requestedBy"])
        vehiculo = ActivityParse.str(raw["nombreVehiculo"], raw["placasVehiculo"], raw["vehiculo"])
        motivo = ActivityParse.str(raw["motivoUso"], raw["motivo"], raw["reason"])
        estatus = ActivityParse.str(raw["estatus"], raw["status"])
        fechaInicio = ActivityParse.str(raw["fechaInicio"], raw["fechaInicioAprobada"])
        fechaFin = ActivityParse.str(raw["fechaFin"], raw["fechaFinAprobada"])
    }

    static func == (lhs: OpsVehicleRequest, rhs: OpsVehicleRequest) -> Bool {
        lhs.id == rhs.id && lhs.estatus == rhs.estatus
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Flota y aprobación de solicitudes de vehículo.
///
/// `VehiclesView.swift` (de otro agente) cubre el alta y el uso de las
/// solicitudes; aquí van los tres endpoints que le faltaban a iOS: el inventario
/// de unidades y la decisión sobre una solicitud.
final class OpsVehicleFleetRepository {
    static let shared = OpsVehicleFleetRepository()
    private let api = ApiClient.shared
    private init() {}

    static let assetStatuses = ["Disponible", "Asignado", "Mantenimiento", "Baja"]

    func inventory() async throws -> [OpsVehicleAsset] {
        ApiClient.decodeMapList(try await api.get("vehicles/inventory")).map { OpsVehicleAsset(raw: $0) }
    }

    func requests() async throws -> [OpsVehicleRequest] {
        ApiClient.decodeMapList(try await api.get("vehicles")).map { OpsVehicleRequest(raw: $0) }
    }

    /// `nombre` es obligatorio para el API (400 si falta); la UI ya lo exige.
    func createAsset(nombre: String, placas: String?, estatus: String, notas: String?) async throws -> OpsVehicleAsset {
        struct Body: Encodable {
            let nombre: String
            let placas: String?
            let estatus: String
            let activo: Bool
            let notas: String?
        }
        let data = try await api.postJSON("vehicles/inventory", body: Body(
            nombre: nombre,
            placas: placas?.nilIfEmpty,
            estatus: estatus,
            activo: true,
            notas: notas?.nilIfEmpty
        ))
        return OpsVehicleAsset(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Actualización parcial. Se manda solo lo que cambia porque el endpoint
    /// hace merge: enviar `nil` en el resto borraría datos que nadie tocó.
    func updateAsset(id: Int64, nombre: String? = nil, placas: String? = nil,
                     estatus: String? = nil, activo: Bool? = nil,
                     notas: String? = nil) async throws -> OpsVehicleAsset {
        struct Body: Encodable {
            let nombre: String?
            let placas: String?
            let estatus: String?
            let activo: Bool?
            let notas: String?
        }
        let data = try await api.patchJSON("vehicles/inventory/\(id)", body: Body(
            nombre: nombre?.nilIfEmpty,
            placas: placas,
            estatus: estatus?.nilIfEmpty,
            activo: activo,
            notas: notas
        ))
        return OpsVehicleAsset(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Aprobar o rechazar una solicitud de uso — exige `vehicles.review`.
    /// El API normaliza cualquier `action` distinto de "reject" a "approve", así
    /// que aquí se manda el literal exacto y nunca un valor calculado a medias.
    @discardableResult
    func decideRequest(id: Int64, approve: Bool, note: String?) async throws -> [String: Any] {
        struct Body: Encodable {
            let action: String
            let note: String?
        }
        return ConsoleHelpers.decodeMap(
            try await api.patchJSON("vehicles/\(id)/approve",
                                    body: Body(action: approve ? "approve" : "reject",
                                               note: note?.nilIfEmpty))
        )
    }
}
