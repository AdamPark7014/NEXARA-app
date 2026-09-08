package mx.nexara.mobile.nativeapp.data.procurement

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.GoodsReceiptDetailDto
import mx.nexara.mobile.nativeapp.data.api.ProcurementApi
import mx.nexara.mobile.nativeapp.data.api.PurchaseOrderDetailDto
import mx.nexara.mobile.nativeapp.data.api.RfqAwardBody
import mx.nexara.mobile.nativeapp.data.api.RfqComparisonDto
import mx.nexara.mobile.nativeapp.data.api.RfqDto
import mx.nexara.mobile.nativeapp.data.api.RfqQuoteBody
import mx.nexara.mobile.nativeapp.data.api.SupplierDto
import java.lang.reflect.ParameterizedType

/**
 * Compras — profundidad que hasta ahora sólo tenía la web.
 *
 * Se separa de `ExtraRepository` a propósito: ese ya pasa de 750 líneas y
 * mezcla veinte dominios. Aquí sólo vive el ciclo de compra.
 */
class ProcurementRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ProcurementApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ProcurementApi::class.java)

    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val mapType: ParameterizedType = Types.newParameterizedType(
        Map::class.java,
        String::class.java,
        Any::class.java,
    )

    /** Objeto suelto; devuelve mapa vacío si la respuesta no es un objeto JSON. */
    private fun parseObject(raw: String): Map<String, Any?> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || !trimmed.startsWith("{")) return emptyMap()
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: emptyMap()
    }

    /** Array directo o envuelto en `{ data | items | results | rows }`. */
    private fun parseList(raw: String): List<Map<String, Any?>> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return emptyList()
        val listType = Types.newParameterizedType(List::class.java, mapType)
        if (trimmed.startsWith("[")) {
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(trimmed) ?: emptyList()
        }
        if (trimmed.startsWith("{")) {
            val root = parseObject(trimmed)
            for (k in listOf("items", "data", "results", "rows")) {
                val v = root[k]
                if (v is List<*>) return v.filterIsInstance<Map<String, Any?>>()
            }
        }
        return emptyList()
    }

    suspend fun suppliers(): List<SupplierDto> =
        parseList(api.getSuppliersRaw().string()).map { SupplierDto.fromRaw(it) }

    suspend fun purchaseOrder(id: Long): PurchaseOrderDetailDto =
        PurchaseOrderDetailDto.fromRaw(parseObject(api.getPurchaseOrderRaw(id).string()))

    suspend fun approvePurchaseOrder(id: Long) {
        api.approvePurchaseOrder(id)
    }

    suspend fun goodsReceipt(id: Long): GoodsReceiptDetailDto =
        GoodsReceiptDetailDto.fromRaw(parseObject(api.getGoodsReceiptRaw(id).string()))

    suspend fun rfqs(status: String? = null): List<RfqDto> =
        parseList(api.getRfqsRaw(status?.takeIf { it.isNotBlank() }).string())
            .map { RfqDto.fromRaw(it) }

    suspend fun rfqComparison(id: Long): RfqComparisonDto =
        RfqComparisonDto.fromRaw(parseObject(api.getRfqComparisonRaw(id).string()))

    /**
     * Captura el precio de una línea. `leadTimeDays` y `notes` van sólo si el
     * usuario los escribió: el API los acepta ausentes y guardar un 0 falso
     * ensucia la comparativa de plazos.
     */
    suspend fun quoteRfqLine(
        rfqId: Long,
        lineId: Long,
        unitPrice: Double,
        leadTimeDays: Int? = null,
        notes: String? = null,
    ) {
        api.submitRfqQuote(
            rfqId,
            lineId,
            RfqQuoteBody(
                unitPrice = unitPrice,
                leadTimeDays = leadTimeDays,
                notes = notes?.trim()?.takeIf { it.isNotBlank() },
            ),
        )
    }

    suspend fun awardRfq(rfqId: Long, supplierId: Long) {
        api.awardRfq(rfqId, RfqAwardBody(supplierId))
    }

    suspend fun cancelRfq(rfqId: Long) {
        api.cancelRfq(rfqId)
    }
}
