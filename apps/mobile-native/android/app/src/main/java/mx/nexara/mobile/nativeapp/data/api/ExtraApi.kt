package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

// ── News ──────────────────────────────────────────────────────────────────
data class NewsPostDto(
    val id: Long,
    val title: String? = null,
    val slug: String? = null,
    val excerpt: String? = null,
    val body: String? = null,
    val content: String? = null,
    val status: String? = null,
    val coverImageUrl: String? = null,
    val category: String? = null,
    val tags: List<String>? = null,
    val publishedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val author: SimpleUserDto? = null,
)

data class NewsListResponse(
    val items: List<NewsPostDto>? = null,
    val data: List<NewsPostDto>? = null,
    val total: Int? = null,
    val page: Int? = null,
    val limit: Int? = null,
)

// ── Contact messages ──────────────────────────────────────────────────────
data class ContactMessageDto(
    val id: Long,
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val subject: String? = null,
    val message: String? = null,
    val category: String? = null,
    val status: String? = null,
    val createdAt: String? = null,
)

data class ContactMessageListResponse(
    val items: List<ContactMessageDto>? = null,
    val data: List<ContactMessageDto>? = null,
    val total: Int? = null,
)

// ── Newsletter ────────────────────────────────────────────────────────────
data class NewsletterSubscriberDto(
    val id: Long,
    val email: String,
    val name: String? = null,
    val status: String? = null,
    val createdAt: String? = null,
)

data class NewsletterListResponse(
    val items: List<NewsletterSubscriberDto>? = null,
    val data: List<NewsletterSubscriberDto>? = null,
    val total: Int? = null,
)

// ── Audit ─────────────────────────────────────────────────────────────────
data class AuditEntryDto(
    val id: Long,
    val entityType: String? = null,
    val entityId: Long? = null,
    val action: String? = null,
    val userId: Long? = null,
    val userName: String? = null,
    val description: String? = null,
    val createdAt: String? = null,
    val metadata: Any? = null,
)

data class AuditListResponse(
    val items: List<AuditEntryDto>? = null,
    val data: List<AuditEntryDto>? = null,
    val total: Int? = null,
    val page: Int? = null,
)

// ── Analytics ─────────────────────────────────────────────────────────────
data class AnalyticsKpiDto(
    val name: String? = null,
    val value: Double? = null,
    val unit: String? = null,
    val updatedAt: String? = null,
)

// ── Expenses ──────────────────────────────────────────────────────────────
data class ExpenseDto(
    val id: Long,
    val concepto: String? = null,
    val monto: Double? = null,
    val estatus: String? = null,
    val usuarioId: Long? = null,
    val createdAt: String? = null,
    val usuario: SimpleUserDto? = null,
)

data class ExpenseListResponse(
    val items: List<ExpenseDto>? = null,
    val data: List<ExpenseDto>? = null,
    val total: Int? = null,
)

// ── Fines ─────────────────────────────────────────────────────────────────
data class FineDto(
    val id: Long,
    val motivo: String? = null,
    val monto: Double? = null,
    val estatus: String? = null,
    val createdAt: String? = null,
    val usuario: SimpleUserDto? = null,
)

// ── Employee payments ─────────────────────────────────────────────────────
data class EmployeePaymentDto(
    val id: Long,
    val concepto: String? = null,
    val monto: Double? = null,
    val estatus: String? = null,
    val periodoInicio: String? = null,
    val periodoFin: String? = null,
    val createdAt: String? = null,
    val usuario: SimpleUserDto? = null,
)

// ── Lunch breaks ──────────────────────────────────────────────────────────
data class LunchBreakDto(
    val id: Long,
    val userId: Long? = null,
    val date: String? = null,
    val checkinTime: String? = null,
    val checkoutTime: String? = null,
    val status: String? = null,
    val isCheckinLate: Boolean? = null,
    val isCheckoutLate: Boolean? = null,
    val notes: String? = null,
    val checkinPhotoUrl: String? = null,
    val checkoutPhotoUrl: String? = null,
    val user: SimpleUserDto? = null,
)

data class LunchCheckinRequest(
    val checkinTime: String,
    val checkinPhotoUrl: String? = null,
)

