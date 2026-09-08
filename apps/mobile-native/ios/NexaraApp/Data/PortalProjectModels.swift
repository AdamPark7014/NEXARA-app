import Foundation

// Modelos del hueco "portal de cliente y sucursales" que Android ya tenía y iOS no.
// Todos se construyen desde `[String: Any]` con `StockParse`, igual que
// `PortalInventoryModels` / `PortalBranchModels`, porque la API mezcla nombres en
// inglés y castellano según la tabla y un `Decodable` estricto se rompe con el
// primer campo que cambia de idioma.

// MARK: - Proyectos del portal cliente

/// GET `client-portal/projects` — proyectos operativos ACTIVE/ON_HOLD del cliente
/// en sesión, con progreso calculado en el backend.
/// Espejo de `ClientPortalProjectDto` (Android).
struct PortalClientProject: Hashable, Identifiable {
    let id: Int64
    let title: String
    let status: String
    let projectType: String
    let siteCount: Int
    let scopeSummary: String
    let activityCount: Int
    let completedActivities: Int
    let progressPercent: Int
    let startDate: String
    let endDate: String
    let raw: [String: Any]

    var rowKey: String { "pcp-\(id)" }
    var displayTitle: String { title.isEmpty ? "Proyecto \(id)" : title }

    /// El backend ya manda `progressPercent`; si faltara lo derivamos de los
    /// contadores para no pintar 0 % en un proyecto que sí avanzó.
    var progressFraction: Double {
        if progressPercent > 0 { return min(1, Double(progressPercent) / 100) }
        guard activityCount > 0 else { return 0 }
        return min(1, Double(completedActivities) / Double(activityCount))
    }

    var isOnHold: Bool { status.uppercased().contains("HOLD") }

    var subtitle: String {
        [projectType, siteCount > 0 ? "\(siteCount) sitios" : ""]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    static func == (lhs: PortalClientProject, rhs: PortalClientProject) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["titulo"])
        status = StockParse.str(raw["status"], raw["estatus"])
        projectType = StockParse.str(raw["projectType"], raw["tipo"])
        siteCount = StockParse.int(raw["siteCount"]) ?? 0
        scopeSummary = StockParse.str(raw["scopeSummary"], raw["alcance"])
        activityCount = StockParse.int(raw["activityCount"]) ?? 0
        completedActivities = StockParse.int(raw["completedActivities"]) ?? 0
        progressPercent = StockParse.int(raw["progressPercent"]) ?? 0
        startDate = StockParse.str(raw["startDate"], raw["fechaInicio"])
        endDate = StockParse.str(raw["endDate"], raw["fechaFin"])
    }
}

// MARK: - Inventarios de consola (no del portal)

/// GET `inventories` — la vista de consola sobre los inventarios que levantan
/// clientes y técnicos. No confundir con `PortalInventorySnapshot`, que es lo
/// que ve el cliente de su propia sucursal: aquí se aprueba o se rechaza.
/// Espejo de `InventorySnapshotDto` (Android).
struct PortalConsoleInventory: Hashable, Identifiable {
    let id: Int64
    let status: String
    let previousCount: Int
    let currentCount: Int
    let deltaCount: Int
    let updatedAt: String
    let branchId: Int64?
    let branchName: String
    let branchNumber: String
    let clientId: Int64?
    let clientName: String
    let activityId: Int64?
    let activityAnNumber: String
    let raw: [String: Any]

    var rowKey: String { "pci-\(id)" }

    var displayTitle: String {
        if !clientName.isEmpty && !branchName.isEmpty { return "\(clientName) · \(branchName)" }
        if !clientName.isEmpty { return clientName }
        if !branchName.isEmpty { return branchName }
        return "Inventario \(id)"
    }

