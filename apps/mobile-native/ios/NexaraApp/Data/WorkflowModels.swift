import Foundation

/// Aprobación pendiente — GET /workflow/my-pending
struct WorkflowApproval: Hashable, Identifiable {
    let id: Int64
    let status: String
    let workflowName: String
    let entityType: String
    let entityId: Int64?
    /// Id de la instancia, no de la aprobación. Hace falta para pedir
    /// `workflow/instances/:id` y enseñar la cadena completa del trámite: el
    /// listado sólo dice "te toca el paso 2", no qué pasó en el paso 1.
    let instanceId: Int64?
    let stepNumber: Int?
    let stepName: String
    let requestedByName: String
    let createdAt: String
    let priority: String

    var rowKey: String { "wa-\(id)" }

    var displayTitle: String {
        if !workflowName.isEmpty { return workflowName }
        if !stepName.isEmpty { return stepName }
        if !entityType.isEmpty { return entityType }
        return "Aprobación"
    }

    var displaySubtitle: String {
        var parts: [String] = []
        if let entityId { parts.append("Entidad #\(entityId)") }
        if let stepNumber { parts.append("Paso \(stepNumber)") }
        if !requestedByName.isEmpty { parts.append(requestedByName) }
        return parts.joined(separator: " · ")
    }

    var urgencyLabel: String {
        priority.isEmpty ? "normal" : priority
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "id": id,
            "approvalId": id,
            "status": status,
            "title": displayTitle,
            "entityType": entityType,
            "stepName": stepName,
            "requestedBy": requestedByName,
            "userName": requestedByName,
            "solicita": requestedByName,
            "createdAt": createdAt,
            "priority": priority,
            "urgencia": priority,
        ]
        if let entityId { out["entityId"] = entityId }
        if let instanceId { out["instanceId"] = instanceId }
        if let stepNumber { out["stepNumber"] = stepNumber }
        return out
    }

    init(raw: [String: Any]) {
        let instance = raw["instance"] as? [String: Any]
        let workflow = instance?["workflow"] as? [String: Any]
        let step = raw["step"] as? [String: Any]
        let startedBy = instance?["startedBy"] as? [String: Any]

        id = StockParse.int64(raw["id"]) ?? StockParse.int64(raw["approvalId"]) ?? 0
        status = StockParse.str(raw["status"], raw["estado"])
        workflowName = StockParse.str(workflow?["name"], raw["title"], raw["workflowName"])
        entityType = StockParse.str(
            instance?["entityType"], workflow?["entityType"], raw["entityType"]
        )
        entityId = StockParse.int64(instance?["entityId"]) ?? StockParse.int64(raw["entityId"])
        instanceId = StockParse.int64(instance?["id"]) ?? StockParse.int64(raw["instanceId"])
        if let n = step?["stepNumber"] as? Int {
            stepNumber = n
        } else if let n = StockParse.dbl(step?["stepNumber"], raw["stepNumber"]) {
            stepNumber = Int(n)
        } else {
            stepNumber = nil
        }
        stepName = StockParse.str(step?["name"], step?["title"], raw["stepName"])
        requestedByName = StockParse.str(
            startedBy?["nombre"], startedBy?["name"],
            raw["requestedBy"], raw["userName"], raw["solicita"]
        )
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        priority = StockParse.str(raw["priority"], raw["urgencia"], raw["urgency"])
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Traza de aprobaciones. `workflow/my-pending` ya decía "tienes algo pendiente",
// pero no por dónde va el trámite ni quién lo firmó antes. En compras eso es
// justamente lo que se necesita para decidir desde el teléfono.
// ─────────────────────────────────────────────────────────────────────────────

/// Un paso ya resuelto (o pendiente) dentro de una instancia de workflow.
struct WorkflowApprovalStep: Hashable, Identifiable {
    let id: Int64
    let stepNumber: Int?
    let stepName: String
    let status: String
    let comments: String
    let decidedByName: String
    let decidedAt: String
    let createdAt: String

    var rowKey: String { "wstep-\(id)" }
    var displayName: String {
        if !stepName.isEmpty { return stepName }
        if let stepNumber { return "Paso \(stepNumber)" }
        return "Paso"
    }
    var isPending: Bool { status.uppercased() == "PENDING" }
    var isApproved: Bool { status.uppercased() == "APPROVED" }
    var isRejected: Bool { status.uppercased() == "REJECTED" }
    var decidedLabel: String { String(decidedAt.prefix(10)) }

    static func == (lhs: WorkflowApprovalStep, rhs: WorkflowApprovalStep) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let step = raw["step"] as? [String: Any]
        let decidedBy = raw["decidedBy"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        stepNumber = StockParse.int(step?["stepNumber"], raw["stepNumber"])
        stepName = StockParse.str(step?["name"], step?["title"], raw["stepName"])
        status = StockParse.str(raw["status"], raw["estado"])
        comments = StockParse.str(raw["comments"], raw["comentarios"])
        decidedByName = StockParse.str(decidedBy?["nombre"], decidedBy?["name"])
        decidedAt = StockParse.str(raw["decidedAt"])
        createdAt = StockParse.str(raw["createdAt"])
    }
}

/// Instancia de workflow — GET /workflow/instances/:id y
/// GET /workflow/entity/:entityType/:entityId
struct WorkflowInstanceItem: Hashable, Identifiable {
    let id: Int64
    let workflowName: String
    let entityType: String
    let entityId: Int64?
    let currentStep: Int?
    let isComplete: Bool
    let isCancelled: Bool
    let startedByName: String
    let startedAt: String
    let completedAt: String
    let steps: [WorkflowApprovalStep]
    let hasData: Bool

    var rowKey: String { "winst-\(id)" }
    var displayTitle: String {
        workflowName.isEmpty ? "Flujo \(id)" : workflowName
    }
    /// Estado legible sin depender de un campo que la API no manda: se deduce de
    /// los dos booleanos que sí manda.
    var statusLabel: String {
        if isCancelled { return "Cancelado" }
        if isComplete { return "Completado" }
        if let currentStep { return "En paso \(currentStep)" }
        return "En curso"
    }
    var approvedCount: Int { steps.filter(\.isApproved).count }
    var pendingCount: Int { steps.filter(\.isPending).count }

    static func == (lhs: WorkflowInstanceItem, rhs: WorkflowInstanceItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let workflow = raw["workflow"] as? [String: Any]
        let startedBy = raw["startedBy"] as? [String: Any]
        hasData = !raw.isEmpty
        id = StockParse.int64(raw["id"]) ?? 0
        workflowName = StockParse.str(workflow?["name"], raw["workflowName"], raw["title"])
        entityType = StockParse.str(raw["entityType"], workflow?["entityType"])
        entityId = StockParse.int64(raw["entityId"])
        currentStep = StockParse.int(raw["currentStep"])
        isComplete = (raw["isComplete"] as? Bool) ?? ((raw["isComplete"] as? NSNumber)?.boolValue ?? false)
        isCancelled = (raw["isCancelled"] as? Bool) ?? ((raw["isCancelled"] as? NSNumber)?.boolValue ?? false)
        startedByName = StockParse.str(startedBy?["nombre"], startedBy?["name"])
        startedAt = StockParse.str(raw["startedAt"], raw["createdAt"])
        completedAt = StockParse.str(raw["completedAt"])
        steps = (raw["approvals"] as? [[String: Any]] ?? []).map { WorkflowApprovalStep(raw: $0) }
    }
}
