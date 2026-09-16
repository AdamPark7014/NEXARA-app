import Foundation

// Capa de datos de la pantalla Asistencias (espejo de
// `apps/web/app/(panels)/erp/asistencias/page.tsx`):
// equipo del día (`attendance/hierarchy/range`), checadas propias
// (`attendance/history`) y GPS de jornada (`gps/*`).

/// Una checada: entrada o salida, con foto y coordenadas si las hubo.
struct AttendancePunch: Hashable, Identifiable {
    let type: String
    let timestamp: String
    let photoUrl: String
    let deviceInfo: String
    let entryLatitude: Double?
    let entryLongitude: Double?
    let exitLatitude: Double?
    let exitLongitude: Double?

    var id: String { "\(type)-\(timestamp)" }
    var isEntry: Bool { type.lowercased().hasPrefix("entrada") }

    /// Coordenadas de la checada según su tipo (el API guarda entrada y salida
    /// en columnas distintas de la misma fila).
    var coords: (lat: Double, lng: Double)? {
        let lat = isEntry ? entryLatitude : exitLatitude
        let lng = isEntry ? entryLongitude : exitLongitude
        guard let lat, let lng else { return nil }
        return (lat, lng)
    }

    init(raw: [String: Any]) {
        type = StockParse.str(raw["type"], raw["tipo"]).lowercased()
        timestamp = StockParse.str(raw["timestamp"], raw["createdAt"])
        photoUrl = StockParse.str(raw["photoUrl"])
        deviceInfo = StockParse.str(raw["deviceInfo"])
        entryLatitude = StockParse.dbl(raw["entryLatitude"])
        entryLongitude = StockParse.dbl(raw["entryLongitude"])
        exitLatitude = StockParse.dbl(raw["exitLatitude"])
        exitLongitude = StockParse.dbl(raw["exitLongitude"])
    }
}

/// Un día de `AttendanceDay` dentro del rango pedido.
struct AttendanceTeamDay: Hashable {
    let date: String
    let totalMinutes: Int
    let isOpen: Bool

    init(raw: [String: Any]) {
        date = StockParse.str(raw["date"])
        totalMinutes = StockParse.int(raw["totalMinutes"]) ?? 0
        isOpen = (raw["isOpen"] as? Bool) ?? false
    }
}

/// Una persona del equipo en el día consultado.
struct AttendanceTeamMember: Hashable, Identifiable {
    let userId: Int
    let userName: String
    let email: String
    let department: String
    let roleName: String
    let totalMinutes: Int
    let days: [AttendanceTeamDay]
    let punches: [AttendancePunch]

    var id: Int { userId }
    var displayName: String {
        let name = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        return email.isEmpty ? "Usuario #\(userId)" : email
    }

    /// Puesto · departamento, como la tarjeta de la web.
    var roleLine: String {
        [roleName, department].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    init(raw: [String: Any]) {
        userId = StockParse.int(raw["userId"], raw["id"]) ?? 0
        userName = StockParse.str(raw["userName"], raw["nombre"])
        email = StockParse.str(raw["email"])
        department = StockParse.str(raw["department"], raw["departamento"])
        roleName = StockParse.str(raw["roleName"], raw["rol"])
        totalMinutes = StockParse.int(raw["totalMinutes"]) ?? 0
        days = (raw["days"] as? [[String: Any]] ?? []).map { AttendanceTeamDay(raw: $0) }
        punches = (raw["attendances"] as? [[String: Any]] ?? []).map { AttendancePunch(raw: $0) }
    }

    /// Última checada del tipo pedido (el API las manda ascendentes, pero la web
    /// se queda con el máximo por marca de tiempo y aquí se hace igual).
    func latest(_ type: String) -> AttendancePunch? {
        punches.filter { $0.type == type }.max { $0.timestamp < $1.timestamp }
    }

    func day(_ date: String) -> AttendanceTeamDay? {
        days.first { $0.date == date || $0.date.hasPrefix(date) }
    }
}

/// Fila de `GET gps/team`: última posición de quien tiene jornada abierta.
struct GpsTeamLocation: Hashable, Identifiable {
    let id: Int
    let usuarioId: Int
    let nombre: String
    let detalle: String
    let latitude: Double?
    let longitude: Double?
    let speedKmh: Double?
    let isActive: Bool
    let updatedAt: String

