import Foundation

/// Fila de historial / revisión de evidencias.
struct EvidenceRow: Hashable, Identifiable {
    let id: Int64
    let activityId: Int64
    let anNumber: String
    let title: String
    let clientName: String
    let status: String
    let createdAt: String
    let engineerName: String

    var rowKey: String { "ev-\(activityId)-\(id)" }
    var displayTitle: String {
        if !anNumber.isEmpty { return anNumber }
        if !title.isEmpty { return title }
        return "Actividad"
    }

    var needsReview: Bool {
        let s = status.lowercased()
        if s.contains("aprobad") || s.contains("rechazad") { return false }
        return s.contains("pendiente") || s.contains("revis") || s.contains("complet")
            || s.contains("enviad") || s.contains("entregad") || s.isEmpty
    }

    func toFlatMap() -> [String: Any] {
        [
            "id": id,
            "activityId": activityId,
            "activityAn": anNumber,
            "anNumber": anNumber,
            "titulo": title,
            "clientName": clientName,
            "cliente": clientName,
            "status": status,
            "estado": status,
            "estatus": status,
            "createdAt": createdAt,
            "engineerName": engineerName,
        ]
    }

    init(raw: [String: Any]) {
        let act = raw["actividad"] as? [String: Any]
        let user = raw["user"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        activityId = StockParse.int64(act?["id"])
            ?? StockParse.int64(raw["activityId"])
            ?? StockParse.int64(raw["id"])
            ?? 0
        anNumber = StockParse.str(
            act?["anNumber"], raw["activityAn"], raw["anNumber"]
        )
        title = StockParse.str(act?["titulo"], raw["titulo"], raw["title"])
        clientName = StockParse.str(
            act?["branchName"], raw["clientName"], raw["cliente"], raw["branchName"]
        )
        status = StockParse.str(
            raw["estatus"], raw["status"], raw["estado"], raw["reviewStatus"]
        )
        createdAt = StockParse.str(raw["createdAt"], raw["fechaEvidencia"], raw["updatedAt"])
        engineerName = StockParse.str(
            user?["nombre"], user?["name"],
            raw["engineerName"], raw["userName"]
        )
    }
}

/// Detalle de workflow de evidencias por actividad.
struct EvidenceDetail: Hashable {
    let id: Int64
    let activityId: Int64
    let status: String
    let reviewStatus: String
    let reviewNotes: String
    let entryPhotoUrl: String?
    let evidencePhotos: [String]
    let serviceSheetPdfUrl: String?
    let serviceSheetCompleted: Bool
    let exitPhotoUrl: String?

    var hasEntry: Bool { entryPhotoUrl != nil && !(entryPhotoUrl?.isEmpty ?? true) }
    var hasPhotos: Bool { !evidencePhotos.isEmpty }
    var hasPdf: Bool { serviceSheetPdfUrl != nil && !(serviceSheetPdfUrl?.isEmpty ?? true) }
    var hasExit: Bool { exitPhotoUrl != nil && !(exitPhotoUrl?.isEmpty ?? true) }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "id": id,
            "activityId": activityId,
            "status": status,
            "reviewStatus": reviewStatus,
            "reviewNotes": reviewNotes,
            "serviceSheetCompleted": serviceSheetCompleted,
            "evidencePhotoUrls": evidencePhotos,
            "evidencePhotos": evidencePhotos,
        ]
        if let entryPhotoUrl { out["entryPhotoUrl"] = entryPhotoUrl }
        if let serviceSheetPdfUrl { out["serviceSheetPdfUrl"] = serviceSheetPdfUrl }
        if let exitPhotoUrl { out["exitPhotoUrl"] = exitPhotoUrl }
        return out
    }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        activityId = StockParse.int64(raw["activityId"]) ?? StockParse.int64(raw["id"]) ?? 0
        status = StockParse.str(raw["status"], raw["estatus"])
        reviewStatus = StockParse.str(raw["reviewStatus"], raw["estatus"])
        reviewNotes = StockParse.str(raw["reviewNotes"], raw["observacionesRevision"], raw["comentarios"])
        let entry = StockParse.str(raw["entryPhotoUrl"])
        entryPhotoUrl = entry.isEmpty ? nil : entry
        if let arr = raw["evidencePhotos"] as? [String] {
            evidencePhotos = arr
        } else if let arr = raw["evidencePhotoUrls"] as? [String] {
            evidencePhotos = arr
        } else if let arr = raw["evidencePhotos"] as? [Any] {
            evidencePhotos = arr.compactMap { $0 as? String }
        } else {
            evidencePhotos = []
        }
        let pdf = StockParse.str(raw["serviceSheetPdfUrl"])
        serviceSheetPdfUrl = pdf.isEmpty ? nil : pdf
        if let b = raw["serviceSheetCompleted"] as? Bool {
            serviceSheetCompleted = b
        } else if raw["serviceSheetData"] != nil || raw["serviceSheetCompletedAt"] != nil {
            serviceSheetCompleted = true
        } else {
            serviceSheetCompleted = false
        }
        let exit = StockParse.str(raw["exitPhotoUrl"])
        exitPhotoUrl = exit.isEmpty ? nil : exit
    }
}
