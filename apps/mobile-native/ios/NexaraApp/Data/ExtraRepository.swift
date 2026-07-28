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
    func news() async -> [[String: Any]] { await newsItems().map(\.raw) }
    func newsItems() async -> [ConsoleNewsItem] { await load("news").map { ConsoleNewsItem(raw: $0) } }
    func contactMessages() async -> [[String: Any]] { await contactMessageItems().map(\.raw) }
    func contactMessageItems() async -> [ConsoleContactMessage] {
        await load("contact-messages").map { ConsoleContactMessage(raw: $0) }
    }
    func newsletter() async -> [[String: Any]] { await newsletterItems().map(\.raw) }
    func newsletterItems() async -> [ConsoleNewsletterSubscriber] {
        await load("newsletter").map { ConsoleNewsletterSubscriber(raw: $0) }
    }
    func audit() async -> [[String: Any]] { await auditItems().map(\.raw) }
    func auditItems() async -> [AuditEntry] { await load("audit").map { AuditEntry(raw: $0) } }
    func expenses() async -> [[String: Any]] {
        await expenseItems().map { $0.toFlatMap() }
    }

    func expenseItems() async -> [ExpenseItem] {
        await load("expenses").map { ExpenseItem(raw: $0) }
    }

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

    func fines() async -> [[String: Any]] { await fineItems().map(\.raw) }
    func fineItems() async -> [FineItem] { await load("fines").map { FineItem(raw: $0) } }
    func employeePayments() async -> [[String: Any]] { await employeePaymentItems().map(\.raw) }
    func employeePaymentItems() async -> [EmployeePaymentItem] {
        await load("employee-payments").map { EmployeePaymentItem(raw: $0) }
    }
    func cotizaciones() async -> [[String: Any]] { await cotizacionItems().map(\.raw) }
    func cotizacionItems() async -> [Cotizacion] { await load("cotizaciones").map { Cotizacion(raw: $0) } }
    func lunchBreaks() async -> [[String: Any]] { await lunchBreakItems().map(\.raw) }
    func lunchBreakItems() async -> [LunchBreak] { await load("lunch-breaks").map { LunchBreak(raw: $0) } }
    func documents() async -> [[String: Any]] { await documentItems().map(\.raw) }
    func documentItems() async -> [DocumentItem] { await load("documents").map { DocumentItem(raw: $0) } }
    func journalEntries() async -> [[String: Any]] { await journalEntryItems().map(\.raw) }
    func journalEntryItems() async -> [JournalEntryItem] {
        await load("accounting/journal-entries").map { JournalEntryItem(raw: $0) }
    }
    func invoices() async -> [[String: Any]] {
        await invoiceItems().map { $0.toFlatMap() }
    }

    func invoiceItems() async -> [InvoiceItem] {
        await load("accounting/invoices").map { InvoiceItem(raw: $0) }
    }

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

    func bankAccounts() async -> [[String: Any]] { await bankAccountItems().map(\.raw) }
    func bankAccountItems() async -> [BankAccountItem] {
        await load("accounting/banking/accounts").map { BankAccountItem(raw: $0) }
    }
    func hrLeaves() async           -> [[String: Any]] { await hrLeaveItems().map(\.raw) }
    func hrLeaveItems() async -> [HrLeave] { await load("hr/leaves").map { HrLeave(raw: $0) } }
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
    func serviceSheets() async -> [[String: Any]] { await serviceSheetItems().map(\.raw) }
    func serviceSheetItems() async -> [ServiceSheetItem] {
        await load("service-sheets").map { ServiceSheetItem(raw: $0) }
    }
    func cvs() async -> [[String: Any]] { await candidateItems().map(\.raw) }
    func candidateItems() async -> [CandidateItem] { await load("cvs").map { CandidateItem(raw: $0) } }
    func clientTicketRequests() async -> [[String: Any]] { await load("client-ticket-requests") }
    func projects() async -> [[String: Any]] { await portfolioProjects().map(\.raw) }
    func portfolioProjects() async -> [PortfolioProject] {
        await load("projects").map { PortfolioProject(raw: $0) }
    }

    // Console-specific
    func activities() async -> [[String: Any]] { await load("activities") }

    func activityItems() async -> [ActivityItem] {
        await load("activities").map { ActivityItem(raw: $0) }
    }
    func evidences() async          -> [[String: Any]] { await load("activity-evidence") }
    func viatics() async -> [[String: Any]] { await viaticItems().map(\.raw) }
    func viaticItems() async -> [ViaticItem] { await load("viatics").map { ViaticItem(raw: $0) } }
    func vehicles() async           -> [[String: Any]] { await load("vehicles") }
    func clients() async            -> [[String: Any]] { await load("clients") }
    func serviceClients() async     -> [[String: Any]] { await load("service-clients") }
    func users() async              -> [[String: Any]] { await load("users") }
    func attendance() async -> [[String: Any]] { await attendanceEventItems().map(\.raw) }
    func attendanceEventItems() async -> [AttendanceEvent] {
        await load("attendance").map { AttendanceEvent(raw: $0) }
    }
    func tools() async              -> [[String: Any]] { await load("tools") }
    func operationalProjects() async -> [[String: Any]] { await load("operational-projects") }
    func gpsLocations() async       -> [[String: Any]] { await load("gps") }

    // Lunch break actions
    func myLunchBreaks() async -> [[String: Any]] { await myLunchBreakItems().map(\.raw) }
    func myLunchBreakItems() async -> [LunchBreak] { await load("lunch-breaks/my-breaks").map { LunchBreak(raw: $0) } }
    func teamLunchBreaks() async -> [[String: Any]] { await teamLunchBreakItems().map(\.raw) }
    func teamLunchBreakItems() async -> [LunchBreak] { await load("lunch-breaks/users").map { LunchBreak(raw: $0) } }

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
        await analyticsDashboardItem().raw
    }

    func analyticsDashboardItem() async -> AnalyticsDashboard {
        guard let data = try? await ApiClient.shared.get("analytics/dashboard"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return AnalyticsDashboard(raw: [:])
        }
        return AnalyticsDashboard(raw: obj)
    }

    func analyticsComputedKpis() async -> [[String: Any]] {
        await analyticsComputedKpiItems().map(\.raw)
    }

    func analyticsComputedKpiItems() async -> [ComputedKpi] {
        guard let data = try? await ApiClient.shared.get("analytics/kpi/computed") else { return [] }
        return ApiClient.decodeMapList(data).map { ComputedKpi(raw: $0) }
    }

    func biMarginByType() async -> [[String: Any]] {
        await biMarginRows().map(\.raw)
    }

    func biMarginRows() async -> [BiMarginRow] {
        guard let data = try? await ApiClient.shared.get("analytics/bi/margin-by-type") else { return [] }
        return ApiClient.decodeMapList(data).map { BiMarginRow(raw: $0) }
    }

    func biEngineers(limit: Int = 10) async -> [[String: Any]] {
        await biEngineerRows(limit: limit).map(\.raw)
    }

    func biEngineerRows(limit: Int = 10) async -> [BiEngineerRow] {
        guard let data = try? await ApiClient.shared.get("analytics/bi/engineers", query: ["limit": String(limit)]) else { return [] }
        return ApiClient.decodeMapList(data).map { BiEngineerRow(raw: $0) }
    }

    func biClientsRoi(limit: Int = 10) async -> [[String: Any]] {
        await biClientRoiRows(limit: limit).map(\.raw)
    }

    func biClientRoiRows(limit: Int = 10) async -> [BiClientRoi] {
        guard let data = try? await ApiClient.shared.get("analytics/bi/clients-roi", query: ["limit": String(limit)]) else { return [] }
        return ApiClient.decodeMapList(data).map { BiClientRoi(raw: $0) }
    }

    func executiveCLevel() async -> [String: Any] {
        await executiveCLevelItem().raw
    }

    func executiveCLevelItem() async -> ExecutiveCLevel {
        guard let data = try? await ApiClient.shared.get("executive/c-level"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return ExecutiveCLevel(raw: [:])
        }
        return ExecutiveCLevel(raw: obj)
    }

    func workflowPending() async -> [[String: Any]] {
        await workflowApprovals().map { $0.toFlatMap() }
    }

    func workflowApprovals() async -> [WorkflowApproval] {
        guard let data = try? await ApiClient.shared.get("workflow/my-pending") else { return [] }
        return ApiClient.decodeMapList(data).map { WorkflowApproval(raw: $0) }
    }

    func workflowDecide(id: Int64, decision: String, comments: String? = nil) async throws {
        struct Body: Encodable { let decision: String; let comments: String? }
        _ = try await ApiClient.shared.postJSON(
            "workflow/approvals/\(id)/decide",
            body: Body(decision: decision, comments: comments)
        )
    }

    func nocSummary() async -> [String: Any] {
        guard let data = try? await ApiClient.shared.get("noc/summary"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func nocAlerts() async -> [[String: Any]] {
        await nocAlertItems().map { $0.toFlatMap() }
    }

    func nocAlertItems() async -> [NocAlert] {
        guard let data = try? await ApiClient.shared.get("noc/alerts") else { return [] }
        return ApiClient.decodeMapList(data).map { NocAlert(raw: $0) }
    }

    func nocDevices() async -> [[String: Any]] {
        await nocDeviceItems().map { $0.toFlatMap() }
    }

    func nocDeviceItems() async -> [NocDevice] {
        guard let data = try? await ApiClient.shared.get("noc/devices") else { return [] }
        return ApiClient.decodeMapList(data).map { NocDevice(raw: $0) }
    }

    func slaStats() async -> [String: Any] {
        await slaStatsItem().raw
    }

    func slaStatsItem() async -> SlaStats {
        guard let data = try? await ApiClient.shared.get("sla/stats"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return SlaStats(raw: [:])
        }
        return SlaStats(raw: obj)
    }

    func maintenanceContracts(clientId: String? = nil) async -> [[String: Any]] {
        await maintenanceContractItems(clientId: clientId).map { $0.toFlatMap() }
    }

    func maintenanceContractItems(clientId: String? = nil) async -> [MaintenanceContract] {
        var query: [String: String] = [:]
        if let id = clientId, !id.isEmpty { query["clientId"] = id }
        guard let data = try? await ApiClient.shared.get("maintenance-contracts", query: query) else { return [] }
        return ApiClient.decodeMapList(data).map { MaintenanceContract(raw: $0) }
    }

    func serviceClientBranches(serviceClientId: String) async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("service-clients/\(serviceClientId)/branches") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func companies() async -> [[String: Any]] {
        await companyItems().map(\.raw)
    }

    func companyItems() async -> [Company] {
        guard let data = try? await ApiClient.shared.get("company/list") else { return [] }
        return ApiClient.decodeMapList(data).map { Company(raw: $0) }
    }

    func clientTickets() async -> [[String: Any]] {
        guard let data = try? await ApiClient.shared.get("client-ticket-requests") else { return [] }
        return ApiClient.decodeMapList(data)
    }

    func kbArticles(q: String? = nil) async -> [[String: Any]] {
        await kbArticleItems(q: q).map(\.raw)
    }

    func kbArticleItems(q: String? = nil) async -> [KbArticle] {
        var query: [String: String] = [:]
        if let q, !q.isEmpty { query["q"] = q }
        guard let data = try? await ApiClient.shared.get("kb/articles", query: query) else { return [] }
        return ApiClient.decodeMapList(data).map { KbArticle(raw: $0) }
    }

    func kbArticle(_ slugOrId: String) async -> [String: Any] {
        await kbArticleItem(slugOrId).raw
    }

    func kbArticleItem(_ slugOrId: String) async -> KbArticle {
        guard let data = try? await ApiClient.shared.get("kb/articles/\(slugOrId)"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return KbArticle(raw: [:])
        }
        return KbArticle(raw: obj)
    }

    func orgchart() async -> [[String: Any]] {
        await orgNodeItems().map(\.raw)
    }

    func orgNodeItems() async -> [OrgNode] {
        guard let data = try? await ApiClient.shared.get("users/orgchart") else { return [] }
        return ApiClient.decodeMapList(data).map { OrgNode(raw: $0) }
    }

    func hrStaff(page: Int = 1, limit: Int = 100) async -> [[String: Any]] {
        await hrStaffItems(page: page, limit: limit).map(\.raw)
    }

    func hrStaffItems(page: Int = 1, limit: Int = 100) async -> [HrStaffMember] {
        guard let data = try? await ApiClient.shared.get("users/hr-staff", query: ["page": String(page), "limit": String(limit)]) else { return [] }
        return ApiClient.decodeMapList(data).map { HrStaffMember(raw: $0) }
    }

    func calendarEvents(from: String, to: String) async -> [[String: Any]] {
        await calendarEventItems(from: from, to: to).map(\.raw)
    }

    func calendarEventItems(from: String, to: String) async -> [CalendarEvent] {
        guard let data = try? await ApiClient.shared.get("calendar/events", query: ["from": from, "to": to]) else { return [] }
        return ApiClient.decodeMapList(data).map { CalendarEvent(raw: $0) }
    }

    func exportCsv(entity: String, from: String, to: String) async throws -> Data {
        try await ApiClient.shared.get("exports/\(entity)", query: ["from": from, "to": to])
    }
}
