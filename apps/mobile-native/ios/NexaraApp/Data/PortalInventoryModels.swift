import Foundation

struct PortalInventoryItem: Hashable, Identifiable {
    let id: Int64
    let groupName: String
    let itemName: String
    let brand: String
    let modelBefore: String
    let modelAfter: String
    let serialNumber: String
    let itemStatus: String
    let compareState: String
    let notes: String

    var rowKey: String { "pii-\(id)" }
    var displayName: String {
        if !itemName.isEmpty { return itemName }
        if !groupName.isEmpty { return groupName }
        return "Ítem"
    }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        groupName = StockParse.str(raw["groupName"], raw["grupo"])
        itemName = StockParse.str(raw["itemName"], raw["nombre"], raw["name"])
        brand = StockParse.str(raw["brand"], raw["marca"])
        modelBefore = StockParse.str(raw["modelBefore"])
        modelAfter = StockParse.str(raw["modelAfter"])
        serialNumber = StockParse.str(raw["serialNumber"], raw["serie"])
        itemStatus = StockParse.str(raw["itemStatus"], raw["status"])
        compareState = StockParse.str(raw["compareState"])
        notes = StockParse.str(raw["notes"], raw["notas"])
    }
}

/// Snapshot de inventario portal — GET /client-portal/inventories
struct PortalInventorySnapshot: Hashable, Identifiable {
    let id: Int64
    let title: String
    let notes: String
    let status: String
    let previousCount: Int
    let currentCount: Int
    let deltaCount: Int
    let createdAt: String
    let completedAt: String
    let branchId: Int64?
    let branchName: String
    let items: [PortalInventoryItem]
    let raw: [String: Any]

    var rowKey: String { "pis-\(id)" }
    var displayTitle: String { title.isEmpty ? "Inventario" : title }

    func toFlatMap() -> [String: Any] {
        var out = raw
        out["id"] = id
        out["title"] = title
        out["notes"] = notes
        out["status"] = status
        out["previousCount"] = previousCount
        out["currentCount"] = currentCount
        out["deltaCount"] = deltaCount
        out["createdAt"] = createdAt
        out["completedAt"] = completedAt
        if let branchId { out["branchId"] = branchId }
        out["branchName"] = branchName
        return out
    }

    static func == (lhs: PortalInventorySnapshot, rhs: PortalInventorySnapshot) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let branch = raw["branch"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["titulo"])
        notes = StockParse.str(raw["notes"], raw["notas"])
        status = StockParse.str(raw["status"], raw["estado"])
        previousCount = Int(StockParse.dbl(raw["previousCount"]) ?? 0)
        currentCount = Int(StockParse.dbl(raw["currentCount"]) ?? 0)
        deltaCount = Int(StockParse.dbl(raw["deltaCount"]) ?? 0)
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        completedAt = StockParse.str(raw["completedAt"])
        branchId = StockParse.int64(raw["branchId"]) ?? StockParse.int64(branch?["id"])
        branchName = StockParse.str(branch?["name"], raw["branchName"])
        if let arr = raw["items"] as? [[String: Any]] {
            items = arr.map { PortalInventoryItem(raw: $0) }
        } else {
            items = []
        }
    }
}
