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

    func salesTeam() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("ventas/reportes/vendedores"))
    }
}
