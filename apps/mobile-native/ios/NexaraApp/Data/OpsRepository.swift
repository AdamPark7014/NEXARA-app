import Foundation

/// Operaciones ERP/OPS — tickets de clientes, compras, etc.
final class OpsRepository {
    static let shared = OpsRepository()
    private let api = ApiClient.shared
    private init() {}

    func clientTicketRequests(status: String? = nil) async throws -> [[String: Any]] {
        try await clientTicketRequestItems(status: status).map { $0.toFlatMap() }
    }

    func clientTicketRequestItems(status: String? = nil) async throws -> [ClientTicketRequest] {
        var q: [String: String] = [:]
        if let status, !status.isEmpty { q["status"] = status }
        return ApiClient.decodeMapList(try await api.get("client-ticket-requests", query: q))
            .map { ClientTicketRequest(raw: $0) }
    }

    func patchClientTicketStatus(id: Int64, status: String) async throws -> [String: Any] {
        struct Body: Encodable { let status: String }
        return ConsoleHelpers.decodeMap(try await api.patchJSON("client-ticket-requests/\(id)/status", body: Body(status: status)))
    }

    func approveRequisition(id: Int64) async throws -> [String: Any] {
        struct Empty: Encodable {}
        return ConsoleHelpers.decodeMap(try await api.patchJSON("procurement/requisitions/\(id)/approve", body: Empty()))
    }

    func rejectRequisition(id: Int64, reason: String) async throws -> [String: Any] {
        struct Body: Encodable { let reason: String }
        return ConsoleHelpers.decodeMap(try await api.patchJSON("procurement/requisitions/\(id)/reject", body: Body(reason: reason)))
    }

    func startWorkOrder(id: Int64) async throws -> [String: Any] {
        struct Empty: Encodable {}
        return ConsoleHelpers.decodeMap(try await api.patchJSON("maintenance/work-orders/\(id)/start", body: Empty()))
    }

    func completeWorkOrder(id: Int64, notes: String? = nil) async throws -> [String: Any] {
        struct Body: Encodable { let notes: String? }
        return ConsoleHelpers.decodeMap(try await api.patchJSON("maintenance/work-orders/\(id)/complete", body: Body(notes: notes)))
    }
}
