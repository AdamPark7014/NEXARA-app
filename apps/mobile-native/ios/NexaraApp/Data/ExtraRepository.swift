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

    func createExpense(
        concepto: String,
        monto: Double,
        categoria: String?,
        ticketEvidenciaUrl: String?
    ) async throws {
        struct Body: Encodable {
            let concepto: String
            let monto: Double
            let categoria: String?
            let ticketEvidenciaUrl: String?
        }
        _ = try await ApiClient.shared.postJSON(
            "expenses",
            body: Body(
                concepto: concepto,
                monto: monto,
                categoria: categoria,
                ticketEvidenciaUrl: ticketEvidenciaUrl
            )
        )
    }

    func approveExpense(id: Int64, approve: Bool, note: String?) async throws {
        struct Body: Encodable {
            let action: String
            let note: String?
        }
        _ = try await ApiClient.shared.patchJSON(
            "expenses/\(id)/approve",
            body: Body(action: approve ? "approve" : "reject", note: note)
        )
    }

    func fines() async              -> [[String: Any]] { await load("fines") }
    func employeePayments() async   -> [[String: Any]] { await load("employee-payments") }
    func cotizaciones() async       -> [[String: Any]] { await load("cotizaciones") }
    func lunchBreaks() async        -> [[String: Any]] { await load("lunch-breaks") }
    func documents() async          -> [[String: Any]] { await load("documents") }
    func journalEntries() async     -> [[String: Any]] { await load("accounting/journal-entries") }
    func invoices() async           -> [[String: Any]] { await load("accounting/invoices") }

    func invoiceDetail(id: Int64) async -> [String: Any] {
        do {
            let data = try await ApiClient.shared.get("accounting/invoices/\(id)")
            return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        } catch {
            return [:]
        }
    }

    func registerInvoicePayment(
        id: Int64,
        amount: Double,
        paymentDate: String,
        method: String?,
        reference: String?,
        notes: String? = nil
    ) async throws {
        struct Body: Encodable {
            let amount: Double
            let paymentDate: String
            let method: String?
            let reference: String?
            let notes: String?
        }
        _ = try await ApiClient.shared.postJSON(
            "accounting/invoices/\(id)/payments",
            body: Body(amount: amount, paymentDate: paymentDate, method: method, reference: reference, notes: notes)
        )
    }

    func evaluateInvoiceMatch(id: Int64) async throws -> [String: Any] {
        struct Empty: Encodable {}
        let data = try await ApiClient.shared.postJSON("accounting/invoices/\(id)/match/evaluate", body: Empty())
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    func bankAccounts() async       -> [[String: Any]] { await load("accounting/banking/accounts") }
    func hrLeaves() async           -> [[String: Any]] { await load("hr/leaves") }
    func warehouse() async -> [[String: Any]] {
        await warehouseItems().map { $0.toFlatMap() }
    }

    func warehouseItems() async -> [WarehouseItem] {
        await load("warehouse").map { WarehouseItem(raw: $0) }
    }

    func stock() async -> [[String: Any]] {
        await stockLevels().map { $0.toFlatMap() }
    }

    func stockLevels() async -> [StockLevel] {
        await load("stock/levels").map { StockLevel(raw: $0) }
    }

    func lowStockAlerts() async -> [[String: Any]] {
        await lowStockLevels().map { $0.toFlatMap() }
    }

    func lowStockLevels() async -> [StockLevel] {
        let rows = await load("stock/alerts/low-stock").map { StockLevel(raw: $0) }
        if rows.isEmpty {
            return await stockLevels().filter(\.isLow)
        }
        return rows
    }

    func stockMovements() async -> [[String: Any]] {
        await stockMovementItems().map { $0.toFlatMap() }
    }

    func stockMovementItems() async -> [StockMovement] {
        await load("stock/movements").map { StockMovement(raw: $0) }
    }

    func catalogProducts() async -> [[String: Any]] {
        await catalogProductItems().map { $0.toFlatMap() }
    }

    func catalogProductItems() async -> [CatalogProduct] {
        do {
            let data = try await ApiClient.shared.get("catalog/products", query: ["take": "200"])
            return ApiClient.decodeMapList(data).map { CatalogProduct(raw: $0) }
        } catch {
            return []
        }
    }

    func createStockMovement(
        type: String,
        productId: Int64,
        quantity: Double,
        fromWarehouseId: Int64? = nil,
        toWarehouseId: Int64? = nil,
        unitCost: Double? = nil,
        reference: String? = nil,
        notes: String? = nil
    ) async throws {
        struct Body: Encodable {
            let type: String
            let productId: Int64
            let quantity: Double
            let fromWarehouseId: Int64?
            let toWarehouseId: Int64?
            let unitCost: Double?
            let reference: String?
            let notes: String?
        }
        _ = try await ApiClient.shared.postJSON(
            "stock/movements",
            body: Body(
                type: type,
                productId: productId,
                quantity: quantity,
                fromWarehouseId: fromWarehouseId,
                toWarehouseId: toWarehouseId,
                unitCost: unitCost,
                reference: reference,
                notes: notes
            )
        )
    }

    func requisitions() async -> [[String: Any]] {
        await requisitionItems().map { $0.toFlatMap() }
    }

    func requisitionItems() async -> [RequisitionItem] {
        await load("procurement/requisitions").map { RequisitionItem(raw: $0) }
    }

    func purchaseOrders() async -> [[String: Any]] {
        await purchaseOrderItems().map { $0.toFlatMap() }
    }

    func purchaseOrderItems() async -> [PurchaseOrderItem] {
        await load("procurement/purchase-orders").map { PurchaseOrderItem(raw: $0) }
    }

    func goodsReceipts() async -> [[String: Any]] {
        await goodsReceiptItems().map { $0.toFlatMap() }
    }

    func goodsReceiptItems() async -> [GoodsReceiptItem] {
        await load("procurement/goods-receipts").map { GoodsReceiptItem(raw: $0) }
    }
    func maintenanceAssets() async -> [[String: Any]] {
        await maintenanceAssetItems().map { $0.toFlatMap() }
    }

    func maintenanceAssetItems() async -> [MaintenanceAsset] {
        await load("maintenance/assets").map { MaintenanceAsset(raw: $0) }
    }

    func workOrders() async -> [[String: Any]] {
        await workOrderItems().map { $0.toFlatMap() }
    }

    func workOrderItems() async -> [WorkOrder] {
        await load("maintenance/work-orders").map { WorkOrder(raw: $0) }
    }
    func serviceSheets() async      -> [[String: Any]] { await load("service-sheets") }
    func cvs() async                -> [[String: Any]] { await load("cvs") }
    func clientTicketRequests() async -> [[String: Any]] { await load("client-ticket-requests") }
    func projects() async           -> [[String: Any]] { await load("projects") }

    // Console-specific
    func activities() async -> [[String: Any]] { await load("activities") }

    func activityItems() async -> [ActivityItem] {
        await load("activities").map { ActivityItem(raw: $0) }
    }
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
        _ = try await ApiClient.shared.putJSON("lunch-breaks/checkout", body: Body(checkoutTime: checkoutTime, checkoutPhotoUrl: photoDataUrl))
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

    func maintenanceContracts(clientId: String? = nil) async -> [[String: Any]] {
        var query: [String: String] = [:]
        if let id = clientId, !id.isEmpty { query["clientId"] = id }
        guard let data = try? await ApiClient.shared.get("maintenance-contracts", query: query) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func serviceClientBranches(serviceClientId: String) async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("service-clients/\(serviceClientId)/branches") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func companies() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("company/list") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func clientTickets() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("client-ticket-requests") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func kbArticles(q: String? = nil) async -> [[String: Any]] {
        var query: [String: String] = [:]
        if let q, !q.isEmpty { query["q"] = q }
        guard let data = try? await ApiClient.shared.get("kb/articles", query: query) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func kbArticle(_ slugOrId: String) async -> [String: Any] {
        guard let data = try? await ApiClient.shared.get("kb/articles/\(slugOrId)"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func orgchart() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("users/orgchart") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func hrStaff(page: Int = 1, limit: Int = 100) async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("users/hr-staff", query: ["page": String(page), "limit": String(limit)]) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func calendarEvents(from: String, to: String) async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("calendar/events", query: ["from": from, "to": to]) else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func exportCsv(entity: String, from: String, to: String) async throws -> Data {
        try await ApiClient.shared.get("exports/\(entity)", query: ["from": from, "to": to])
    }
}
