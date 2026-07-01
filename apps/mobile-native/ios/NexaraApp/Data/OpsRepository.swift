import Foundation

/// Operaciones ERP/OPS — tickets de clientes, compras, etc.
final class OpsRepository {
    static let shared = OpsRepository()
    private let api = ApiClient.shared
    private init() {}

    func clientTicketRequests(status: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let status, !status.isEmpty { q["status"] = status }
        return ApiClient.decodeMapList(try await api.get("client-ticket-requests", query: q))
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
}
