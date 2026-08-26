package mx.nexara.mobile.nativeapp.data.api

import com.squareup.moshi.Json
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class StockByWarehouseDto(
    val code: String = "",
    val qty: Int = 0,
    val label: String? = null,
    val city: String? = null,
)

data class SmartOfferDto(
    val id: Long = 0,
    val clave: String? = null,
    val numParte: String? = null,
    val nombre: String? = null,
    val modelo: String? = null,
    val marca: String? = null,
    val categoria: String? = null,
    val precio: Double = 0.0,
    val costMxn: Double = 0.0,
    val stockTotal: Int = 0,
    val stockPreferred: Int = 0,
    val stockByWarehouse: List<StockByWarehouseDto>? = null,
    val leadTimeDays: Int = 0,
    val promociones: List<Map<String, Any?>>? = null,
    val sellPriceSuggested: Double = 0.0,
    val marginPercent: Double = 0.0,
    val imagen: String? = null,
    val badges: List<String>? = null,
)

data class SmartSearchResponse(
    val data: List<SmartOfferDto> = emptyList(),
    val meta: SmartSearchMeta? = null,
)

data class SmartSearchMeta(
    val totalCandidates: Int = 0,
    val mode: String? = null,
)

data class SmartCtStatusDto(
    val total: Int = 0,
    val active: Int = 0,
    val withStock: Int = 0,
)

data class CreateCotizacionItemBody(
    val name: String,
    val qty: Int,
    val unitPrice: Double,
    val discount: Double = 0.0,
    val tax: Double = 16.0,
    val description: String? = null,
    val category: String? = null,
    val brand: String? = null,
    val model: String? = null,
    val sku: String? = null,
    val partNumber: String? = null,
    val unitCost: Double? = null,
    val supplierCode: String? = null,
    val productCtId: Long? = null,
    val supplierSku: String? = null,
    val marginPercent: Double? = null,
    val stockSnapshot: Int? = null,
    val leadTimeDays: Int? = null,
    val optimizationMode: String? = null,
)

data class CreateCotizacionBody(
    val quoteNumber: String,
    val issueDate: String,
    val validUntil: String,
    val clientName: String,
    val clientCompany: String? = null,
    val projectName: String? = null,
    val currency: String = "MXN",
    val status: String = "DRAFT",
    val items: List<CreateCotizacionItemBody>,
)

data class CreateCotizacionResponse(
    val id: Long? = null,
    @Json(name = "quoteNumber") val quoteNumber: String? = null,
)

data class SupplierStatRowDto(
    val supplierCode: String = "",
    val label: String = "",
    val lineCount: Int = 0,
    val quoteCount: Int = 0,
    val costNet: Double = 0.0,
    val sellNet: Double = 0.0,
    val taxAmount: Double = 0.0,
    val sellWithTax: Double = 0.0,
    val marginAmount: Double = 0.0,
    val marginPercent: Double = 0.0,
    val priceIncludesTax: Boolean = false,
    val customerTaxPercent: Double = 16.0,
)

data class SupplierStatsTotalsDto(
    val quoteCount: Int = 0,
    val costNet: Double = 0.0,
    val sellNet: Double = 0.0,
    val taxAmount: Double = 0.0,
    val sellWithTax: Double = 0.0,
    val marginAmount: Double = 0.0,
    val marginPercent: Double = 0.0,
)

data class SupplierStatsResponseDto(
    val suppliers: List<SupplierStatRowDto> = emptyList(),
    val totals: SupplierStatsTotalsDto? = null,
)

data class CtOrderLineDto(
    val clave: String? = null,
    val nombre: String = "",
    val qty: Int = 0,
    val unitCost: Double = 0.0,
    val unitSell: Double = 0.0,
    val lineCost: Double = 0.0,
    val lineSell: Double = 0.0,
    val marginPercent: Double? = null,
)

data class CtOrderPreviewDto(
    val lines: List<CtOrderLineDto> = emptyList(),
    val subtotalCost: Double = 0.0,
    val subtotalSell: Double = 0.0,
    val marginAmount: Double = 0.0,
    val quoteStatus: String = "",
    val existingOrders: List<CtSupplierOrderDto> = emptyList(),
)

data class CtSupplierOrderDto(
    val id: Long = 0L,
    val status: String = "",
    val externalFolio: String? = null,
)

data class CtOrderSubmitBody(
    val almacen: String,
    val confirmNow: Boolean = false,
)

data class SmartFacetDto(
    val name: String? = null,
    val count: Int = 0,
)

data class SmartFacetsResponseDto(
    val brands: List<SmartFacetDto> = emptyList(),
    val categories: List<SmartFacetDto> = emptyList(),
)

data class LaborSuggestItemDto(
    val code: String = "",
    val name: String = "",
    val category: String = "",
    val qty: Int = 1,
    val unitPrice: Double = 0.0,
    val unitCost: Double = 0.0,
    val laborHours: Double = 0.0,
    val laborRate: Double = 0.0,
    val reason: String = "",
)

