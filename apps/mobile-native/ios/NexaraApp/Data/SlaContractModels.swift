import Foundation

struct SlaBucket: Hashable {
    let onTime: Int
    let late: Int
    let compliancePercent: Double

    init(raw: [String: Any]) {
        onTime = Int(StockParse.dbl(raw["onTime"]) ?? 0)
        late = Int(StockParse.dbl(raw["late"]) ?? 0)
        compliancePercent = StockParse.dbl(raw["compliancePercent"]) ?? 0
    }
}

struct SlaBreach: Hashable, Identifiable {
    let id: String
    let title: String
    let anNumber: String
    let type: String
    let priority: String
    let hoursLate: Double

    var displayTitle: String {
        if !title.isEmpty { return title }
        if !anNumber.isEmpty { return anNumber }
        return "Incumplimiento"
    }

    init(raw: [String: Any]) {
        id = StockParse.str(raw["id"], raw["anNumber"], raw["titulo"])
        title = StockParse.str(raw["titulo"], raw["title"])
        anNumber = StockParse.str(raw["anNumber"], raw["folio"])
        type = StockParse.str(raw["type"], raw["tipo"])
        priority = StockParse.str(raw["priority"], raw["prioridad"])
        hoursLate = StockParse.dbl(raw["hoursLate"], raw["hours"]) ?? 0
    }
}

struct SlaStats: Hashable {
    let total: Int
    let stillOpen: Int
    let response: SlaBucket
    let resolution: SlaBucket
    let recentBreaches: [SlaBreach]
    let raw: [String: Any]

    init(raw: [String: Any]) {
        self.raw = raw
        total = Int(StockParse.dbl(raw["total"]) ?? 0)
        stillOpen = Int(StockParse.dbl(raw["stillOpen"]) ?? 0)
        response = SlaBucket(raw: (raw["responseSla"] as? [String: Any]) ?? [:])
        resolution = SlaBucket(raw: (raw["resolutionSla"] as? [String: Any]) ?? [:])
        if let arr = raw["recentBreaches"] as? [[String: Any]] {
            recentBreaches = arr.map { SlaBreach(raw: $0) }
        } else {
            recentBreaches = []
        }
    }
}

/// Contrato de mantenimiento — GET /maintenance-contracts
struct MaintenanceContract: Hashable, Identifiable {
    let id: Int64
    let contractNumber: String
    let title: String
    let status: String
    let clientName: String
    let frequency: String
    let startDate: String
    let endDate: String
    let monthlyFee: Double?
    let currency: String
    let slaResponseHours: Int?
    let slaResolutionHours: Int?
    let raw: [String: Any]

    var rowKey: String { "mc-\(id)" }
    var displayTitle: String {
        if !title.isEmpty { return title }
        if !contractNumber.isEmpty { return contractNumber }
        return "Contrato"
    }

    var activities: [[String: Any]] {
        (raw["activities"] as? [[String: Any]])
            ?? (raw["actividades"] as? [[String: Any]])
            ?? []
    }

    var slaEntries: [[String: Any]] {
        (raw["sla"] as? [[String: Any]])
            ?? (raw["slaEntries"] as? [[String: Any]])
            ?? []
    }

    var inventory: [[String: Any]] {
        (raw["inventory"] as? [[String: Any]])
            ?? (raw["inventario"] as? [[String: Any]])
            ?? []
    }

    func toFlatMap() -> [String: Any] {
        var out = raw
        out["id"] = id
        out["contractNumber"] = contractNumber
        out["title"] = title
        out["name"] = title
        out["status"] = status
        out["estado"] = status
        out["clientName"] = clientName
        out["cliente"] = clientName
        out["frequency"] = frequency
        out["startDate"] = startDate
        out["endDate"] = endDate
        out["expiresAt"] = endDate
        if let monthlyFee { out["monthlyFee"] = monthlyFee; out["amount"] = monthlyFee }
        out["currency"] = currency
        if let slaResponseHours { out["slaResponseHours"] = slaResponseHours }
        if let slaResolutionHours { out["slaResolutionHours"] = slaResolutionHours }
        return out
    }

    static func == (lhs: MaintenanceContract, rhs: MaintenanceContract) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let client = raw["client"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        contractNumber = StockParse.str(raw["contractNumber"], raw["number"], raw["folio"])
        title = StockParse.str(raw["title"], raw["name"], raw["titulo"])
        status = StockParse.str(raw["status"], raw["estado"])
        clientName = StockParse.str(client?["name"], client?["nombre"], raw["clientName"], raw["cliente"])
        frequency = StockParse.str(raw["frequency"], raw["frecuencia"], raw["type"], raw["tipo"])
        startDate = StockParse.str(raw["startDate"], raw["fechaInicio"])
        endDate = StockParse.str(raw["endDate"], raw["expiresAt"], raw["fechaFin"])
        monthlyFee = StockParse.dbl(raw["monthlyFee"], raw["amount"], raw["monto"])
        currency = StockParse.str(raw["currency"], raw["moneda"]).ifEmpty("MXN")
        slaResponseHours = StockParse.dbl(raw["slaResponseHours"]).map { Int($0) }
        slaResolutionHours = StockParse.dbl(raw["slaResolutionHours"]).map { Int($0) }
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
