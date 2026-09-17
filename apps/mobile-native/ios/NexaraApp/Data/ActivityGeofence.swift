import Foundation

// Geocerca de actividades: quien inicia una actividad (foto de entrada con GPS)
// debe permanecer y registrar la salida a 100 m o menos de ese punto.
// Espejo de `apps/api/src/activities/geofence/geocerca.ts` y de lo que devuelve
// `GET activity-evidence/:id/geocerca`.

enum ActivityGeofence {
    /// Radio de la zona alrededor del punto de inicio (`RADIO_ACTIVIDAD_M`).
    static let radioM = 100

    private static let radioTierraM = 6_371_000.0

    private static func rad(_ grados: Double) -> Double { grados * .pi / 180 }

    /// Distancia sobre la superficie (haversine), en metros enteros, igual que el API.
    static func distanciaM(lat1: Double, lng1: Double, lat2: Double, lng2: Double) -> Int {
        let dLat = rad(lat2 - lat1)
        let dLng = rad(lng2 - lng1)
        let h = pow(sin(dLat / 2), 2) + cos(rad(lat1)) * cos(rad(lat2)) * pow(sin(dLng / 2), 2)
        let metros = 2 * radioTierraM * asin(min(1, sqrt(h)))
        return Int(metros.rounded())
    }

    /// Coordenada usable: finita, en rango y distinta del (0,0) de un teléfono sin permiso.
    static func esPuntoReal(latitude: Double?, longitude: Double?) -> Bool {
        guard let latitude, let longitude, latitude.isFinite, longitude.isFinite else { return false }
        if latitude == 0 && longitude == 0 { return false }
        return abs(latitude) <= 90 && abs(longitude) <= 180
    }

    /// Distancia al punto de inicio, o `nil` si alguno de los dos puntos no es real.
    static func distanciaAlOrigen(
        origenLat: Double?,
        origenLng: Double?,
        latitude: Double?,
        longitude: Double?
    ) -> Int? {
        guard esPuntoReal(latitude: origenLat, longitude: origenLng),
              esPuntoReal(latitude: latitude, longitude: longitude),
              let origenLat, let origenLng, let latitude, let longitude else { return nil }
        return distanciaM(lat1: origenLat, lng1: origenLng, lat2: latitude, lng2: longitude)
    }

    static func fueraDeZona(_ distancia: Int, radioM: Int = ActivityGeofence.radioM) -> Bool {
        distancia > radioM
    }

    /// Mismo texto con el que el API rechaza la foto de salida (`mensajeSalidaFueraDeZona`).
    static func mensajeSalidaFueraDeZona(distancia: Int, radioM: Int = ActivityGeofence.radioM) -> String {
        "La salida se registra donde iniciaste la actividad: estás a \(distancia) m y el máximo es \(radioM) m. "
            + "Regresa al punto de inicio para tomar la foto de salida."
    }
}

// MARK: - Decodificación tolerante

