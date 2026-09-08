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

    func cotizacionDetail(id: Int) async throws -> [String: Any] {
        let data = try await api.get("ventas/cotizaciones/\(id)")
        return ConsoleHelpers.decodeMap(data)
    }

    func downloadCotizacionPdf(id: Int, internal: Bool = false) async throws -> Data {
        let path = internal ? "cotizaciones/\(id)/pdf/internal" : "cotizaciones/\(id)/pdf"
        return try await api.getBinary(path)
    }

    func sendCotizacion(id: Int, email: String, message: String? = nil) async throws {
        let body = SendCotizacionBody(email: email, message: message?.isEmpty == true ? nil : message)
        _ = try await api.postJSON("cotizaciones/\(id)/send", body: body)
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

    func clientDetail(id: Int64) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await api.get("ventas/clientes/\(id)"))
    }

    func clientSnapshot(id: Int64) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await api.get("ventas/clientes/\(id)/snapshot"))
    }

    func updateClient(id: Int64, fields: [String: String]) async throws -> [String: Any] {
        let data = try await api.patchJSON("ventas/clientes/\(id)", body: fields)
        return ConsoleHelpers.decodeMap(data)
    }

    func provisionServiceClient(id: Int64) async throws -> [String: Any] {
        let data = try await api.postJSON("ventas/clientes/\(id)/provision-service-client", body: EmptyBody())
        let result = ConsoleHelpers.decodeMap(data)
        if let salesClient = result["salesClient"] as? [String: Any] {
            return salesClient
        }
        return try await clientDetail(id: id)
    }

    func leads() async throws -> [[String: Any]] {
        try await leadItems().map(\.raw)
    }

    func leadItems() async throws -> [CrmLead] {
        ApiClient.decodeMapList(try await api.get("ventas/leads")).map { CrmLead(raw: $0) }
    }

    func getLead(id: Int64) async throws -> CrmLead {
        let data = try await api.get("ventas/leads/\(id)")
        return CrmLead(raw: ConsoleHelpers.decodeMap(data))
    }

    func createLead(_ fields: [String: Any]) async throws -> CrmLead {
        let data = try await IntegraHTTP.postMap("ventas/leads", body: fields)
        return CrmLead(raw: ConsoleHelpers.decodeMap(data))
    }

    func updateLead(id: Int64, fields: [String: Any]) async throws -> CrmLead {
        let data = try await IntegraHTTP.patchMap("ventas/leads/\(id)", body: fields)
        return CrmLead(raw: ConsoleHelpers.decodeMap(data))
    }

    func deleteLead(id: Int64) async throws {
        try await api.delete("ventas/leads/\(id)")
    }

    func createClient(_ fields: [String: Any]) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await IntegraHTTP.postMap("ventas/clientes", body: fields))
    }

    /// Convierte lead → cliente + oportunidad (misma secuencia que Android `convertLeadToOpportunity`).
    func convertLeadToOpportunity(
        lead: CrmLead,
        value: Double,
        stage: String = "DISCOVERY"
    ) async throws -> [String: Any] {
        guard let leadId = lead.numericId else {
            throw ApiError.http(400, "Lead sin ID")
        }
        let clientLabel = lead.clientName.isEmpty ? lead.displayTitle : lead.clientName
        let email = StockParse.str(lead.raw["email"], lead.raw["correo"])
        let phone = StockParse.str(lead.raw["phone"], lead.raw["telefono"])
        var clientFields: [String: Any] = [
            "legalName": clientLabel,
            "notes": "Cliente desde lead #\(leadId)",
        ]
        if !email.isEmpty { clientFields["billingEmail"] = email }
        if !phone.isEmpty { clientFields["billingPhone"] = phone }
        let client = try await createClient(clientFields)
        let clientId = StockParse.int64(client["id"])
        var leadPatch: [String: Any] = ["status": "CONVERTED"]
        if let clientId { leadPatch["clientId"] = clientId }
        _ = try await updateLead(id: leadId, fields: leadPatch)
        var oppFields: [String: Any] = [
            "title": clientLabel,
            "value": value,
            "stage": stage,
            "probability": 30,
            "leadId": leadId,
            "clientName": clientLabel,
        ]
        if let clientId { oppFields["clientId"] = clientId }
        return ConsoleHelpers.decodeMap(try await IntegraHTTP.postMap("ventas/oportunidades", body: oppFields))
    }

    func proyectos() async throws -> [[String: Any]] {
        try await projectItems().map(\.raw)
    }

    func projectItems() async throws -> [CrmSalesProject] {
        ApiClient.decodeMapList(try await api.get("ventas/proyectos")).map { CrmSalesProject(raw: $0) }
    }

    func getProjectSummary(id: Int64) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await api.get("ventas/proyectos/\(id)/resumen"))
    }

    func updateProject(id: Int64, fields: [String: Any]) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await IntegraHTTP.patchMap("ventas/proyectos/\(id)", body: fields))
    }

    func updateProjectStatus(id: Int64, status: String) async throws -> [String: Any] {
        try await updateProject(id: id, fields: ["status": status])
    }

    func projectCosts(id: Int64) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(try await api.get("ventas/proyectos/\(id)/costos"))
    }

    func updateProjectCosts(
        id: Int64,
        costProducts: Double? = nil,
        costViaticos: Double? = nil,
        costOperativo: Double? = nil
    ) async throws -> [String: Any] {
        var payload: [String: Any] = [:]
        if let costProducts { payload["costProducts"] = costProducts }
        if let costViaticos { payload["costViaticos"] = costViaticos }
        if let costOperativo { payload["costOperativo"] = costOperativo }
        guard !payload.isEmpty else {
            throw ApiError.http(400, "Sin costos que actualizar")
        }
        return ConsoleHelpers.decodeMap(
            try await IntegraHTTP.patchMap("ventas/proyectos/\(id)/costos", body: payload)
        )
    }

    func closeProject(id: Int64) async throws -> [String: Any] {
        ConsoleHelpers.decodeMap(
            try await IntegraHTTP.postMap("ventas/proyectos/\(id)/close", body: [:])
        )
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

    func updateOpportunityStage(id: Int, stage: String) async throws -> [String: Any] {
        try await updateOpportunity(id: id, fields: ["stage": stage])
    }

    func crmActivitiesForOpportunity(opportunityId: Int64) async throws -> [CrmActivity] {
        ApiClient.decodeMapList(
            try await api.get("crm-activities", query: ["opportunityId": "\(opportunityId)"])
        ).map(CrmActivity.init)
    }

    func crmAgenda() async throws -> CrmAgenda {
        let data = try await api.get("crm-activities/my-agenda")
        return CrmAgenda(raw: ConsoleHelpers.decodeMap(data))
    }

    func completeCrmActivity(id: Int64, outcome: String? = nil) async throws {
        var body: [String: Any] = [:]
        if let outcome, !outcome.isEmpty { body["outcome"] = outcome }
        _ = try await IntegraHTTP.patchMap("crm-activities/\(id)/complete", body: body)
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
private struct SendCotizacionBody: Encodable {
    let email: String
    let message: String?
}
