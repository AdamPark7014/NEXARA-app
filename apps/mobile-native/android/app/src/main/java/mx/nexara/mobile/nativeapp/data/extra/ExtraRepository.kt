package mx.nexara.mobile.nativeapp.data.extra

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.AuditEntryDto
import mx.nexara.mobile.nativeapp.data.api.BankAccountDto
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.DocumentDto
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentDto
import mx.nexara.mobile.nativeapp.data.api.ExpenseDto
import mx.nexara.mobile.nativeapp.data.api.ExtraApi
import mx.nexara.mobile.nativeapp.data.api.FineDto
import mx.nexara.mobile.nativeapp.data.api.InvoiceDto
import mx.nexara.mobile.nativeapp.data.api.JournalEntryDto
import mx.nexara.mobile.nativeapp.data.api.LunchBreakDto
import mx.nexara.mobile.nativeapp.data.api.LunchCheckinRequest
import mx.nexara.mobile.nativeapp.data.api.LunchCheckoutRequest
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.api.NewsletterSubscriberDto
import mx.nexara.mobile.nativeapp.data.api.WorkflowStepDto
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

    suspend fun expenses(): List<ExpenseDto> = parseList(api.getExpensesRaw())
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
    suspend fun bankAccounts(): List<BankAccountDto> = parseList(api.getBankAccountsRaw())
    suspend fun workflow(): List<WorkflowStepDto> = parseList(api.getWorkflowRaw())

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

    suspend fun hrLeaves() = loadGeneric { api.getHrLeavesRaw() }
    suspend fun hrReviews() = loadGeneric { api.getHrReviewsRaw() }
    suspend fun hrDashboardRaw(): String = api.getHrDashboardRaw().string()
    suspend fun safetyIncidents() = loadGeneric { api.getSafetyIncidentsRaw() }
    suspend fun safetyPermits() = loadGeneric { api.getSafetyPermitsRaw() }
    suspend fun safetyTraining() = loadGeneric { api.getSafetyTrainingRaw() }
    suspend fun warehouse() = loadGeneric { api.getWarehouseRaw() }
    suspend fun stock() = loadGeneric { api.getStockRaw() }
    suspend fun requisitions() = loadGeneric { api.getRequisitionsRaw() }
    suspend fun purchaseOrders() = loadGeneric { api.getPurchaseOrdersRaw() }
    suspend fun goodsReceipts() = loadGeneric { api.getGoodsReceiptsRaw() }
    suspend fun supplierEvaluations() = loadGeneric { api.getSupplierEvaluationsRaw() }
    suspend fun production() = loadGeneric { api.getProductionRaw() }
    suspend fun bom() = loadGeneric { api.getBomRaw() }
    suspend fun maintenanceAssets() = loadGeneric { api.getMaintenanceAssetsRaw() }
    suspend fun workOrders() = loadGeneric { api.getWorkOrdersRaw() }
    suspend fun inspections() = loadGeneric { api.getInspectionsRaw() }
    suspend fun ncr() = loadGeneric { api.getNcrRaw() }
    suspend fun serviceSheets() = loadGeneric { api.getServiceSheetsRaw() }
    suspend fun cvs() = loadGeneric { api.getCvsRaw() }
    suspend fun clientTicketRequests() = loadGeneric { api.getClientTicketRequestsRaw() }
    suspend fun projects() = loadGeneric { api.getProjectsRaw() }
}