/// Los números pueden llegar como número o como texto (`Decimal` de Prisma) y
/// una fila con un campo raro no debe tumbar la pantalla entera.
private extension KeyedDecodingContainer {
    func geofenceDouble(_ key: Key) -> Double? {
        if let value = try? decode(Double.self, forKey: key) { return value }
        if let text = try? decode(String.self, forKey: key) {
            return Double(text.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    func geofenceInt(_ key: Key) -> Int? {
        if let value = try? decode(Int.self, forKey: key) { return value }
        if let value = geofenceDouble(key), value.isFinite { return Int(value.rounded()) }
        return nil
    }

    func geofenceString(_ key: Key) -> String? {
        try? decode(String.self, forKey: key)
    }

    func geofenceBool(_ key: Key) -> Bool? {
        try? decode(Bool.self, forKey: key)
    }
}

// MARK: - Modelos

/// Punto donde inició la actividad (foto de entrada).
struct ActivityGeofenceOrigin: Codable, Hashable {
    let latitude: Double?
    let longitude: Double?
    let at: String?

    private enum CodingKeys: String, CodingKey {
        case latitude, longitude, at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        latitude = c.geofenceDouble(.latitude)
        longitude = c.geofenceDouble(.longitude)
        at = c.geofenceString(.at)
    }
}

/// Lectura GPS del recorrido con su distancia al punto de inicio.
struct ActivityGeofencePoint: Codable, Hashable {
    let latitude: Double?
    let longitude: Double?
    let at: String?
    let distanciaM: Int?

    private enum CodingKeys: String, CodingKey {
        case latitude, longitude, at, distanciaM
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        latitude = c.geofenceDouble(.latitude)
        longitude = c.geofenceDouble(.longitude)
        at = c.geofenceString(.at)
        distanciaM = c.geofenceInt(.distanciaM)
    }

    func isInside(radioM: Int = ActivityGeofence.radioM) -> Bool? {
        distanciaM.map { $0 <= radioM }
    }
}

/// Salida de la zona. `abierta` = sigue fuera; `status` dice si ya la justificó.
struct ActivityGeofenceAlert: Codable, Identifiable, Hashable {
    static let statusAbierta = "ABIERTA"
    static let statusJustificada = "JUSTIFICADA"

    let id: Int
    let detectedAt: String?
    let returnedAt: String?
    let distanciaM: Int
    let maxDistanciaM: Int
    let radioM: Int
    /// ABIERTA | JUSTIFICADA
    let status: String
    let abierta: Bool
    let justificacion: String?
    let fotoUrl: String?
    let justificadaAt: String?
    let latitude: Double?
    let longitude: Double?

    private enum CodingKeys: String, CodingKey {
        case id, detectedAt, returnedAt, distanciaM, maxDistanciaM, radioM, status, abierta
        case justificacion, fotoUrl, justificadaAt, latitude, longitude
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.geofenceInt(.id) ?? 0
        detectedAt = c.geofenceString(.detectedAt)
        let regreso = c.geofenceString(.returnedAt)
        returnedAt = regreso
        let distancia = c.geofenceInt(.distanciaM) ?? 0
        distanciaM = distancia
        maxDistanciaM = max(c.geofenceInt(.maxDistanciaM) ?? distancia, distancia)
        radioM = c.geofenceInt(.radioM) ?? ActivityGeofence.radioM
        status = c.geofenceString(.status) ?? ActivityGeofenceAlert.statusAbierta
        abierta = c.geofenceBool(.abierta) ?? (regreso == nil)
        justificacion = c.geofenceString(.justificacion)
        fotoUrl = c.geofenceString(.fotoUrl)
        justificadaAt = c.geofenceString(.justificadaAt)
        latitude = c.geofenceDouble(.latitude)
        longitude = c.geofenceDouble(.longitude)
    }

    var isJustified: Bool { status.uppercased() == ActivityGeofenceAlert.statusJustificada }
    var hasJustificationText: Bool {
        !(justificacion ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var hasPhoto: Bool { !(fotoUrl ?? "").isEmpty }
}

/// `GET activity-evidence/:activityId/geocerca`.
struct ActivityGeofenceState: Codable, Hashable {
    let activityId: Int?
    let radioM: Int
    let origen: ActivityGeofenceOrigin?
    /// Hay foto de entrada y todavía no hay de salida.
    let seguimientoActivo: Bool
    /// `nil` sin lecturas desde el inicio.
    let dentro: Bool?
    let ultimo: ActivityGeofencePoint?
    /// Del más reciente al más viejo.
    let puntos: [ActivityGeofencePoint]
    let alertas: [ActivityGeofenceAlert]

    private enum CodingKeys: String, CodingKey {
        case activityId, radioM, origen, seguimientoActivo, dentro, ultimo, puntos, alertas
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        activityId = c.geofenceInt(.activityId)
        radioM = c.geofenceInt(.radioM) ?? ActivityGeofence.radioM
        origen = try? c.decode(ActivityGeofenceOrigin.self, forKey: .origen)
        seguimientoActivo = c.geofenceBool(.seguimientoActivo) ?? false
        dentro = c.geofenceBool(.dentro)
        ultimo = try? c.decode(ActivityGeofencePoint.self, forKey: .ultimo)
        puntos = (try? c.decode([ActivityGeofencePoint].self, forKey: .puntos)) ?? []
        alertas = (try? c.decode([ActivityGeofenceAlert].self, forKey: .alertas)) ?? []
    }

    var pendingAlerts: [ActivityGeofenceAlert] { alertas.filter { !$0.isJustified } }
}

/// Cuerpo de `POST .../geocerca/alertas/:alertId/justificacion`.
struct ActivityGeofenceJustificationPayload: Encodable {
    let motivo: String
    /// Data URL (`data:image/jpeg;base64,…`) o base64 plano; el API acepta ambos.
    let fotoBase64: String?
}

// MARK: - Repositorio

final class ActivityGeofenceRepository {
    static let shared = ActivityGeofenceRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Punto de inicio, recorrido y salidas de zona de quien ejecuta.
    func estado(activityId: Int) async throws -> ActivityGeofenceState {
        let data = try await api.get("activity-evidence/\(activityId)/geocerca")
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        do {
            return try JSONDecoder().decode(ActivityGeofenceState.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// Justifica una salida de zona. Devuelve la alerta actualizada o `nil` si
    /// quedó en la cola sin conexión.
    func justificar(activityId: Int, alertId: Int, motivo: String, fotoBase64: String?) async throws -> ActivityGeofenceAlert? {
        let data = try await api.postJSON(
            "activity-evidence/\(activityId)/geocerca/alertas/\(alertId)/justificacion",
            body: ActivityGeofenceJustificationPayload(motivo: motivo, fotoBase64: fotoBase64)
        )
        if CoreRepository.isQueuedOffline(data) { return nil }
        do {
            return try JSONDecoder().decode(ActivityGeofenceAlert.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }
}
