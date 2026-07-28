import Foundation

/// Fila genérica de herramientas (solicitudes, inventario, kit, usuarios).
struct ToolItem: Hashable, Identifiable {
    let itemId: String
    let title: String
    let subtitle: String
    let code: String
    let category: String
    let status: String
    let location: String
    let userName: String
    let startDate: String
    let endDate: String
    let brand: String
    let model: String
    let serial: String
    let notes: String
    let raw: [String: Any]

    var id: String { itemId }

    static func == (lhs: ToolItem, rhs: ToolItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let inv = raw["inventoryItem"] as? [String: Any]
        let user = raw["user"] as? [String: Any] ?? raw["usuario"] as? [String: Any]
        let parsedId = StockParse.str(raw["id"], inv?["id"])
        itemId = parsedId.isEmpty ? UUID().uuidString : parsedId
        title = StockParse.str(
            raw["toolName"], raw["name"], raw["nombre"],
            inv?["toolName"], inv?["name"],
            raw["userName"], user?["nombre"], user?["name"]
        )
        subtitle = StockParse.str(raw["status"], raw["estado"], raw["code"], raw["sku"], inv?["status"], inv?["serialNumber"])
        code = StockParse.str(raw["code"], raw["sku"], raw["codigo"], inv?["serialNumber"])
        category = StockParse.str(raw["category"], raw["categoria"], raw["type"], raw["tipo"])
        status = StockParse.str(raw["status"], raw["estado"], raw["condition"], raw["condicion"], inv?["status"])
        location = StockParse.str(raw["location"], raw["ubicacion"])
        userName = StockParse.str(raw["userName"], raw["usuario"], user?["nombre"], user?["name"])
        startDate = StockParse.str(raw["startDate"], raw["fechaInicio"], raw["assignedDate"])
        endDate = StockParse.str(raw["endDate"], raw["returnDate"], raw["fechaFin"])
        brand = StockParse.str(raw["brand"], raw["marca"])
        model = StockParse.str(raw["model"], raw["modelo"], inv?["model"])
        serial = StockParse.str(raw["serialNumber"], raw["serial"], inv?["serialNumber"])
        notes = StockParse.str(raw["notes"], raw["notas"], raw["description"], raw["descripcion"], raw["reason"], raw["motivo"])
    }
}

struct ToolRenewal: Hashable, Identifiable {
    let id: Int64
    let title: String
    let previousReturnDate: String
    let newReturnDate: String
    let status: String
    let raw: [String: Any]

    static func == (lhs: ToolRenewal, rhs: ToolRenewal) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        previousReturnDate = StockParse.str(raw["previousReturnDate"])
        newReturnDate = StockParse.str(raw["newReturnDate"])
        status = StockParse.str(raw["status"], raw["estado"])
        if let tr = raw["toolRequest"] as? [String: Any] {
            let tool = StockParse.str(tr["toolName"], tr["name"])
            if let u = tr["usuario"] as? [String: Any] {
                let un = StockParse.str(u["nombre"], u["name"])
                title = un.isEmpty ? tool : "\(un) · \(tool)"
            } else {
                title = StockParse.str(tr["userName"], tr["toolName"], tr["name"])
            }
        } else {
            title = StockParse.str(raw["toolName"], raw["userName"], raw["name"])
        }
    }
}

struct ConsoleNewsItem: Hashable, Identifiable {
    let id: Int64
    let title: String
    let excerpt: String
    let content: String
    let status: String
    let slug: String
    let publishedAt: String
    let isDraft: Bool
    let raw: [String: Any]

    static func == (lhs: ConsoleNewsItem, rhs: ConsoleNewsItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["titulo"])
        excerpt = StockParse.str(raw["excerpt"], raw["summary"], raw["resumen"])
        content = StockParse.str(raw["content"], raw["body"], raw["contenido"])
        status = StockParse.str(raw["status"], raw["estado"])
        slug = StockParse.str(raw["slug"])
        publishedAt = StockParse.str(raw["publishedAt"], raw["createdAt"], raw["fecha"])
        if let d = raw["draft"] as? Bool {
            isDraft = d
        } else {
            isDraft = status.lowercased().contains("draft") || status.lowercased().contains("borrador")
        }
    }
}

struct AuditEntry: Hashable, Identifiable {
    let id: Int64
    let action: String
    let userName: String
    let entityType: String
    let entityId: String
    let description: String
    let details: String
    let createdAt: String
    let raw: [String: Any]

    static func == (lhs: AuditEntry, rhs: AuditEntry) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        action = StockParse.str(raw["action"], raw["accion"], raw["description"])
        userName = StockParse.str(raw["userName"], raw["usuario"])
        entityType = StockParse.str(raw["entityType"], raw["modelo"], raw["entity"])
        entityId = StockParse.str(raw["entityId"], raw["recordId"])
        description = StockParse.str(raw["description"], raw["details"])
        if let meta = raw["metadata"] ?? raw["details"] ?? raw["changes"] {
            if let s = meta as? String { details = s }
            else if let d = try? JSONSerialization.data(withJSONObject: meta),
                    let s = String(data: d, encoding: .utf8) { details = s }
            else { details = String(describing: meta) }
        } else {
            details = ""
        }
        createdAt = StockParse.str(raw["createdAt"], raw["timestamp"], raw["fecha"])
    }
}
