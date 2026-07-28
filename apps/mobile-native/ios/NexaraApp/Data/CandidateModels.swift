import Foundation

/// Candidato / CV — GET /cvs
struct CandidateItem: Hashable, Identifiable {
    let id: Int64
    let fullName: String
    let email: String
    let whatsapp: String
    let category: String
    let stage: String
    let employmentStatus: String
    let cvUrl: String
    let experience: String
    let notes: String
    let source: String
    let expectedSalary: String
    let position: String
    let createdAt: String
    let raw: [String: Any]

    var displayName: String { fullName.isEmpty ? "Candidato #\(id)" : fullName }
    var stageKey: String { stage.isEmpty ? "INBOX" : stage }
    var isRejected: Bool { stageKey.contains("REJECTED") }
    var isApproved: Bool { stageKey == "APPROVED" }

    static func == (lhs: CandidateItem, rhs: CandidateItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        fullName = StockParse.str(raw["fullName"], raw["nombre"], raw["name"])
        email = StockParse.str(raw["email"], raw["correo"])
        whatsapp = StockParse.str(raw["whatsapp"], raw["phone"], raw["telefono"])
        category = StockParse.str(raw["category"], raw["categoria"])
        stage = StockParse.str(raw["stage"], raw["status"], raw["estado"])
        employmentStatus = StockParse.str(raw["employmentStatus"])
        cvUrl = StockParse.str(raw["cvUrl"], raw["fileUrl"], raw["url"])
        experience = StockParse.str(raw["experience"], raw["experiencia"])
        notes = StockParse.str(raw["notes"], raw["notas"])
        source = StockParse.str(raw["source"], raw["origen"])
        expectedSalary = StockParse.str(raw["expectedSalary"], raw["salary"], raw["sueldo"])
        position = StockParse.str(raw["position"], raw["role"], raw["puesto"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }
}
