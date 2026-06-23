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

    // Analytics (respuestas JSON arbitrarias)
    func analyticsDashboardRaw() async -> String {
        do {
            let data = try await ApiClient.shared.get("analytics/dashboard")
            return String(data: data, encoding: .utf8) ?? ""
        } catch { return "" }
    }
}
