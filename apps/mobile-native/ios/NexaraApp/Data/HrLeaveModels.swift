import Foundation

/// Solicitud de permiso RR.HH. — GET /hr/leaves
struct HrLeave: Hashable, Identifiable {
    let id: Int64
    let type: String
    let reason: String
    let status: String
    let userName: String
    let startDate: String
    let endDate: String
    let days: String
    let approverName: String
    let notes: String
    let raw: [String: Any]

    var rowKey: String { "hr-\(id)" }
    var displayReason: String {
        if !reason.isEmpty { return reason }
        if !type.isEmpty { return type }
        return "Permiso"
    }
    var dateRange: String {
        let s = String(startDate.prefix(10))
        let e = String(endDate.prefix(10))
        if s.isEmpty { return e }
        if e.isEmpty { return s }
        return "\(s) → \(e)"
    }

    static func == (lhs: HrLeave, rhs: HrLeave) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let user = raw["user"] as? [String: Any]
        let employee = raw["employee"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        type = StockParse.str(raw["type"], raw["tipo"])
        reason = StockParse.str(raw["reason"], raw["motivo"])
        status = StockParse.str(raw["status"], raw["estado"])
        userName = StockParse.str(
            raw["userName"], raw["employeeName"], raw["nombre"],
            user?["name"], user?["nombre"],
            employee?["name"], employee?["nombre"]
        )
        startDate = StockParse.str(raw["startDate"], raw["startAt"], raw["fechaInicio"], raw["inicio"])
        endDate = StockParse.str(raw["endDate"], raw["endAt"], raw["fechaFin"], raw["fin"])
        if let n = StockParse.dbl(raw["days"], raw["diasSolicitados"], raw["totalDays"]) {
            days = String(format: "%.0f", n)
        } else {
            days = StockParse.str(raw["days"], raw["diasSolicitados"], raw["totalDays"])
        }
        approverName = StockParse.str(raw["approverName"], raw["approvedBy"], raw["aprobadoPor"])
        notes = StockParse.str(raw["notes"], raw["notas"], raw["comments"], raw["comentarios"])
    }
}
