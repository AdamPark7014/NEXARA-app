package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
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
    val montoSolicitado: Double? = null,
    val estatus: String? = null,
    val estatusPago: String? = null,
    val categoria: String? = null,
    val usuarioId: Long? = null,
    val createdAt: String? = null,
    val ticketEvidenciaUrl: String? = null,
    val usuario: SimpleUserDto? = null,
) {
    fun displayAmount(): Double = monto ?: montoSolicitado ?: 0.0
    fun displayStatus(): String = estatusPago ?: estatus ?: "—"
}

data class CreateExpenseRequest(
    val concepto: String,
    val monto: Double,
    val categoria: String? = null,
    val ticketEvidenciaUrl: String? = null,
)

data class ExpenseApproveRequest(
    val action: String,
    val note: String? = null,
)

/** Movimiento de inventario — POST /stock/movements */
data class StockMovementRequest(
    val type: String,
    val productId: Long,
    val quantity: Double,
    val fromWarehouseId: Long? = null,
    val toWarehouseId: Long? = null,
    val unitCost: Double? = null,
    val reference: String? = null,
    val notes: String? = null,
)

/** Bodega — GET /warehouse */
data class WarehouseDto(
    val id: Long? = null,
    val code: String = "",
    val name: String = "",
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val isActive: Boolean = true,
    val managerName: String? = null,
    val locationsCount: Int = 0,
    val stockLevelsCount: Int = 0,
) {
    val label: String
        get() = when {
            name.isNotBlank() && code.isNotBlank() -> "$name ($code)"
            name.isNotBlank() -> name
            code.isNotBlank() -> code
            else -> "Bodega"
        }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("code", code)
        put("name", name)
        put("nombre", name)
        put("address", address)
        put("city", city)
        put("state", state)
        put("isActive", isActive)
        put("managerName", managerName)
        put("locationsCount", locationsCount)
        put("stockLevelsCount", stockLevelsCount)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): WarehouseDto {
            @Suppress("UNCHECKED_CAST")
            val manager = row["manager"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val count = row["_count"] as? Map<String, Any?>
            fun str(vararg keys: Any?): String {
                for (v in keys) {
                    when (v) {
                        is String -> if (v.isNotBlank() && v != "null") return v
                        is Number -> return v.toString()
                    }
                }
                return ""
            }
            fun lng(vararg keys: Any?): Long? {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toLong()
                        is String -> v.toLongOrNull()?.let { return it }
                    }
                }
                return null
            }
            fun int(vararg keys: Any?): Int {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toInt()
                        is String -> v.toIntOrNull()?.let { return it }
                    }
                }
                return 0
            }
            fun bool(vararg keys: Any?): Boolean {
                for (v in keys) {
                    when (v) {
                        is Boolean -> return v
                        is String -> return v.equals("true", true)
                    }
                }
                return true
            }
            return WarehouseDto(
                id = lng(row["id"]),
                code = str(row["code"], row["codigo"]),
                name = str(row["name"], row["nombre"]),
                address = str(row["address"], row["direccion"]).ifBlank { null },
                city = str(row["city"], row["ciudad"]).ifBlank { null },
                state = str(row["state"], row["estado"]).ifBlank { null },
                isActive = bool(row["isActive"], row["activo"]),
                managerName = str(manager?.get("nombre"), manager?.get("name"), row["managerName"]).ifBlank { null },
                locationsCount = int(count?.get("locations"), row["locationsCount"]),
                stockLevelsCount = int(count?.get("stockLevels"), row["stockLevelsCount"]),
            )
        }
    }
}

