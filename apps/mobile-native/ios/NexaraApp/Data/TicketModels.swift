import Foundation

/// Solicitud de ticket (ops / client-ticket-requests).
struct ClientTicketRequest: Hashable, Identifiable {
    let id: Int64
    let description: String
    let title: String
    let status: String
    let urgency: String
    let requestType: String
    let branchName: String
    let clientName: String
    let clientId: Int64?
    let createdAt: String
    let dueAt: String

    var rowKey: String { "ctr-\(id)" }
    var displayTitle: String {
        let d = description.isEmpty ? title : description
        return d.isEmpty ? "Solicitud" : d
    }
    var isHighUrgency: Bool { urgency.uppercased() == "HIGH" }

    func toFlatMap() -> [String: Any] {
        [
            "id": id,
            "description": description,
            "title": title.isEmpty ? description : title,
            "status": status,
            "urgency": urgency,
            "requestType": requestType,
            "branchName": branchName,
            "clientName": clientName,
            "createdAt": createdAt,
            "dueAt": dueAt,
        ]
    }

    init(raw: [String: Any]) {
        let client = raw["client"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        description = StockParse.str(raw["description"], raw["descripcion"])
        title = StockParse.str(raw["title"], raw["titulo"])
        status = StockParse.str(raw["status"], raw["estado"])
        urgency = StockParse.str(raw["urgency"], raw["urgencia"])
        requestType = StockParse.str(raw["requestType"], raw["tipo"])
        branchName = StockParse.str(raw["branchName"], raw["sucursal"])
        clientName = StockParse.str(
            client?["name"], client?["nombre"],
            raw["clientName"], raw["client"], raw["name"]
        )
        clientId = StockParse.int64(client?["id"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        dueAt = StockParse.str(raw["dueAt"], raw["fechaVencimiento"])
    }
}

/// Ticket operativo del portal cliente/sucursal.
struct PortalTicket: Hashable, Identifiable {
    let id: Int64
    let anNumber: String
    let title: String
    let status: String
    let priority: String
    let ticketType: String
    let branchName: String
    let branchCity: String
    let branchState: String
    let assignedAt: String
    let startedAt: String
    let completedAt: String
    let dueAt: String
    let slaDueAt: String
    let createdAt: String
    let raw: [String: Any]

    var rowKey: String { "pt-\(id)" }
    var displayTitle: String {
        if !title.isEmpty { return title }
        if !anNumber.isEmpty { return anNumber }
        return "Ticket"
    }
    var displayPriority: String { priority.isEmpty ? "—" : priority }

    var isOpen: Bool {
        let s = status.lowercased()
        return !s.contains("finaliz") && !s.contains("cerrad")
            && !s.contains("complet") && !s.contains("cancel")
    }

    var isHighPriority: Bool {
        let p = displayPriority.lowercased()
        return p.contains("alta") || p.contains("high") || p.contains("urgent") || p == "high"
    }

    /// Horas desde asignación / creación (aprox. ISO prefix).
    var ageHours: Int {
        let src = assignedAt.isEmpty ? createdAt : assignedAt
        guard src.count >= 10 else { return 0 }
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = df.date(from: src)
        if date == nil {
            df.formatOptions = [.withInternetDateTime]
            date = df.date(from: src)
        }
        if date == nil {
            let simple = DateFormatter()
            simple.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
            simple.timeZone = TimeZone(secondsFromGMT: 0)
            date = simple.date(from: String(src.prefix(19)))
        }
        guard let date else { return 0 }
        return max(0, Int(Date().timeIntervalSince(date) / 3600))
    }

    func toFlatMap() -> [String: Any] {
        var out = raw
        out["id"] = id
        out["anNumber"] = anNumber
        out["titulo"] = title
        out["estatus"] = status
        out["prioridad"] = priority
        out["urgency"] = priority
        out["ticketType"] = ticketType
        out["branchName"] = branchName
        out["branchCity"] = branchCity
        out["branchState"] = branchState
        out["fechaAsignacion"] = assignedAt
        out["fechaInicio"] = startedAt
        out["fechaFinalizacion"] = completedAt
        out["dueAt"] = dueAt
        out["slaDueAt"] = slaDueAt
        out["createdAt"] = createdAt
        return out
    }

    static func == (lhs: PortalTicket, rhs: PortalTicket) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        anNumber = StockParse.str(raw["anNumber"], raw["folio"])
        title = StockParse.str(raw["titulo"], raw["title"])
        status = StockParse.str(raw["estatus"], raw["status"])
        priority = StockParse.str(raw["prioridad"], raw["urgency"], raw["priority"])
        ticketType = StockParse.str(raw["ticketType"], raw["tipo"])
        branchName = StockParse.str(raw["branchName"], raw["sucursal"])
        branchCity = StockParse.str(raw["branchCity"])
        branchState = StockParse.str(raw["branchState"])
        assignedAt = StockParse.str(raw["fechaAsignacion"], raw["assignedAt"])
        startedAt = StockParse.str(raw["fechaInicio"], raw["startedAt"])
        completedAt = StockParse.str(raw["fechaFinalizacion"], raw["completedAt"])
        dueAt = StockParse.str(raw["dueAt"])
        slaDueAt = StockParse.str(raw["slaDueAt"], raw["slaDue"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }
}

/// Feedback pendiente — GET /client-portal/feedback/pending
struct PendingFeedbackItem: Hashable, Identifiable {
    let id: Int64
    let anNumber: String
    let title: String
    let completedAt: String
    let responsibleName: String

    var rowKey: String { "fb-\(id)" }
    var displayTitle: String {
        if !title.isEmpty { return title }
        if !anNumber.isEmpty { return anNumber }
        return "Actividad"
    }

    func toFlatMap() -> [String: Any] {
        [
            "id": id,
            "anNumber": anNumber,
            "titulo": title,
            "fechaFinalizacion": completedAt,
            "responsable": responsibleName,
        ]
    }

    init(raw: [String: Any]) {
        let responsable = raw["responsable"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? StockParse.int64(raw["activityId"]) ?? 0
        anNumber = StockParse.str(raw["anNumber"], raw["folio"])
        title = StockParse.str(raw["titulo"], raw["title"])
        completedAt = StockParse.str(raw["fechaFinalizacion"], raw["completedAt"])
        responsibleName = StockParse.str(
            responsable?["nombre"], responsable?["name"],
            raw["responsable"], raw["responsableNombre"]
        )
    }
}
