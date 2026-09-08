import Foundation

/// GPS de campo: mi estado, el equipo, el trayecto del día y el consentimiento.
///
/// Regla de producto que este repositorio hace cumplir: **no se inventa una
/// ubicación**. `postCurrentLocation()` no acepta coordenadas de fuera; las pide
/// al dispositivo y, si no hay permiso o no hay fix, devuelve el motivo y no
/// manda nada. Un `0,0` en el histórico es peor que un hueco: parece un técnico
/// en el Golfo de Guinea y contamina el trayecto del día.
///
/// Paridad: `ConsoleRepository.kt` (gpsMe, gpsTeam, gpsTrajectory,
/// gpsUpdateConsent, gpsPost).
final class FieldOpsGpsRepository {
    static let shared = FieldOpsGpsRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Por qué el envío puede fallar sin ser un error de red. La UI escribe
    /// literalmente estos motivos: el técnico tiene derecho a saber por qué no
    /// se mandó su ubicación.
    enum LocationSendFailure: Error, LocalizedError {
        case noPermission
        case noFix
        case noConsent

        var errorDescription: String? {
            switch self {
            case .noPermission:
                return "Sin permiso de ubicación. Actívalo en Ajustes para compartir tu GPS."
            case .noFix:
                return "El teléfono no logró fijar tu posición. Sal a cielo abierto e inténtalo otra vez."
            case .noConsent:
                return "No has aceptado compartir ubicación. Activa el interruptor de arriba primero."
            }
        }
    }

    // MARK: Lectura

    func me() async throws -> GpsMeStatus {
        GpsMeStatus(raw: ConsoleHelpers.decodeMap(try await api.get("gps/me")))
    }

    /// Requiere permiso `gps.manage`. Para un técnico raso el API responde 403 y
    /// la pantalla simplemente no enseña la sección de equipo.
    func team() async throws -> [GpsPoint] {
        ApiClient.decodeMapList(try await api.get("gps/team")).map { GpsPoint(raw: $0) }
    }

    /// Trayecto de un día. Sin `userId` el backend devuelve el del propio
    /// usuario; con `userId` exige permiso de equipo.
    func trajectory(date: String, userId: Int64? = nil) async throws -> [GpsPoint] {
        var query = ["date": date]
        if let userId, userId > 0 { query["userId"] = String(userId) }
        return ApiClient.decodeMapList(try await api.get("gps/trajectory", query: query))
            .map { GpsPoint(raw: $0) }
    }

    // MARK: Consentimiento

    /// `PATCH gps/consent`. Devuelve lo que confirmó el servidor, no lo que pidió
    /// la UI: si el backend no confirma, el interruptor no debe quedarse en verde
    /// fingiendo un consentimiento que nunca se guardó.
    func setConsent(_ enabled: Bool) async throws -> Bool? {
        struct Body: Encodable { let enabled: Bool }
        let map = ConsoleHelpers.decodeMap(try await api.patchJSON("gps/consent", body: Body(enabled: enabled)))
        if let b = map["consent"] as? Bool { return b }
        if let n = map["consent"] as? NSNumber { return n.boolValue }
        return nil
    }

    // MARK: Envío

    /// Lee la posición real del dispositivo y la manda. No hay variante que
    /// acepte lat/lng por parámetro a propósito: esa puerta es justo por donde
    /// entraría un `0,0`.
    ///
    /// `consentGranted` se pasa desde la pantalla (que ya lo leyó de `gps/me`)
    /// para no encadenar dos llamadas antes de cada envío.
    ///
    /// Va en `@MainActor` porque `DeviceLocation` lo está: es el mismo contexto
    /// desde el que ya lo usan asistencia, comidas y evidencias.
    @MainActor
    @discardableResult
    func postCurrentLocation(consentGranted: Bool?) async throws -> DeviceCoords {
        guard consentGranted == true else { throw LocationSendFailure.noConsent }
        guard DeviceLocation.shared.hasPermission else { throw LocationSendFailure.noPermission }
        guard let coords = await DeviceLocation.shared.current() else { throw LocationSendFailure.noFix }
        guard coords.latitude.isFinite, coords.longitude.isFinite,
              !(abs(coords.latitude) < 0.0001 && abs(coords.longitude) < 0.0001) else {
            throw LocationSendFailure.noFix
        }

        struct Body: Encodable {
            let latitud: Double
            let longitud: Double
            let estaActivo: Bool
            let ultimaActualizacion: String
        }
        _ = try await api.postJSON("gps", body: Body(
            latitud: coords.latitude,
            longitud: coords.longitude,
            estaActivo: true,
            ultimaActualizacion: ConsoleHelpers.isoNow()
        ))
        return coords
    }

    /// Formato `yyyy-MM-dd` que espera `gps/trajectory`. Se usa la zona del
    /// dispositivo a propósito: el trayecto "de hoy" es el del día que el
    /// técnico está viviendo, no el del servidor.
    static func dayString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