data class LunchCheckoutRequest(
    val checkoutTime: String,
    val checkoutPhotoUrl: String? = null,
)

// ── Cotizaciones (quotes) ─────────────────────────────────────────────────
data class CotizacionDto(
    val id: Long,
    val folio: String? = null,
    val cliente: String? = null,
    val total: Double? = null,
    val estatus: String? = null,
    val fecha: String? = null,
    val createdAt: String? = null,
)

// ── Documents ─────────────────────────────────────────────────────────────
data class DocumentDto(
    val id: Long,
    val title: String? = null,
    val fileUrl: String? = null,
    val type: String? = null,
    val createdAt: String? = null,
)

// ── Accounting journal entries ────────────────────────────────────────────
data class JournalEntryDto(
    val id: Long,
    val description: String? = null,
    val totalDebit: Double? = null,
    val totalCredit: Double? = null,
    val entryDate: String? = null,
    val reference: String? = null,
    val status: String? = null,
)

data class InvoiceDto(
    val id: Long,
    val folio: String? = null,
    val clientName: String? = null,
    val total: Double? = null,
    val status: String? = null,
    val issueDate: String? = null,
)

data class BankAccountDto(
    val id: Long,
    val name: String? = null,
    val bank: String? = null,
    val accountNumber: String? = null,
    val balance: Double? = null,
    val currency: String? = null,
)

/**
 * Endpoints de módulos secundarios (news, contact-messages, newsletter, audit,
 * analytics, expenses, fines, employee-payments, cotizaciones, lunch-breaks,
 * documents, accounting). BaseURL ya incluye /api.
 *
 * Algunos endpoints devuelven array directo; otros devuelven paginación
 * { items, total, page, limit }. Los DTOs *ListResponse lo soportan y los
 * repos intentan ambos formatos.
 */
interface ExtraApi {

    // News
    @GET("news")
    suspend fun getNewsRaw(
        @Query("search") search: String? = null,
        @Query("status") status: String? = null,
    ): okhttp3.ResponseBody

    // Contact messages
    @GET("contact-messages")
    suspend fun getContactMessagesRaw(
        @Query("status") status: String? = null,
        @Query("category") category: String? = null,
    ): okhttp3.ResponseBody

    // Newsletter
    @GET("newsletter")
    suspend fun getNewsletterRaw(
        @Query("search") search: String? = null,
    ): okhttp3.ResponseBody

    // Audit
    @GET("audit")
    suspend fun getAuditRaw(
        @Query("entityType") entityType: String? = null,
        @Query("action") action: String? = null,
    ): okhttp3.ResponseBody

    // Analytics dashboard
    @GET("analytics/dashboard")
    suspend fun getAnalyticsDashboardRaw(): okhttp3.ResponseBody

    @GET("analytics/kpi/computed")
    suspend fun getAnalyticsComputedKpisRaw(): okhttp3.ResponseBody

    // Expenses
    @GET("expenses")
    suspend fun getExpensesRaw(): okhttp3.ResponseBody

    // Fines
    @GET("fines")
    suspend fun getFinesRaw(): okhttp3.ResponseBody

    // Employee payments
    @GET("employee-payments")
    suspend fun getEmployeePaymentsRaw(): okhttp3.ResponseBody

    // Cotizaciones
    @GET("cotizaciones")
    suspend fun getCotizacionesRaw(): okhttp3.ResponseBody

    // Lunch breaks
    @GET("lunch-breaks")
    suspend fun getLunchBreaksRaw(): okhttp3.ResponseBody

    @GET("lunch-breaks/my-breaks")
    suspend fun getMyLunchBreaksRaw(): okhttp3.ResponseBody

    @GET("lunch-breaks/users")
    suspend fun getUsersLunchBreaksRaw(): okhttp3.ResponseBody

    @POST("lunch-breaks/checkin")
    suspend fun postLunchCheckin(@Body body: LunchCheckinRequest): okhttp3.ResponseBody

    @PUT("lunch-breaks/checkout")
    suspend fun putLunchCheckout(@Body body: LunchCheckoutRequest): okhttp3.ResponseBody