    var subtitle: String {
        [branchNumber, activityAnNumber].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// El delta es lo que decide si un revisor tiene que mirar el inventario:
    /// cero diferencias normalmente se aprueba sin abrir el PDF.
    var deltaLabel: String {
        if deltaCount > 0 { return "+\(deltaCount)" }
        if deltaCount < 0 { return "\(deltaCount)" }
        return "sin cambios"
    }

    var hasDifference: Bool { deltaCount != 0 }

    var normalizedStatus: String { status.uppercased() }
    var isApproved: Bool { normalizedStatus == "APPROVED" }
    var isRejected: Bool { normalizedStatus == "REJECTED" }
    var isPending: Bool { normalizedStatus == "PENDING" || normalizedStatus.isEmpty }

    static func == (lhs: PortalConsoleInventory, rhs: PortalConsoleInventory) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        // `?? [:]` en vez de encadenar con `?`: sin compilador a mano, un
        // diccionario opcional dentro de un variádico `Any?...` es justo el tipo
        // de sutileza que no quiero arriesgar.
        let branch = raw["branch"] as? [String: Any] ?? [:]
        let client = raw["client"] as? [String: Any] ?? [:]
        let activity = raw["activity"] as? [String: Any] ?? [:]
        id = StockParse.int64(raw["id"]) ?? 0
        status = StockParse.str(raw["status"], raw["estado"])
        previousCount = StockParse.int(raw["previousCount"]) ?? 0
        currentCount = StockParse.int(raw["currentCount"]) ?? 0
        deltaCount = StockParse.int(raw["deltaCount"]) ?? 0
        updatedAt = StockParse.str(raw["updatedAt"], raw["fechaActualizacion"])
        branchId = StockParse.int64(branch["id"], raw["branchId"])
        branchName = StockParse.str(branch["name"], raw["branchName"])
        branchNumber = StockParse.str(branch["branchNumber"], raw["branchNumber"])
        clientId = StockParse.int64(client["id"], raw["clientId"])
        clientName = StockParse.str(client["name"], raw["clientName"])
        activityId = StockParse.int64(activity["id"], raw["activityId"])
        activityAnNumber = StockParse.str(activity["anNumber"], raw["anNumber"])
    }
}

// MARK: - Búsqueda de inventario de herramienta

/// GET `tool-requests/inventory/search?q=` — buscador con autocompletado que usa
/// Android al levantar una solicitud de herramienta.
/// Espejo de `ToolInventorySearchOptionDto`.
struct PortalToolInventoryOption: Hashable, Identifiable {
    let id: Int64
    let toolName: String
    let model: String
    let serialNumber: String
    let status: String

    var rowKey: String { "ptio-\(id)" }
    var displayTitle: String { toolName.isEmpty ? "Herramienta \(id)" : toolName }
    var subtitle: String {
        [model, serialNumber].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    /// Sólo lo disponible se puede pedir; el resto se lista en gris.
    var isAvailable: Bool {
        let s = status.uppercased()
        return s.isEmpty || s == "AVAILABLE" || s == "DISPONIBLE"
    }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        toolName = StockParse.str(raw["toolName"], raw["nombre"], raw["name"])
        model = StockParse.str(raw["model"], raw["modelo"])
        serialNumber = StockParse.str(raw["serialNumber"], raw["serie"])
        status = StockParse.str(raw["status"], raw["estado"])
    }
}

// MARK: - Categorías de la base de conocimiento

/// GET `kb/categories` — la web filtra los artículos por categoría; las apps
/// sólo listaban artículos sueltos.
struct PortalKbCategory: Hashable, Identifiable {
    let id: Int64
    let name: String
    let slug: String
    let description: String
    let articleCount: Int

    var rowKey: String { "pkc-\(id)" }
    var displayName: String { name.isEmpty ? slug : name }

    init(raw: [String: Any]) {
        let counts = raw["_count"] as? [String: Any] ?? [:]
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"], raw["title"])
        slug = StockParse.str(raw["slug"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        articleCount = StockParse.int(counts["articles"], raw["articleCount"]) ?? 0
    }
}

// MARK: - Cumplimiento de SLA

/// Un incumplimiento concreto dentro de `sla/insights`.
struct PortalSlaBreach: Hashable, Identifiable {
    let id: Int64
    let anNumber: String
    let title: String
    let type: String
    let priority: String
    let hoursLate: Double

    var rowKey: String { "psb-\(id)-\(type)" }
    var displayTitle: String {
        if !anNumber.isEmpty && !title.isEmpty { return "\(anNumber) — \(title)" }
        if !anNumber.isEmpty { return anNumber }
        return title.isEmpty ? "Actividad \(id)" : title
    }

    /// La API distingue respuesta tardía, respuesta aún sin dar, y resolución.
    var typeLabel: String {
        switch type {
        case "response": return "Respuesta tarde"
        case "response_open": return "Sin responder"
        case "resolution": return "Resolución tarde"
        default: return type.isEmpty ? "Incumplimiento" : type
        }
    }

    var hoursLateLabel: String { String(format: "%.0f h tarde", hoursLate) }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        anNumber = StockParse.str(raw["anNumber"], raw["folio"])
        title = StockParse.str(raw["titulo"], raw["title"])
        type = StockParse.str(raw["type"])
        priority = StockParse.str(raw["priority"], raw["prioridad"])
        hoursLate = StockParse.dbl(raw["hoursLate"]) ?? 0
    }
}

/// Una actividad vieja sin cerrar dentro del backlog de `sla/insights`.
struct PortalSlaBacklogItem: Hashable, Identifiable {
    let id: Int64
    let anNumber: String
    let title: String
    let priority: String
    let ageHours: Double
    let assignee: String

