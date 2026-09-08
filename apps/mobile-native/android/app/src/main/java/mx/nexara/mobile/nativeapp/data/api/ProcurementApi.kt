package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Compras: fichas, aprobación de OC y ciclo de RFQ.
 *
 * `ExtraApi` ya trae los tres listados. Aquí van los endpoints que sólo
 * consumía `apps/web/app/(panels)/erp/procurement/page.tsx` y ninguna de las
 * dos apps.
 *
 * Se devuelve `ResponseBody` en crudo, como el resto del proyecto, porque el
 * API entrega Prisma sin serializar: `Decimal` llega como string y las
 * relaciones vienen anidadas. El parseo tolerante vive en los `fromRaw`.
 */
interface ProcurementApi {

    /** Catálogo de proveedores activos, para filtrar órdenes. */
    @GET("procurement/purchase-orders/suppliers")
    suspend fun getSuppliersRaw(): ResponseBody

    /** Ficha completa de la orden: partidas, proveedor, quién aprobó. */
    @GET("procurement/purchase-orders/{id}")
    suspend fun getPurchaseOrderRaw(@Path("id") id: Long): ResponseBody

    /**
     * `DRAFT → CONFIRMED`. Es la aprobación que el jefe de compras da desde el
     * teléfono: hasta ahora sólo existía en la web.
     */
    @PATCH("procurement/purchase-orders/{id}/approve")
    suspend fun approvePurchaseOrder(@Path("id") id: Long): ResponseBody

    /** Ficha de la recepción: qué llegó, qué se rechazó y con qué lote. */
    @GET("procurement/goods-receipts/{id}")
    suspend fun getGoodsReceiptRaw(@Path("id") id: Long): ResponseBody

    @GET("procurement/rfq")
    suspend fun getRfqsRaw(@Query("status") status: String? = null): ResponseBody

    /**
     * Comparativa lado a lado por proveedor, con el mejor precio y el mejor
     * plazo ya resueltos por el servidor.
     */
    @GET("procurement/rfq/{id}/compare")
    suspend fun getRfqComparisonRaw(@Path("id") id: Long): ResponseBody

    /** Captura del precio de un proveedor para una línea concreta. */
    @POST("procurement/rfq/{id}/lines/{lineId}/quote")
    suspend fun submitRfqQuote(
        @Path("id") id: Long,
        @Path("lineId") lineId: Long,
        @Body body: RfqQuoteBody,
    ): ResponseBody

    /** Adjudica y genera la orden de compra con las líneas de ese proveedor. */
    @POST("procurement/rfq/{id}/award")
    suspend fun awardRfq(
        @Path("id") id: Long,
        @Body body: RfqAwardBody,
    ): ResponseBody

    @PATCH("procurement/rfq/{id}/cancel")
    suspend fun cancelRfq(@Path("id") id: Long): ResponseBody
}
