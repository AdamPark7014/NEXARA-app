package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

interface OpsApi {
    @GET("client-ticket-requests")
    suspend fun getClientTicketRequestsRaw(@Query("status") status: String? = null): ResponseBody

    @PATCH("client-ticket-requests/{id}/status")
    suspend fun patchClientTicketStatus(
        @Path("id") id: Long,
        @Body body: Map<String, String>,
    ): ResponseBody

    @PATCH("procurement/requisitions/{id}/approve")
    suspend fun approveRequisition(@Path("id") id: Long): ResponseBody

    @PATCH("procurement/requisitions/{id}/reject")
    suspend fun rejectRequisition(
        @Path("id") id: Long,
        @Body body: Map<String, String>,
    ): ResponseBody

    @PATCH("maintenance/work-orders/{id}/start")
    suspend fun startWorkOrder(@Path("id") id: Long): ResponseBody

    @PATCH("maintenance/work-orders/{id}/complete")
    suspend fun completeWorkOrder(
        @Path("id") id: Long,
        @Body body: Map<String, String>,
    ): ResponseBody
}
