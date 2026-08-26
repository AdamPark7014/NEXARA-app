import Foundation

/// Capa de datos Console (ERP/OPS) — paridad con Android `ConsoleRepository`.
final class ConsoleRepository {
    static let shared = ConsoleRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Attendance

    func attendanceCurrent() async throws -> [String: Any]? {
        try await attendanceCurrentItem()?.raw
    }

    func attendanceCurrentItem() async throws -> AttendanceCurrent? {
        let data = try await api.get("attendance/current")
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : AttendanceCurrent(raw: map)
    }

    func attendanceRange(from: String, to: String, hierarchy: Bool = true) async throws -> [String: Any] {
        try await attendanceRangeItem(from: from, to: to, hierarchy: hierarchy).raw
    }

    func attendanceRangeItem(from: String, to: String, hierarchy: Bool = true) async throws -> AttendanceRange {
        let path = hierarchy ? "attendance/hierarchy/range" : "attendance/range"
        let data = try await api.get(path, query: ["from": from, "to": to])
        return AttendanceRange(raw: ConsoleHelpers.decodeMap(data))
    }

    func attendanceCheckIn(type: String, lat: Double? = nil, lng: Double? = nil) async throws -> [String: Any] {
        try await attendanceCheckInResult(type: type, lat: lat, lng: lng).raw
    }

    func attendanceCheckInResult(type: String, lat: Double? = nil, lng: Double? = nil) async throws -> AttendanceCheckInResult {
        struct Body: Encodable {
            let type: String
            let timestamp: String
            let latitude: Double?
            let longitude: Double?
        }
        let data = try await api.postJSON("attendance", body: Body(
            type: type, timestamp: ConsoleHelpers.isoNow(), latitude: lat, longitude: lng
        ))
        return AttendanceCheckInResult(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Activities

    func activities(scope: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let s = scope { q["scope"] = s }
        return ApiClient.decodeMapList(try await api.get("activities", query: q))
    }

    func activityItems(scope: String? = nil) async throws -> [ActivityItem] {
        try await activities(scope: scope).map { ActivityItem(raw: $0) }
    }

    func createActivity(body: [String: Any]) async throws -> Int64 {
        let data = try await api.postJSON("activities", body: body)
        let map = ConsoleHelpers.decodeMap(data)
        return Int64(ConsoleHelpers.mapInt(map, "id"))
    }

    func nextAnNumber() async throws -> String {
        let map = ConsoleHelpers.decodeMap(try await api.get("activities/next-an"))
        return ConsoleHelpers.mapStr(map, "next")
    }

    // MARK: Evidences

    func myEvidenceHistory() async throws -> [[String: Any]] {
        try await myEvidenceRows().map { $0.toFlatMap() }
    }

    func myEvidenceRows() async throws -> [EvidenceRow] {
        ApiClient.decodeMapList(try await api.get("activity-evidence/history"))
            .map { EvidenceRow(raw: $0) }
    }

    func evidenceReviewHistory() async throws -> [[String: Any]] {
        try await evidenceReviewRows().map { $0.toFlatMap() }
    }

    func evidenceReviewRows() async throws -> [EvidenceRow] {
        ApiClient.decodeMapList(try await api.get("activity-evidence/review-history"))
            .map { EvidenceRow(raw: $0) }
    }

    func evidenceDetail(activityId: Int64) async throws -> [String: Any] {
        try await evidenceDetailItem(activityId: activityId).toFlatMap()
    }

    func evidenceDetailItem(activityId: Int64) async throws -> EvidenceDetail {
        EvidenceDetail(raw: ConsoleHelpers.decodeMap(try await api.get("activity-evidence/\(activityId)")))
    }

    func activityTimelineEvents(activityId: Int64) async throws -> [[String: Any]] {
        let map = ConsoleHelpers.decodeMap(try await api.get("activities/\(activityId)/timeline"))
        return map["events"] as? [[String: Any]] ?? []
    }

    func activityMaterials(activityId: Int64) async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("activities/\(activityId)/materiales"))
    }

