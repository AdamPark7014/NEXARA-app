import Foundation

/// Portal cliente/sucursal — paridad con Android `TicketsRepository`.
final class TicketsRepository {
    static let shared = TicketsRepository()
    private let api = ApiClient.shared
    private init() {}

    private var isBranchUser: Bool {
        SessionStore.shared.currentUser?.isBranchUser == true
    }

    // MARK: Profile

    func profile() async throws -> [String: Any]? {
        let path = isBranchUser ? "branch-portal/profile" : "client-portal/profile"
        let data = try await api.get(path)
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : map
    }

    func updateProfile(
        contactName: String?, contactEmail: String?, contactPhone: String?,
        address: String?, city: String?, state: String?, country: String?
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let contactName, contactEmail, contactPhone: String?
            let address, city, state, country: String?
        }
        let data = try await api.putJSON("client-portal/profile", body: Body(
            contactName: contactName, contactEmail: contactEmail, contactPhone: contactPhone,
            address: address, city: city, state: state, country: country
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    // MARK: Branches (client only)

    func branches() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("client-portal/branches"))
    }

    func createBranch(
        name: String, branchNumber: String, portalEmail: String, portalPassword: String,
        address: String?, city: String?, state: String?, country: String?,
        placeId: String?, latitud: Double?, longitud: Double?, isActive: Bool,
        logoData: Data?, logoFileName: String?
    ) async throws -> [String: Any] {
        var fields: [String: String] = [
            "name": name.trimmingCharacters(in: .whitespacesAndNewlines),
            "branchNumber": branchNumber.trimmingCharacters(in: .whitespacesAndNewlines),
            "portalEmail": portalEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            "portalPassword": portalPassword,
            "isActive": isActive ? "true" : "false",
        ]
        if let address, !address.isEmpty { fields["address"] = address }
        if let city, !city.isEmpty { fields["city"] = city }
        if let state, !state.isEmpty { fields["state"] = state }
        if let country, !country.isEmpty { fields["country"] = country }
        if let placeId, !placeId.isEmpty { fields["placeId"] = placeId }
        if let latitud { fields["latitud"] = String(latitud) }
        if let longitud { fields["longitud"] = String(longitud) }
        let data = try await api.uploadMultipart(
            "client-portal/branches",
            fields: fields,
            fileField: logoData != nil ? "logo" : nil,
            fileData: logoData,
            fileName: logoFileName ?? "logo.jpg"
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func updateBranch(
        id: Int64,
        name: String?, branchNumber: String?, portalEmail: String?, portalPassword: String?,
        address: String?, city: String?, state: String?, country: String?,
        placeId: String?, latitud: Double?, longitud: Double?, isActive: Bool?,
        logoData: Data?, logoFileName: String?
    ) async throws -> [String: Any] {
        var fields: [String: String] = [:]
        if let name, !name.isEmpty { fields["name"] = name }
        if let branchNumber, !branchNumber.isEmpty { fields["branchNumber"] = branchNumber }
        if let portalEmail, !portalEmail.isEmpty { fields["portalEmail"] = portalEmail.lowercased() }
        if let portalPassword, !portalPassword.isEmpty { fields["portalPassword"] = portalPassword }
        if let address, !address.isEmpty { fields["address"] = address }
        if let city, !city.isEmpty { fields["city"] = city }
        if let state, !state.isEmpty { fields["state"] = state }
        if let country, !country.isEmpty { fields["country"] = country }
        if let placeId, !placeId.isEmpty { fields["placeId"] = placeId }
        if let latitud { fields["latitud"] = String(latitud) }
        if let longitud { fields["longitud"] = String(longitud) }
        if let isActive { fields["isActive"] = isActive ? "true" : "false" }
        let data = try await api.uploadMultipart(
            "client-portal/branches/\(id)",
            method: "PUT",
            fields: fields,
            fileField: logoData != nil ? "logo" : nil,
            fileData: logoData,
            fileName: logoFileName ?? "logo.jpg"
        )
        return ConsoleHelpers.decodeMap(data)
    }

    // MARK: Requests

    func requests() async throws -> [[String: Any]] {
        let path = isBranchUser ? "branch-portal/requests" : "client-portal/requests"
        return ApiClient.decodeMapList(try await api.get(path))
    }

    func createRequest(
        description: String, urgency: String, requestType: String, branchId: Int64?,
        evidenceFiles: [(fileName: String, data: Data)] = []
    ) async throws -> [String: Any] {
        if isBranchUser {
            let fields: [String: String] = [
                "description": description.trimmingCharacters(in: .whitespacesAndNewlines),
                "urgency": urgency,
                "requestType": requestType,
            ]
            let files = evidenceFiles.map { (field: "files", data: $0.data, fileName: $0.fileName, mimeType: "image/jpeg") }
            let data = try await api.uploadMultipartFiles("branch-portal/requests", fields: fields, files: files)
            return ConsoleHelpers.decodeMap(data)
        }
        struct Body: Encodable {
            let description: String
            let urgency: String
            let requestType: String
            let branchId: Int64?
        }
        let data = try await api.postJSON("client-portal/requests", body: Body(
            description: description, urgency: urgency, requestType: requestType, branchId: branchId
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    func closeRequest(id: Int64) async throws {
        _ = try await api.putJSON("client-portal/requests/\(id)/close", body: EmptyClose())
    }

    private struct EmptyClose: Encodable {}

    // MARK: Tickets

    func tickets(branchId: Int64? = nil) async throws -> [[String: Any]] {
        let path = isBranchUser ? "branch-portal/tickets" : "client-portal/tickets"
        var q: [String: String] = [:]
        if let b = branchId { q["branchId"] = String(b) }
        return ApiClient.decodeMapList(try await api.get(path, query: q))
    }

    func ticket(id: Int64) async throws -> [String: Any]? {
        let path = isBranchUser ? "branch-portal/tickets/\(id)" : "client-portal/tickets/\(id)"
        let map = ConsoleHelpers.decodeMap(try await api.get(path))
        return map.isEmpty ? nil : map
    }

    func ticketReportPdf(id: Int64) async throws -> Data {
        let path = isBranchUser ? "branch-portal/tickets/\(id)/report" : "client-portal/tickets/\(id)/report"
        return try await api.get(path)
    }

    // MARK: Feedback

    func pendingFeedback() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("client-portal/feedback/pending"))
    }

    func submitFeedback(
        activityId: Int64, rating: Int?, wasOnTime: String?, wasFriendly: String?, wasSolved: String?, comments: String?
    ) async throws {
        struct Body: Encodable {
            let activityId: Int64
            let rating: Int?
            let wasOnTime, wasFriendly, wasSolved, comments: String?
        }
        _ = try await api.postJSON("client-portal/feedback", body: Body(
            activityId: activityId, rating: rating,
            wasOnTime: wasOnTime, wasFriendly: wasFriendly, wasSolved: wasSolved, comments: comments
        ))
    }

    /// Compatibilidad con llamadas simples (solo rating).
    func submitFeedback(activityId: Int64, rating: Int, comments: String?) async throws {
        try await submitFeedback(
            activityId: activityId, rating: rating,
            wasOnTime: "YES", wasFriendly: "YES", wasSolved: "YES", comments: comments
        )
    }

    // MARK: Inventories

    func inventories(search: String? = nil) async throws -> [[String: Any]] {
        let path = isBranchUser ? "branch-portal/inventories" : "client-portal/inventories"
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        return ApiClient.decodeMapList(try await api.get(path, query: q))
    }

    func inventoryDetail(id: Int64) async throws -> [String: Any] {
        let path = isBranchUser ? "branch-portal/inventories/\(id)" : "client-portal/inventories/\(id)"
        return ConsoleHelpers.decodeMap(try await api.get(path))
    }

    func inventoryReportPdf(id: Int64) async throws -> Data {
        let path = isBranchUser ? "branch-portal/inventories/\(id)/report" : "client-portal/inventories/\(id)/report"
        return try await api.get(path)
    }

    func syncInventory(
        branchId: Int64, snapshotId: Int64?, title: String?, notes: String?,
        completed: Bool, confirmDifference: Bool
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let branchId: Int64
            let snapshotId: Int64?
            let title, notes: String?
            let completed, confirmDifference: Bool
        }
        let path = "client-portal/inventories/sync"
        let data = try await api.postJSON(path, body: Body(
            branchId: branchId, snapshotId: snapshotId, title: title, notes: notes,
            completed: completed, confirmDifference: confirmDifference
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    func decideInventory(id: Int64, decision: String) async throws -> [String: Any] {
        struct Body: Encodable { let decision: String }
        let data = try await api.putJSON("client-portal/inventories/\(id)/decision", body: Body(decision: decision))
        return ConsoleHelpers.decodeMap(data)
    }

    func portalReportPdf(start: String? = nil, end: String? = nil) async throws -> Data {
        var q: [String: String] = [:]
        if let start, !start.isEmpty { q["start"] = start }
        if let end, !end.isEmpty { q["end"] = end }
        let path = isBranchUser ? "branch-portal/report" : "client-portal/report"
        return try await api.get(path, query: q)
    }
}
