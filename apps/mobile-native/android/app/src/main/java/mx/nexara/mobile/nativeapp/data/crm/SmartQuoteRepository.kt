package mx.nexara.mobile.nativeapp.data.crm

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ConfigureSolutionResponse
import mx.nexara.mobile.nativeapp.data.api.CopilotDraftDto
import mx.nexara.mobile.nativeapp.data.api.CreateCotizacionBody
import mx.nexara.mobile.nativeapp.data.api.CreateCotizacionItemBody
import mx.nexara.mobile.nativeapp.data.api.CtOrderPreviewDto
import mx.nexara.mobile.nativeapp.data.api.LaborSuggestBody
import mx.nexara.mobile.nativeapp.data.api.LaborSuggestItemDto
import mx.nexara.mobile.nativeapp.data.api.CommercialRuleDto
import mx.nexara.mobile.nativeapp.data.api.LogisticsZoneDto
import mx.nexara.mobile.nativeapp.data.api.MarginCheckBody
import mx.nexara.mobile.nativeapp.data.api.MarginCheckDto
import mx.nexara.mobile.nativeapp.data.api.SmartFacetsResponseDto
import mx.nexara.mobile.nativeapp.data.api.SmartOfferDto
import mx.nexara.mobile.nativeapp.data.api.SmartQuoteApi
import mx.nexara.mobile.nativeapp.data.api.SupplierStatsResponseDto

class SmartQuoteRepository(context: Context) {
    private val api: SmartQuoteApi =
        ApiClient.authed { AuthRepository(context).token() }.create(SmartQuoteApi::class.java)

    suspend fun search(
        query: String,
        margin: Int = 30,
        optimize: String = "BALANCE",
        brand: String? = null,
        category: String? = null,
    ): List<SmartOfferDto> {
        if (query.isBlank() && brand.isNullOrBlank() && category.isNullOrBlank()) return emptyList()
        return api.search(
            q = query.trim().ifBlank { null },
            brand = brand?.takeIf { it.isNotBlank() },
            category = category?.takeIf { it.isNotBlank() },
            optimize = optimize,
            targetMargin = margin,
            take = 40,
        ).data
    }

    suspend fun facets(): SmartFacetsResponseDto = api.facets()

    suspend fun substitutes(clave: String, margin: Int = 30, optimize: String = "BALANCE"): List<SmartOfferDto> =
        api.substitutes(clave, optimize, margin)

    suspend fun laborSuggest(cart: List<QuoteCartLine>): List<LaborSuggestItemDto> {
        val lines = cart.map {
            mapOf(
                "name" to it.name,
                "qty" to it.qty,
                "category" to (it.brand ?: "CT"),
            )
        }
        return api.laborSuggest(LaborSuggestBody(lines))
    }

    suspend fun marginRules(): List<CommercialRuleDto> = runCatching { api.marginRules() }.getOrDefault(emptyList())

    suspend fun logisticsZones(): List<LogisticsZoneDto> = runCatching { api.logisticsZones() }.getOrDefault(emptyList())

    suspend fun checkMargin(
        unitCost: Double,
        unitPrice: Double,
        category: String? = null,
        brand: String? = null,
    ): MarginCheckDto =
        api.checkMargin(
            MarginCheckBody(
                unitCost = unitCost,
                unitPrice = unitPrice,
                category = category,
                brand = brand,
            ),
        )

    suspend fun copilotDraft(prompt: String): CopilotDraftDto =
        api.copilotDraft(mx.nexara.mobile.nativeapp.data.api.CopilotDraftBody(prompt))

    suspend fun configureSolution(
        template: String,
        cameras: Int? = null,
        storageDays: Int? = null,
        accessPoints: Int? = null,
        doors: Int? = null,
        margin: Int = 30,
        optimize: String = "BALANCE",
        logisticsZone: String? = null,
    ): ConfigureSolutionResponse =
        api.configure(
            mx.nexara.mobile.nativeapp.data.api.ConfigureSolutionBody(
                template = template,
                cameras = cameras,
                storageDays = storageDays,
                accessPoints = accessPoints,
                doors = doors,
                optimize = optimize,
                targetMarginPercent = margin,
                logisticsZone = logisticsZone,
                includeLabor = true,
            ),
        )

    suspend fun ctProductCount(): Int = runCatching { api.ctStatus().total }.getOrDefault(0)

    suspend fun supplierStats(from: String? = null, to: String? = null): SupplierStatsResponseDto =
        api.supplierStats(from = from, to = to)

    suspend fun ctOrderPreview(cotizacionId: Long): CtOrderPreviewDto =
        api.ctOrderPreview(cotizacionId)

    suspend fun submitCtOrder(cotizacionId: Long, almacen: String, confirmNow: Boolean = false) {
        api.ctOrderSubmit(cotizacionId, mx.nexara.mobile.nativeapp.data.api.CtOrderSubmitBody(almacen, confirmNow))
    }

    suspend fun confirmCtOrder(orderId: Long) {
        api.ctOrderConfirm(orderId)
    }

    suspend fun createQuote(
        clientName: String,
        projectName: String?,
        lines: List<QuoteCartLine>,
        optimizeMode: String = "BALANCE",
    ): Long {
        val now = java.time.LocalDate.now()
        val quoteNumber = "NXR-${now.year}-${System.currentTimeMillis().toString().takeLast(6)}"
        val body = CreateCotizacionBody(
            quoteNumber = quoteNumber,
            issueDate = now.toString(),
            validUntil = now.plusDays(15).toString(),
            clientName = clientName,
            clientCompany = clientName,
            projectName = projectName?.takeIf { it.isNotBlank() },
            items = lines.map { l ->
                CreateCotizacionItemBody(
                    name = l.name,
                    qty = l.qty,
                    unitPrice = l.unitPrice,
                    discount = 0.0,
                    tax = 16.0,
                    category = if (l.isLabor) "LABOR" else l.brand,
                    brand = l.brand,
                    model = l.model,
                    sku = l.sku,
                    partNumber = l.partNumber,
                    unitCost = l.unitCost,
                    supplierCode = if (l.productCtId != null) "CT" else l.supplierCode,
                    productCtId = l.productCtId,
                    supplierSku = l.sku,
                    marginPercent = l.marginPercent,
                    stockSnapshot = l.stockSnapshot,
                    optimizationMode = optimizeMode,
                )
            },
        )
        val res = api.createCotizacion(body)
        return res.id ?: throw IllegalStateException("Cotización sin ID")
    }
}

data class QuoteCartLine(
    val productCtId: Long?,
    val name: String,
    val category: String? = null,
    val brand: String?,
    val model: String?,
    val sku: String?,
    val partNumber: String?,
    val qty: Int,
    val unitCost: Double,
    val unitPrice: Double,
    val marginPercent: Double,
    val stockSnapshot: Int?,
    val isLabor: Boolean = false,
    val supplierCode: String? = null,
)
