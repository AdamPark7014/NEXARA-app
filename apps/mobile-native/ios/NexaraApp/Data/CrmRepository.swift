import Foundation

/// CRM / Ventas — endpoints web `/crm/*` vía API `ventas/*` y `catalog/*`.
final class CrmRepository {
    static let shared = CrmRepository()
    private let api = ApiClient.shared
    private init() {}

    func cotizaciones() async throws -> [[String: Any]] {
        try await cotizacionItems().map(\.raw)
    }

    func cotizacionItems() async throws -> [Cotizacion] {
        if let data = try? await api.get("ventas/cotizaciones") {
            let list = ApiClient.decodeMapList(data).map { Cotizacion(raw: $0) }
            if !list.isEmpty { return list }
        }
        return ApiClient.decodeMapList(try await api.get("cotizaciones")).map { Cotizacion(raw: $0) }
    }

    func oportunidades() async throws -> [[String: Any]] {
        try await opportunityItems().map(\.raw)
    }

    func opportunityItems() async throws -> [CrmOpportunity] {
        ApiClient.decodeMapList(try await api.get("ventas/oportunidades")).map { CrmOpportunity(raw: $0) }
    }

    func clientes() async throws -> [[String: Any]] {
        try await clientItems().map(\.raw)
    }

    func clientItems() async throws -> [CrmClient] {
        ApiClient.decodeMapList(try await api.get("ventas/clientes")).map { CrmClient(raw: $0) }
    }

    func leads() async throws -> [[String: Any]] {
        try await leadItems().map(\.raw)
    }

    func leadItems() async throws -> [CrmLead] {
        ApiClient.decodeMapList(try await api.get("ventas/leads")).map { CrmLead(raw: $0) }
    }

    func proyectos() async throws -> [[String: Any]] {
        try await projectItems().map(\.raw)
    }

    func projectItems() async throws -> [CrmSalesProject] {
        ApiClient.decodeMapList(try await api.get("ventas/proyectos")).map { CrmSalesProject(raw: $0) }
    }

    func productos(search: String? = nil) async throws -> [CrmProduct] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        return ApiClient.decodeMapList(try await api.get("catalog/products", query: q)).map { CrmProduct(raw: $0) }
    }

    func products(search: String? = nil) async throws -> [[String: Any]] {
        try await productos(search: search).map(\.raw)
    }

    func salesDashboardRaw() async throws -> Data {
        try await api.get("ventas/reportes/cockpit")
    }

    func calendarEvents() async throws -> [[String: Any]] {
        try await calendarEventItems().map(\.raw)
    }

    func calendarEventItems() async throws -> [CalendarEvent] {
        ApiClient.decodeMapList(try await api.get("calendar/events")).map { CalendarEvent(raw: $0) }
    }

    func tenders() async throws -> [[String: Any]] {
        try await tenderItems().map(\.raw)
    }

    func tenderItems() async throws -> [Tender] {
        ApiClient.decodeMapList(try await api.get("tenders")).map { Tender(raw: $0) }
    }

    func salesTargets() async throws -> [[String: Any]] {
        try await salesTargetItems().map(\.raw)
    }

    func salesTargetItems() async throws -> [SalesTarget] {
        ApiClient.decodeMapList(try await api.get("sales-targets")).map { SalesTarget(raw: $0) }
    }

    func salesTeam(period: String = "month") async throws -> [[String: Any]] {
        try await salesTeamMemberItems(period: period).map(\.raw)
    }

    func salesTeamMemberItems(period: String = "month") async throws -> [SalesTeamMember] {
        ApiClient.decodeMapList(try await api.get("ventas/reportes/vendedores", query: ["period": period]))
            .map { SalesTeamMember(raw: $0) }
    }

    func salesMetrics(period: String = "month") async -> [String: Any] {
        await salesMetricsItem(period: period).raw
    }

    func salesMetricsItem(period: String = "month") async -> SalesMetrics {
        guard let data = try? await api.get("ventas/reportes/metricas", query: ["period": period]),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return SalesMetrics()
        }
        return SalesMetrics(raw: obj)
    }

    func vendorStats(period: String = "month") async -> [[String: Any]] {
        await vendorReportItems(period: period).map(\.raw)
    }

    func vendorReportItems(period: String = "month") async -> [VendorReportItem] {
        guard let data = try? await api.get("ventas/reportes/vendedores", query: ["period": period]) else { return [] }
        return ApiClient.decodeMapList(data).map { VendorReportItem(raw: $0) }
    }

    func orderTemplates() async throws -> [[String: Any]] {
        try await orderTemplateItems().map(\.raw)
    }

    func orderTemplateItems() async throws -> [OrderTemplate] {
        ApiClient.decodeMapList(try await api.get("ventas/order-templates")).map(OrderTemplate.init)
    }

    func createOrderTemplate(_ fields: [String: String]) async throws {
        _ = try await api.postJSON("ventas/order-templates", body: fields)
    }

    func setOrderTemplateDefault(id: Int) async throws {
        _ = try await api.postJSON("ventas/order-templates/\(id)/set-default", body: EmptyBody())
    }

    func deleteOrderTemplate(id: Int) async throws {
        try await api.delete("ventas/order-templates/\(id)")
    }

    func getOpportunity(id: Int) async throws -> [String: Any] {
        try await opportunityDetail(id: id).raw
    }

    func opportunityDetail(id: Int) async throws -> CrmOpportunityDetail {
        let data = try await api.get("ventas/oportunidades/\(id)")
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return CrmOpportunityDetail()
        }
        return CrmOpportunityDetail(raw: obj)
    }

    func addOpportunityNote(id: Int, message: String) async throws {
        _ = try await api.postJSON("ventas/oportunidades/\(id)/notas", body: ["message": message])
    }

    func uploadOpportunityEvidences(id: Int, fileData: Data, fileName: String, mimeType: String) async throws {
        _ = try await api.uploadMultipart(
            "ventas/oportunidades/\(id)/evidencias",
            fields: [:],
            fileField: "files",
            fileData: fileData,
            fileName: fileName,
            mimeType: mimeType
        )
    }

    func createOpportunity(_ fields: [String: String]) async throws -> [String: Any] {
        let data = try await api.postJSON("ventas/oportunidades", body: fields)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    func updateOpportunity(id: Int, fields: [String: String]) async throws -> [String: Any] {
        let data = try await api.patchJSON("ventas/oportunidades/\(id)", body: fields)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    func deleteOpportunity(id: Int) async throws {
        try await api.delete("ventas/oportunidades/\(id)")
    }

    func downloadAssetBytes(_ relativeOrAbsoluteUrl: String) async throws -> Data {
        let url = ApiUrls.absoluteAsset(relativeOrAbsoluteUrl)
        var req = URLRequest(url: url)
        if let token = SessionStore.shared.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ApiError.http((resp as? HTTPURLResponse)?.statusCode ?? 0, nil)
        }
        return data
    }
}

private struct EmptyBody: Encodable {}
