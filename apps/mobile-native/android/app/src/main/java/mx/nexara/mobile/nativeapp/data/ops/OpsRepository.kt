package mx.nexara.mobile.nativeapp.data.ops

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.OpsClientTicketRequestDto
import mx.nexara.mobile.nativeapp.data.api.OpsApi
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import java.lang.reflect.ParameterizedType

class OpsRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: OpsApi = ApiClient.authed { authRepo.token() }.create(OpsApi::class.java)
    private val extra = ExtraRepository(context)

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private fun parseMaps(body: okhttp3.ResponseBody): List<Map<String, Any?>> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()
        val mapType: ParameterizedType = Types.newParameterizedType(
            Map::class.java,
            String::class.java,
            Any::class.java,
        )
        val listType: ParameterizedType = Types.newParameterizedType(List::class.java, mapType)
        if (raw.startsWith("[")) {
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw) ?: emptyList()
        }
        if (raw.startsWith("{")) {
            val root = moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: return emptyList()
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

    suspend fun clientTicketRequests(status: String? = null) =
        clientTicketRequestDtos(status).map { it.toFlatMap() }

    suspend fun clientTicketRequestDtos(status: String? = null): List<OpsClientTicketRequestDto> =
        parseMaps(api.getClientTicketRequestsRaw(status)).map { OpsClientTicketRequestDto.fromRaw(it) }

    suspend fun patchClientTicketStatus(id: Long, status: String) {
        api.patchClientTicketStatus(id, mapOf("status" to status))
    }

    suspend fun assignClientTicket(requestId: Long, activityId: Long) {
        api.assignClientTicket(requestId, mapOf("activityId" to activityId))
    }

    suspend fun approvedTicketRequests() = clientTicketRequestDtos("APPROVED")

    suspend fun approveRequisition(id: Long) {
        api.approveRequisition(id)
    }

    suspend fun rejectRequisition(id: Long, reason: String) {
        api.rejectRequisition(id, mapOf("reason" to reason))
    }

    suspend fun startWorkOrder(id: Long) {
        api.startWorkOrder(id)
    }

    suspend fun completeWorkOrder(id: Long, notes: String? = null) {
        api.completeWorkOrder(id, mapOf("notes" to (notes ?: "")))
    }

    suspend fun workOrders() = extra.workOrders()
    suspend fun workOrderDtos() = extra.workOrderDtos()
    suspend fun maintenanceAssets() = extra.maintenanceAssets()
    suspend fun maintenanceAssetDtos() = extra.maintenanceAssetDtos()
    suspend fun warehouse() = extra.warehouse()
    suspend fun stock() = extra.stock()
    suspend fun requisitions() = extra.requisitions()
    suspend fun requisitionDtos() = extra.requisitionDtos()
    suspend fun purchaseOrders() = extra.purchaseOrders()
    suspend fun purchaseOrderDtos() = extra.purchaseOrderDtos()
    suspend fun goodsReceiptDtos() = extra.goodsReceiptDtos()
    suspend fun serviceSheets() = serviceSheetDtos()
    suspend fun serviceSheetDtos() = extra.serviceSheetDtos()
}