data class MarginCheckDto(
    val ok: Boolean = true,
    val marginPercent: Double = 0.0,
    val minRequired: Double = 0.0,
    val requiresApproval: Boolean = false,
    val ruleName: String? = null,
    val message: String? = null,
)

data class CommercialRuleDto(
    val id: Int = 0,
    val name: String = "",
    val scope: String = "GLOBAL",
    val scopeValue: String? = null,
    val minMarginPercent: Double? = null,
    val maxDiscountPercent: Double? = null,
    val requiresApproval: Boolean = true,
    val active: Boolean = true,
)

data class LogisticsZoneDto(
    val zoneCode: String = "",
    val zoneName: String = "",
    val baseCost: Double = 0.0,
    val basePrice: Double = 0.0,
    val active: Boolean = true,
)

data class CopilotHardwareLineDto(
    val name: String = "",
    val qty: Int = 1,
    val unitPrice: Double = 0.0,
    val unitCost: Double = 0.0,
    val brand: String? = null,
    val sku: String? = null,
    val supplierCode: String? = null,
    val productCtId: Long? = null,
    val marginPercent: Double? = null,
)

data class CopilotProposalDto(
    val hardware: List<CopilotHardwareLineDto> = emptyList(),
    val notes: List<String> = emptyList(),
)

data class CopilotDraftDto(
    val proposal: CopilotProposalDto? = null,
    val disclaimer: String? = null,
)

data class LaborSuggestBody(
    val lines: List<Map<String, Any?>>,
)

data class MarginCheckBody(
    val unitCost: Double,
    val unitPrice: Double,
    val discountPercent: Double = 0.0,
    val category: String? = null,
    val brand: String? = null,
)

data class CopilotDraftBody(
    val prompt: String,
)

data class ConfigureSolutionBody(
    val template: String,
    val cameras: Int? = null,
    val storageDays: Int? = null,
    val accessPoints: Int? = null,
    val doors: Int? = null,
    val optimize: String = "BALANCE",
    val targetMarginPercent: Int = 30,
    val logisticsZone: String? = null,
    val includeLabor: Boolean = true,
)

data class ConfigureSolutionResponse(
    val hardware: List<CopilotHardwareLineDto> = emptyList(),
    val labor: List<LaborSuggestItemDto> = emptyList(),
    val logistics: CopilotHardwareLineDto? = null,
    val notes: List<String> = emptyList(),
)

interface SmartQuoteApi {
    @GET("smart-quote/search")
    suspend fun search(
        @Query("q") q: String? = null,
        @Query("brand") brand: String? = null,
        @Query("category") category: String? = null,
        @Query("optimize") optimize: String? = "BALANCE",
        @Query("targetMargin") targetMargin: Int? = 30,
        @Query("inStockOnly") inStockOnly: String? = "1",
        @Query("take") take: Int? = 40,
    ): SmartSearchResponse

    @GET("smart-quote/facets")
    suspend fun facets(): SmartFacetsResponseDto

    @GET("smart-quote/substitutes/{clave}")
    suspend fun substitutes(
        @Path("clave") clave: String,
        @Query("optimize") optimize: String? = "BALANCE",
        @Query("targetMargin") targetMargin: Int? = 30,
    ): List<SmartOfferDto>

    @POST("smart-quote/labor/suggest")
    suspend fun laborSuggest(@Body body: LaborSuggestBody): List<LaborSuggestItemDto>

    @GET("smart-quote/rules")
    suspend fun marginRules(): List<CommercialRuleDto>

    @GET("smart-quote/logistics")
    suspend fun logisticsZones(): List<LogisticsZoneDto>

    @POST("smart-quote/rules/check-margin")
    suspend fun checkMargin(@Body body: MarginCheckBody): MarginCheckDto

    @POST("smart-quote/copilot/draft")
    suspend fun copilotDraft(@Body body: CopilotDraftBody): CopilotDraftDto

    @POST("smart-quote/configure")
    suspend fun configure(@Body body: ConfigureSolutionBody): ConfigureSolutionResponse

    @GET("smart-quote/ct/status")
    suspend fun ctStatus(): SmartCtStatusDto

    @GET("smart-quote/supplier-stats")
    suspend fun supplierStats(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("status") status: String? = null,
    ): SupplierStatsResponseDto

    @GET("smart-quote/ct/orders/preview/{cotizacionId}")
    suspend fun ctOrderPreview(@Path("cotizacionId") cotizacionId: Long): CtOrderPreviewDto

    @POST("smart-quote/ct/orders/{cotizacionId}")
    suspend fun ctOrderSubmit(
        @Path("cotizacionId") cotizacionId: Long,
        @Body body: CtOrderSubmitBody,
    ): Map<String, Any?>

    @POST("smart-quote/ct/orders/confirm/{orderId}")
    suspend fun ctOrderConfirm(
        @Path("orderId") orderId: Long,
    ): Map<String, Any?>

    @POST("cotizaciones")
    suspend fun createCotizacion(@Body body: CreateCotizacionBody): CreateCotizacionResponse
}
