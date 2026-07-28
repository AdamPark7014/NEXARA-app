import Foundation

/// Aprobación pendiente — GET /workflow/my-pending
struct WorkflowApproval: Hashable, Identifiable {
    let id: Int64
    let status: String
    let workflowName: String
    let entityType: String
    let entityId: Int64?
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
