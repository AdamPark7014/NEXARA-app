package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

data class BranchPortalProfileDto(
    val id: Long,
    val clientId: Long? = null,
    val name: String? = null,
    val branchNumber: String? = null,
    val portalEmail: String? = null,
    val logoUrl: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val latitud: Double? = null,
    val longitud: Double? = null,
    val isActive: Boolean? = null,
)

interface BranchPortalApi {
    @GET("branch-portal/profile")
    suspend fun profile(): BranchPortalProfileDto?

    @GET("branch-portal/requests")
    suspend fun requests(): List<ClientTicketRequestDto>

    @Multipart
    @POST("branch-portal/requests")
    suspend fun createRequest(
        @Part("description") description: RequestBody,
        @Part("urgency") urgency: RequestBody,
        @Part("requestType") requestType: RequestBody,
        @Part("dueAt") dueAt: RequestBody?,
        @Part("placeId") placeId: RequestBody?,
        @Part("latitud") latitud: RequestBody?,
        @Part("longitud") longitud: RequestBody?,
        @Part files: List<MultipartBody.Part> = emptyList(),
    ): ClientTicketRequestDto

    @GET("branch-portal/tickets")
    suspend fun tickets(
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
    ): List<ClientPortalTicketDto>

    @GET("branch-portal/tickets/{id}")
    suspend fun ticket(@Path("id") id: Long): ClientPortalTicketDto?

    @Streaming
    @GET("branch-portal/tickets/{id}/report")
    suspend fun ticketReportPdf(@Path("id") id: Long): Response<okhttp3.ResponseBody>

    @Streaming
    @GET("branch-portal/report")
    suspend fun branchReportPdf(
        @Query("start") start: String? = null,
        @Query("end") end: String? = null,
    ): Response<okhttp3.ResponseBody>

    @GET("branch-portal/inventories")
    suspend fun inventories(
        @Query("status") status: String? = null,
        @Query("origin") origin: String? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("search") search: String? = null,
    ): List<ClientPortalInventorySnapshotDto>

    @GET("branch-portal/inventories/{id}")
    suspend fun inventoryDetail(@Path("id") id: Long): ClientPortalInventorySnapshotDto

    @Streaming
    @GET("branch-portal/inventories/{id}/report")
    suspend fun inventoryReportPdf(@Path("id") id: Long): Response<okhttp3.ResponseBody>
}

