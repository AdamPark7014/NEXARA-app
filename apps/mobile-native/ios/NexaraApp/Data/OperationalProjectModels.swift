import Foundation

/// Proyecto operativo OPS — GET /operational-projects
struct OperationalProjectItem: Hashable, Identifiable {
    let id: Int64
    let title: String
    let description: String
    let status: String
    let projectType: String
    let scopeSummary: String
    let siteCount: String
    let clientName: String
    let clientId: Int64?
    let vendorName: String
    let startDate: String
    let endDate: String
    let actualEndDate: String
    let activities: [[String: Any]]
    let engineers: [[String: Any]]
    let raw: [String: Any]

    var displayTitle: String { title.isEmpty ? "Proyecto" : title }

    static func == (lhs: OperationalProjectItem, rhs: OperationalProjectItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let client = raw["client"] as? [String: Any]
        let vendor = raw["vendor"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["name"], raw["nombre"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        status = StockParse.str(raw["status"], raw["estado"])
        projectType = StockParse.str(raw["projectType"], raw["tipo"], raw["type"])
        scopeSummary = StockParse.str(raw["scopeSummary"])
        siteCount = StockParse.str(raw["siteCount"])
        clientName = StockParse.str(
            raw["clientName"],
            client?["name"], client?["nombre"], client?["razonSocial"]
        )
        clientId = StockParse.int64(client?["id"])
        vendorName = StockParse.str(
            raw["vendorName"],
            vendor?["nombre"], vendor?["name"]
        )
        startDate = StockParse.str(raw["startDate"])
        endDate = StockParse.str(raw["endDate"])
        actualEndDate = StockParse.str(raw["actualEndDate"])
        activities = (raw["activities"] as? [[String: Any]])
            ?? (raw["actividades"] as? [[String: Any]])
            ?? []
        engineers = (raw["engineers"] as? [[String: Any]])
            ?? (raw["ingenieros"] as? [[String: Any]])
            ?? []
    }
}
