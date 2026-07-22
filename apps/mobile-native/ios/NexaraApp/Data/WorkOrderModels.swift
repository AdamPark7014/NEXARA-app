import Foundation

/// Activo de mantenimiento tipado — GET /maintenance/assets
struct MaintenanceAsset: Hashable {
    let id: Int64?
    let code: String
    let name: String
    let description: String
    let category: String
    let location: String
    let status: String
    let serialNumber: String
    let manufacturer: String
    let model: String
    let responsibleName: String
    let responsibleId: Int64?
    let lastMaintenanceDate: String

    var rowKey: String { "\(id ?? 0)-\(code)" }

    var displayName: String {
        if !name.isEmpty { return name }
        if !code.isEmpty { return code }
        return "Activo"
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "code": code,
            "tag": code,
            "serial": serialNumber.isEmpty ? code : serialNumber,
            "name": name,
            "nombre": name,
            "description": description,
            "category": category,
            "type": category,
            "tipo": category,
            "location": location,
            "ubicacion": location,
            "status": status,
            "estado": status,
            "serialNumber": serialNumber,
            "manufacturer": manufacturer,
            "model": model,
            "responsibleName": responsibleName,
            "responsable": responsibleName,
            "assignedTo": responsibleName,
            "lastMaintenanceDate": lastMaintenanceDate,
            "lastService": lastMaintenanceDate,
        ]
        if let id { out["id"] = id }
        if let responsibleId { out["responsibleId"] = responsibleId }
        return out
    }

    init(raw: [String: Any]) {
        let responsible = raw["responsible"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        code = StockParse.str(raw["code"], raw["tag"], raw["codigo"])
        name = StockParse.str(raw["name"], raw["nombre"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        category = StockParse.str(raw["category"], raw["categoria"], raw["type"], raw["tipo"])
        location = StockParse.str(raw["location"], raw["ubicacion"])
        status = StockParse.str(raw["status"], raw["estado"], raw["condition"])
        serialNumber = StockParse.str(raw["serialNumber"], raw["serial"], raw["serie"])
        manufacturer = StockParse.str(raw["manufacturer"], raw["fabricante"])
        model = StockParse.str(raw["model"], raw["modelo"])
        responsibleName = StockParse.str(
            responsible?["nombre"], responsible?["name"],
            raw["responsibleName"], raw["responsable"], raw["assignedTo"]
        )
        responsibleId = StockParse.int64(responsible?["id"] ?? raw["responsibleId"])
        lastMaintenanceDate = StockParse.str(raw["lastMaintenanceDate"], raw["lastService"], raw["updatedAt"])
    }
}

/// Orden de mantenimiento tipada — GET /maintenance/work-orders
struct WorkOrder: Hashable {
    let id: Int64?
    let orderNumber: String
    let title: String
    let description: String
    let status: String
    let priority: String
    let type: String
    let assetName: String
    let assetId: Int64?
    let technicianName: String
    let assignedToId: Int64?
    let plannedDate: String
    let completedDate: String
    let workPerformed: String
    let notes: String

    var rowKey: String { "\(id ?? 0)-\(orderNumber)" }

    var displayTitle: String {
        if !title.isEmpty { return title }
        if !orderNumber.isEmpty { return orderNumber }
        return "Orden"
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "orderNumber": orderNumber,
            "title": title,
            "description": description,
            "status": status,
            "estado": status,
            "priority": priority,
            "prioridad": priority,
            "type": type,
            "assetName": assetName,
            "equipmentName": assetName,
            "technicianName": technicianName,
            "responsable": technicianName,
            "plannedDate": plannedDate,
            "scheduledDate": plannedDate,
            "createdAt": plannedDate,
            "completedDate": completedDate,
            "workPerformed": workPerformed,
            "notes": notes.isEmpty ? workPerformed : notes,
            "observaciones": notes.isEmpty ? workPerformed : notes,
        ]
        if let id { out["id"] = id }
        if let assetId { out["assetId"] = assetId }
        if let assignedToId { out["assignedToId"] = assignedToId }
        return out
    }

    init(raw: [String: Any]) {
        let asset = raw["asset"] as? [String: Any]
        let assigned = raw["assignedTo"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        orderNumber = StockParse.str(raw["orderNumber"], raw["number"], raw["folio"])
        title = StockParse.str(raw["title"], raw["titulo"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        status = StockParse.str(raw["status"], raw["estado"])
        priority = StockParse.str(raw["priority"], raw["prioridad"])
        type = StockParse.str(raw["type"], raw["tipo"])
        assetName = StockParse.str(asset?["name"], asset?["code"], raw["assetName"], raw["equipmentName"], raw["asset"])
        assetId = StockParse.int64(asset?["id"] ?? raw["assetId"])
        technicianName = StockParse.str(assigned?["nombre"], assigned?["name"], raw["technicianName"], raw["responsable"])
        assignedToId = StockParse.int64(assigned?["id"] ?? raw["assignedToId"])
        plannedDate = StockParse.str(raw["plannedDate"], raw["scheduledDate"], raw["scheduledAt"], raw["createdAt"])
        completedDate = StockParse.str(raw["completedDate"], raw["completedAt"])
        workPerformed = StockParse.str(raw["workPerformed"])
        notes = StockParse.str(raw["notes"], raw["observaciones"], raw["workPerformed"], raw["description"])
    }
}
