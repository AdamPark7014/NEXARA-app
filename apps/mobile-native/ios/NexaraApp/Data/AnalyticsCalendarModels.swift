import Foundation

/// Evento de agenda ERP/CRM — GET /calendar/events (y CRM agenda)
struct CalendarEvent: Hashable, Identifiable {
    let eventId: String
    let title: String
    let source: String
    let type: String
    let start: String
    let end: String
    let ownerName: String
    let description: String
    let location: String
    let result: String
    let raw: [String: Any]

    var id: String { rowKey }
    var rowKey: String { "cal-\(eventId.isEmpty ? "\(title)-\(start)" : eventId)" }
    var dayKey: String { String(start.prefix(10)) }
    var displayTitle: String { title.isEmpty ? (type.isEmpty ? "Evento" : type) : title }
    var timeLabel: String {
        if start.count >= 16 {
            let i = start.index(start.startIndex, offsetBy: 11)
            let j = start.index(start.startIndex, offsetBy: 16)
            return String(start[i..<j])
        }
        return String(start.suffix(8))
    }

    static func == (lhs: CalendarEvent, rhs: CalendarEvent) -> Bool { lhs.rowKey == rhs.rowKey }
    func hash(into hasher: inout Hasher) { hasher.combine(rowKey) }

    init(raw: [String: Any]) {
        self.raw = raw
        eventId = StockParse.str(raw["id"])
        title = StockParse.str(raw["title"], raw["titulo"], raw["subject"])
        source = StockParse.str(raw["source"], raw["origen"])
        type = StockParse.str(raw["type"], raw["tipo"])
        start = StockParse.str(raw["start"], raw["startAt"], raw["fecha"])
        end = StockParse.str(raw["end"], raw["endAt"], raw["fin"])
        ownerName = StockParse.str(raw["ownerName"], raw["attendeeName"], raw["responsable"])
        description = StockParse.str(raw["description"], raw["notes"], raw["notas"])
        location = StockParse.str(raw["location"], raw["ubicacion"])
        result = StockParse.str(raw["result"], raw["resultado"])
    }
}

struct AnalyticsDashboard: Hashable {
    let revenue: Double
    let expenses: Double
    let openPurchaseOrders: Int
    let pendingMaintenanceOrders: Int
    let lowStockAlerts: Int
    let raw: [String: Any]

    var isEmpty: Bool { raw.isEmpty }

    static func == (lhs: AnalyticsDashboard, rhs: AnalyticsDashboard) -> Bool {
        lhs.revenue == rhs.revenue && lhs.expenses == rhs.expenses
    }
    func hash(into hasher: inout Hasher) {
        hasher.combine(revenue); hasher.combine(expenses)
    }

    init(raw: [String: Any]) {
        self.raw = raw
        revenue = StockParse.dbl(raw["revenue"], raw["ingresos"]) ?? 0
        expenses = StockParse.dbl(raw["expenses"], raw["gastos"]) ?? 0
        openPurchaseOrders = Int(StockParse.dbl(raw["openPurchaseOrders"]) ?? 0)
        pendingMaintenanceOrders = Int(StockParse.dbl(raw["pendingMaintenanceOrders"]) ?? 0)
        lowStockAlerts = Int(StockParse.dbl(raw["lowStockAlerts"]) ?? 0)
    }
}

struct ComputedKpi: Hashable, Identifiable {
    let name: String
    let unit: String
    let category: String
    let status: String
    let value: Double?
    let valueLabel: String
    let raw: [String: Any]

    var id: String { "kpi-\(name)-\(category)-\(status)" }

    static func == (lhs: ComputedKpi, rhs: ComputedKpi) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        name = StockParse.str(raw["name"], raw["nombre"])
        unit = StockParse.str(raw["unit"], raw["unidad"])
        category = {
            let c = StockParse.str(raw["category"], raw["categoria"])
            return c.isEmpty ? "General" : c
        }()
        status = StockParse.str(raw["status"], raw["estado"])
        value = StockParse.dbl(raw["value"])
        if let value {
            valueLabel = String(value)
        } else {
            valueLabel = StockParse.str(raw["value"])
        }
    }
}

struct BiMarginRow: Hashable, Identifiable {
    let projectType: String
    let count: Int
    let budget: Double
    let margin: Double
    let marginPercent: Double
    let raw: [String: Any]

    var id: String { "bm-\(projectType)" }

    static func == (lhs: BiMarginRow, rhs: BiMarginRow) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        projectType = StockParse.str(raw["projectType"], raw["type"], raw["linea"])
        count = Int(StockParse.dbl(raw["count"], raw["projects"]) ?? 0)
        budget = StockParse.dbl(raw["budget"], raw["presupuesto"]) ?? 0
        margin = StockParse.dbl(raw["margin"], raw["margen"]) ?? 0
        marginPercent = StockParse.dbl(raw["marginPercent"], raw["margenPct"]) ?? 0
    }
}

struct BiEngineerRow: Hashable, Identifiable {
    let engineerId: String
    let engineerName: String
    let completed: Int
    let totalActivities: Int
    let completionRate: Double
    let avgDurationMin: Double?
    let raw: [String: Any]

    var id: String { "be-\(engineerId.isEmpty ? engineerName : engineerId)" }

    static func == (lhs: BiEngineerRow, rhs: BiEngineerRow) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        engineerId = StockParse.str(raw["engineerId"], raw["id"])
        engineerName = StockParse.str(raw["engineerName"], raw["nombre"], raw["name"])
        completed = Int(StockParse.dbl(raw["completed"]) ?? 0)
        totalActivities = Int(StockParse.dbl(raw["totalActivities"], raw["total"]) ?? 0)
        completionRate = StockParse.dbl(raw["completionRate"]) ?? 0
        avgDurationMin = StockParse.dbl(raw["avgDurationMin"], raw["avgDuration"])
    }
}

struct BiClientRoi: Hashable, Identifiable {
    let clientId: String
    let clientName: String
    let projects: Int
    let revenue: Double
    let roi: Double
    let raw: [String: Any]

    var id: String { "bc-\(clientId.isEmpty ? clientName : clientId)" }

    static func == (lhs: BiClientRoi, rhs: BiClientRoi) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        clientId = StockParse.str(raw["clientId"], raw["id"])
        clientName = StockParse.str(raw["clientName"], raw["nombre"], raw["name"])
        projects = Int(StockParse.dbl(raw["projects"], raw["count"]) ?? 0)
        revenue = StockParse.dbl(raw["revenue"], raw["ingresos"]) ?? 0
        roi = StockParse.dbl(raw["roi"]) ?? 0
    }
}
