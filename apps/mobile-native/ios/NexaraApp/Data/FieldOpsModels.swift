import Foundation

// MARK: - Attendance (mirror Android Attendance*Dto)

struct AttendanceCurrent: Hashable {
    let id: Int64?
    let userId: Int64?
    let date: String
    let checkIn: String
    let checkOut: String
    let totalMinutes: Int
    let isOpen: Bool
    let raw: [String: Any]

    static func == (lhs: AttendanceCurrent, rhs: AttendanceCurrent) -> Bool {
        lhs.id == rhs.id && lhs.isOpen == rhs.isOpen && lhs.totalMinutes == rhs.totalMinutes
    }
    func hash(into hasher: inout Hasher) {
        hasher.combine(id); hasher.combine(isOpen); hasher.combine(totalMinutes)
    }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"])
        userId = StockParse.int64(raw["userId"])
        date = StockParse.str(raw["date"])
        checkIn = StockParse.str(raw["checkIn"])
        checkOut = StockParse.str(raw["checkOut"])
        totalMinutes = StockParse.int(raw["totalMinutes"]) ?? 0
        isOpen = (raw["isOpen"] as? Bool) ?? false
    }
}

struct AttendanceEvent: Hashable, Identifiable {
    let id: String
    let userName: String
    let type: String
    let timestamp: String
    let location: String
    let device: String
    let notes: String
    let isLate: Bool
    let raw: [String: Any]

    var displayName: String { userName.isEmpty ? "Desconocido" : userName }
    var dateLabel: String { String(timestamp.prefix(16)) }

    static func == (lhs: AttendanceEvent, rhs: AttendanceEvent) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any], userName: String = "") {
        self.raw = raw
        let uid = StockParse.str(raw["id"])
        let ts = StockParse.str(raw["timestamp"], raw["createdAt"], raw["date"])
        id = uid.isEmpty ? "att-\(userName)-\(ts)" : "att-\(uid)"
        self.userName = userName.isEmpty
            ? StockParse.str(raw["userName"], raw["usuario"], raw["nombre"])
            : userName
        type = StockParse.str(raw["type"], raw["tipo"])
        timestamp = ts
        location = StockParse.str(raw["location"], raw["ubicacion"], raw["address"])
        device = StockParse.str(raw["device"], raw["dispositivo"])
        notes = StockParse.str(raw["notes"], raw["notas"], raw["observaciones"])
        isLate = (raw["isLate"] as? Bool) ?? false
    }
}

struct AttendanceRange: Hashable {
    let rangeStart: String
    let rangeEnd: String
    let totalMinutesAll: Int
    let totalUsers: Int
    let events: [AttendanceEvent]
    let raw: [String: Any]

    static func == (lhs: AttendanceRange, rhs: AttendanceRange) -> Bool {
        lhs.rangeStart == rhs.rangeStart && lhs.rangeEnd == rhs.rangeEnd && lhs.events.count == rhs.events.count
    }
    func hash(into hasher: inout Hasher) {
        hasher.combine(rangeStart); hasher.combine(rangeEnd); hasher.combine(events.count)
    }

    init(raw: [String: Any]) {
        self.raw = raw
        rangeStart = StockParse.str(raw["rangeStart"])
        rangeEnd = StockParse.str(raw["rangeEnd"])
        totalMinutesAll = StockParse.int(raw["totalMinutesAll"]) ?? 0
        totalUsers = StockParse.int(raw["totalUsers"]) ?? 0
        let users = raw["users"] as? [[String: Any]] ?? []
        var out: [AttendanceEvent] = []
        for u in users {
            let name = StockParse.str(u["userName"])
            let attendances = u["attendances"] as? [[String: Any]] ?? []
            for e in attendances {
                out.append(AttendanceEvent(raw: e, userName: name))
            }
        }
        events = out
    }
}

struct AttendanceCheckInResult {
    let message: String
    let raw: [String: Any]

    init(raw: [String: Any]) {
        self.raw = raw
        message = StockParse.str(raw["message"])
    }
}

// MARK: - Viatics (mirror Android ViaticDto)

struct ViaticItem: Hashable, Identifiable {
    let id: Int64
    let usuarioId: Int64?
    let montoSolicitado: Double
    let estatusPago: String
    let estatus: String
    let razonGasto: String
    let categoria: String
    let createdAt: String
    let userName: String
    let activityLabel: String
    let ticketEvidenciaUrl: String
    let raw: [String: Any]

    var displayStatus: String {
        let s = estatusPago.isEmpty ? estatus : estatusPago
        return s.isEmpty ? "—" : s
    }
    var displayConcept: String { razonGasto.isEmpty ? "Sin concepto" : razonGasto }
    var dateLabel: String { String(createdAt.prefix(10)) }

    static func == (lhs: ViaticItem, rhs: ViaticItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let usuario = raw["usuario"] as? [String: Any]
        let actividad = raw["actividad"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        usuarioId = StockParse.int64(raw["usuarioId"], raw["userId"])
            ?? StockParse.int64(usuario?["id"])
        montoSolicitado = StockParse.dbl(raw["montoSolicitado"], raw["amount"], raw["monto"], raw["total"]) ?? 0
        estatusPago = StockParse.str(raw["estatusPago"])
        estatus = StockParse.str(raw["estatus"], raw["status"], raw["estado"])
        razonGasto = StockParse.str(raw["razonGasto"], raw["concepto"], raw["descripcion"], raw["motivo"])
        categoria = StockParse.str(raw["categoria"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        userName = StockParse.str(
            raw["usuarioNombre"], raw["userName"], raw["nombre"],
            usuario?["nombre"], usuario?["name"]
        )
        activityLabel = StockParse.str(actividad?["anNumber"], raw["actividadAn"])
        ticketEvidenciaUrl = StockParse.str(raw["ticketEvidenciaUrl"])
    }
}