    func activityTeam(activityId: Int64) async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("activities/\(activityId)/team"))
    }

    func evidenceEntryPhoto(activityId: Int64, photoUrl: String, lat: Double = 0, lng: Double = 0) async throws -> [String: Any] {
        struct Body: Encodable { let photoUrl: String; let latitude: Double; let longitude: Double }
        let data = try await api.postJSON("activity-evidence/\(activityId)/entry-photo", body: Body(photoUrl: photoUrl, latitude: lat, longitude: lng))
        return ConsoleHelpers.decodeMap(data)
    }

    func evidencePhotos(activityId: Int64, photoUrls: [String]) async throws -> [String: Any] {
        struct Body: Encodable { let photoUrls: [String] }
        let data = try await api.postJSON("activity-evidence/\(activityId)/evidence-photos", body: Body(photoUrls: photoUrls))
        return ConsoleHelpers.decodeMap(data)
    }

    func evidenceServiceSheetPdf(activityId: Int64, pdfUrl: String) async throws -> [String: Any] {
        struct Body: Encodable { let pdfUrl: String }
        let data = try await api.postJSON("activity-evidence/\(activityId)/service-sheet-pdf", body: Body(pdfUrl: pdfUrl))
        return ConsoleHelpers.decodeMap(data)
    }

    func evidenceServiceSheetData(activityId: Int64) async throws -> [String: Any] {
        struct Body: Encodable { let source: String; let completedAt: String; let notes: String }
        let data = try await api.postJSON("activity-evidence/\(activityId)/service-sheet-data", body: Body(
            source: "mobile-native-ios", completedAt: ConsoleHelpers.isoNow(),
            notes: "Plantilla completada desde app nativa"
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    func evidenceExitPhoto(activityId: Int64, photoUrl: String, lat: Double = 0, lng: Double = 0) async throws -> [String: Any] {
        struct Body: Encodable { let photoUrl: String; let latitude: Double; let longitude: Double }
        let data = try await api.postJSON("activity-evidence/\(activityId)/exit-photo", body: Body(photoUrl: photoUrl, latitude: lat, longitude: lng))
        return ConsoleHelpers.decodeMap(data)
    }

    func approveEvidence(activityId: Int64, reviewerId: Int64, notes: String? = nil) async throws {
        struct Body: Encodable { let reviewerId: Int64; let notes: String? }
        _ = try await api.postJSON(
            "activity-evidence/\(activityId)/approve",
            body: Body(reviewerId: reviewerId, notes: notes)
        )
    }

    func rejectEvidence(
        activityId: Int64,
        reviewerId: Int64,
        notes: String,
        rejectedStep: String = "EVIDENCE_PHOTOS"
    ) async throws {
        struct Body: Encodable { let reviewerId: Int64; let notes: String; let rejectedStep: String }
        _ = try await api.postJSON(
            "activity-evidence/\(activityId)/reject",
            body: Body(reviewerId: reviewerId, notes: notes, rejectedStep: rejectedStep)
        )
    }

    func ticketReportPdf(activityId: Int64) async throws -> Data {
        try await api.get("activity-evidence/\(activityId)/report")
    }

    // MARK: Tools

    func myToolRequests() async throws -> [[String: Any]] {
        try await myToolRequestItems().map(\.raw)
    }

    func myToolRequestItems() async throws -> [ToolItem] {
        ApiClient.decodeMapList(try await api.get("tool-requests/my-requests")).map { ToolItem(raw: $0) }
    }

    func toolRequests(status: String? = nil) async throws -> [[String: Any]] {
        try await toolRequestItems(status: status).map(\.raw)
    }

    func toolRequestItems(status: String? = nil) async throws -> [ToolItem] {
        var q: [String: String] = [:]
        if let s = status { q["status"] = s }
        return ApiClient.decodeMapList(try await api.get("tool-requests", query: q)).map { ToolItem(raw: $0) }
    }

    func toolInventory(search: String? = nil) async throws -> [[String: Any]] {
        try await toolInventoryItems(search: search).map(\.raw)
    }

    func toolInventoryItems(search: String? = nil) async throws -> [ToolItem] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["q"] = s }
        return ApiClient.decodeMapList(try await api.get("tool-requests/inventory", query: q)).map { ToolItem(raw: $0) }
    }

    func myToolKit() async throws -> [[String: Any]] {
        try await myToolKitItems().map(\.raw)
    }

    func myToolKitItems() async throws -> [ToolItem] {
        ApiClient.decodeMapList(try await api.get("tool-requests/kits/my")).map { ToolItem(raw: $0) }
    }

    func toolKitsUsers() async throws -> [[String: Any]] {
        try await toolKitsUserItems().map(\.raw)
    }

    func toolKitsUserItems() async throws -> [ToolItem] {
        ApiClient.decodeMapList(try await api.get("tool-requests/kits/users")).map { ToolItem(raw: $0) }
    }

    func toolRenewalsPending() async throws -> [[String: Any]] {
        try await toolRenewalItems().map(\.raw)
    }

    func toolRenewalItems() async throws -> [ToolRenewal] {
        ApiClient.decodeMapList(try await api.get("tool-requests/renewals/pending")).map { ToolRenewal(raw: $0) }
    }

    func approveToolRenewal(id: Int64) async throws {
        struct Empty: Encodable {}
        _ = try await api.postJSON("tool-requests/renewals/\(id)/approve", body: Empty())
    }

    func rejectToolRenewal(id: Int64, reason: String) async throws {
        struct Body: Encodable { let reason: String }
        _ = try await api.postJSON("tool-requests/renewals/\(id)/reject", body: Body(reason: reason))
    }

    // MARK: Clients & projects

    func serviceClients() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("service-clients"))
    }

    func serviceClientReportPdf(clientId: Int64) async throws -> Data {
        try await api.get("service-clients/\(clientId)/report")
    }

    func createServiceClient(
        name: String,
        contactName: String?, contactEmail: String?, contactPhone: String?,
        address: String?, city: String?, state: String?, country: String?,
        accountCode: String?, portalEmail: String?, portalPassword: String?,
        isActive: Bool,
        logoData: Data?, logoFileName: String?
    ) async throws -> [String: Any] {
        var fields: [String: String] = ["name": name, "isActive": isActive ? "true" : "false"]
        if let v = contactName?.nilIfEmpty { fields["contactName"] = v }
        if let v = contactEmail?.nilIfEmpty { fields["contactEmail"] = v }
        if let v = contactPhone?.nilIfEmpty { fields["contactPhone"] = v }
        if let v = address?.nilIfEmpty { fields["address"] = v }
        if let v = city?.nilIfEmpty { fields["city"] = v }
        if let v = state?.nilIfEmpty { fields["state"] = v }
        if let v = country?.nilIfEmpty { fields["country"] = v }
        if let v = accountCode?.nilIfEmpty { fields["accountCode"] = v }
        if let v = portalEmail?.nilIfEmpty { fields["portalEmail"] = v }
        if let v = portalPassword?.nilIfEmpty { fields["portalPassword"] = v }
        let data = try await api.uploadMultipart(
            "service-clients",
            fields: fields,
            fileField: logoData != nil ? "logo" : nil,
            fileData: logoData,
            fileName: logoFileName ?? "logo.jpg"
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func updateServiceClient(
        id: Int64,
        name: String,
        contactName: String?, contactEmail: String?, contactPhone: String?,
        address: String?, city: String?, state: String?, country: String?,
        accountCode: String?, portalEmail: String?, portalPassword: String?,
        isActive: Bool,
        logoData: Data?, logoFileName: String?
    ) async throws -> [String: Any] {
        if let logoData {
            var fields: [String: String] = ["name": name, "isActive": isActive ? "true" : "false"]
            if let v = contactName?.nilIfEmpty { fields["contactName"] = v }
            if let v = contactEmail?.nilIfEmpty { fields["contactEmail"] = v }
            if let v = contactPhone?.nilIfEmpty { fields["contactPhone"] = v }
            if let v = address?.nilIfEmpty { fields["address"] = v }
            if let v = city?.nilIfEmpty { fields["city"] = v }
            if let v = state?.nilIfEmpty { fields["state"] = v }
            if let v = country?.nilIfEmpty { fields["country"] = v }
            if let v = accountCode?.nilIfEmpty { fields["accountCode"] = v }
            if let v = portalEmail?.nilIfEmpty { fields["portalEmail"] = v }
            if let v = portalPassword?.nilIfEmpty { fields["portalPassword"] = v }
            let data = try await api.uploadMultipart(
                "service-clients/\(id)",
                method: "PUT",
                fields: fields,
                fileField: "logo",
                fileData: logoData,
                fileName: logoFileName ?? "logo.jpg"
            )
            return ConsoleHelpers.decodeMap(data)
        }
        struct Body: Encodable {
            let name: String
            let contactName, contactEmail, contactPhone: String?
            let address, city, state, country: String?
            let accountCode, portalEmail, portalPassword: String?
            let isActive: Bool
        }
        let data = try await api.putJSON("service-clients/\(id)", body: Body(
            name: name,
            contactName: contactName?.nilIfEmpty,
            contactEmail: contactEmail?.nilIfEmpty,
            contactPhone: contactPhone?.nilIfEmpty,
            address: address?.nilIfEmpty,
            city: city?.nilIfEmpty,
            state: state?.nilIfEmpty,
            country: country?.nilIfEmpty,
            accountCode: accountCode?.nilIfEmpty,
            portalEmail: portalEmail?.nilIfEmpty,
            portalPassword: portalPassword?.nilIfEmpty,
            isActive: isActive
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    func operationalProjects() async throws -> [[String: Any]] {
        try await operationalProjectItems().map(\.raw)
    }

    func operationalProjectItems() async throws -> [OperationalProjectItem] {
        ApiClient.decodeMapList(try await api.get("operational-projects")).map { OperationalProjectItem(raw: $0) }
    }

    func patchProjectStatus(id: Int64, status: String) async throws -> [String: Any] {
        struct Body: Encodable { let status: String }
        let data = try await api.patchJSON("operational-projects/\(id)/status", body: Body(status: status))
        return ConsoleHelpers.decodeMap(data)
    }

    func users(preferAssignable: Bool = true) async throws -> [[String: Any]] {
        if preferAssignable {
            do {
                return ApiClient.decodeMapList(try await api.get("users/assignable"))
            } catch { /* fallback */ }
        }
        return ApiClient.decodeMapList(try await api.get("users"))
    }

    func vehicles() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("vehicles"))
    }

    func viatics() async throws -> [[String: Any]] {
        try await viaticItems().map(\.raw)
    }

    func viaticItems() async throws -> [ViaticItem] {
        ApiClient.decodeMapList(try await api.get("viatics")).map { ViaticItem(raw: $0) }
    }

    func createViatic(
        amount: Double,
        motivo: String,
        categoria: String?,
        ticketEvidenciaUrl: String,
        activityId: Int64? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let montoSolicitado: Double
            let motivo: String
            let categoria: String?
            let actividadId: Int64?
            let ticketEvidenciaUrl: String
        }
        let data = try await api.postJSON(
            "viatics",
            body: Body(
                montoSolicitado: amount,
                motivo: motivo,
                categoria: categoria,
                actividadId: activityId,
                ticketEvidenciaUrl: ticketEvidenciaUrl
            )
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func approveViatic(id: Int64, approve: Bool, note: String? = nil) async throws {
        struct Body: Encodable { let action: String; let note: String? }
        _ = try await api.patchJSON(
            "viatics/\(id)/approve",
            body: Body(action: approve ? "approve" : "reject", note: note)
        )
    }

    func gpsPost(lat: Double, lng: Double, speedKmh: Double? = nil) async throws {
        struct Body: Encodable {
            let latitud: Double
            let longitud: Double
            let velocidadKmh: Double?
            let ultimaActualizacion: String
        }
        _ = try await api.postJSON("gps", body: Body(
            latitud: lat, longitud: lng, velocidadKmh: speedKmh,
            ultimaActualizacion: ConsoleHelpers.isoNow()
        ))
    }

    // MARK: System settings (console.admin)

    func settingsList() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("settings"))
    }

    func settingsUpsert(key: String, value: String, category: String, label: String?) async throws -> [String: Any] {
        struct Body: Encodable {
            let key, value, category: String
            let label: String?
        }
        return ConsoleHelpers.decodeMap(try await api.putJSON("settings", body: Body(
            key: key, value: value, category: category, label: label
        )))
    }

    func settingsDelete(key: String) async throws {
        try await api.delete("settings/\(key)")
    }
}
