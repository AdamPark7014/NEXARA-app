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
        let branch = isBranchUser
        if branch {
            data = try await api.get("branch-portal/profile")
        } else {
            data = try await api.get("client-portal/profile")
        }
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : PortalClientProfile(raw: map, isBranch: branch)
    }

    /// PUT `client-portal/profile`. Como Android: cada campo va recortado y uno
    /// vacío no se manda (el servidor conserva el valor anterior).
    func updateProfile(
        contactName: String?, contactEmail: String?, contactPhone: String?,
        address: String?, city: String?, state: String?, country: String?
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let contactName, contactEmail, contactPhone: String?
            let address, city, state, country: String?
        }
        let data = try await api.putJSON("client-portal/profile", body: Body(
            contactName: Self.clean(contactName), contactEmail: Self.clean(contactEmail),
            contactPhone: Self.clean(contactPhone), address: Self.clean(address),
            city: Self.clean(city), state: Self.clean(state), country: Self.clean(country)
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    /// Texto recortado; vacío = `nil` (Android `trim().takeIf { !it.isNullOrBlank() }`).
    private static func clean(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
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
        logoData: Data?, logoFileName: String?, logoMimeType: String = "image/jpeg"
    ) async throws -> [String: Any] {
        var fields: [String: String] = [
            "name": name.trimmingCharacters(in: .whitespacesAndNewlines),
            "branchNumber": branchNumber.trimmingCharacters(in: .whitespacesAndNewlines),
            "portalEmail": portalEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            "portalPassword": portalPassword,
            "isActive": isActive ? "true" : "false",
        ]
        if let address = Self.clean(address) { fields["address"] = address }
        if let city = Self.clean(city) { fields["city"] = city }
        if let state = Self.clean(state) { fields["state"] = state }
        if let country = Self.clean(country) { fields["country"] = country }
        if let placeId = Self.clean(placeId) { fields["placeId"] = placeId }
        if let latitud { fields["latitud"] = String(latitud) }
        if let longitud { fields["longitud"] = String(longitud) }
        let data = try await api.uploadMultipart(
            "client-portal/branches",
            fields: fields,
            fileField: logoData != nil ? "logo" : nil,
            fileData: logoData,
            fileName: logoFileName ?? "logo.jpg",
            mimeType: logoMimeType
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func updateBranch(
        id: Int64,
        name: String?, branchNumber: String?, portalEmail: String?, portalPassword: String?,
        address: String?, city: String?, state: String?, country: String?,
        placeId: String?, latitud: Double?, longitud: Double?, isActive: Bool?,
        logoData: Data?, logoFileName: String?, logoMimeType: String = "image/jpeg"
    ) async throws -> [String: Any] {
        var fields: [String: String] = [:]
        if let name = Self.clean(name) { fields["name"] = name }
        if let branchNumber = Self.clean(branchNumber) { fields["branchNumber"] = branchNumber }
        if let portalEmail = Self.clean(portalEmail) { fields["portalEmail"] = portalEmail.lowercased() }
        if let portalPassword, !portalPassword.isEmpty { fields["portalPassword"] = portalPassword }
        if let address = Self.clean(address) { fields["address"] = address }
        if let city = Self.clean(city) { fields["city"] = city }
        if let state = Self.clean(state) { fields["state"] = state }
        if let country = Self.clean(country) { fields["country"] = country }
        if let placeId = Self.clean(placeId) { fields["placeId"] = placeId }
        if let latitud { fields["latitud"] = String(latitud) }
        if let longitud { fields["longitud"] = String(longitud) }
        if let isActive { fields["isActive"] = isActive ? "true" : "false" }
        let data = try await api.uploadMultipart(
            "client-portal/branches/\(id)",
            method: "PUT",
            fields: fields,
            fileField: logoData != nil ? "logo" : nil,
            fileData: logoData,
            fileName: logoFileName ?? "logo.jpg",
            mimeType: logoMimeType
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
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            urgency: urgency, requestType: requestType, branchId: branchId
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    /// Cerrar y autorizar/rechazar solo existen en `client-portal`: el API no las
    /// tiene en `branch-portal` y a una sucursal le respondería 403
    /// (`ClientPortalGuard`). La pantalla no las ofrece a sucursales.
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

    /// Tickets del portal (Android `TicketsRepository.tickets`). `start`/`end` en
    /// ISO-8601 filtran por `fechaAsignacion`. La sucursal solo admite el rango
    /// (`branch-portal/tickets` ignora sucursal y proyecto).
    func portalTickets(
        start: String? = nil,
        end: String? = nil,
        projectId: Int64? = nil,
        branchId: Int64? = nil
    ) async throws -> [PortalTicket] {
        var q: [String: String] = [:]
        if let start, !start.isEmpty { q["start"] = start }
        if let end, !end.isEmpty { q["end"] = end }
        let data: Data
        if isBranchUser {
            data = try await api.get("branch-portal/tickets", query: q)
        } else {
            if let b = branchId { q["branchId"] = String(b) }
            if let p = projectId { q["projectId"] = String(p) }
            data = try await api.get("client-portal/tickets", query: q)
        }
        return ApiClient.decodeMapList(data).map { PortalTicket(raw: $0) }
    }

    /// Proyectos activos del cliente para el filtro de tickets (Android `projects()`).
    /// A una sucursal no se le piden: `branch-portal/tickets` no filtra por
    /// proyecto y Android, que sí los pedía a `client-portal`, recibía 403 y
    /// escondía el selector; aquí se llega a lo mismo sin la llamada fallida.
    func portalProjects() async throws -> [PortalProject] {
        if isBranchUser { return [] }
        return ApiClient.decodeMapList(try await api.get("client-portal/projects"))
            .map { PortalProject(raw: $0) }
            .filter { $0.id > 0 }
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
            return try await api.getBinary("branch-portal/tickets/\(id)/report")
        }
        return try await api.getBinary("client-portal/tickets/\(id)/report")
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
            return try await api.getBinary("branch-portal/inventories/\(id)/report")
        }
        return try await api.getBinary("client-portal/inventories/\(id)/report")
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
        let body = Body(
            branchId: branchId, snapshotId: snapshotId,
            title: Self.clean(title), notes: Self.clean(notes),
            completed: completed, confirmDifference: confirmDifference, items: syncItems
        )
        // La sucursal sincroniza por su propio portal, como la web
        // (`TicketsInventoryManager`): `client-portal` le responde 403. Android
        // usaba siempre `client-portal` y a una sucursal le fallaba el botón.
        let data: Data
        if isBranchUser {
            data = try await api.postJSON("branch-portal/inventories/sync", body: body)
        } else {
            data = try await api.postJSON("client-portal/inventories/sync", body: body)
        }
        return ConsoleHelpers.decodeMap(data)
    }

    /// PUT `client-portal/inventories/{id}/decision` con `APPROVED` | `REJECTED`
    /// (el API rechaza cualquier otro valor con 400). Solo para cuentas cliente.
    func decideInventory(id: Int64, decision: String) async throws -> [String: Any] {
        struct Body: Encodable { let decision: String }
        let data = try await api.putJSON("client-portal/inventories/\(id)/decision", body: Body(decision: decision))
        return ConsoleHelpers.decodeMap(data)
    }

    /// POST `…/inventories/upload` — multipart field `files`. La sucursal sube
    /// por `branch-portal` (como la web); `client-portal` le respondería 403.
    func uploadInventoryMedia(
        files: [(fileName: String, data: Data)],
        mimeType: String = "image/jpeg"
    ) async throws -> [String] {
        let parts = files.map { (field: "files", data: $0.data, fileName: $0.fileName, mimeType: mimeType) }
        let data: Data
        if isBranchUser {
            data = try await api.uploadMultipartFiles("branch-portal/inventories/upload", fields: [:], files: parts)
        } else {
            data = try await api.uploadMultipartFiles("client-portal/inventories/upload", fields: [:], files: parts)
        }
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
            return try await api.getBinary("branch-portal/report", query: q)
        }
        return try await api.getBinary("client-portal/report", query: q)
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