/** Producto de catálogo — GET /catalog/products */
data class CatalogProductDto(
    val id: Long? = null,
    val name: String = "",
    val sku: String = "",
    val category: String? = null,
    val price: Double? = null,
    val unit: String? = null,
    val isActive: Boolean = true,
) {
    val label: String
        get() = if (sku.isNotBlank()) "$name ($sku)" else name.ifBlank { "Producto" }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("productId", id)
        put("name", name)
        put("productName", name)
        put("nombre", name)
        put("sku", sku)
        put("code", sku)
        put("category", category)
        put("price", price)
        put("unit", unit)
        put("isActive", isActive)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): CatalogProductDto {
            fun str(vararg keys: Any?): String {
                for (v in keys) {
                    when (v) {
                        is String -> if (v.isNotBlank() && v != "null") return v
                        is Number -> return v.toString()
                    }
                }
                return ""
            }
            fun lng(vararg keys: Any?): Long? {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toLong()
                        is String -> v.toLongOrNull()?.let { return it }
                    }
                }
                return null
            }
            fun num(vararg keys: Any?): Double? {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toDouble()
                        is String -> v.toDoubleOrNull()?.let { return it }
                    }
                }
                return null
            }
            fun bool(vararg keys: Any?): Boolean {
                for (v in keys) {
                    when (v) {
                        is Boolean -> return v
                        is String -> return v.equals("true", true)
                    }
                }
                return true
            }
            return CatalogProductDto(
                id = lng(row["id"], row["productId"]),
                name = str(row["name"], row["nombre"], row["productName"]),
                sku = str(row["sku"], row["code"], row["codigo"]),
                category = str(row["category"], row["categoria"]).ifBlank { null },
                price = num(row["price"], row["precio"], row["unitPrice"]),
                unit = str(row["unit"], row["unidad"]).ifBlank { null },
                isActive = bool(row["isActive"], row["activo"]),
            )
        }
    }
}

/** Nivel de stock aplanado para UI WMS (product/warehouse anidados → campos planos). */
data class StockLevelDto(
    val id: Long? = null,
    val productId: Long? = null,
    val warehouseId: Long? = null,
    val name: String = "",
    val sku: String = "",
    val quantity: Double = 0.0,
    val reorderPoint: Double? = null,
    val minStock: Double? = null,
    val warehouseName: String? = null,
    val location: String? = null,
    val category: String? = null,
    val price: Double? = null,
) {
    val isLow: Boolean
        get() {
            val threshold = reorderPoint ?: minStock ?: return false
            return threshold > 0 && quantity <= threshold
        }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("productId", productId)
        put("warehouseId", warehouseId)
        put("name", name)
        put("productName", name)
        put("sku", sku)
        put("code", sku)
        put("quantity", quantity)
        put("cantidad", quantity)
        put("reorderPoint", reorderPoint)
        put("minStock", minStock ?: reorderPoint)
        put("warehouseName", warehouseName)
        put("bodega", warehouseName)
        put("ubicacion", location ?: warehouseName)
        put("location", location)
        put("category", category)
        put("price", price)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): StockLevelDto {
            @Suppress("UNCHECKED_CAST")
            val product = row["product"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val warehouse = row["warehouse"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val locationObj = row["location"] as? Map<String, Any?>

            val name = firstStr(
                product?.get("name"), product?.get("nombre"),
                row["name"], row["productName"], row["nombre"],
            )
            val sku = firstStr(product?.get("sku"), product?.get("code"), row["sku"], row["code"])
            val whName = firstStr(warehouse?.get("name"), warehouse?.get("nombre"), row["warehouseName"], row["bodega"])
            val loc = firstStr(
                locationObj?.get("code"), locationObj?.get("name"),
                row["location"]?.takeIf { it !is Map<*, *> },
            )
            val qty = firstNum(row["quantity"], row["cantidad"]) ?: 0.0
            val reorder = firstNum(row["reorderPoint"], row["minStock"])
            return StockLevelDto(
                id = firstLong(row["id"]),
                productId = firstLong(product?.get("id"), row["productId"]),
                warehouseId = firstLong(warehouse?.get("id"), row["warehouseId"]),
                name = name,
                sku = sku,
                quantity = qty,
                reorderPoint = reorder,
                minStock = firstNum(row["minStock"]) ?: reorder,
                warehouseName = whName.ifBlank { null },
                location = loc.ifBlank { null },
                category = firstStr(product?.get("category"), product?.get("categoria"), row["category"]).ifBlank { null },
                price = firstNum(product?.get("price"), row["price"]),
            )
        }

        private fun firstStr(vararg values: Any?): String {
            for (v in values) {
                when (v) {
                    is String -> if (v.isNotBlank() && v != "null") return v
                    is Number -> return v.toString()
                }
            }
            return ""
        }

        private fun firstNum(vararg values: Any?): Double? {
            for (v in values) {
                when (v) {
                    is Number -> return v.toDouble()
                    is String -> v.toDoubleOrNull()?.let { return it }
                }
            }
            return null
        }

        private fun firstLong(vararg values: Any?): Long? {
            for (v in values) {
                when (v) {
                    is Number -> return v.toLong()
                    is String -> v.toLongOrNull()?.let { return it }
                }
            }
            return null
        }
    }
}

