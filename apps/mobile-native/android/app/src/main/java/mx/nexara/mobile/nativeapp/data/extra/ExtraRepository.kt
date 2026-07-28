package mx.nexara.mobile.nativeapp.data.extra

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.AuditEntryDto
import mx.nexara.mobile.nativeapp.data.api.AnalyticsDashboardDto
import mx.nexara.mobile.nativeapp.data.api.BankAccountDto
import mx.nexara.mobile.nativeapp.data.api.BiClientRoiDto
import mx.nexara.mobile.nativeapp.data.api.BiEngineerRowDto
import mx.nexara.mobile.nativeapp.data.api.BiMarginRowDto
import mx.nexara.mobile.nativeapp.data.api.CalendarEventDto
import mx.nexara.mobile.nativeapp.data.api.ComputedKpiDto
import mx.nexara.mobile.nativeapp.data.api.CompanyDto
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.ExecutiveCLevelDto
import mx.nexara.mobile.nativeapp.data.api.KbArticleDto
import mx.nexara.mobile.nativeapp.data.api.OrgNodeDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.CreateExpenseRequest
import mx.nexara.mobile.nativeapp.data.api.DocumentDto
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentDto
import mx.nexara.mobile.nativeapp.data.api.ExpenseApproveRequest
import mx.nexara.mobile.nativeapp.data.api.ExpenseDto
import mx.nexara.mobile.nativeapp.data.api.ExtraApi
import mx.nexara.mobile.nativeapp.data.api.FineDto
import mx.nexara.mobile.nativeapp.data.api.HrLeaveDto
import mx.nexara.mobile.nativeapp.data.api.HrStaffDto
import mx.nexara.mobile.nativeapp.data.api.InvoiceDto
import mx.nexara.mobile.nativeapp.data.api.InvoiceMatchWaiveRequest
import mx.nexara.mobile.nativeapp.data.api.InvoicePaymentRequest
import mx.nexara.mobile.nativeapp.data.api.JournalEntryDto
import mx.nexara.mobile.nativeapp.data.api.LunchBreakDto
import mx.nexara.mobile.nativeapp.data.api.LunchCheckinRequest
import mx.nexara.mobile.nativeapp.data.api.LunchCheckoutRequest
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.api.CrmLeadDto
import mx.nexara.mobile.nativeapp.data.api.NewsletterSubscriberDto
import mx.nexara.mobile.nativeapp.data.api.CandidateDto
import mx.nexara.mobile.nativeapp.data.api.CatalogProductDto
import mx.nexara.mobile.nativeapp.data.api.PortfolioProjectDto
import mx.nexara.mobile.nativeapp.data.api.ServiceSheetListDto
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto
import mx.nexara.mobile.nativeapp.data.api.StockMovementDto
import mx.nexara.mobile.nativeapp.data.api.StockMovementRequest
import mx.nexara.mobile.nativeapp.data.api.GoodsReceiptDto
import mx.nexara.mobile.nativeapp.data.api.MaintenanceAssetDto
import mx.nexara.mobile.nativeapp.data.api.PurchaseOrderDto
import mx.nexara.mobile.nativeapp.data.api.RequisitionDto
import mx.nexara.mobile.nativeapp.data.api.WarehouseDto
import mx.nexara.mobile.nativeapp.data.api.MaintenanceContractDto
import mx.nexara.mobile.nativeapp.data.api.NocAlertDto
import mx.nexara.mobile.nativeapp.data.api.NocDeviceDto
import mx.nexara.mobile.nativeapp.data.api.SlaStatsDto
import mx.nexara.mobile.nativeapp.data.api.WorkflowApprovalDto
import mx.nexara.mobile.nativeapp.data.api.WorkOrderDto
import mx.nexara.mobile.nativeapp.data.api.WorkflowDecideRequest
import java.lang.reflect.ParameterizedType

class ExtraRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ExtraApi = ApiClient.authed { authRepo.token() }.create(ExtraApi::class.java)

    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    /**
     * Parsea una respuesta que puede ser:
     *  - array directo: [ {...}, {...} ]
     *  - objeto paginado: { items: [...] } o { data: [...] }
     */
    private inline fun <reified T> parseList(body: okhttp3.ResponseBody): List<T> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()

        val listType: ParameterizedType = Types.newParameterizedType(List::class.java, T::class.java)
        if (raw.startsWith("[")) {
            return moshi.adapter<List<T>>(listType).fromJson(raw) ?: emptyList()
        }
        if (raw.startsWith("{")) {
            // intenta {items:[...]} y {data:[...]}
            val mapType = Types.newParameterizedType(
                Map::class.java,
                String::class.java,
                Any::class.java,
            )
            val adapter = moshi.adapter<Map<String, Any?>>(mapType)
            val map = adapter.fromJson(raw) ?: return emptyList()
            val candidateKeys = listOf("items", "data", "results", "rows")
            for (k in candidateKeys) {
                val v = map[k]
                if (v is List<*>) {
                    val reJson = moshi.adapter(Any::class.java).toJson(v)
                    return moshi.adapter<List<T>>(listType).fromJson(reJson) ?: emptyList()
                }
            }
        }
        return emptyList()
    }

    suspend fun news(search: String? = null, status: String? = null): List<NewsPostDto> =
        parseList(api.getNewsRaw(search, status))

    suspend fun contactMessages(status: String? = null, category: String? = null): List<ContactMessageDto> =
        parseList(api.getContactMessagesRaw(status, category))

    suspend fun newsletter(search: String? = null): List<NewsletterSubscriberDto> =
        parseList(api.getNewsletterRaw(search))

    suspend fun audit(entityType: String? = null, action: String? = null): List<AuditEntryDto> =
        parseList(api.getAuditRaw(entityType, action))

    suspend fun analyticsDashboardRaw(): String = api.getAnalyticsDashboardRaw().string()
    suspend fun analyticsKpisRaw(): String = api.getAnalyticsComputedKpisRaw().string()
    suspend fun analyticsDashboardMap(): Map<String, Any?> = analyticsDashboardDto().raw
    suspend fun analyticsDashboardDto(): AnalyticsDashboardDto =
        AnalyticsDashboardDto.fromRaw(parseObject(api.getAnalyticsDashboardRaw().string()))
    suspend fun analyticsComputedKpisList(): List<Map<String, Any?>> =
        analyticsComputedKpiDtos().map { it.raw }
    suspend fun analyticsComputedKpiDtos(): List<ComputedKpiDto> =
        loadGeneric { api.getAnalyticsComputedKpisRaw() }.map { ComputedKpiDto.fromRaw(it) }

    suspend fun expenses(): List<ExpenseDto> = parseList(api.getExpensesRaw())

    suspend fun createExpense(concepto: String, monto: Double, categoria: String?, ticketUrl: String?) =
        api.createExpense(
            CreateExpenseRequest(
                concepto = concepto,
                monto = monto,
                categoria = categoria,
                ticketEvidenciaUrl = ticketUrl,
            ),
        )

    suspend fun approveExpense(id: Long, approve: Boolean, note: String? = null) =
        api.approveExpense(
            id = id,
            body = ExpenseApproveRequest(
                action = if (approve) "approve" else "reject",
                note = note,
            ),
        )
    suspend fun fines(): List<FineDto> = parseList(api.getFinesRaw())
    suspend fun employeePayments(): List<EmployeePaymentDto> = parseList(api.getEmployeePaymentsRaw())
    suspend fun cotizaciones(): List<CotizacionDto> = parseList(api.getCotizacionesRaw())
    suspend fun lunchBreaks(): List<LunchBreakDto> = parseList(api.getLunchBreaksRaw())
    suspend fun myLunchBreaks(): List<LunchBreakDto> = parseList(api.getMyLunchBreaksRaw())
    suspend fun usersLunchBreaks(): List<LunchBreakDto> = parseList(api.getUsersLunchBreaksRaw())
    suspend fun lunchCheckin(checkinTime: String, photoDataUrl: String?): String =
        api.postLunchCheckin(LunchCheckinRequest(checkinTime = checkinTime, checkinPhotoUrl = photoDataUrl)).string()
    suspend fun lunchCheckout(checkoutTime: String, photoDataUrl: String?): String =
        api.putLunchCheckout(LunchCheckoutRequest(checkoutTime = checkoutTime, checkoutPhotoUrl = photoDataUrl)).string()
    suspend fun documents(): List<DocumentDto> = parseList(api.getDocumentsRaw())
    suspend fun journalEntries(): List<JournalEntryDto> = parseList(api.getJournalEntriesRaw())
    suspend fun invoices(): List<InvoiceDto> = parseList(api.getInvoicesRaw())

    suspend fun invoiceDetail(id: Long): Map<String, Any?> {
        val raw = api.getInvoiceRaw(id).string().trim()
        if (raw.isEmpty() || !raw.startsWith("{")) return emptyMap()
        val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    suspend fun registerInvoicePayment(
        id: Long,
        amount: Double,
        paymentDate: String,
        method: String? = null,
        reference: String? = null,
        notes: String? = null,
    ) {
        api.registerInvoicePayment(
            id,
            InvoicePaymentRequest(
                amount = amount,
                paymentDate = paymentDate,
                method = method,
                reference = reference,
                notes = notes,
            ),
        )
    }

    suspend fun evaluateInvoiceMatch(id: Long): Map<String, Any?> {
        val raw = api.evaluateInvoiceMatch(id).string().trim()
        if (raw.isEmpty() || !raw.startsWith("{")) return emptyMap()
        val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    suspend fun waiveInvoiceMatch(id: Long, notes: String?) {
        api.waiveInvoiceMatch(id, InvoiceMatchWaiveRequest(notes = notes))
    }

    suspend fun bankAccounts(): List<BankAccountDto> = parseList(api.getBankAccountsRaw())

    // ── Generic endpoints (Map<String, Any?>) for screens that only list raw
    // records. Mantiene paridad visual sin forzar DTOs específicos.
    private suspend fun loadGeneric(loader: suspend () -> okhttp3.ResponseBody): List<Map<String, Any?>> {
        val raw = loader().string().trim()
        if (raw.isEmpty()) return emptyList()
        val listType = Types.newParameterizedType(
            List::class.java,
            Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java),
        )
        val adapter = moshi.adapter<List<Map<String, Any?>>>(listType)
        if (raw.startsWith("[")) {
            return adapter.fromJson(raw) ?: emptyList()
        }
        if (raw.startsWith("{")) {
            val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
            val mapAdapter = moshi.adapter<Map<String, Any?>>(mapType)
            val root = mapAdapter.fromJson(raw) ?: return emptyList()
            for (k in listOf("items", "data", "results", "rows")) {
                val v = root[k]
                if (v is List<*>) {
                    @Suppress("UNCHECKED_CAST")
                    return v.filterIsInstance<Map<String, Any?>>()
                }
            }
        }
        return emptyList()
    }

    suspend fun hrLeaves() = hrLeaveDtos().map { it.raw }
    suspend fun hrLeaveDtos(): List<HrLeaveDto> =
        loadGeneric { api.getHrLeavesRaw() }.map { HrLeaveDto.fromRaw(it) }
    suspend fun hrReviews() = loadGeneric { api.getHrReviewsRaw() }
    suspend fun hrDashboardRaw(): String = api.getHrDashboardRaw().string()
    suspend fun warehouse(): List<Map<String, Any?>> =
        warehouses().map { it.toFlatMap() }

    suspend fun warehouses(): List<WarehouseDto> =
        loadGeneric { api.getWarehouseRaw() }.map { WarehouseDto.fromRaw(it) }

    suspend fun stock(belowReorder: Boolean? = null): List<Map<String, Any?>> =
        stockLevels(belowReorder).map { it.toFlatMap() }

    suspend fun stockLevels(belowReorder: Boolean? = null): List<StockLevelDto> =
        loadGeneric { api.getStockLevelsRaw(belowReorder = belowReorder) }
            .map { StockLevelDto.fromRaw(it) }

    suspend fun lowStockAlerts(): List<Map<String, Any?>> =
        lowStockLevelDtos().map { it.toFlatMap() }

    suspend fun lowStockLevelDtos(): List<StockLevelDto> {
        val parsed = loadGeneric { api.getLowStockAlertsRaw() }.map { StockLevelDto.fromRaw(it) }
        if (parsed.isNotEmpty()) return parsed
        return stockLevels().filter { it.isLow }
    }

    suspend fun stockMovements(
        warehouseId: Long? = null,
        productId: Long? = null,
        type: String? = null,
    ): List<Map<String, Any?>> =
        stockMovementDtos(warehouseId, productId, type).map { it.toFlatMap() }

    suspend fun stockMovementDtos(
        warehouseId: Long? = null,
        productId: Long? = null,
        type: String? = null,
    ): List<StockMovementDto> =
        loadGeneric { api.getStockMovementsRaw(warehouseId, productId, type) }
            .map { StockMovementDto.fromRaw(it) }

    suspend fun catalogProducts(): List<Map<String, Any?>> =
        catalogProductDtos().map { it.toFlatMap() }

    suspend fun catalogProductDtos(): List<CatalogProductDto> =
        loadGeneric { api.getCatalogProductsRaw(200) }.map { CatalogProductDto.fromRaw(it) }

    suspend fun createStockMovement(
        type: String,
        productId: Long,
        quantity: Double,
        fromWarehouseId: Long? = null,
        toWarehouseId: Long? = null,
        unitCost: Double? = null,
        reference: String? = null,
        notes: String? = null,
    ) {
        api.createStockMovement(
            StockMovementRequest(
                type = type,
                productId = productId,
                quantity = quantity,
                fromWarehouseId = fromWarehouseId,
                toWarehouseId = toWarehouseId,
                unitCost = unitCost,
                reference = reference,
                notes = notes,
            ),
        )
    }

    suspend fun requisitions(): List<Map<String, Any?>> =
        requisitionDtos().map { it.toFlatMap() }

    suspend fun requisitionDtos(): List<RequisitionDto> =
        loadGeneric { api.getRequisitionsRaw() }.map { RequisitionDto.fromRaw(it) }

    suspend fun purchaseOrders(): List<Map<String, Any?>> =
        purchaseOrderDtos().map { it.toFlatMap() }

    suspend fun purchaseOrderDtos(): List<PurchaseOrderDto> =
        loadGeneric { api.getPurchaseOrdersRaw() }.map { PurchaseOrderDto.fromRaw(it) }

    suspend fun goodsReceipts(): List<Map<String, Any?>> =
        goodsReceiptDtos().map { it.toFlatMap() }

    suspend fun goodsReceiptDtos(): List<GoodsReceiptDto> =
        loadGeneric { api.getGoodsReceiptsRaw() }.map { GoodsReceiptDto.fromRaw(it) }
    suspend fun supplierEvaluations() = loadGeneric { api.getSupplierEvaluationsRaw() }
    suspend fun maintenanceAssets(): List<Map<String, Any?>> =
        maintenanceAssetDtos().map { it.toFlatMap() }

    suspend fun maintenanceAssetDtos(): List<MaintenanceAssetDto> =
        loadGeneric { api.getMaintenanceAssetsRaw() }.map { MaintenanceAssetDto.fromRaw(it) }

    suspend fun workOrders(): List<Map<String, Any?>> =
        workOrderDtos().map { it.toFlatMap() }

    suspend fun workOrderDtos(): List<WorkOrderDto> =
        loadGeneric { api.getWorkOrdersRaw() }.map { WorkOrderDto.fromRaw(it) }
    suspend fun serviceSheets() = serviceSheetDtos().map { it.toFlatMap() }
    suspend fun serviceSheetDtos(): List<ServiceSheetListDto> =
        loadGeneric { api.getServiceSheetsRaw() }.map { ServiceSheetListDto.fromRaw(it) }
    suspend fun cvs() = candidateDtos().map { it.toFlatMap() }
    suspend fun candidateDtos(): List<CandidateDto> =
        loadGeneric { api.getCvsRaw() }.map { CandidateDto.fromRaw(it) }
    suspend fun clientTicketRequests() = loadGeneric { api.getClientTicketRequestsRaw() }
    suspend fun clientTicketLeadDtos(): List<CrmLeadDto> =
        clientTicketRequests().map { CrmLeadDto.fromRaw(it) }
    suspend fun projects() = portfolioProjectDtos().map { it.toFlatMap() }
    suspend fun portfolioProjectDtos(): List<PortfolioProjectDto> =
        loadGeneric { api.getProjectsRaw() }.map { PortfolioProjectDto.fromRaw(it) }

    suspend fun biMarginByType() = biMarginRowDtos().map { it.raw }
    suspend fun biMarginRowDtos(): List<BiMarginRowDto> =
        loadGeneric { api.getBiMarginRaw() }.map { BiMarginRowDto.fromRaw(it) }
    suspend fun biEngineers(limit: Int = 10) = biEngineerRowDtos(limit).map { it.raw }
    suspend fun biEngineerRowDtos(limit: Int = 10): List<BiEngineerRowDto> =
        loadGeneric { api.getBiEngineersRaw(limit) }.map { BiEngineerRowDto.fromRaw(it) }
    suspend fun biClientsRoi(limit: Int = 10) = biClientRoiDtos(limit).map { it.raw }
    suspend fun biClientRoiDtos(limit: Int = 10): List<BiClientRoiDto> =
        loadGeneric { api.getBiClientsRoiRaw(limit) }.map { BiClientRoiDto.fromRaw(it) }
    suspend fun executiveCLevel(): Map<String, Any?> = executiveCLevelDto().raw
    suspend fun executiveCLevelDto(): ExecutiveCLevelDto =
        ExecutiveCLevelDto.fromRaw(parseObject(api.getExecutiveCLevelRaw().string()))
    suspend fun workflowPending() = workflowApprovals().map { it.toFlatMap() }
    suspend fun workflowApprovals(): List<WorkflowApprovalDto> =
        loadGeneric { api.getWorkflowPendingRaw() }.map { WorkflowApprovalDto.fromRaw(it) }
    suspend fun workflowDecide(id: Long, decision: String, comments: String? = null) {
        api.postWorkflowDecide(id, WorkflowDecideRequest(decision, comments))
    }
    suspend fun nocSummary(): Map<String, Any?> = parseObject(api.getNocSummaryRaw().string())
    suspend fun nocAlerts() = nocAlertDtos().map { it.toFlatMap() }
    suspend fun nocAlertDtos(): List<NocAlertDto> =
        loadGeneric { api.getNocAlertsRaw() }.map { NocAlertDto.fromRaw(it) }
    suspend fun nocDevices() = nocDeviceDtos().map { it.toFlatMap() }
    suspend fun nocDeviceDtos(): List<NocDeviceDto> =
        loadGeneric { api.getNocDevicesRaw() }.map { NocDeviceDto.fromRaw(it) }
    suspend fun slaStats(): Map<String, Any?> = slaStatsDto().raw
    suspend fun slaStatsDto(): SlaStatsDto = SlaStatsDto.fromRaw(parseObject(api.getSlaStatsRaw().string()))
    suspend fun maintenanceContracts(status: String? = null, clientId: String? = null) =
        maintenanceContractDtos(status, clientId).map { it.toFlatMap() }
    suspend fun maintenanceContractDtos(status: String? = null, clientId: String? = null): List<MaintenanceContractDto> =
        loadGeneric { api.getMaintenanceContractsRaw(status, clientId) }.map { MaintenanceContractDto.fromRaw(it) }

    suspend fun serviceClientBranches(serviceClientId: String) =
        loadGeneric { api.getServiceClientBranchesRaw(serviceClientId) }

    suspend fun companies() = companyDtos().map { it.raw }
    suspend fun companyDtos(): List<CompanyDto> =
        loadGeneric { api.getCompaniesRaw() }.map { CompanyDto.fromRaw(it) }
    suspend fun kbArticles(q: String? = null) = kbArticleDtos(q).map { it.raw }
    suspend fun kbArticleDtos(q: String? = null): List<KbArticleDto> =
        loadGeneric { api.getKbArticlesRaw(q) }.map { KbArticleDto.fromRaw(it) }
    suspend fun kbArticle(slugOrId: String): Map<String, Any?> = kbArticleDto(slugOrId).raw
    suspend fun kbArticleDto(slugOrId: String): KbArticleDto =
        KbArticleDto.fromRaw(parseObject(api.getKbArticleRaw(slugOrId).string()))
    suspend fun orgchart(): List<Map<String, Any?>> = orgNodeDtos().map { it.raw }
    suspend fun orgNodeDtos(): List<OrgNodeDto> =
        loadGeneric { api.getOrgchartRaw() }.map { OrgNodeDto.fromRaw(it) }
    suspend fun hrStaff(page: Int = 1, limit: Int = 100) = hrStaffDtos(page, limit).map { it.raw }
    suspend fun hrStaffDtos(page: Int = 1, limit: Int = 100): List<HrStaffDto> =
        loadGeneric { api.getHrStaffRaw(limit, page) }.map { HrStaffDto.fromRaw(it) }
    suspend fun calendarEvents(from: String, to: String) =
        calendarEventDtos(from, to).map { it.raw }
    suspend fun calendarEventDtos(from: String, to: String): List<CalendarEventDto> =
        loadGeneric { api.getCalendarEventsRaw(from, to) }.map { CalendarEventDto.fromRaw(it) }
    suspend fun exportCsv(entity: String, from: String, to: String): ByteArray =
        api.getExportRaw(entity, from, to).bytes()

    private fun parseObject(raw: String): Map<String, Any?> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || !trimmed.startsWith("{")) return emptyMap()
        val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: emptyMap()
    }
}
