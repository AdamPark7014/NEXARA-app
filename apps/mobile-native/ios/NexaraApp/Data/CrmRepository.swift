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

    /// PDF de la cotización. Dos rutas distintas, no una con parámetro: la
    /// interna lleva costos y margen y sólo la ve el equipo comercial.
    ///
    /// Antes se construía la ruta en una variable; escritas como literales, un
    /// `grep` por el endpoint encuentra la llamada —y el informe de paridad deja
    /// de contarlas como huecos que no existen.
    func downloadCotizacionPdf(id: Int, internal isInternal: Bool = false) async throws -> Data {
        if isInternal {
            return try await api.getBinary("cotizaciones/\(id)/pdf/internal")
        }
        return try await api.getBinary("cotizaciones/\(id)/pdf")
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
        // `AnyCodable` ya envuelve JSON heterogéneo, así que se puede usar
        // `patchJSON` —cuerpo tipado y ruta literal— en vez de `patchMap`.
        let body = fields.mapValues { AnyCodable($0) }
        return ConsoleHelpers.decodeMap(try await api.patchJSON("ventas/proyectos/\(id)", body: body))
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

    /// Costos del proyecto ya tipados. `projectCosts` devuelve el mapa crudo y
    /// se conserva por compatibilidad con lo que ya lo usa.
    func projectCostSummary(id: Int64) async throws -> CrmProjectCosts {
        CrmProjectCosts(raw: try await projectCosts(id: id))
    }

    /// Valida presupuesto contra costos — GET `ventas/proyectos/:id/validar-presupuesto`.
    /// Devuelve `{valid, message}` con el mensaje ya redactado por el backend.
    func validateProjectBudget(id: Int64) async throws -> CrmBudgetCheck {
        let data = try await api.get("ventas/proyectos/\(id)/validar-presupuesto")
        return CrmBudgetCheck(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Recalcula `costViaticos` sumando los viáticos del proyecto —
    /// POST `ventas/proyectos/:id/sync-viaticos`. Devuelve los costos ya
    /// recalculados, así que no hace falta una segunda llamada.
    @discardableResult
    func syncProjectViaticos(id: Int64) async throws -> CrmProjectCosts {
        let data = try await api.postJSON("ventas/proyectos/\(id)/sync-viaticos", body: EmptyBody())
        return CrmProjectCosts(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Baja los costos reales de campo (viáticos aprobados + gastos de OT) al
    /// proyecto — POST `ventas/proyectos/:id/sync-actual-costs`.
    @discardableResult
    func syncProjectActualCosts(id: Int64) async throws -> CrmProjectCosts {
        let data = try await api.postJSON("ventas/proyectos/\(id)/sync-actual-costs", body: EmptyBody())
        return CrmProjectCosts(raw: ConsoleHelpers.decodeMap(data))
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

    /// Insights ejecutivos de ventas — GET `ventas/reportes/insights`.
    ///
    /// Es lo que la web pinta en `/crm/reports`: forecast ponderado, higiene de
    /// pipeline y alertas de riesgo. Se modela sólo la parte que cabe en un
    /// teléfono (ver `CrmSalesInsights`).
    func salesInsights(period: String = "month") async throws -> CrmSalesInsights {
        let data = try await api.get("ventas/reportes/insights", query: ["period": period])
        return CrmSalesInsights(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Notificaciones del panel comercial — GET `ventas/reportes/notificaciones`.
    ///
    /// No es la bandeja general (`notifications`): el backend la filtra al
    /// equipo de ventas y, si eres admin comercial, agrega las de todo el equipo.
    func salesNotifications(limit: Int = 20, offset: Int = 0) async throws -> [CrmSalesNotification] {
        let data = try await api.get("ventas/reportes/notificaciones", query: [
            "limit": String(limit),
            "offset": String(offset),
        ])
        return ApiClient.decodeMapList(data).map(CrmSalesNotification.init)
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

    /// Detalle de licitación — GET `tenders/:id`.
    /// Trae documentos, hitos, responsable y la oportunidad vinculada; la lista
    /// (`tenders`) no trae nada de eso.
    func tenderDetail(id: Int64) async throws -> CrmTenderDetail {
        let data = try await api.get("tenders/\(id)")
        return CrmTenderDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Cambia el estado de la licitación — PATCH `tenders/:id/status`.
    ///
    /// `awardedToCompetitor` / `awardNotes` sólo tienen sentido al marcarla
    /// perdida o descalificada; se envían únicamente si vienen con contenido
    /// para no sobrescribir con cadenas vacías lo que ya hubiera guardado.
    @discardableResult
    func setTenderStatus(
        id: Int64,
        status: String,
        awardedToCompetitor: String? = nil,
        awardNotes: String? = nil
    ) async throws -> CrmTenderDetail {
        let competitor = awardedToCompetitor?.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = awardNotes?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = TenderStatusBody(
            status: status,
            awardedToCompetitor: (competitor?.isEmpty ?? true) ? nil : competitor,
            awardNotes: (notes?.isEmpty ?? true) ? nil : notes
        )
        let data = try await api.patchJSON("tenders/\(id)/status", body: body)
        return CrmTenderDetail(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Promueve una licitación adjudicada a oportunidad ganada —
    /// POST `tenders/:id/promote-opportunity`.
    ///
    /// El backend devuelve 400 si el estado no es `AWARDED`; la vista sólo
    /// ofrece el botón cuando `CrmTenderDetail.canPromote` lo permite, pero el
    /// error se propaga igual por si alguien cambia el estado en paralelo.
    @discardableResult
    func promoteTenderToOpportunity(id: Int64) async throws -> [String: Any] {
        let data = try await api.postJSON("tenders/\(id)/promote-opportunity", body: EmptyBody())
        return ConsoleHelpers.decodeMap(data)
    }

    func salesTargets() async throws -> [[String: Any]] {
        try await salesTargetItems().map(\.raw)
    }

    func salesTargetItems() async throws -> [SalesTarget] {
        ApiClient.decodeMapList(try await api.get("sales-targets")).map { SalesTarget(raw: $0) }
    }

    /// Cumplimiento de cuota y comisión por vendedor —
    /// GET `sales-targets/performance`.
    ///
    /// `sales-targets` a secas sólo devuelve la meta guardada. Esto la cruza con
    /// lo realmente vendido en el periodo y calcula la comisión: es el dato por
    /// el que un vendedor abre la app.
    func salesTargetPerformance(year: Int? = nil, month: Int? = nil) async throws -> CrmTargetPerformance {
        var params: [String: String] = [:]
        if let year { params["year"] = String(year) }
        if let month { params["month"] = String(month) }
        let data = try await api.get("sales-targets/performance", query: params)
        return CrmTargetPerformance(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Borra una cuota — DELETE `sales-targets/:id`.
    /// Requiere permiso de gestión; la vista lo pide con confirmación porque no
    /// hay deshacer.
    func deleteSalesTarget(id: Int64) async throws {
        try await api.delete("sales-targets/\(id)")
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
        // Cuerpo tipado en vez de `[String: Any]`: `outcome` nulo desaparece del
        // JSON y la ruta queda escrita como literal, localizable con un `grep`.
        let clean = outcome?.trimmingCharacters(in: .whitespacesAndNewlines)
        _ = try await api.patchJSON(
            "crm-activities/\(id)/complete",
            body: CrmActivityOutcomeBody(outcome: (clean?.isEmpty ?? true) ? nil : clean)
        )
    }

    /// Crea una tarea CRM — POST `crm-activities`.
    ///
    /// El backend rechaza con 400 una actividad que no cuelgue de un lead, una
    /// oportunidad o una licitación: por eso `opportunityId` es obligatorio aquí
    /// (es el único origen desde el que la app la ofrece hoy).
    @discardableResult
    func createCrmActivity(
        opportunityId: Int64,
        subject: String,
        dueDate: String,
        activityType: String = "TASK",
        description: String? = nil
    ) async throws -> CrmActivity {
        var body: [String: Any] = [
            "opportunityId": opportunityId,
            "subject": subject.trimmingCharacters(in: .whitespacesAndNewlines),
            "dueDate": dueDate,
            "activityType": activityType,
        ]
        if let description = description?.trimmingCharacters(in: .whitespacesAndNewlines),
           !description.isEmpty {
            body["description"] = description
        }
        let data = try await IntegraHTTP.postMap("crm-activities", body: body)
        return CrmActivity(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Reprograma o edita una tarea CRM — PATCH `crm-activities/:id`.
    /// Sólo se envían los campos presentes: el backend hace merge y un campo
    /// vacío borraría el asunto.
    @discardableResult
    func updateCrmActivity(
        id: Int64,
        subject: String? = nil,
        dueDate: String? = nil,
        activityType: String? = nil,
        description: String? = nil
    ) async throws -> CrmActivity {
        let cleanSubject = subject?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = CrmActivityPatchBody(
            subject: (cleanSubject?.isEmpty ?? true) ? nil : cleanSubject,
            dueDate: (dueDate?.isEmpty ?? true) ? nil : dueDate,
            activityType: (activityType?.isEmpty ?? true) ? nil : activityType,
            description: description
        )
        guard body.hasChanges else {
            throw ApiError.http(400, "Sin cambios que guardar")
        }
        let data = try await api.patchJSON("crm-activities/\(id)", body: body)
        return CrmActivity(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Borra una tarea CRM — DELETE `crm-activities/:id`. No hay papelera.
    func deleteCrmActivity(id: Int64) async throws {
        try await api.delete("crm-activities/\(id)")
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

/// Cuerpo de `PATCH tenders/:id/status`. Los opcionales se omiten del JSON
/// (Swift sintetiza `encodeIfPresent`), que es justo lo que quiere el backend:
/// un `null` sobrescribiría las notas de adjudicación ya guardadas.
private struct TenderStatusBody: Encodable {
    let status: String
    let awardedToCompetitor: String?
    let awardNotes: String?
}

/// Cuerpo de `PATCH crm-activities/:id/complete`.
private struct CrmActivityOutcomeBody: Encodable {
    let outcome: String?
}

/// Cuerpo de `PATCH crm-activities/:id`. Mismo criterio: sólo viaja lo que se
/// tocó de verdad.
private struct CrmActivityPatchBody: Encodable {
    let subject: String?
    let dueDate: String?
    let activityType: String?
    let description: String?

    var hasChanges: Bool {
        subject != nil || dueDate != nil || activityType != nil || description != nil
    }
}
