import Foundation

/// CRM / Ventas — endpoints web `/crm/*` vía API `ventas/*` y `catalog/*`.
final class CrmRepository {
    static let shared = CrmRepository()
    private let api = ApiClient.shared
    private init() {}

    func cotizaciones() async throws -> [[String: Any]] {
        if let data = try? await api.get("ventas/cotizaciones") {
            let list = ApiClient.decodeMapList(data)
            if !list.isEmpty { return list }
        }
        return ApiClient.decodeMapList(try await api.get("cotizaciones"))
    }

    func oportunidades() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/oportunidades"))
    }

    func clientes() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/clientes"))
    }

    func leads() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/leads"))
    }

    func proyectos() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/proyectos"))
    }

    func products(search: String? = nil) async throws -> [[String: Any]] {
        var q: [String: String] = [:]
        if let s = search, !s.isEmpty { q["search"] = s }
        return ApiClient.decodeMapList(try await api.get("catalog/products", query: q))
    }

    func salesDashboardRaw() async throws -> Data {
        try await api.get("ventas/reportes/cockpit")
    }

    func calendarEvents() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("calendar/events"))
    }

    func tenders() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("tenders"))
    }

    func salesTargets() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("sales-targets"))
    }

    func salesTeam(period: String = "month") async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/reportes/vendedores", query: ["period": period]))
    }

    func salesMetrics(period: String = "month") async -> [String: Any] {
        guard let data = try? await api.get("ventas/reportes/metricas", query: ["period": period]),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func vendorStats(period: String = "month") async -> [[String: Any]] {
        guard let data = try? await api.get("ventas/reportes/vendedores", query: ["period": period]) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func orderTemplates() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/order-templates"))
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
        let data = try await api.get("ventas/oportunidades/\(id)")
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
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
