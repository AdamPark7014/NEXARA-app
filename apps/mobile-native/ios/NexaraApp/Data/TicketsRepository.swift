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
        try await portalProfile()?.raw
    }

    func portalProfile() async throws -> PortalClientProfile? {
        // Las dos rutas se escriben enteras en cada rama en vez de armarse en una
        // variable. No es estilo: `scripts/parity-report.py` sólo ve rutas
        // literales, y con el ternario daba por ausentes en iOS veinte endpoints
        // que la app sí llamaba. Una matriz de paridad que miente ya costó cara.
        //
        // Se usa `if/else` y no un ternario porque Swift no admite `try` a la
        // derecha de un operador no-asignación.
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/profile")
        } else {
            data = try await api.get("client-portal/profile")
        }
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : PortalClientProfile(raw: map)
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
        try await portalBranches().map(\.raw)
    }

    func portalBranches() async throws -> [PortalBranch] {
        ApiClient.decodeMapList(try await api.get("client-portal/branches")).map { PortalBranch(raw: $0) }
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
        try await portalRequests().map { $0.toFlatMap() }
    }

    func portalRequests() async throws -> [ClientTicketRequest] {
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/requests")
        } else {
            data = try await api.get("client-portal/requests")
        }
        return ApiClient.decodeMapList(data).map { ClientTicketRequest(raw: $0) }
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

    /// PUT `client-portal/requests/{id}/decision` — APPROVED | REJECTED (paridad Android).
    func decideRequest(id: Int64, decision: String) async throws {
        struct Body: Encodable { let decision: String }
        _ = try await api.putJSON("client-portal/requests/\(id)/decision", body: Body(decision: decision))
    }

    private struct EmptyClose: Encodable {}

    // MARK: Tickets

    func tickets(branchId: Int64? = nil) async throws -> [[String: Any]] {
        try await portalTickets(branchId: branchId).map { $0.toFlatMap() }
    }

    func portalTickets(branchId: Int64? = nil) async throws -> [PortalTicket] {
        var q: [String: String] = [:]
        if let b = branchId { q["branchId"] = String(b) }
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/tickets", query: q)
        } else {
            data = try await api.get("client-portal/tickets", query: q)
        }
        return ApiClient.decodeMapList(data).map { PortalTicket(raw: $0) }
    }

    func ticket(id: Int64) async throws -> [String: Any]? {
        try await portalTicket(id: id)?.toFlatMap()
    }

    func portalTicket(id: Int64) async throws -> PortalTicket? {
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/tickets/\(id)")
        } else {
            data = try await api.get("client-portal/tickets/\(id)")
        }
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : PortalTicket(raw: map)
    }

    func ticketReportPdf(id: Int64) async throws -> Data {
        if isBranchUser {
            return try await api.get("branch-portal/tickets/\(id)/report")
        }
        return try await api.get("client-portal/tickets/\(id)/report")
    }

    /// POST `…/tickets/{id}/comments` — body `{ body }`.
    func postTicketComment(id: Int64, body: String) async throws {
        struct Body: Encodable { let body: String }
        let payload = Body(body: body.trimmingCharacters(in: .whitespacesAndNewlines))
        if isBranchUser {
            _ = try await api.postJSON("branch-portal/tickets/\(id)/comments", body: payload)
        } else {
            _ = try await api.postJSON("client-portal/tickets/\(id)/comments", body: payload)
        }
    }

    /// PATCH `…/tickets/{id}/status` — action ACK | CONFIRM_RESOLVED | REQUEST_REOPEN.
    func patchTicketStatus(id: Int64, action: String, note: String? = nil) async throws {
        struct Body: Encodable {
            let action: String
            let note: String?
        }
        let payload = Body(action: action, note: note)
        if isBranchUser {
            _ = try await api.patchJSON("branch-portal/tickets/\(id)/status", body: payload)
        } else {
            _ = try await api.patchJSON("client-portal/tickets/\(id)/status", body: payload)
        }
    }

    // MARK: Feedback

    func pendingFeedback() async throws -> [[String: Any]] {
        try await pendingFeedbackItems().map { $0.toFlatMap() }
    }

    func pendingFeedbackItems() async throws -> [PendingFeedbackItem] {
        ApiClient.decodeMapList(try await api.get("client-portal/feedback/pending"))
            .map { PendingFeedbackItem(raw: $0) }
    }

    func submitFeedback(
        activityId: Int64, rating: Int?, wasOnTime: String?, wasFriendly: String?, wasSolved: String?, comments: String?
    ) async throws {
        struct Body: Encodable {
            let activityId: Int64
            let rating: Int?
            let wasOnTime: Bool?
            let wasFriendly: Bool?
            let wasSolved: Bool?
            let comments: String?
        }
        _ = try await api.postJSON("client-portal/feedback", body: Body(
            activityId: activityId, rating: rating,
            wasOnTime: Self.feedbackYesNo(wasOnTime),
            wasFriendly: Self.feedbackYesNo(wasFriendly),
            wasSolved: Self.feedbackYesNo(wasSolved),
            comments: comments?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? comments?.trimmingCharacters(in: .whitespacesAndNewlines)
                : nil
        ))
    }

    /// Compatibilidad con llamadas simples (solo rating).
    func submitFeedback(activityId: Int64, rating: Int, comments: String?) async throws {
        try await submitFeedback(
            activityId: activityId, rating: rating,
            wasOnTime: "YES", wasFriendly: "YES", wasSolved: "YES", comments: comments
        )
    }

    private static func feedbackYesNo(_ raw: String?) -> Bool? {
        switch raw?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "YES", "SI", "TRUE": return true
        case "NO", "FALSE": return false
        default: return nil
        }
    }

    // MARK: Inventories

    func inventories(search: String? = nil) async throws -> [[String: Any]] {
        try await portalInventories(search: search).map { $0.toFlatMap() }
    }

    func portalInventories(search: String? = nil) async throws -> [PortalInventorySnapshot] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/inventories", query: q)
        } else {
            data = try await api.get("client-portal/inventories", query: q)
        }
        return ApiClient.decodeMapList(data).map { PortalInventorySnapshot(raw: $0) }
    }

    func inventoryDetail(id: Int64) async throws -> [String: Any] {
        try await portalInventoryDetail(id: id).toFlatMap()
    }

    func portalInventoryDetail(id: Int64) async throws -> PortalInventorySnapshot {
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/inventories/\(id)")
        } else {
            data = try await api.get("client-portal/inventories/\(id)")
        }
        return PortalInventorySnapshot(raw: ConsoleHelpers.decodeMap(data))
    }

    func inventoryReportPdf(id: Int64) async throws -> Data {
        if isBranchUser {
            return try await api.get("branch-portal/inventories/\(id)/report")
        }
        return try await api.get("client-portal/inventories/\(id)/report")
    }

    func syncInventory(
        branchId: Int64, snapshotId: Int64?, title: String?, notes: String?,
        completed: Bool, confirmDifference: Bool,
        items: [PortalInventoryItem]? = nil
    ) async throws -> [String: Any] {
        struct SyncItem: Encodable {
            let id: Int64?
            let groupName, itemName, brand: String?
            let modelBefore, modelAfter, serialNumber: String?
            let itemStatus, compareState, notes: String?
        }
        struct Body: Encodable {
            let branchId: Int64
            let snapshotId: Int64?
            let title, notes: String?
            let completed, confirmDifference: Bool
            let items: [SyncItem]?
        }
        let syncItems: [SyncItem]? = items.map { list in
            list.map { it in
                SyncItem(
                    id: it.id > 0 ? it.id : nil,
                    groupName: it.groupName.isEmpty ? nil : it.groupName,
                    itemName: it.itemName.isEmpty ? nil : it.itemName,
                    brand: it.brand.isEmpty ? nil : it.brand,
                    modelBefore: it.modelBefore.isEmpty ? nil : it.modelBefore,
                    modelAfter: it.modelAfter.isEmpty ? nil : it.modelAfter,
                    serialNumber: it.serialNumber.isEmpty ? nil : it.serialNumber,
                    itemStatus: it.itemStatus.isEmpty ? nil : it.itemStatus,
                    compareState: it.compareState.isEmpty ? nil : it.compareState,
                    notes: it.notes.isEmpty ? nil : it.notes
                )
            }
        }
        let data = try await api.postJSON("client-portal/inventories/sync", body: Body(
            branchId: branchId, snapshotId: snapshotId, title: title, notes: notes,
            completed: completed, confirmDifference: confirmDifference, items: syncItems
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    func decideInventory(id: Int64, decision: String) async throws -> [String: Any] {
        struct Body: Encodable { let decision: String }
        let data = try await api.putJSON("client-portal/inventories/\(id)/decision", body: Body(decision: decision))
        return ConsoleHelpers.decodeMap(data)
    }

    /// POST `client-portal/inventories/upload` — multipart field `files`.
    func uploadInventoryMedia(files: [(fileName: String, data: Data)]) async throws -> [String] {
        let parts = files.map { (field: "files", data: $0.data, fileName: $0.fileName, mimeType: "image/jpeg") }
        let data = try await api.uploadMultipartFiles("client-portal/inventories/upload", fields: [:], files: parts)
        let map = ConsoleHelpers.decodeMap(data)
        if let urls = map["urls"] as? [String] { return urls }
        if let urls = map["urls"] as? [Any] {
            return urls.compactMap { $0 as? String }
        }
        return []
    }

    func portalReportPdf(start: String? = nil, end: String? = nil) async throws -> Data {
        var q: [String: String] = [:]
        if let start, !start.isEmpty { q["start"] = start }
        if let end, !end.isEmpty { q["end"] = end }
        if isBranchUser {
            return try await api.get("branch-portal/report", query: q)
        }
        return try await api.get("client-portal/report", query: q)
    }

    // MARK: Mis servicios (portal cliente)

    func servicesSummary() async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await api.get("client-portal/services-summary"))
    }

    func portalInvoices() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("client-portal/invoices"))
    }

    func portalQuotes() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("client-portal/quotes"))
    }

    func downloadInvoicePdf(id: Int64) async throws -> Data {
        try await api.getBinary("client-portal/invoices/\(id)/pdf")
    }

    func downloadInvoiceXml(id: Int64) async throws -> Data {
        try await api.getBinary("client-portal/invoices/\(id)/xml")
    }

    func downloadQuotePdf(id: Int64) async throws -> Data {
        try await api.getBinary("client-portal/quotes/\(id)/pdf")
    }
}
