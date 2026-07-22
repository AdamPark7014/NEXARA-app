import Foundation

/// Actividad tipada para listados móviles (paridad Android `ActivityDto`).
struct ActivityItem: Identifiable {
    let id: Int64
    let title: String
    let status: String
    let priority: String
    let clientName: String
    let responsable: String
    let responsableId: String?
    let creator: String
    let type: String
    let description: String
    let scheduledDate: String
    let startDate: String
    let endDate: String
    /// Mapa original para pantallas de detalle que aún leen keys dinámicas.
    let raw: [String: Any]

    init(raw: [String: Any]) {
        self.raw = raw
        id = ActivityParse.int64(raw["id"]) ?? 0
        title = ActivityParse.str(raw["titulo"], raw["title"], raw["descripcion"])
        status = ActivityParse.str(raw["estatus"], raw["status"], raw["estado"]).lowercased()
        priority = ActivityParse.str(raw["prioridad"], raw["priority"])
        clientName = ActivityParse.str(raw["clienteNombre"], raw["clientName"], raw["cliente"])
        responsable = ActivityParse.nestedName(raw["responsable"], raw["asignadoNombre"], raw["assignedTo"])
        responsableId = ActivityParse.str(
            raw["responsableId"], raw["assignedToId"], raw["userId"]
        ).nilIfEmpty
        creator = ActivityParse.nestedName(raw["creador"], raw["createdBy"])
        type = ActivityParse.str(raw["tipo"], raw["type"], raw["tipoActividad"])
        description = ActivityParse.str(raw["descripcion"], raw["description"])
        scheduledDate = ActivityParse.str(raw["scheduledDate"], raw["fechaProgramada"], raw["fechaAsignacion"])
        startDate = ActivityParse.str(raw["startDate"], raw["fechaInicio"], raw["startedAt"])
        endDate = ActivityParse.str(raw["fechaFinalizacion"], raw["completedAt"], raw["endDate"])
    }
}

enum ActivityParse {
    static func str(_ values: Any?...) -> String {
        for v in values {
            if let s = v as? String, !s.isEmpty, s != "null" { return s }
            if let n = v as? NSNumber { return n.stringValue }
            if let m = v as? [String: Any] {
                let nested = str(m["nombre"], m["name"], m["code"])
                if !nested.isEmpty { return nested }
            }
        }
        return ""
    }

    static func nestedName(_ values: Any?...) -> String {
        for v in values {
            let s = str(v)
            if !s.isEmpty { return s }
        }
        return ""
    }

    static func int64(_ value: Any?) -> Int64? {
        if let n = value as? Int64 { return n }
        if let n = value as? Int { return Int64(n) }
        if let n = value as? NSNumber { return n.int64Value }
        if let s = value as? String, let n = Int64(s) { return n }
        return nil
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