    var rowKey: String { "psbl-\(id)" }
    var displayTitle: String {
        if !anNumber.isEmpty { return anNumber }
        return title.isEmpty ? "Actividad \(id)" : title
    }
    var ageLabel: String {
        if ageHours >= 48 { return String(format: "%.0f d", ageHours / 24) }
        return String(format: "%.0f h", ageHours)
    }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        anNumber = StockParse.str(raw["anNumber"], raw["folio"])
        title = StockParse.str(raw["titulo"], raw["title"])
        priority = StockParse.str(raw["prioridad"], raw["priority"])
        ageHours = StockParse.dbl(raw["ageHours"]) ?? 0
        assignee = StockParse.str(raw["assignee"], raw["responsable"])
    }
}

/// Fila del ranking de técnicos dentro de `sla/insights`.
struct PortalSlaTechRow: Hashable, Identifiable {
    let userId: Int64
    let name: String
    let closed: Int
    let mttrHours: Double

    var id: Int64 { userId }
    var rowKey: String { "pst-\(userId)" }
    var mttrLabel: String { String(format: "%.1f h", mttrHours) }

    init(raw: [String: Any]) {
        userId = StockParse.int64(raw["userId"], raw["id"]) ?? 0
        name = StockParse.str(raw["nombre"], raw["name"])
        closed = StockParse.int(raw["closed"]) ?? 0
        mttrHours = StockParse.dbl(raw["mttrHours"]) ?? 0
    }
}

/// GET `sla/insights?from=` — lo que la web pinta en `ops/support/sla`.
/// Ninguna de las dos apps lo tenía; el jefe de soporte lleva el teléfono, no
/// el portátil, así que aquí sí encaja.
struct PortalSlaInsights {
    let total: Int
    let stillOpen: Int
    let responseOnTime: Int
    let responseLate: Int
    let responseCompliancePct: Double
    let responseAvgHours: Double
    let resolutionOnTime: Int
    let resolutionLate: Int
    let resolutionCompliancePct: Double
    let resolutionAvgHours: Double
    let high: Int
    let medium: Int
    let low: Int
    let mttrMeanHours: Double
    let mttrMedianHours: Double
    let mttrSampleSize: Int
    let backlogOpen: Int
    let aging0to24: Int
    let aging1to3d: Int
    let aging3to7d: Int
    let aging7dPlus: Int
    let breaches: [PortalSlaBreach]
    let oldest: [PortalSlaBacklogItem]
    let techRanking: [PortalSlaTechRow]
    let inboxByStatus: [(status: String, count: Int)]
    let alerts: [(severity: String, message: String)]

    var isEmpty: Bool { total == 0 && stillOpen == 0 && breaches.isEmpty }