/** Movimiento de inventario leído de GET /stock/movements */
data class StockMovementDto(
    val id: Long? = null,
    val type: String = "",
    val productId: Long? = null,
    val productName: String = "",
    val sku: String = "",
    val quantity: Double = 0.0,
    val fromWarehouseId: Long? = null,
    val toWarehouseId: Long? = null,
    val fromWarehouseName: String? = null,
    val toWarehouseName: String? = null,
    val reference: String? = null,
    val notes: String? = null,
    val createdAt: String? = null,
) {
    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("type", type)
        put("productId", productId)
        put("name", productName)
        put("productName", productName)
        put("sku", sku)
        put("quantity", quantity)
        put("fromWarehouseId", fromWarehouseId)
        put("toWarehouseId", toWarehouseId)
        put("fromWarehouseName", fromWarehouseName)
        put("toWarehouseName", toWarehouseName)
        put("reference", reference)
        put("notes", notes)
        put("createdAt", createdAt)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): StockMovementDto {
            @Suppress("UNCHECKED_CAST")
            val product = row["product"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val fromWh = row["fromWarehouse"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val toWh = row["toWarehouse"] as? Map<String, Any?>
            fun str(vararg keys: Any?): String {
                for (v in keys) {
                    when (v) {
                        is String -> if (v.isNotBlank() && v != "null") return v
                        is Number -> return v.toString()
                    }
                }
                return ""
            }
            fun num(vararg keys: Any?): Double? {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toDouble()
                        is String -> v.toDoubleOrNull()?.let { return it }
                    }
                }
                return null
            }
            fun lng(vararg keys: Any?): Long? {
                for (v in keys) {
                    when (v) {
                        is Number -> return v.toLong()
                        is String -> v.toLongOrNull()?.let { return it }
                    }
                }
                return null
            }
            return StockMovementDto(
                id = lng(row["id"]),
                type = str(row["type"], row["movementType"]),
                productId = lng(product?.get("id"), row["productId"]),
                productName = str(product?.get("name"), row["productName"], row["name"]),
                sku = str(product?.get("sku"), row["sku"]),
                quantity = num(row["quantity"], row["cantidad"]) ?: 0.0,
                fromWarehouseId = lng(fromWh?.get("id"), row["fromWarehouseId"]),
                toWarehouseId = lng(toWh?.get("id"), row["toWarehouseId"]),
                fromWarehouseName = str(fromWh?.get("name"), row["fromWarehouseName"]).ifBlank { null },
                toWarehouseName = str(toWh?.get("name"), row["toWarehouseName"]).ifBlank { null },
                reference = str(row["reference"], row["ref"]).ifBlank { null },
                notes = str(row["notes"]).ifBlank { null },
                createdAt = str(row["createdAt"], row["date"]).ifBlank { null },
            )
        }
    }
}

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
    val pdfUrl: String? = null,
    val balance: Double? = null,
    val matchStatus: String? = null,
)

