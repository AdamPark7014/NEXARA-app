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
    /// Número de la sucursal de la solicitud (Android `ClientTicketRequestDto.branchNumber`).
    let branchNumber: String
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
    /// `ClientTicketStatus` del API: NEW · APPROVED · REJECTED · CLOSED (Android compara igual).
    var isNew: Bool { status.uppercased() == "NEW" }
    var isClosed: Bool { status.uppercased() == "CLOSED" }

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
        branchNumber = StockParse.str(raw["branchNumber"])
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
    /// `urgency` del ticket, aparte de la prioridad (Android lo usa como «Tipo» si falta `ticketType`).
    let urgency: String
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

    /// OT finalizada de verdad (Android `isFinished()`): el API solo acepta
    /// CONFIRM_RESOLVED / REQUEST_REOPEN con estatus FINALIZADA
    /// (`activity-status.ts::isFinishedStatus`), así que una cancelada no cuenta.
    var isFinished: Bool {
        let s = status.lowercased()
        if s.contains("cancel") { return false }
        return s.contains("finaliz") || s.contains("complet")
    }

    var commentsFeedback: String {
        StockParse.str(raw["comentariosFeedback"], raw["comments"], raw["comentarios"])
    }

    var responsableName: String {
        if let map = raw["responsable"] as? [String: Any] {
            return StockParse.str(map["nombre"], map["name"])
        }
        return StockParse.str(raw["responsable"], raw["responsableNombre"], raw["technicianName"])
    }

    var serviceSheet: [String: Any]? {
        raw["serviceSheet"] as? [String: Any]
    }

    var evidences: [[String: Any]] {
        var out: [[String: Any]] = []
        if let a = raw["evidencias"] as? [[String: Any]] { out.append(contentsOf: a) }
        if let a = raw["activityEvidence"] as? [[String: Any]] { out.append(contentsOf: a) }
        if let a = raw["evidences"] as? [[String: Any]] { out.append(contentsOf: a) }
        return out
    }

    /// Evidencias que ve el cliente en el detalle: primero las de `evidencias`
    /// (con los mismos campos que lee Android `TicketsTicketDetailScreen`) y luego
    /// las fotos y el PDF del flujo de evidencia del técnico.
    ///
    /// El API manda ese flujo en `activityEvidences` (arreglo, `include` de
    /// `client-portal/tickets/:id`), pero Android y la web lo buscaban como
    /// `activityEvidence` en singular y nunca lo encontraban: el cliente no veía
    /// la foto de llegada, las de trabajo ni la de salida de su propio servicio.
    /// Se arman igual que `buildTicketEvidenceFiles` de la web; sin repetidos.
    var evidenceFiles: [PortalTicketEvidence] {
        var out: [PortalTicketEvidence] = []
        var seen = Set<String>()
        func add(_ item: PortalTicketEvidence) {
            let key = item.url.isEmpty ? "sin-archivo-\(out.count)" : item.url
            guard !seen.contains(key) else { return }
            seen.insert(key)
            out.append(item)
        }
        for ev in evidences {
            add(PortalTicketEvidence(
                id: "ev-\(out.count)",
                title: ConsoleHelpers.mapStr(ev, "tipoEvidencia", "description", "descripcion", "name", "tipo"),
                comments: ConsoleHelpers.mapStr(ev, "comentarios", "description", "descripcion"),
                uploadedAt: ConsoleHelpers.mapStr(ev, "subidoEn", "createdAt", "fecha", "uploadedAt"),
                url: ConsoleHelpers.mapStr(ev, "archivoUrl", "fileUrl", "url", "path")
            ))
        }
        var flows: [[String: Any]] = []
        if let list = raw["activityEvidences"] as? [[String: Any]] { flows.append(contentsOf: list) }
        if let one = raw["activityEvidence"] as? [String: Any] { flows.append(one) }
        let sheetPdf = serviceSheet.map { ConsoleHelpers.mapStr($0, "pdfUrl") } ?? ""
        for flow in flows {
            func file(_ title: String, _ urlKey: String, _ whenKey: String) {
                let url = ConsoleHelpers.mapStr(flow, urlKey)
                guard !url.isEmpty else { return }
                add(PortalTicketEvidence(
                    id: "flujo-\(out.count)", title: title, comments: "",
                    uploadedAt: ConsoleHelpers.mapStr(flow, whenKey), url: url
                ))
            }
            file("Foto llegada", "entryPhotoUrl", "entryPhotoUploadedAt")
            let photos = (flow["evidencePhotos"] as? [Any] ?? []).compactMap { $0 as? String }
            for (index, url) in photos.enumerated() where !url.isEmpty {
                add(PortalTicketEvidence(
                    id: "flujo-\(out.count)", title: "Evidencia \(index + 1)", comments: "",
                    uploadedAt: ConsoleHelpers.mapStr(flow, "evidencePhotosUploadedAt"), url: url
                ))
            }
            let pdf = ConsoleHelpers.mapStr(flow, "serviceSheetPdfUrl")
            if !pdf.isEmpty || !sheetPdf.isEmpty {
                add(PortalTicketEvidence(
                    id: "flujo-\(out.count)", title: "PDF hoja de servicio", comments: "",
                    uploadedAt: ConsoleHelpers.mapStr(flow, "serviceSheetUploadedAt"),
                    url: pdf.isEmpty ? sheetPdf : pdf
                ))
            }
            file("Foto salida", "exitPhotoUrl", "exitPhotoUploadedAt")
        }
        return out
    }

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let naiveUtcFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    /// Horas desde la asignación o, si no hay, desde el inicio (Android
    /// `ticketAgeHours`: `fechaAsignacion ?: fechaInicio`; sin fecha = 0). Una fecha
    /// sin zona se lee en UTC, como Android.
    var ageHours: Int {
        let src = assignedAt.isEmpty ? startedAt : assignedAt
        guard src.count >= 10 else { return 0 }
        let naive = String(src.prefix(19)).replacingOccurrences(of: " ", with: "T")
        guard let date = Self.isoFractional.date(from: src)
            ?? Self.isoPlain.date(from: src)
            ?? Self.naiveUtcFormatter.date(from: naive)
        else { return 0 }
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
        urgency = StockParse.str(raw["urgency"])
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
    var subtitle: String {
        [anNumber, responsibleName].filter { !$0.isEmpty }.joined(separator: " · ")
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

/// Un archivo de evidencia del detalle de ticket del portal (foto o PDF).
struct PortalTicketEvidence: Hashable, Identifiable {
    let id: String
    /// Tipo o nombre; vacío = «Evidencia».
    let title: String
    let comments: String
    let uploadedAt: String
    /// Ruta tal como la manda el API (relativa a `/uploads` o absoluta).
    let url: String

    var isPdf: Bool { url.lowercased().hasSuffix(".pdf") }
    var isImage: Bool { !url.isEmpty && !isPdf }
}

/// Proyecto del cliente para filtrar tickets — GET client-portal/projects
/// (Android `ClientPortalProjectDto`).
struct PortalProject: Hashable, Identifiable {
    let id: Int64
    let title: String

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"])
    }
}
