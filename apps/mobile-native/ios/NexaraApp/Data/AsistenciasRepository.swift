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

/// Día sin checada que Christian justificó (`justificaciones[]` de `attendance/range` y
/// `attendance/hierarchy/range`). No es checada ni suma horas: se muestra como
/// «Falta justificada · motivo» en lugar de «Sin checada».
struct AttendanceJustification: Hashable, Identifiable {
    /// Mínimo del motivo (`JUSTIFICATION_MOTIVO_MINIMO`).
    static let motivoMinimo = 10
    static let motivoMaximo = 1000

    let id: Int
    let userId: Int
    /// `AAAA-MM-DD`.
    let fecha: String
    let motivo: String
    /// «Falta justificada · motivo» tal como lo arma el API.
    let etiqueta: String
    let justificadaPor: String
    let justificadaAt: String

    /// Si el API no mandó `etiqueta`, se arma igual que él.
    var texto: String {
        etiqueta.isEmpty ? "Falta justificada · \(motivo)" : etiqueta
    }

    /// «Justificó Christian · jue 17 sep, 10:30».
    var detalle: String {
        let quien = justificadaPor.isEmpty ? "Justificada" : "Justificó \(justificadaPor)"
        guard let when = CoreFormat.when(justificadaAt) else { return quien }
        return "\(quien) · \(when)"
    }

    private static let diaEntrada: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let diaSalida: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEE d MMM"
        return formatter
    }()

    /// «jue 17 sep» del día `AAAA-MM-DD` (la columna es DATE: se lee sin zona, como el API).
    static func diaCorto(_ fecha: String) -> String {
        guard let date = diaEntrada.date(from: String(fecha.prefix(10))) else { return fecha }
        return diaSalida.string(from: date)
    }

    var fechaCorta: String { Self.diaCorto(fecha) }

    init(raw: [String: Any]) {
        id = StockParse.int(raw["id"]) ?? 0
        userId = StockParse.int(raw["userId"]) ?? 0
        fecha = String(StockParse.str(raw["fecha"]).prefix(10))
        motivo = StockParse.str(raw["motivo"])
        etiqueta = StockParse.str(raw["etiqueta"])
        let by = raw["justificadaPor"] as? [String: Any]
        justificadaPor = StockParse.str(by?["nombre"])
        justificadaAt = StockParse.str(raw["justificadaAt"])
    }

    static func list(_ value: Any?) -> [AttendanceJustification] {
        (value as? [[String: Any]] ?? []).map { AttendanceJustification(raw: $0) }.filter { !$0.fecha.isEmpty }
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
    let justificaciones: [AttendanceJustification]

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
        justificaciones = AttendanceJustification.list(raw["justificaciones"])
    }

    /// Falta justificada de ese día, si la hay (`faltaDelDia` de la web).
    func justification(_ date: String) -> AttendanceJustification? {
        justificaciones.first { $0.fecha == date }
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
        // Safety net: Christian/Adam/Claudia/cuenta demo no son empleados: fuera de "sin checada".
        return rows.map { AttendanceTeamMember(raw: $0) }.filter { !CoreOrg.isNonEmployee($0.email) }
    }

    /// `GET attendance/history?date=YYYY-MM-DD` — mis checadas de ese día.
    func myPunches(date: String) async throws -> [AttendancePunch] {
        let data = try await api.get("attendance/history", query: ["date": date])
        return ApiClient.decodeMapList(data).map { AttendancePunch(raw: $0) }
    }

    // MARK: Faltas justificadas

    /// Mis faltas justificadas del rango (`justificaciones` de `GET attendance/range`).
    func myJustifications(from: String, to: String) async throws -> [AttendanceJustification] {
        let range = try await ConsoleRepository.shared.attendanceRangeItem(from: from, to: to, hierarchy: false)
        return range.justificaciones.sorted { $0.fecha > $1.fecha }
    }

    /// `POST attendance/justificaciones { userId, fecha, motivo }` — solo Christian.
    /// No crea checadas: el día queda como «Falta justificada».
    func justifyAbsence(userId: Int, fecha: String, motivo: String) async throws {
        struct Body: Encodable {
            let userId: Int
            let fecha: String
            let motivo: String
        }
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON(
            "attendance/justificaciones",
            body: Body(userId: userId, fecha: fecha, motivo: motivo)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
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