data class InvoicePaymentRequest(
    val amount: Double,
    val paymentDate: String,
    val method: String? = null,
    val reference: String? = null,
    val notes: String? = null,
)

data class InvoiceMatchWaiveRequest(
    val notes: String? = null,
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

    @retrofit2.http.POST("expenses")
    suspend fun createExpense(
        @retrofit2.http.Body body: CreateExpenseRequest,
    ): ExpenseDto

    @PATCH("expenses/{id}/approve")
    suspend fun approveExpense(
        @Path("id") id: Long,
        @retrofit2.http.Body body: ExpenseApproveRequest,
    ): okhttp3.ResponseBody

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

    @GET("accounting/invoices/{id}")
    suspend fun getInvoiceRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @retrofit2.http.POST("accounting/invoices/{id}/payments")
    suspend fun registerInvoicePayment(
        @Path("id") id: Long,
        @Body body: InvoicePaymentRequest,
    ): okhttp3.ResponseBody

    @retrofit2.http.POST("accounting/invoices/{id}/match/evaluate")
    suspend fun evaluateInvoiceMatch(@Path("id") id: Long): okhttp3.ResponseBody

    @retrofit2.http.POST("accounting/invoices/{id}/match/waive")
    suspend fun waiveInvoiceMatch(
        @Path("id") id: Long,
        @Body body: InvoiceMatchWaiveRequest,
    ): okhttp3.ResponseBody

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

    @GET("stock/levels")
    suspend fun getStockLevelsRaw(
        @Query("warehouseId") warehouseId: Long? = null,
        @Query("belowReorder") belowReorder: Boolean? = null,
    ): okhttp3.ResponseBody

    @GET("stock/alerts/low-stock")
    suspend fun getLowStockAlertsRaw(): okhttp3.ResponseBody

    @GET("stock/movements")
    suspend fun getStockMovementsRaw(
        @Query("warehouseId") warehouseId: Long? = null,
        @Query("productId") productId: Long? = null,
        @Query("type") type: String? = null,
    ): okhttp3.ResponseBody

    @POST("stock/movements")
    suspend fun createStockMovement(
        @Body body: StockMovementRequest,
    ): okhttp3.ResponseBody

    @GET("catalog/products")
    suspend fun getCatalogProductsRaw(
        @Query("take") take: Int = 200,
    ): okhttp3.ResponseBody

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
    suspend fun getMaintenanceContractsRaw(@Query("status") status: String? = null, @Query("clientId") clientId: String? = null): okhttp3.ResponseBody

    @GET("service-clients/{id}/branches")
    suspend fun getServiceClientBranchesRaw(@retrofit2.http.Path("id") id: String): okhttp3.ResponseBody

    // Gobierno corporativo
    @GET("company/list")
    suspend fun getCompaniesRaw(): okhttp3.ResponseBody

    @GET("kb/articles")
    suspend fun getKbArticlesRaw(@Query("q") q: String? = null): okhttp3.ResponseBody

    @GET("kb/articles/{slugOrId}")
    suspend fun getKbArticleRaw(@retrofit2.http.Path("slugOrId") slugOrId: String): okhttp3.ResponseBody

    @GET("users/orgchart")
    suspend fun getOrgchartRaw(): okhttp3.ResponseBody

    @GET("users/hr-staff")
    suspend fun getHrStaffRaw(
        @Query("limit") limit: Int = 100,
        @Query("page") page: Int = 1,
    ): okhttp3.ResponseBody

    @GET("calendar/events")
    suspend fun getCalendarEventsRaw(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): okhttp3.ResponseBody

    @GET("exports/{entity}")
    suspend fun getExportRaw(
        @retrofit2.http.Path("entity") entity: String,
        @Query("from") from: String?,
        @Query("to") to: String?,
    ): okhttp3.ResponseBody
}

data class WorkflowDecideRequest(
    val decision: String,
    val comments: String? = null,
)