    // Documents
    @GET("documents")
    suspend fun getDocumentsRaw(): okhttp3.ResponseBody

    // Accounting journal entries
    @GET("accounting/journal-entries")
    suspend fun getJournalEntriesRaw(): okhttp3.ResponseBody

    // Invoices
    @GET("accounting/invoices")
    suspend fun getInvoicesRaw(): okhttp3.ResponseBody

    // Banking accounts
    @GET("accounting/banking/accounts")
    suspend fun getBankAccountsRaw(): okhttp3.ResponseBody

    // HR
    @GET("hr/leaves")
    suspend fun getHrLeavesRaw(): okhttp3.ResponseBody

    @GET("hr/reviews")
    suspend fun getHrReviewsRaw(): okhttp3.ResponseBody

    @GET("hr/dashboard")
    suspend fun getHrDashboardRaw(): okhttp3.ResponseBody

    // Warehouse / Stock
    @GET("warehouse")
    suspend fun getWarehouseRaw(): okhttp3.ResponseBody

    @GET("stock")
    suspend fun getStockRaw(): okhttp3.ResponseBody

    // Procurement
    @GET("procurement/requisitions")
    suspend fun getRequisitionsRaw(): okhttp3.ResponseBody

    @GET("procurement/purchase-orders")
    suspend fun getPurchaseOrdersRaw(): okhttp3.ResponseBody

    @GET("procurement/goods-receipts")
    suspend fun getGoodsReceiptsRaw(): okhttp3.ResponseBody

    @GET("procurement/supplier-evaluations")
    suspend fun getSupplierEvaluationsRaw(): okhttp3.ResponseBody

    // Maintenance
    @GET("maintenance/assets")
    suspend fun getMaintenanceAssetsRaw(): okhttp3.ResponseBody

    @GET("maintenance/work-orders")
    suspend fun getWorkOrdersRaw(): okhttp3.ResponseBody

    // Service sheets
    @GET("service-sheets")
    suspend fun getServiceSheetsRaw(): okhttp3.ResponseBody

    // CVs
    @GET("cvs")
    suspend fun getCvsRaw(): okhttp3.ResponseBody

    // Client ticket requests (para ventas "leads"/admin "client-tickets")
    @GET("client-ticket-requests")
    suspend fun getClientTicketRequestsRaw(): okhttp3.ResponseBody

    // Projects (proyectos generales)
    @GET("projects")
    suspend fun getProjectsRaw(): okhttp3.ResponseBody

    // BI ejecutivo
    @GET("analytics/bi/margin-by-type")
    suspend fun getBiMarginRaw(): okhttp3.ResponseBody

    @GET("analytics/bi/engineers")
    suspend fun getBiEngineersRaw(@Query("limit") limit: Int = 10): okhttp3.ResponseBody

    @GET("analytics/bi/clients-roi")
    suspend fun getBiClientsRoiRaw(@Query("limit") limit: Int = 10): okhttp3.ResponseBody

    @GET("executive/c-level")
    suspend fun getExecutiveCLevelRaw(): okhttp3.ResponseBody

    @GET("workflow/my-pending")
    suspend fun getWorkflowPendingRaw(): okhttp3.ResponseBody

    @retrofit2.http.POST("workflow/approvals/{id}/decide")
    suspend fun postWorkflowDecide(
        @retrofit2.http.Path("id") id: Long,
        @retrofit2.http.Body body: WorkflowDecideRequest,
    ): okhttp3.ResponseBody

    @GET("noc/summary")
    suspend fun getNocSummaryRaw(): okhttp3.ResponseBody

    @GET("noc/alerts")
    suspend fun getNocAlertsRaw(): okhttp3.ResponseBody

    @GET("noc/devices")
    suspend fun getNocDevicesRaw(): okhttp3.ResponseBody

    @GET("sla/stats")
    suspend fun getSlaStatsRaw(): okhttp3.ResponseBody

    @GET("maintenance-contracts")
    suspend fun getMaintenanceContractsRaw(@Query("status") status: String? = null): okhttp3.ResponseBody
}

data class WorkflowDecideRequest(
    val decision: String,
    val comments: String? = null,
)
