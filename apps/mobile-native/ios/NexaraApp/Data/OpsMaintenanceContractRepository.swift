import Foundation

/// Visita programada de un contrato de mantenimiento —
/// `GET maintenance-contracts/visits`.
///
/// El ciclo real es: SCHEDULED → (generar OT) GENERATED → (cerrar) COMPLETED.
/// `activityId` es lo que enlaza la visita con la orden de trabajo; sin él, la
/// visita todavía no existe para el técnico que la tiene que hacer.
struct MaintenanceVisit: Identifiable, Hashable {
    let id: Int64
    let contractId: Int64
    let contractNumber: String
    let contractTitle: String
    let clientName: String
    let branchName: String
    let scheduledDate: String
    let status: String
    let completedAt: String
    let activityId: Int64?
    let assignedTo: String
    let notes: String

    var isCompleted: Bool { status.uppercased() == "COMPLETED" }
    var hasWorkOrder: Bool { (activityId ?? 0) > 0 }

    var statusLabel: String {
        switch status.uppercased() {
        case "SCHEDULED": return "Programada"
        case "GENERATED": return "OT generada"
        case "COMPLETED": return "Completada"
        case "SKIPPED": return "Omitida"
        default: return status.isEmpty ? "—" : status
        }
    }

    var dateLabel: String {
        scheduledDate.isEmpty ? "Sin fecha" : ActivityParse.fmtIso(scheduledDate)
    }

    /// Una visita programada cuya fecha ya pasó y que sigue sin OT es
    /// exactamente lo que se le escapa a la operación. Se marca en rojo.
    var isOverdue: Bool {
        guard !isCompleted, let d = ActivityParse.isoDate(scheduledDate) else { return false }
        return d < Calendar.current.startOfDay(for: Date())
    }

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        let contract = raw["contract"] as? [String: Any]
        contractId = ActivityParse.int64(raw["contractId"]) ?? ActivityParse.int64(contract?["id"]) ?? 0
        contractNumber = ActivityParse.str(contract?["contractNumber"], raw["contractNumber"])
        contractTitle = ActivityParse.str(contract?["title"], raw["title"])
        clientName = ActivityParse.nestedName(contract?["client"], raw["client"])
        branchName = ActivityParse.nestedName(contract?["branch"], raw["branch"])
        scheduledDate = ActivityParse.str(raw["scheduledDate"], raw["fechaProgramada"])
        status = ActivityParse.str(raw["status"], raw["estado"])
        completedAt = ActivityParse.str(raw["completedAt"])
        let act = ActivityParse.int64(raw["activityId"])
        activityId = (act ?? 0) > 0 ? act : nil
        assignedTo = ActivityParse.nestedName(raw["assignedTo"], raw["asignadoA"])
        notes = ActivityParse.str(raw["notes"], raw["notas"])
    }

    static func == (lhs: MaintenanceVisit, rhs: MaintenanceVisit) -> Bool {
        lhs.id == rhs.id && lhs.status == rhs.status && lhs.activityId == rhs.activityId
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Contratos de mantenimiento y sus visitas programadas.
///
/// `MaintenanceContractsView` (en `ErpPlatformViews.swift`) ya lista contratos,
/// pero es de otro agente y solo consume `GET maintenance-contracts`. Este
/// repositorio y `OpsMaintenanceVisitsView` cubren la parte operativa —visitas,
/// generación de OT y cierre— sin tocar ese fichero.
final class OpsMaintenanceContractRepository {
    static let shared = OpsMaintenanceContractRepository()
    private let api = ApiClient.shared
    private init() {}

    /// Estados válidos de contrato en el backend
    /// (`maintenance-contracts.service.ts`). Mandar otro da 400.
    static let contractStatuses = ["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"]

    static func contractStatusLabel(_ code: String) -> String {
        switch code.uppercased() {
        case "DRAFT": return "Borrador"
        case "ACTIVE": return "Activo"
        case "PAUSED": return "Pausado"
        case "EXPIRED": return "Vencido"
        case "CANCELLED": return "Cancelado"
        default: return code
        }
    }

    func contract(id: Int64) async throws -> MaintenanceContract {
        MaintenanceContract(raw: ConsoleHelpers.decodeMap(try await api.get("maintenance-contracts/\(id)")))
    }

    /// Pausar un contrato detiene la generación automática de visitas: no es un
    /// cambio cosmético, por eso la UI lo confirma antes.
    func setContractStatus(id: Int64, status: String) async throws -> MaintenanceContract {
        struct Body: Encodable { let status: String }
        let data = try await api.patchJSON("maintenance-contracts/\(id)/status", body: Body(status: status))
        return MaintenanceContract(raw: ConsoleHelpers.decodeMap(data))
    }

    func visits(contractId: Int64? = nil, status: String? = nil,
                from: String? = nil, to: String? = nil) async throws -> [MaintenanceVisit] {
        var query: [String: String] = [:]
        if let contractId, contractId > 0 { query["contractId"] = String(contractId) }
        if let status, !status.isEmpty { query["status"] = status }
        if let from, !from.isEmpty { query["from"] = from }
        if let to, !to.isEmpty { query["to"] = to }
        return ApiClient.decodeMapList(try await api.get("maintenance-contracts/visits", query: query))
            .map { MaintenanceVisit(raw: $0) }
    }

    /// Materializa la visita como Actividad (OT). `assignedToId` es opcional: si
    /// no se manda, el backend usa el dueño del contrato.
    @discardableResult
    func generateWorkOrder(visitId: Int64, assignedToId: Int64? = nil) async throws -> [String: Any] {
        struct Body: Encodable { let assignedToId: Int64? }
        return ConsoleHelpers.decodeMap(
            try await api.postJSON("maintenance-contracts/visits/\(visitId)/generate-ot",
                                   body: Body(assignedToId: assignedToId))
        )
    }

    /// Cerrar la visita. El backend genera la OT antes si aún no existía y luego
    /// programa la siguiente visita del contrato, así que después de esto hay que
    /// recargar la lista: cambian dos filas, no una.
    @discardableResult
    func completeVisit(visitId: Int64) async throws -> [String: Any] {
        struct Empty: Encodable {}
        return ConsoleHelpers.decodeMap(
            try await api.postJSON("maintenance-contracts/visits/\(visitId)/complete", body: Empty())
        )
    }
}
