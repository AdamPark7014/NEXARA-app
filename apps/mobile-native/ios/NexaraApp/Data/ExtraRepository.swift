import Foundation

/// Repositorio para endpoints adicionales. Paridad con `ExtraRepository` de Android.
/// Cada método devuelve `[[String: Any]]` para que las vistas SwiftUI
/// construyan filas dinámicas (id/title/subtitle/status/fecha).
final class ExtraRepository {
    static let shared = ExtraRepository()
    private init() {}

    private func load(_ path: String) async -> [[String: Any]] {
        do {
            let data = try await ApiClient.shared.get(path)
            return ApiClient.decodeMapList(data)
        } catch {
            return []
        }
    }

    // MARK: Endpoints (idéntico a Android ExtraRepository + ConsoleRepository)
    func news() async               -> [[String: Any]] { await load("news") }
    func contactMessages() async    -> [[String: Any]] { await load("contact-messages") }
    func newsletter() async         -> [[String: Any]] { await load("newsletter") }
    func audit() async              -> [[String: Any]] { await load("audit") }
    func expenses() async           -> [[String: Any]] { await load("expenses") }
    func fines() async              -> [[String: Any]] { await load("fines") }
    func employeePayments() async   -> [[String: Any]] { await load("employee-payments") }
    func cotizaciones() async       -> [[String: Any]] { await load("cotizaciones") }
    func lunchBreaks() async        -> [[String: Any]] { await load("lunch-breaks") }
    func documents() async          -> [[String: Any]] { await load("documents") }
    func journalEntries() async     -> [[String: Any]] { await load("accounting/journal-entries") }
    func invoices() async           -> [[String: Any]] { await load("accounting/invoices") }
    func bankAccounts() async       -> [[String: Any]] { await load("accounting/banking/accounts") }
    func hrLeaves() async           -> [[String: Any]] { await load("hr/leaves") }
    func warehouse() async          -> [[String: Any]] { await load("warehouse") }
    func stock() async              -> [[String: Any]] { await load("stock") }
    func requisitions() async       -> [[String: Any]] { await load("procurement/requisitions") }
    func purchaseOrders() async     -> [[String: Any]] { await load("procurement/purchase-orders") }
    func maintenanceAssets() async  -> [[String: Any]] { await load("maintenance/assets") }
    func workOrders() async         -> [[String: Any]] { await load("maintenance/work-orders") }
    func serviceSheets() async      -> [[String: Any]] { await load("service-sheets") }
    func cvs() async                -> [[String: Any]] { await load("cvs") }
    func clientTicketRequests() async -> [[String: Any]] { await load("client-ticket-requests") }
    func projects() async           -> [[String: Any]] { await load("projects") }

    // Console-specific
    func activities() async         -> [[String: Any]] { await load("activities") }
    func evidences() async          -> [[String: Any]] { await load("activity-evidence") }
    func viatics() async            -> [[String: Any]] { await load("viatics") }
    func vehicles() async           -> [[String: Any]] { await load("vehicles") }
    func clients() async            -> [[String: Any]] { await load("clients") }
    func serviceClients() async     -> [[String: Any]] { await load("service-clients") }
    func users() async              -> [[String: Any]] { await load("users") }
    func attendance() async         -> [[String: Any]] { await load("attendance") }
    func tools() async              -> [[String: Any]] { await load("tools") }
    func operationalProjects() async -> [[String: Any]] { await load("operational-projects") }
    func gpsLocations() async       -> [[String: Any]] { await load("gps") }

    // Lunch break actions
    func myLunchBreaks() async -> [[String: Any]] { await load("lunch-breaks/my-breaks") }
    func teamLunchBreaks() async -> [[String: Any]] { await load("lunch-breaks/users") }

    func lunchCheckin(checkinTime: String, photoDataUrl: String?) async throws {
        struct Body: Encodable { let checkinTime: String; let checkinPhotoUrl: String? }
        _ = try await ApiClient.shared.postJSON("lunch-breaks/checkin", body: Body(checkinTime: checkinTime, checkinPhotoUrl: photoDataUrl))
    }

    func lunchCheckout(checkoutTime: String, photoDataUrl: String?) async throws {
        struct Body: Encodable { let checkoutTime: String; let checkoutPhotoUrl: String? }
        _ = try await ApiClient.shared.postJSON("lunch-breaks/checkout", body: Body(checkoutTime: checkoutTime, checkoutPhotoUrl: photoDataUrl))
    }

    // Analytics (respuestas JSON arbitrarias)
    func analyticsDashboardRaw() async -> String {
        do {
            let data = try await ApiClient.shared.get("analytics/dashboard")
            return String(data: data, encoding: .utf8) ?? ""
        } catch { return "" }
    }

    func analyticsKpisRaw() async -> String {
        do {
            let data = try await ApiClient.shared.get("analytics/kpi/computed")
            return String(data: data, encoding: .utf8) ?? ""
        } catch { return "" }
    }

    func analyticsDashboardMap() async -> [String: Any] {
        guard let data = try? await ApiClient.shared.get("analytics/dashboard"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func analyticsComputedKpis() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("analytics/kpi/computed") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func biMarginByType() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("analytics/bi/margin-by-type") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func biEngineers(limit: Int = 10) async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("analytics/bi/engineers", query: ["limit": String(limit)]) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func biClientsRoi(limit: Int = 10) async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("analytics/bi/clients-roi", query: ["limit": String(limit)]) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func executiveCLevel() async -> [String: Any] {
        guard let data = try? await ApiClient.shared.get("executive/c-level"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func workflowPending() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("workflow/my-pending") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func workflowDecide(id: Int, decision: String, comments: String? = nil) async throws {
        struct Body: Encodable { let decision: String; let comments: String? }
        _ = try await ApiClient.shared.postJSON("workflow/approvals/\(id)/decide", body: Body(decision: decision, comments: comments))
    }

    func nocSummary() async -> [String: Any] {
        guard let data = try? await ApiClient.shared.get("noc/summary"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func nocAlerts() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("noc/alerts") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func nocDevices() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("noc/devices") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func slaStats() async -> [String: Any] {
        guard let data = try? await ApiClient.shared.get("sla/stats"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func maintenanceContracts() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("maintenance-contracts") else { return [] }
        return ApiClient.decodeMapList(data)
    }
}