    init(raw: [String: Any]) {
        id = StockParse.int(raw["id"]) ?? 0
        usuarioId = StockParse.int(raw["usuarioId"]) ?? 0
        let usuario = raw["usuario"] as? [String: Any]
        nombre = StockParse.str(usuario?["nombre"], raw["nombre"])
        let role = usuario?["role"] as? [String: Any]
        let dept = usuario?["department"] as? [String: Any]
        detalle = StockParse.str(role?["nombre"], dept?["nombre"])
        latitude = StockParse.dbl(raw["latitud"])
        longitude = StockParse.dbl(raw["longitud"])
        speedKmh = StockParse.dbl(raw["velocidadKmh"])
        isActive = (raw["estaActivo"] as? Bool) ?? false
        updatedAt = StockParse.str(raw["ultimaActualizacion"])
    }
}

/// Punto de `GET gps/trajectory?date=`.
struct GpsTrajectoryPoint: Hashable, Identifiable {
    let id: Int
    let latitude: Double?
    let longitude: Double?
    let speedKmh: Double?
    let updatedAt: String

    init(raw: [String: Any], fallbackId: Int) {
        id = StockParse.int(raw["id"]) ?? fallbackId
        latitude = StockParse.dbl(raw["latitud"])
        longitude = StockParse.dbl(raw["longitud"])
        speedKmh = StockParse.dbl(raw["velocidadKmh"])
        updatedAt = StockParse.str(raw["ultimaActualizacion"])
    }
}

final class AsistenciasRepository {
    static let shared = AsistenciasRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Equipo

    /// `GET attendance/hierarchy/range?from&to[&scope=subtree]`.
    ///
    /// No hay respaldo a `GET attendance`: esa ruta no existe en el API y el
    /// intento solo convertía un 404 en «sin registros». Dirección, plataforma
    /// y `developer@` consultan sin `scope`; los demás encargados, su subárbol.
    func teamDay(date: String, companyWide: Bool) async throws -> [AttendanceTeamMember] {
        var query = ["from": date, "to": date]
        if !companyWide { query["scope"] = "subtree" }
        let data = try await api.get("attendance/hierarchy/range", query: query)
        let map = ConsoleHelpers.decodeMap(data)
        let rows = (map["users"] as? [[String: Any]]) ?? ApiClient.decodeMapList(data)
        return rows.map { AttendanceTeamMember(raw: $0) }
    }

    /// `GET attendance/history?date=YYYY-MM-DD` — mis checadas de ese día.
    func myPunches(date: String) async throws -> [AttendancePunch] {
        let data = try await api.get("attendance/history", query: ["date": date])
        return ApiClient.decodeMapList(data).map { AttendancePunch(raw: $0) }
    }

    // MARK: GPS

    /// `GET gps/team` — exige `gps.manage`.
    func gpsTeam() async throws -> [GpsTeamLocation] {
        let data = try await api.get("gps/team")
        return ApiClient.decodeMapList(data).map { GpsTeamLocation(raw: $0) }
    }

    /// `GET gps/trajectory?date=` — mi recorrido del día.
    func gpsTrajectory(date: String) async throws -> [GpsTrajectoryPoint] {
        let data = try await api.get("gps/trajectory", query: ["date": date])
        return ApiClient.decodeMapList(data).enumerated().map {
            GpsTrajectoryPoint(raw: $0.element, fallbackId: $0.offset)
        }
    }

    /// `GET gps/me` — `consent` ya viene cruzado con la jornada abierta del día.
    func gpsConsentIsOn() async throws -> Bool {
        let data = try await api.get("gps/me")
        return (ConsoleHelpers.decodeMap(data)["consent"] as? Bool) ?? false
    }

    /// `PATCH gps/consent` — se enciende al marcar entrada y se apaga en salida.
    @discardableResult
    func setGpsConsent(_ enabled: Bool) async throws -> Bool {
        struct Body: Encodable { let enabled: Bool }
        let data = try await api.patchJSON("gps/consent", body: Body(enabled: enabled))
        if CoreRepository.isQueuedOffline(data) { return enabled }
        return (ConsoleHelpers.decodeMap(data)["consent"] as? Bool) ?? enabled
    }
}