    init(raw: [String: Any]) {
        let response = raw["responseSla"] as? [String: Any] ?? [:]
        let resolution = raw["resolutionSla"] as? [String: Any] ?? [:]
        let severity = raw["bySeverity"] as? [String: Any] ?? [:]
        let mttr = raw["mttr"] as? [String: Any] ?? [:]
        let backlog = raw["backlog"] as? [String: Any] ?? [:]
        let aging = backlog["aging"] as? [String: Any] ?? [:]

        total = StockParse.int(raw["total"]) ?? 0
        stillOpen = StockParse.int(raw["stillOpen"]) ?? 0
        responseOnTime = StockParse.int(response["onTime"]) ?? 0
        responseLate = StockParse.int(response["late"]) ?? 0
        responseCompliancePct = StockParse.dbl(response["compliancePct"]) ?? 0
        responseAvgHours = StockParse.dbl(response["avgHours"]) ?? 0
        resolutionOnTime = StockParse.int(resolution["onTime"]) ?? 0
        resolutionLate = StockParse.int(resolution["late"]) ?? 0
        resolutionCompliancePct = StockParse.dbl(resolution["compliancePct"]) ?? 0
        resolutionAvgHours = StockParse.dbl(resolution["avgHours"]) ?? 0
        high = StockParse.int(severity["high"]) ?? 0
        medium = StockParse.int(severity["medium"]) ?? 0
        low = StockParse.int(severity["low"]) ?? 0
        mttrMeanHours = StockParse.dbl(mttr["meanHours"]) ?? 0
        mttrMedianHours = StockParse.dbl(mttr["medianHours"]) ?? 0
        mttrSampleSize = StockParse.int(mttr["sampleSize"]) ?? 0
        backlogOpen = StockParse.int(backlog["open"]) ?? 0
        aging0to24 = StockParse.int(aging["h0_24"]) ?? 0
        aging1to3d = StockParse.int(aging["d1_3"]) ?? 0
        aging3to7d = StockParse.int(aging["d3_7"]) ?? 0
        aging7dPlus = StockParse.int(aging["d7_plus"]) ?? 0
        breaches = (raw["breaches"] as? [[String: Any]] ?? []).map { PortalSlaBreach(raw: $0) }
        oldest = (backlog["oldest"] as? [[String: Any]] ?? []).map { PortalSlaBacklogItem(raw: $0) }
        techRanking = (raw["techRanking"] as? [[String: Any]] ?? []).map { PortalSlaTechRow(raw: $0) }

        // `inboxByStatus` viene como diccionario libre; lo ordenamos por volumen
        // para que la pantalla no cambie de orden en cada refresco.
        let inbox = raw["inboxByStatus"] as? [String: Any] ?? [:]
        inboxByStatus = inbox
            .map { (status: $0.key, count: StockParse.int($0.value) ?? 0) }
            .sorted { $0.count > $1.count }

        alerts = (raw["alerts"] as? [[String: Any]] ?? []).map {
            (severity: StockParse.str($0["severity"]), message: StockParse.str($0["message"]))
        }
    }
}

// MARK: - Ficha 360 del cliente de servicio

/// GET `service-clients/{id}/snapshot` — la web la usa para la pestaña de
/// tickets del cliente. Reúne sucursales, actividades recientes, proyectos,
/// contratos y solicitudes en una sola llamada.
struct PortalServiceClientSnapshot {
    let id: Int64
    let name: String
    let branchCount: Int
    let activityCount: Int
    let projectCount: Int
    let contractCount: Int
    let ticketRequestCount: Int
    let branches: [[String: Any]]
    let recentActivities: [[String: Any]]
    let operationalProjects: [[String: Any]]
    let maintenanceContracts: [[String: Any]]
    let ticketRequests: [ClientTicketRequest]
    let raw: [String: Any]

    var isEmpty: Bool { id == 0 && name.isEmpty }

    init(raw: [String: Any]) {
        self.raw = raw
        // El snapshot puede venir plano o envuelto en `client`, según versión.
        let client = raw["client"] as? [String: Any] ?? raw
        let counts = (client["_count"] as? [String: Any]) ?? (raw["_count"] as? [String: Any]) ?? [:]
        id = StockParse.int64(client["id"], raw["id"]) ?? 0
        name = StockParse.str(client["name"], client["nombre"], raw["name"])
        branchCount = StockParse.int(counts["branches"]) ?? 0
        activityCount = StockParse.int(counts["activities"]) ?? 0
        projectCount = StockParse.int(counts["operationalProjects"]) ?? 0
        contractCount = StockParse.int(counts["maintenanceContracts"]) ?? 0
        ticketRequestCount = StockParse.int(counts["ticketRequests"]) ?? 0
        branches = (client["branches"] as? [[String: Any]]) ?? (raw["branches"] as? [[String: Any]]) ?? []
        recentActivities = (raw["activitiesRecent"] as? [[String: Any]])
            ?? (raw["activities"] as? [[String: Any]]) ?? []
        operationalProjects = (raw["operationalProjects"] as? [[String: Any]]) ?? []
        maintenanceContracts = (raw["maintenanceContracts"] as? [[String: Any]]) ?? []
        ticketRequests = (raw["ticketRequests"] as? [[String: Any]] ?? []).map { ClientTicketRequest(raw: $0) }
    }
}
