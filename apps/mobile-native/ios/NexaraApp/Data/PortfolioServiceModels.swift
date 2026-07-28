import Foundation

/// Portfolio / marketing — GET /projects
struct PortfolioProject: Hashable, Identifiable {
    let id: Int64
    let title: String
    let slug: String
    let sector: String
    let summary: String
    let impact: String
    let services: [String]
    let tags: [String]
    let highlights: [String]
    let mainImage: String
    let gallery: [String]
    let createdAt: String
    let raw: [String: Any]

    var displayTitle: String { title.isEmpty ? "Proyecto" : title }
    var subtitle: String {
        [sector, impact].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    static func == (lhs: PortfolioProject, rhs: PortfolioProject) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["name"], raw["nombre"])
        slug = StockParse.str(raw["slug"])
        sector = StockParse.str(raw["sector"])
        summary = StockParse.str(raw["summary"], raw["description"], raw["descripcion"])
        impact = StockParse.str(raw["impact"])
        services = Self.stringList(raw["services"])
        tags = Self.stringList(raw["tags"])
        highlights = Self.stringList(raw["highlights"])
        mainImage = StockParse.str(raw["mainImage"], raw["image"], raw["coverUrl"])
        gallery = Self.stringList(raw["gallery"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }

    private static func stringList(_ value: Any?) -> [String] {
        if let arr = value as? [String] { return arr.filter { !$0.isEmpty } }
        if let arr = value as? [Any] {
            return arr.compactMap { v -> String? in
                if let s = v as? String, !s.isEmpty { return s }
                let s = StockParse.str(v)
                return s.isEmpty ? nil : s
            }
        }
        if let s = value as? String, !s.isEmpty {
            return s.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
        return []
    }
}

/// Documento — GET /documents
struct DocumentItem: Hashable, Identifiable {
    let id: Int64
    let title: String
    let type: String
    let fileUrl: String
    let createdAt: String
    let raw: [String: Any]

    var displayTitle: String { title.isEmpty ? "Documento" : title }

    static func == (lhs: DocumentItem, rhs: DocumentItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["name"], raw["fileName"], raw["nombre"])
        type = StockParse.str(raw["type"], raw["category"], raw["tipo"])
        fileUrl = StockParse.str(raw["fileUrl"], raw["url"], raw["path"])
        createdAt = StockParse.str(raw["createdAt"], raw["updatedAt"], raw["fecha"])
    }
}

/// Contacto consolá — fromRaw para ExtraRepository (Studio ContactMessage es Codable).
struct ConsoleContactMessage: Hashable, Identifiable {
    let id: Int64
    let name: String
    let email: String
    let phone: String
    let subject: String
    let message: String
    let status: String
    let category: String
    let createdAt: String
    let raw: [String: Any]

    var displayName: String { name.isEmpty ? (subject.isEmpty ? "Mensaje" : subject) : name }

    static func == (lhs: ConsoleContactMessage, rhs: ConsoleContactMessage) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        email = StockParse.str(raw["email"], raw["correo"])
        phone = StockParse.str(raw["phone"], raw["telefono"])
        subject = StockParse.str(raw["subject"], raw["asunto"])
        message = StockParse.str(raw["message"], raw["mensaje"], raw["body"])
        status = StockParse.str(raw["status"], raw["estado"])
        category = StockParse.str(raw["category"], raw["categoria"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }
}

struct ConsoleNewsletterSubscriber: Hashable, Identifiable {
    let id: Int64
    let email: String
    let name: String
    let status: String
    let createdAt: String
    let isUnsubscribed: Bool
    let raw: [String: Any]

    static func == (lhs: ConsoleNewsletterSubscriber, rhs: ConsoleNewsletterSubscriber) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        email = StockParse.str(raw["email"], raw["correo"])
        name = StockParse.str(raw["name"], raw["nombre"])
        status = StockParse.str(raw["status"], raw["estado"])
        createdAt = StockParse.str(raw["createdAt"], raw["subscribedAt"], raw["fecha"])
        let unsubFlag = (raw["unsubscribed"] as? Bool) ?? false
        isUnsubscribed = unsubFlag || status.lowercased() == "unsubscribed" || status.lowercased().contains("baja")
    }
}

/// Hoja de servicio — GET /service-sheets
struct ServiceSheetItem: Hashable, Identifiable {
    let id: Int64
    let activityId: Int64
    let clientName: String
    let technicianName: String
    let serviceType: String
    let status: String
    let managerName: String
    let workSummary: String
    let observations: String
    let signedName: String
    let pdfUrl: String
    let createdAt: String
    let equipmentList: [[String: Any]]
    let raw: [String: Any]

    var displayTitle: String {
        if !clientName.isEmpty { return clientName }
        if !serviceType.isEmpty { return serviceType }
        return "Hoja #\(id)"
    }

    static func == (lhs: ServiceSheetItem, rhs: ServiceSheetItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        activityId = StockParse.int64(raw["activityId"]) ?? 0
        clientName = StockParse.str(raw["clientName"], raw["cliente"])
        technicianName = StockParse.str(raw["technicianName"], raw["userName"], raw["responsable"])
        serviceType = StockParse.str(raw["serviceType"], raw["ticketType"], raw["tipo"])
        status = StockParse.str(raw["status"], raw["estado"], raw["estatus"])
        managerName = StockParse.str(raw["managerName"])
        workSummary = StockParse.str(raw["workSummary"], raw["summary"])
        observations = StockParse.str(raw["observations"], raw["observaciones"], raw["notes"])
        signedName = StockParse.str(raw["signedName"], raw["clientSignature"])
        pdfUrl = StockParse.str(raw["pdfUrl"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        if let arr = raw["equipmentList"] as? [[String: Any]] {
            equipmentList = arr
        } else if let arr = raw["materials"] as? [[String: Any]] {
            equipmentList = arr
        } else {
            equipmentList = []
        }
    }
}


